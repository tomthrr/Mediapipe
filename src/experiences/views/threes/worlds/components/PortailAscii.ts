import {
    Mesh,
    Vector3,
    CanvasTexture,
    LinearFilter,
    RGBAFormat,
    UnsignedByteType,
} from 'three';
import ThreeActorBase from '../../bases/components/ThreeActorBase';
import { type MediapipeHandsSnapshot } from '../../../../managers/MediapipeManager';
import ThreeCameraControllerManager from '../../../../managers/threes/ThreeCameraControllerManager';
import { CameraId } from '../../../../constants/experiences/CameraId';
import ThreeCameraControllerBase from '../../../../cameras/threes/bases/ThreeCameraControllerBase';
import DebugManager from '../../../../managers/DebugManager';
import { DebugGuiTitle } from '../../../../constants/experiences/DebugGuiTitle';
import MainThreeApp from '../../../../engines/threes/app/MainThreeApp';
import * as THREE from 'three';

type HandTips = {
    topLeft: Vector3;
    bottomLeft: Vector3;
    topRight: Vector3;
    bottomRight: Vector3;
};

type PixelSample = {
    r: number;
    g: number;
    b: number;
    luminance: number;
};

export default class PortailAscii extends ThreeActorBase {
    private static readonly _DEBUG_INIT_KEY: string = '__portailAsciiDebugInit';
    private static readonly _DEFAULT_ASCII_CHARS: string = '.:-=+*#%@';
    private static readonly _MIN_ASCII_CHARS: string = '.#@';

    private _time: number = 0;
    private _cameraController: ThreeCameraControllerBase;
    private _cubeTester: Mesh | null = null;
    private _portalMesh: Mesh | null = null;

    private _asciiCanvas: HTMLCanvasElement;
    private _asciiCtx: CanvasRenderingContext2D;
    private _asciiTexture: CanvasTexture;

    private _renderTarget: THREE.WebGLRenderTarget | null = null;
    private _renderPixels: Uint8Array = new Uint8Array(0);
    private _captureWidth: number = 0;
    private _captureHeight: number = 0;
    private _asciiCellW: number = 8;
    private _asciiCellH: number = 12;
    private _asciiFrameElapsed: number = 0;

    private readonly _tmpLeft = new Vector3();
    private readonly _tmpRight = new Vector3();
    private readonly _tmpPoint = new Vector3();
    private readonly _tmpProjected = new Vector3();
    private readonly _tmpFromCam = new Vector3();

    private _rawCorners: HandTips = {
        topLeft: new Vector3(),
        bottomLeft: new Vector3(),
        topRight: new Vector3(),
        bottomRight: new Vector3(),
    };

    private _targetCorners: HandTips = {
        topLeft: new Vector3(),
        bottomLeft: new Vector3(),
        topRight: new Vector3(),
        bottomRight: new Vector3(),
    };

    private _smoothedCorners: HandTips = {
        topLeft: new Vector3(),
        bottomLeft: new Vector3(),
        topRight: new Vector3(),
        bottomRight: new Vector3(),
    };

    private _portalPositions: Float32Array | null = null;

    private readonly _settings = {
        enabled: true,
        handDepth: -2,
        handSpread: 4,
        smoothing: 0.07,
        asciiChars: PortailAscii._DEFAULT_ASCII_CHARS,
        asciiCols: 96,
        asciiRows: 54,
        asciiFps: 18,
        captureHeight: 260,
        asciiFontSize: 12,
        asciiColor: '#9ed4ff',
        asciiBackground: '#050913',
        asciiBackgroundAlpha: 0.72,
        invert: false,
        allowBlankGlyph: false,
    };

    private readonly _right = new Vector3();
    private readonly _up = new Vector3();
    private readonly _forward = new Vector3();

