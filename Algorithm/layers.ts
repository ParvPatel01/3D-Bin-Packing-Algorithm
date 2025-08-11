import { Box, LayerCandidate, Pallet } from "./type";


// Build candidate layer heights from box dimensions
export function buildLayerCandidates(boxes: Box[], pallet: Pallet): LayerCandidate[] {
    const heights = new Map<number, number>();

    for (const box of boxes) {
    const dims = [box.w, box.h, box.d];
    for (const dim of dims) {
      if (dim <= pallet.h) {
        let score = 0;
        for (const b of boxes) {
          const closest = Math.min(...[b.w, b.h, b.d].map(v => Math.abs(v - dim)));
          score += closest;
        }
        heights.set(dim, score);
      }
    }
  }

  return [...heights.entries()]
    .map(([height, evalScore]) => ({ height, evalScore }))
    .sort((a, b) => a.evalScore - b.evalScore);
}