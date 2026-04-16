import type { PortalDrawFrame, PortalVisionEffect } from './PortalVisionEffect';

type ThermalPortalVisionSettings = {
    backgroundAlpha: number;
    showGlyphs: boolean;
    glyphs: string;
    glyphColor: string;
    minGlyphs: string;
};

export default class ThermalPortalVisionEffect implements PortalVisionEffect {
    public readonly id = 'thermal' as const;
    public readonly label = 'Thermal';

    constructor(private readonly _getSettings: () => ThermalPortalVisionSettings) {}

    public render(frame: PortalDrawFrame): void {
        const settings = this._getSettings();
        const { ctx, canvasWidth, canvasHeight, cols, rows, cellWidth, cellHeight, sampleAt } = frame;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = `rgba(0, 0, 0, ${settings.backgroundAlpha})`;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const glyphs = this._getGlyphs(settings);
        const maxGlyphIndex = glyphs.length - 1;
        const sample = { r: 0, g: 0, b: 0, luminance: 0 };

        for (let y = 0; y < rows; y++) {
            const v = rows <= 1 ? 0 : y / (rows - 1);
            for (let x = 0; x < cols; x++) {
                const u = cols <= 1 ? 0 : x / (cols - 1);
                if (!sampleAt(u, v, sample)) continue;

                const color = this._thermalColor(sample.luminance);
                ctx.fillStyle = color;
                ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth + 0.5, cellHeight + 0.5);

                if (settings.showGlyphs) {
                    const glyphIndex = Math.min(maxGlyphIndex, Math.max(0, Math.floor(sample.luminance * maxGlyphIndex)));
                    ctx.fillStyle = settings.glyphColor;
                    ctx.font = `${Math.max(8, Math.floor(cellHeight * 0.9))}px monospace`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(glyphs[glyphIndex], x * cellWidth, y * cellHeight);
                }
            }
        }
    }

    private _getGlyphs(settings: ThermalPortalVisionSettings): string {
        const trimmed = settings.glyphs.replace(/\s+$/g, '');
        return trimmed.length >= 2 ? trimmed : settings.minGlyphs;
    }

    private _thermalColor(l: number): string {
        // Piecewise linear approximation of a thermal palette.
        if (l < 0.2) return this._lerpColor('#090620', '#1f2bd4', l / 0.2);
        if (l < 0.4) return this._lerpColor('#1f2bd4', '#00b5ff', (l - 0.2) / 0.2);
        if (l < 0.6) return this._lerpColor('#00b5ff', '#ffe600', (l - 0.4) / 0.2);
        if (l < 0.8) return this._lerpColor('#ffe600', '#ff7a00', (l - 0.6) / 0.2);
        return this._lerpColor('#ff7a00', '#ff2300', (l - 0.8) / 0.2);
    }

    private _lerpColor(a: string, b: string, t: number): string {
        const c1 = this._hexToRgb(a);
        const c2 = this._hexToRgb(b);
        const clampedT = Math.min(1, Math.max(0, t));
        const r = Math.round(c1.r + (c2.r - c1.r) * clampedT);
        const g = Math.round(c1.g + (c2.g - c1.g) * clampedT);
        const bl = Math.round(c1.b + (c2.b - c1.b) * clampedT);
        return `rgb(${r}, ${g}, ${bl})`;
    }

    private _hexToRgb(hex: string): { r: number; g: number; b: number } {
        const clean = hex.replace('#', '');
        if (clean.length !== 6) return { r: 0, g: 0, b: 0 };
        const intValue = Number.parseInt(clean, 16);
        return {
            r: (intValue >> 16) & 255,
            g: (intValue >> 8) & 255,
            b: intValue & 255,
        };
    }
}
