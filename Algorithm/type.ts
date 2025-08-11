export interface Box {
    id: string;
    w: number;
    h: number;
    d: number;
    qty: number;
}

export interface PlacedBox extends Box {
    x: number;
    y: number;
    z: number;
    orientation: [number, number, number]; // [bw, bh, bd]
}

export interface Pallet {
    w: number;
    h: number;
    d: number;
}

export interface LayerCandidate {
    height: number;
    evalScore: number;
}

export interface Gap {
    x: number;
    z: number;
    width: number;
    depth: number;
}