// packing.ts
import { Box, PlacedBox, Pallet, LayerCandidate } from "./types";

/**
 * Skyline node: at position x, current "filled depth" is z.
 * nodes are kept sorted by x. Last node must have x = pallet.w sentinel.
 */
type Node = { x: number; z: number };

/**
 * Helper: merge consecutive nodes with same height z
 */
function mergeNodes(nodes: Node[]) {
    const out: Node[] = [];
    for (const n of nodes) {
        if (out.length === 0) out.push({ ...n });
        else {
            const last = out[out.length - 1];
            if (last.z === n.z) {
                // drop n (it is redundant) but keep x for boundary
                last.x = n.x;
            } else {
                out.push({ ...n });
            }
        }
    }
    return out;
}

/**
 * Try place a rectangle (bw x bd) into skyline.
 * Returns {x,z} placement if possible, otherwise null.
 *
 * Algo (sliding window over nodes):
 * For each node index i:
 *   find j such that nodes[j].x - nodes[i].x >= bw
 *   compute maxZ = max(nodes[k].z for k in [i..j])
 *   if maxZ + bd <= pallet.d -> it's feasible. pick the one with minimal maxZ (lowest front)
 * Tie-break by leftmost x (to keep packing compact).
 */
function skylineFindPlacement(nodes: Node[], bw: number, bd: number, pallet: Pallet): { x: number; z: number; leftIndex: number; rightX: number } | null {
    const W = pallet.w;
    const D = pallet.d;
    let best: { x: number; z: number; leftIndex: number; rightX: number } | null = null;

    for (let i = 0; i < nodes.length - 1; i++) {
        const startX = nodes[i].x;
        // find right index j where span >= bw
        let span = 0;
        let j = i;
        while (j < nodes.length - 1 && span < bw) {
            span = nodes[j + 1].x - startX;
            j++;
        }
        if (span < bw) continue; // can't fit width from this start

        // compute maxZ across indices i..j-1 (since nodes[j].x is boundary)
        let maxZ = -Infinity;
        for (let k = i; k <= j - 1; k++) maxZ = Math.max(maxZ, nodes[k].z);

        if (maxZ + bd <= D) {
            // feasible placement
            if (!best || maxZ < best.z || (maxZ === best.z && startX < best.x)) {
                best = { x: startX, z: maxZ, leftIndex: i, rightX: startX + bw };
            }
        }
    }
    return best;
}

/**
 * Update the skyline nodes by adding a placed rectangle at x..x+bw with top depth z+bd.
 * We set the filled-depth over [x, x+bw) to newTop = z + bd.
 */
function skylineUpdate(nodes: Node[], x: number, bw: number, newTop: number): Node[] {
    const rightX = x + bw;
    const out: Node[] = [];
    // keep nodes left of x
    let i = 0;
    while (i < nodes.length && nodes[i].x < x) {
        out.push({ ...nodes[i] });
        i++;
    }
    // insert node at x with height newTop if last node's z differs
    if (out.length === 0 || out[out.length - 1].x !== x) {
        // but we need the z at x: it should be derived from previous nodes
        const prevZ = (out.length > 0) ? out[out.length - 1].z : 0;
        // if prevZ !== newTop, add node:
        out.push({ x, z: newTop });
    } else {
        out[out.length - 1].z = newTop;
    }

    // skip nodes that are inside (x, rightX)
    while (i < nodes.length && nodes[i].x <= rightX) i++;

    // ensure there is a node at rightX with the z of the node before it (which was possibly higher/lower)
    // determine z after rightX: it equals the z of the last node with x <= rightX in original nodes
    let zAfter = 0;
    // find last node with x <= rightX in original
    for (let k = nodes.length - 1; k >= 0; k--) {
        if (nodes[k].x <= rightX) {
            zAfter = nodes[k].z;
            break;
        }
    }

    // push node for rightX with zAfter but only if zAfter != newTop
    if (rightX < nodes[nodes.length - 1].x) {
        if (zAfter !== newTop) out.push({ x: rightX, z: zAfter });
        // append remaining original nodes that start after rightX (but shift if first node.x equals rightX already)
        for (let k = i; k < nodes.length; k++) {
            out.push({ ...nodes[k] });
        }
    } else {
        // rightX reaches or exceeds end boundary, push sentinel
        out.push({ x: nodes[nodes.length - 1].x, z: (nodes[nodes.length - 1].z) });
    }

    return mergeNodes(out);
}