    constructor() {
        super();
        this._asciiCanvas = document.createElement('canvas');
        const asciiCtx = this._asciiCanvas.getContext('2d');
        if (!asciiCtx) {
            throw new Error('2D context unavailable for ASCII portal canvas.');
        }
        this._asciiCtx = asciiCtx;
        this._asciiTexture = new CanvasTexture(this._asciiCanvas);
        this._asciiTexture.minFilter = LinearFilter;
        this._asciiTexture.magFilter = LinearFilter;

        this._cameraController = ThreeCameraControllerManager.get(CameraId.THREE_MAIN);
        this._resizeAsciiCanvas();
        this._initMesh();
        window.addEventListener('hand:update', this._onHandUpdate);
        this._initDebug();
    }

    private _initDebug(): void {
        if (!DebugManager.isActive) return;

        const folder = DebugManager.getGuiFolder(DebugGuiTitle.PORTAIL_ASCII);
        const anyFolder = folder as unknown as Record<string, unknown>;
        if (anyFolder[PortailAscii._DEBUG_INIT_KEY]) return;
        anyFolder[PortailAscii._DEBUG_INIT_KEY] = true;

        folder.add(this._settings, 'enabled').name('enabled');
        folder.add(this._settings, 'handDepth', -10, 10, 0.01).name('handDepth');
        folder.add(this._settings, 'handSpread', 0, 10, 0.01).name('handSpread');
        folder.add(this._settings, 'smoothing', 0.01, 0.5, 0.01).name('smoothing');

        folder.add(this._settings, 'asciiChars').name('chars');
        folder
            .add(this._settings, 'asciiCols', 24, 220, 1)
            .name('cols')
            .onChange(() => this._resizeAsciiCanvas());
        folder
            .add(this._settings, 'asciiRows', 16, 140, 1)
            .name('rows')
            .onChange(() => this._resizeAsciiCanvas());
        folder
            .add(this._settings, 'asciiFontSize', 7, 30, 1)
            .name('fontSize')
            .onChange(() => this._resizeAsciiCanvas());
        folder.add(this._settings, 'asciiFps', 4, 60, 1).name('fps');
        folder
            .add(this._settings, 'captureHeight', 64, 480, 1)
            .name('captureHeight')
            .onChange(() => this._ensureRenderTarget());

        folder.add(this._settings, 'invert').name('invert');
        folder.add(this._settings, 'allowBlankGlyph').name('allowBlankGlyph');
        folder.addColor(this._settings, 'asciiColor').name('fg');
        folder.addColor(this._settings, 'asciiBackground').name('bg');
        folder.add(this._settings, 'asciiBackgroundAlpha', 0, 1, 0.01).name('bgAlpha');
    }

    private _initMesh(): void {
        this._generateCubeTester();
        this._createPortalMesh();
        this._ensureRenderTarget();
    }

