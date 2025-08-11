import { Box, Gap, LayerCandidate, Pallet, PlacedBox } from "./type";

// Find the bestBox-fitting box for a gap
function findBestBox(gap: Gap, boxes: Box[], layerHeight: number): { box: Box; orientation: [number, number, number] } | null {
    let bestBox: { box: Box; orientation: [number, number, number]; score: number } | null = null;

    for (const box of boxes) {
        const orientations: [number, number, number][] = [
            [box.w, box.h, box.d],
            [box.w, box.d, box.h],
            [box.h, box.w, box.d],
            [box.h, box.d, box.w],
            [box.d, box.w, box.h],
            [box.d, box.h, box.w],
        ];

        for (const o of orientations) {
            const [bw, bh, bd] = o;
            if (bw <= gap.width && bh <= layerHeight && bd <= gap.depth) {
                const score = Math.abs(bh - layerHeight) + Math.abs(bw - gap.width) + Math.abs(bd - gap.depth);
                if (!bestBox || score < bestBox.score) {
                    bestBox = { box, orientation: o, score };
                }
            }
        }
    }

    return bestBox ? { box: bestBox.box, orientation: bestBox.orientation } : null;
}