/**
 * Select the best box (with quantity > 0) for a given gap candidate (bw x bd available)
 * following Analyzebox priority:
 *  1) Match y (box.h) as close as possible to layerHeight but <= availableY (prefer <=)
 *  2) Match x (box.w) closeness to bw
 *  3) Match z (box.d) closeness to bd
 *
 * Returns {boxIndex, orientation} or null.
 */
function findBestBoxForGap(
    boxes: Box[],
    gapWidth: number,
    gapDepth: number,
    layerHeight: number,
    maxAvailableY: number // equal to layerHeight (or current remaining layer limit)
): { index: number; orientation: [number, number, number]; score: number } | null {

    let best: { index: number; orientation: [number, number, number]; score: number } | null = null;

    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (box.qty <= 0) continue;

        const orients: [number, number, number][] = [
            [box.w, box.h, box.d],
            [box.w, box.d, box.h],
            [box.h, box.w, box.d],
            [box.h, box.d, box.w],
            [box.d, box.w, box.h],
            [box.d, box.h, box.w],
        ];

        for (const o of orients) {
            const [bw, bh, bd] = o;
            if (bw > gapWidth) continue;
            if (bd > gapDepth) continue;

            // Prefer bh <= maxAvailableY (fits within current layer)
            const fitsLayer = bh <= maxAvailableY;

            // Primary key: closeness of bh to layerHeight (prefer ≤layerHeight; differences penalized)
            // We'll produce a composite score:
            // score = primaryPenalty * 10000 + |bw - gapWidth| * 100 + |bd - gapDepth|
            // primaryPenalty: 0 if bh <= layerHeight, otherwise big penalty but still considered if no <= fit found.
            // Also prefer smaller difference |bh - layerHeight|
            let primaryPenalty = fitsLayer ? Math.abs(layerHeight - bh) : 100000 + Math.abs(bh - layerHeight);
            const score = primaryPenalty * 10000 + Math.abs(bw - gapWidth) * 100 + Math.abs(bd - gapDepth);

            if (!best || score < best.score) {
                best = { index: i, orientation: o, score };
            }
        }
    }

    return best;
}

/**
 * Pack a single layer (height = layerHeight) using skyline.
 * - places as many boxes as it can according to the skyline fit and Analyzebox priority.
 * - returns placed boxes and updated boxes array (with decremented qty).
 *
 * yBase = starting Y coordinate for this layer (stack height before this layer)
 */
export function packLayerSkyline(
    boxesIn: Box[],
    pallet: Pallet,
    layerHeight: number,
    yBase: number
): { placed: PlacedBox[]; boxesOut: Box[] } {
    // copy boxes list (we'll mutate qty)
    const boxes = boxesIn.map(b => ({ ...b }));

    // nodes: start [0,0] and sentinel [pallet.w, 0]
    let nodes: Node[] = [{ x: 0, z: 0 }, { x: pallet.w, z: 0 }];

    const placed: PlacedBox[] = [];

    // Continue until no placements possible in this layer
    while (true) {
        // find best placement among all possible widths using skyline heuristic:
        // For performance: we iterate boxes and test skyline feasibility for each orientation.
        // But we'll instead: scan nodes for candidate spans and then query findBestBoxForGap.
        let anyPlacedThisRound = false;

        // Iterate nodes left-to-right; for each node try to place a box starting at node.x
        for (let i = 0; i < nodes.length - 1; i++) {
            const gapX = nodes[i].x;
            const gapWidthTotal = nodes[i + 1].x - gapX;

            if (gapWidthTotal <= 0) continue;

            // We need to find the best width-subspan (the algorithm will consider placing boxes with width <= gapWidthTotal)
            // For simplicity, we'll treat the candidate gap width as gapWidthTotal and compute best box that fits into it.
            const maxZInSpan = (() => {
                let maxZ = -Infinity;
                // compute j such that nodes[j].x - gapX >= 0 (not necessary here)
                for (let k = i; k < nodes.length - 1; k++) {
                    maxZ = Math.max(maxZ, nodes[k].z);
                }
                return maxZ;
            })();

            const gapDepthAvailable = pallet.d - maxZInSpan;
            if (gapDepthAvailable <= 0) continue;

            // Find best box that fit within gapWidthTotal and gapDepthAvailable
            const cand = findBestBoxForGap(boxes, gapWidthTotal, gapDepthAvailable, layerHeight, layerHeight);
            if (!cand) continue;

            // We have candidate box index & orientation — but we should find exact width bw to occupy.
            // Use bw from orientation.
            const box = boxes[cand.index];
            const [bw, bh, bd] = cand.orientation;

            // Place box at (gapX, yBase, z = maxZ in the span that covers bw)
            // BUT nodes might contain many segments; we need maxZ across the span from gapX to gapX + bw.
            // Find rightX index j such that nodes[j].x - gapX >= bw
            let span = 0;
            let j = i;
            while (j < nodes.length - 1 && span < bw) {
                span = nodes[j + 1].x - gapX;
                j++;
            }
            if (span < bw) {
                // For some reason cannot allocate this width (shouldn't happen), skip
                continue;
            }
            // compute exact maxZ across i..j-1
            let exactMaxZ = -Infinity;
            for (let k = i; k <= j - 1; k++) exactMaxZ = Math.max(exactMaxZ, nodes[k].z);
            if (exactMaxZ + bd > pallet.d) {
                // can't place due to depth after all
                continue;
            }

            // Placement coords:
            const placeX = gapX;
            const placeZ = exactMaxZ;
            const placeY = yBase;

            // Update nodes skyline: set [placeX, placeX + bw) to newTop = exactMaxZ + bd
            nodes = skylineUpdate(nodes, placeX, bw, exactMaxZ + bd);

            // record placement, decrement qty
            placed.push({
                id: box.id,
                w: bw,
                h: bh,
                d: bd,
                qty: 1,
                x: placeX,
                y: placeY,
                z: placeZ,
                orientation: [bw, bh, bd],
            });

            boxes[cand.index].qty -= 1;
            anyPlacedThisRound = true;

            // break to restart iteration (we changed skyline)
            break;
        }

        if (!anyPlacedThisRound) break; // no fitting box placed in this pass => layer packing done
    }

    return { placed, boxesOut: boxes };
}