    private _generateCubeTester(): void {
        const geo = new THREE.TorusKnotGeometry(0.5, 0.15, 64, 16);
        const mat = new THREE.MeshPhongMaterial({ color: 0x3377ff, shininess: 90 });
        const cube = new THREE.Mesh(geo, mat);
        cube.position.set(0, 1, 0);
        this.add(cube);
        this._cubeTester = cube;
        this._cubeTester.add(
            new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x88ccff }))
        );
    }

    private _createPortalMesh(): Mesh {
        const geo = new THREE.BufferGeometry();

        const positions = new Float32Array(4 * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._portalPositions = positions;

        geo.setIndex([0, 1, 2, 1, 3, 2]);

        const uvs = new Float32Array([
            0, 1,
            0, 0,
            1, 1,
            1, 0,
        ]);
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: this._asciiTexture,
            transparent: true,
            opacity: 1,
            blending: THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        mat.toneMapped = false;

        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        this._portalMesh = mesh;
        this.add(mesh);
        return mesh;
    }

    private _resizeAsciiCanvas(): void {
        this._settings.asciiCols = Math.max(8, Math.floor(this._settings.asciiCols));
        this._settings.asciiRows = Math.max(8, Math.floor(this._settings.asciiRows));

        this._asciiCellH = Math.max(8, Math.floor(this._settings.asciiFontSize));
        this._asciiCellW = Math.max(4, Math.floor(this._asciiCellH * 0.64));

        this._asciiCanvas.width = this._settings.asciiCols * this._asciiCellW;
        this._asciiCanvas.height = this._settings.asciiRows * this._asciiCellH;

        this._asciiCtx.textBaseline = 'top';
        this._asciiCtx.font = `${this._settings.asciiFontSize}px monospace`;

        this._asciiTexture.needsUpdate = true;
        this._ensureRenderTarget();
    }

    private _ensureRenderTarget(): void {
        const height = Math.max(64, Math.floor(this._settings.captureHeight));
        const aspect = window.innerWidth / Math.max(1, window.innerHeight);
        const width = Math.max(64, Math.floor(height * aspect));

        if (this._renderTarget && this._renderTarget.width === width && this._renderTarget.height === height) {
            return;
        }

        if (this._renderTarget) this._renderTarget.dispose();

        this._renderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
            type: UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false,
        });

        this._captureWidth = width;
        this._captureHeight = height;
        this._renderPixels = new Uint8Array(width * height * 4);
    }

    private _getAsciiChars(): string {
        const trimmed = this._settings.asciiChars.replace(/\s+$/g, '');
        return trimmed.length >= 2 ? trimmed : PortailAscii._MIN_ASCII_CHARS;
    }

    private _updateAsciiTexture(dt: number): void {
        if (!this._settings.enabled) return;
        if (!this._renderTarget || !this._portalMesh) return;

        this._asciiFrameElapsed += dt;
        const targetInterval = 1 / Math.max(1, this._settings.asciiFps);
        if (this._asciiFrameElapsed < targetInterval) return;
        this._asciiFrameElapsed = 0;

        const renderer = MainThreeApp.renderer;
        const previousRenderTarget = renderer.getRenderTarget();

        this._portalMesh.visible = false;
        renderer.setRenderTarget(this._renderTarget);
        renderer.clear();
        renderer.render(MainThreeApp.scene, this._cameraController.camera);
        renderer.readRenderTargetPixels(
            this._renderTarget,
            0,
            0,
            this._captureWidth,
            this._captureHeight,
            this._renderPixels,
        );
        renderer.setRenderTarget(previousRenderTarget);
        this._portalMesh.visible = true;

        this._drawAsciiFromPixels();
        this._asciiTexture.needsUpdate = true;
    }

    private _drawAsciiFromPixels(): void {
        const cols = this._settings.asciiCols;
        const rows = this._settings.asciiRows;
        const chars = this._getAsciiChars();
        const maxIndex = chars.length - 1;

        const ctx = this._asciiCtx;
        ctx.clearRect(0, 0, this._asciiCanvas.width, this._asciiCanvas.height);

        const bgRgb = this._hexToRgb(this._settings.asciiBackground);
        ctx.fillStyle = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${this._settings.asciiBackgroundAlpha})`;
        ctx.fillRect(0, 0, this._asciiCanvas.width, this._asciiCanvas.height);

        ctx.fillStyle = this._settings.asciiColor;
        ctx.font = `${this._settings.asciiFontSize}px monospace`;

        const sample: PixelSample = { r: 0, g: 0, b: 0, luminance: 0 };

        for (let y = 0; y < rows; y++) {
            const v = rows <= 1 ? 0 : y / (rows - 1);
            for (let x = 0; x < cols; x++) {
                const u = cols <= 1 ? 0 : x / (cols - 1);
                if (!this._sampleAtPortalUV(u, v, sample)) continue;

                const mapped = Math.min(maxIndex, Math.max(0, Math.floor(sample.luminance * maxIndex)));
                let charIndex = this._settings.invert ? maxIndex - mapped : mapped;

                if (!this._settings.allowBlankGlyph && chars[charIndex] === ' ') {
                    charIndex = Math.min(maxIndex, 1);
                }

                ctx.fillText(chars[charIndex], x * this._asciiCellW, y * this._asciiCellH);
            }
        }
    }

    private _sampleAtPortalUV(u: number, v: number, out: PixelSample): boolean {
        const camera = this._cameraController.camera;
        const p = this._smoothedCorners;

        this._tmpLeft.copy(p.topLeft).lerp(p.bottomLeft, v);
        this._tmpRight.copy(p.topRight).lerp(p.bottomRight, v);
        this._tmpPoint.copy(this._tmpLeft).lerp(this._tmpRight, u);
        this._tmpProjected.copy(this._tmpPoint).project(camera);

        if (
            this._tmpProjected.x < -1 || this._tmpProjected.x > 1 ||
            this._tmpProjected.y < -1 || this._tmpProjected.y > 1 ||
            this._tmpProjected.z < -1 || this._tmpProjected.z > 1
        ) {
            return false;
        }

        const sx = Math.floor(((this._tmpProjected.x * 0.5) + 0.5) * (this._captureWidth - 1));
        const syTop = Math.floor(((-this._tmpProjected.y * 0.5) + 0.5) * (this._captureHeight - 1));
        const sy = (this._captureHeight - 1) - syTop;
        const pixelIndex = (sy * this._captureWidth + sx) * 4;

        const r = this._renderPixels[pixelIndex];
        const g = this._renderPixels[pixelIndex + 1];
        const b = this._renderPixels[pixelIndex + 2];

        out.r = r;
        out.g = g;
        out.b = b;
        out.luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return true;
    }

    private _hexToRgb(hex: string): { r: number; g: number; b: number } {
        const clean = hex.replace('#', '');
        if (clean.length !== 6) {
            return { r: 0, g: 0, b: 0 };
        }
        const intValue = Number.parseInt(clean, 16);
        return {
            r: (intValue >> 16) & 255,
            g: (intValue >> 8) & 255,
            b: intValue & 255,
        };
    }

    private _handToWorld(tip: { x: number; y: number; z: number }): Vector3 {
        const camera = this._cameraController.camera;

        const nx = (tip.x - 0.5) * -2;
        const ny = (0.5 - tip.y) * 2;

        camera.matrixWorld.extractBasis(this._right, this._up, this._forward);
        this._forward.negate();

        return new Vector3()
            .copy(camera.position)
            .addScaledVector(this._forward, this._settings.handDepth)
            .addScaledVector(this._right, nx * this._settings.handSpread)
            .addScaledVector(this._up, ny * this._settings.handSpread);
    }

    private _onHandUpdate = (e: CustomEvent<MediapipeHandsSnapshot>): void => {
        if (!this._settings.enabled) return;
        const { left, right } = e.detail;

        if (left?.indexTip) this._rawCorners.topLeft.copy(this._handToWorld(left.indexTip));
        if (left?.thumb) this._rawCorners.bottomLeft.copy(this._handToWorld(left.thumb));
        if (right?.indexTip) this._rawCorners.topRight.copy(this._handToWorld(right.indexTip));
        if (right?.thumb) this._rawCorners.bottomRight.copy(this._handToWorld(right.thumb));
    };

    public update(dt: number): void {
        super.update(dt);
        this._time += dt;

        if (this._cubeTester) {
            this._cubeTester.rotation.x = this._time * 0.5;
            this._cubeTester.rotation.y = this._time * 0.3;
        }

        this._updatePortalMesh();
        this._updateAsciiTexture(dt);
    }

    private _updatePortalMesh(): void {
        if (!this._portalMesh || !this._portalPositions) return;

        this._computeRigidTargetCorners();

        const s = this._settings.smoothing;

        this._smoothedCorners.topLeft.lerp(this._targetCorners.topLeft, s);
        this._smoothedCorners.bottomLeft.lerp(this._targetCorners.bottomLeft, s);
        this._smoothedCorners.topRight.lerp(this._targetCorners.topRight, s);
        this._smoothedCorners.bottomRight.lerp(this._targetCorners.bottomRight, s);

        const p = this._smoothedCorners;
        const buf = this._portalPositions;

        buf[0] = p.topLeft.x; buf[1] = p.topLeft.y; buf[2] = p.topLeft.z;
        buf[3] = p.bottomLeft.x; buf[4] = p.bottomLeft.y; buf[5] = p.bottomLeft.z;
        buf[6] = p.topRight.x; buf[7] = p.topRight.y; buf[8] = p.topRight.z;
        buf[9] = p.bottomRight.x; buf[10] = p.bottomRight.y; buf[11] = p.bottomRight.z;

        (this._portalMesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        this._portalMesh.geometry.computeBoundingSphere();
    }

    private _computeRigidTargetCorners(): void {
        const camera = this._cameraController.camera;

        camera.matrixWorld.extractBasis(this._right, this._up, this._forward);
        this._forward.negate();

        const xTL = this._axisFromCamera(this._rawCorners.topLeft, this._right);
        const xBL = this._axisFromCamera(this._rawCorners.bottomLeft, this._right);
        const xTR = this._axisFromCamera(this._rawCorners.topRight, this._right);
        const xBR = this._axisFromCamera(this._rawCorners.bottomRight, this._right);

        const yTL = this._axisFromCamera(this._rawCorners.topLeft, this._up);
        const yBL = this._axisFromCamera(this._rawCorners.bottomLeft, this._up);
        const yTR = this._axisFromCamera(this._rawCorners.topRight, this._up);
        const yBR = this._axisFromCamera(this._rawCorners.bottomRight, this._up);

        const xLeftRaw = 0.5 * (xTL + xBL);
        const xRightRaw = 0.5 * (xTR + xBR);
        const yTopRaw = 0.5 * (yTL + yTR);
        const yBottomRaw = 0.5 * (yBL + yBR);

        let xLeft = Math.min(xLeftRaw, xRightRaw);
        let xRight = Math.max(xLeftRaw, xRightRaw);
        let yBottom = Math.min(yBottomRaw, yTopRaw);
        let yTop = Math.max(yBottomRaw, yTopRaw);

        const minHalfWidth = 0.1;
        const minHalfHeight = 0.1;

        if (xRight - xLeft < minHalfWidth * 2) {
            const cx = 0.5 * (xLeft + xRight);
            xLeft = cx - minHalfWidth;
            xRight = cx + minHalfWidth;
        }

        if (yTop - yBottom < minHalfHeight * 2) {
            const cy = 0.5 * (yTop + yBottom);
            yBottom = cy - minHalfHeight;
            yTop = cy + minHalfHeight;
        }

        this._buildCameraPlanePoint(xLeft, yTop, this._targetCorners.topLeft);
        this._buildCameraPlanePoint(xLeft, yBottom, this._targetCorners.bottomLeft);
        this._buildCameraPlanePoint(xRight, yTop, this._targetCorners.topRight);
        this._buildCameraPlanePoint(xRight, yBottom, this._targetCorners.bottomRight);
    }

    private _axisFromCamera(point: Vector3, axis: Vector3): number {
        this._tmpFromCam.copy(point).sub(this._cameraController.camera.position);
        return this._tmpFromCam.dot(axis);
    }

    private _buildCameraPlanePoint(x: number, y: number, out: Vector3): void {
        out.copy(this._cameraController.camera.position)
            .addScaledVector(this._forward, this._settings.handDepth)
            .addScaledVector(this._right, x)
            .addScaledVector(this._up, y);
    }

    public override reset(): void {}

    public dispose(): void {
        window.removeEventListener('hand:update', this._onHandUpdate);

        if (this._portalMesh) {
            this._portalMesh.geometry.dispose();
            (this._portalMesh.material as THREE.Material).dispose();
            this._portalMesh = null;
        }

        if (this._renderTarget) {
            this._renderTarget.dispose();
            this._renderTarget = null;
        }

        this._asciiTexture.dispose();

        if (this._cubeTester) {
            this._cubeTester.geometry.dispose();
            (this._cubeTester.material as THREE.Material).dispose();
            this._cubeTester = null;
        }
    }
}
