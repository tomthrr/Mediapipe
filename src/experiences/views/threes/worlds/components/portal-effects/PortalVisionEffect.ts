export type PortalVisionMode = 'ascii' | 'thermal';

export type PortalSample = {
    r: number;
    g: number;
    b: number;
    luminance: number;
};

export type PortalDrawFrame = {
    ctx: CanvasRenderingContext2D;
    canvasWidth: number;
    canvasHeight: number;
    cols: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
    sampleAt: (u: number, v: number, out: PortalSample) => boolean;
};

export interface PortalVisionEffect {
    readonly id: PortalVisionMode;
    readonly label: string;
    render(frame: PortalDrawFrame): void;
}
