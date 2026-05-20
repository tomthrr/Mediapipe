declare module 'wiggle' {
    import type { Bone, Object3D } from 'three';

    export interface WiggleBoneOptions {
        velocity?: number;
        maxStretch?: number;
        scene?: Object3D;
    }

    export class WiggleBone {
        constructor(target: Bone, options?: WiggleBoneOptions, helpers?: boolean);
        reset(): void;
        dispose(): void;
        update(dt?: number | null): void;
    }
}
