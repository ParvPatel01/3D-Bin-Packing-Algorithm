import { Pallet } from "./type";

export function getPalletOrientations(pallet: Pallet): Pallet[] {
    const { w, h, d } = pallet;
    const dims: [number, number, number][] = [
        [w, h, d],
        [w, d, h],
        [h, w, d],
        [h, d, w],
        [d, w, h],
        [d, h, w],
    ];

    const seen = new Set<string>();
    return dims.filter(([a, b, c]) => {
        const key = `${a},${b},${c}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map(([W, H, D]) => ({ w: W, h: H, d: D }));
}