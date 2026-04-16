import type { PortalDrawFrame, PortalVisionEffect } from './PortalVisionEffect';

type AsciiPortalVisionSettings = {
    chars: string;
    color: string;
    background: string;
    backgroundAlpha: number;
    fontSize: number;
    invert: boolean;
    allowBlankGlyph: boolean;
    minChars: string;
};

export default class AsciiPortalVisionEffect implements PortalVisionEffect {
    public readonly id = 'ascii' as const;
    public readonly label = 'ASCII';

    constructor(private readonly _getSettings: () => AsciiPortalVisionSettings) {}

    public render(frame: PortalDrawFrame): void {
        const settings = this._getSettings();
        const { ctx, canvasWidth, canvasHeight, cols, rows, cellWidth, cellHeight, sampleAt } = frame;
        const chars = this._getChars(settings);
        const maxIndex = chars.length - 1;

        const bgRgb = this._hexToRgb(settings.background);
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${settings.backgroundAlpha})`;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = settings.color;
        ctx.font = `${settings.fontSize}px monospace`;
        ctx.textBaseline = 'top';

        const sample = { r: 0, g: 0, b: 0, luminance: 0 };
        for (let y = 0; y < rows; y++) {
            const v = rows <= 1 ? 0 : y / (rows - 1);
            for (let x = 0; x < cols; x++) {
                const u = cols <= 1 ? 0 : x / (cols - 1);
                if (!sampleAt(u, v, sample)) continue;

                const mapped = Math.min(maxIndex, Math.max(0, Math.floor(sample.luminance * maxIndex)));
                let charIndex = settings.invert ? maxIndex - mapped : mapped;

                if (!settings.allowBlankGlyph && chars[charIndex] === ' ') {
                    charIndex = Math.min(maxIndex, 1);
                }

                ctx.fillText(chars[charIndex], x * cellWidth, y * cellHeight);
            }
        }
    }

    private _getChars(settings: AsciiPortalVisionSettings): string {
        const trimmed = settings.chars.replace(/\s+$/g, '');
        return trimmed.length >= 2 ? trimmed : settings.minChars;
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