/**
 * High-level packPallet that tries layer candidates (sorted by eval) and pallet orientation.
 * This follows the paper's iteration idea: for each layer candidate, pack layers sequentially until pallet height used up.
 */
export function packPalletWithLayers(
    boxes: Box[],
    pallet: Pallet,
    layerCandidates: LayerCandidate[]
): { placed: PlacedBox[]; utilization: number } {
    const totalVolume = pallet.w * pallet.h * pallet.d;
    let bestPlaced: PlacedBox[] = [];
    let bestUtil = 0;

    // We'll try layer candidates in given order (assumed pre-sorted by eval)
    for (const candidate of layerCandidates) {
        // copy boxes for this iteration
        let remainingBoxes = boxes.map(b => ({ ...b }));
        let placedAll: PlacedBox[] = [];
        let currentY = 0;
        let currentLayerHeight = candidate.height;

        // pack until height exceeds pallet.h or no more placements
        while (currentY < pallet.h) {
            // adjust layer height not to exceed pallet remaining space
            if (currentY + currentLayerHeight > pallet.h) {
                currentLayerHeight = pallet.h - currentY;
                if (currentLayerHeight <= 0) break;
            }

            const { placed, boxesOut } = packLayerSkyline(remainingBoxes, pallet, currentLayerHeight, currentY);
            // if nothing placed in this layer -> try next layerHeight (stop)
            if (placed.length === 0) break;

            // append placed with correct y (placed already has yBase)
            placedAll = placedAll.concat(placed);

            // compute height consumed: paper increases layer height if taller boxes used.
            // Find max box.h among placed (since some boxes may have bh > currentLayerHeight)
            const maxPlacedH = Math.max(...placed.map(p => p.h));
            const effectiveLayerUsed = Math.max(currentLayerHeight, maxPlacedH);

            currentY += effectiveLayerUsed;
            // set next layer height: choose among candidates or attempt greedy recompute - for simplicity use same candidate
            remainingBoxes = boxesOut;
            // if we packed some boxes taller than candidate.height, the next layer base is elevated and this is similar to layer-in-layer effect.
            // continue until full.
        }

        // compute utilization
        const usedVol = placedAll.reduce((s, p) => s + p.w * p.h * p.d, 0);
        const util = usedVol / totalVolume;

        if (util > bestUtil) {
            bestUtil = util;
            bestPlaced = placedAll;
        }

        // optionally early-exit: if utilization close to 1 or high enough, we can stop.
    }

    return { placed: bestPlaced, utilization: bestUtil };
}
