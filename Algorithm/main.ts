import { getPalletOrientations } from "./utils";
import { buildLayerCandidates } from "./layers";
import { Box, Pallet } from "./type";
import { packPalletWithLayers } from "./packing";


const pallet: Pallet = { w: 84, h: 96, d: 104 }; // Example Air Force pallet
const boxes: Box[] = [
  { id: "A", w: 20, h: 10, d: 15, qty: 10 },
  { id: "B", w: 15, h: 15, d: 15, qty: 5 },
  { id: "C", w: 10, h: 20, d: 30, qty: 3 },
];

let bestSolution: { utilization: number; placed: any[] } = { utilization: 0, placed: [] };

for (const orientation of getPalletOrientations(pallet)) {
  const layers = buildLayerCandidates(boxes, orientation);
  const result = packPalletWithLayers(boxes, orientation, layers);
  if (result.utilization > bestSolution.utilization) {
    bestSolution = { utilization: result.utilization, placed: result.placed };
  }
}

console.log("Best utilization:", bestSolution.utilization);
console.log("Packed boxes:", bestSolution.placed);