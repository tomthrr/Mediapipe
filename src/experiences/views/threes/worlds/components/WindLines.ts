import {
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    NormalBlending,
    Vector2,
    Vector3,
    Texture,
    CanvasTexture,
    AdditiveBlending,
} from 'three';
import ThreeActorBase from '../../bases/components/ThreeActorBase';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
import { type MediapipeHandsSnapshot } from '../../../../managers/MediapipeManager';
import ThreeCameraControllerManager from '../../../../managers/threes/ThreeCameraControllerManager';
import { CameraId } from '../../../../constants/experiences/CameraId';
import ThreeCameraControllerBase from '../../../../cameras/threes/bases/ThreeCameraControllerBase';
import DebugManager from '../../../../managers/DebugManager';
import { DebugGuiTitle } from '../../../../constants/experiences/DebugGuiTitle';
import ThreeRaycasterManager from '../../../../managers/threes/ThreeRaycasterManager';
import MainThreeApp from '../../../../engines/threes/app/MainThreeApp';
import { Object3DId } from '../../../../constants/experiences/Object3dId';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────

type Trail = {
    mesh: Mesh;
    geometry: MeshLineGeometry;
    material: MeshLineMaterial;
    points: Vector3[];
    offset: Vector3;
    phase: number;
    speed: number;
    smoothedTarget: Vector3;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export default class WindLines extends ThreeActorBase {
    private static readonly _NUM_TRAILS   = 12;
    private static readonly _TRAIL_LEN    = 200;
    private static readonly _TRAIL_COLORS = [
        '#00c3ff',
        '#ffd900', 
        '#ff8800', 
        '#ff0000'
    ];

    private static readonly _DEBUG_INIT_KEY: string = '__windLinesDebugInit';

    private _trails: Trail[]   = [];
    private _time: number      = 0;
    private _target3D: Vector3 = new Vector3();
    private _cameraController: ThreeCameraControllerBase;

    private _debugRaycastPoint: Mesh | null = null;

    private readonly _settings = {
        enabled: true,
        handDepth: 0,
        handSpread: 4,
        smoothing: 0.07,
        numTrails: WindLines._NUM_TRAILS,
        lineWidth: 0.35,
        trailSpread: 0.3,
        amplitudeXY: 0.2,
        amplitudeZ: 0.1,
        color0: WindLines._TRAIL_COLORS[0],
        color1: WindLines._TRAIL_COLORS[1],
        color2: WindLines._TRAIL_COLORS[2],
        color3: WindLines._TRAIL_COLORS[3],
    };

    // Reusable vectors — allocated once, never inside the hot path
    private readonly _right   = new Vector3();
    private readonly _up      = new Vector3();
    private readonly _forward = new Vector3();

    constructor() {
        super();
        this._cameraController = ThreeCameraControllerManager.get(CameraId.THREE_MAIN);
        this._initMesh();
        window.addEventListener('hand:update', this._onHandUpdate);

        this._initDebug();
    }

    private _initDebug(): void {
        if (!DebugManager.isActive) return;

        const folder = DebugManager.getGuiFolder(DebugGuiTitle.WINDLINES);
        const anyFolder = folder as unknown as Record<string, unknown>;
        if (anyFolder[WindLines._DEBUG_INIT_KEY]) return;
        anyFolder[WindLines._DEBUG_INIT_KEY] = true;

        folder.add(this._settings, 'enabled').name('enabled');
        folder.add(this._settings, 'handDepth', -10, 10, 0.01).name('handDepth');
        folder.add(this._settings, 'handSpread', 0, 10, 0.01).name('handSpread');
        folder.add(this._settings, 'smoothing', 0.01, 0.5, 0.01).name('smoothing');

        folder
            .add(this._settings, 'lineWidth', 0.01, 2, 0.01)
            .name('lineWidth')
            .onChange(() => this._applyLineWidth());

        folder.add(this._settings, 'trailSpread', 0, 1, 0.01).name('trailSpread');
        folder.add(this._settings, 'amplitudeXY', 0, 1, 0.01).name('amplitudeXY');
        folder.add(this._settings, 'amplitudeZ', 0, 1, 0.01).name('amplitudeZ');

        folder.addColor(this._settings, 'color0').name('color0').onChange(() => this._applyColors());
        folder.addColor(this._settings, 'color1').name('color1').onChange(() => this._applyColors());
        folder.addColor(this._settings, 'color2').name('color2').onChange(() => this._applyColors());
        folder.addColor(this._settings, 'color3').name('color3').onChange(() => this._applyColors());

        folder.add(this._settings, 'numTrails', 1, 10, 1).name('numTrails').onChange((value: number) => {
            this._settings.numTrails = value;
            if (this._trails.length > value) {
                const toRemove = this._trails.splice(value);
                toRemove.forEach(tr => {
                    this.remove(tr.mesh);
                    tr.geometry.dispose();
                    tr.material.dispose();
                });
            } else {
                const toAdd = value - this._trails.length;
                for (let i = 0; i < toAdd; i++) {
                    this.generateMesh(i);     
                }
            }
        });
    }

    private _getTrailColor(index: number): string {
        const palette = [this._settings.color0, this._settings.color1, this._settings.color2, this._settings.color3];
        return palette[index % palette.length];
    }

    private _applyColors(): void {
        for (let i = 0; i < this._trails.length; i++) {
            this._trails[i].material.color.set(this._getTrailColor(i));
        }
    }

    private _applyLineWidth(): void {
        for (const tr of this._trails) {
            tr.material.lineWidth = this._settings.lineWidth;
        }
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    private _initMesh(): void {
        for (let t = 0; t < WindLines._NUM_TRAILS; t++) {
            this.generateMesh(t);
        }
    }

    private generateMesh(t: number): void {
        const points: Vector3[] = Array(WindLines._TRAIL_LEN)
            .fill(0)
            .map(() => new Vector3());

        const geometry = new MeshLineGeometry();
        geometry.setPoints(points.map(p => p.clone()));

        const mat = new MeshLineMaterial({
            color: this._getTrailColor(t),
            sizeAttenuation: 1,
            resolution: new Vector2(window.innerWidth, window.innerHeight),
            lineWidth: this._settings.lineWidth,
        });
        
        const mesh = new Mesh(geometry, mat);
        
        this.add(mesh);

        this._trails.push({
            mesh,
            geometry,
            material: mat,
            points,
            offset: new Vector3(
                (Math.random() - 0.5) * this._settings.trailSpread,
                (Math.random() - 0.5) * this._settings.trailSpread,
                (Math.random() - 0.5) * this._settings.trailSpread,
            ),
            phase: Math.random() * Math.PI * 2,
            speed: 0.8 + Math.random() * 0.6,
            smoothedTarget: new Vector3(),
        });
    }

    private _createAlphaTexture(): Texture {
        const canvas = document.createElement('canvas');
        canvas.width  = 256;
        canvas.height = 1;
        const ctx = canvas.getContext('2d')!;

        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        gradient.addColorStop(0,   'rgba(255,255,255,1)');
        gradient.addColorStop(0.9, 'rgba(255,255,255,0.1)');
        gradient.addColorStop(1,   'rgba(255,255,255,0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);

        const texture = new CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Converts a mediapipe [0..1] tip into a world-space position locked
     * in front of the camera, using the camera's own right/up/forward axes.
     *
     * extractBasis pulls the three columns of the camera's world matrix:
     *   col 0 → right, col 1 → up, col 2 → camera's local +Z (backwards),
     * so we negate col 2 to get the true look-forward direction.
     */
    private _handToWorld(tip: { x: number; y: number; z: number }): Vector3 {
        const camera = this._cameraController.camera;

        // Remap mediapipe [0..1] → [-1..1], mirror x so left = left on screen
        const nx = (tip.x - 0.5) * -2;
        const ny = (0.5 - tip.y) *  2;

        camera.matrixWorld.extractBasis(this._right, this._up, this._forward);
        this._forward.negate(); // col 2 is +Z (behind camera), flip to look direction

        return new Vector3()
            .copy(camera.position)
            .addScaledVector(this._forward, this._settings.handDepth)
            .addScaledVector(this._right,   nx * this._settings.handSpread)
            .addScaledVector(this._up,      ny * this._settings.handSpread);
    }

    private _onHandUpdate = (e: CustomEvent<MediapipeHandsSnapshot>): void => {
        if (!this._settings.enabled) return;
        const tip = e.detail.right?.indexTip;
        if (tip) {
            // Convert Mediapipe [0..1] → NDC [-1..1].
            // Mirror X to match your UI/camera mapping.
            const ndcX = (0.5 - tip.x) * 2;
            const ndcY = (0.5 - tip.y) * 2;

            const statueRoot =
                MainThreeApp.scene.getObjectByName(Object3DId.STATUE) ?? MainThreeApp.scene.getObjectByName('STATUE001');

            if (statueRoot) {
                const hits = ThreeRaycasterManager.castFromCameraToNdc(ndcX, ndcY, [statueRoot]);
                if (hits.length > 0) {
                    const hit = hits[0];
                    console.log('Hit statue at', hit.point);
                    this._target3D.copy(hit.point);
                    this._applyHitToStatue(statueRoot, hit);
                    return;
                }
            }

            // Fallback: keep the previous behavior if we don't hit the statue.
            this._target3D.copy(this._handToWorld(tip));
        };
    };

    private _applyHitToStatue(statueRoot: THREE.Object3D, hit: THREE.Intersection): void {
        // Unlimited persistence: paint into the statue's hit-mask texture (created by Statue.ts).
        let node: THREE.Object3D | null = statueRoot;
        let painter:
            | { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.Texture; size: number }
            | undefined;

        while (node && !painter) {
            painter = node.userData.hitMaskPainter;
            node = node.parent;
        }

        if (!painter) return;
        if (!hit.uv) return;

        const { ctx, texture, size } = painter;
        const x = hit.uv.x * size;
        const y = (1 - hit.uv.y) * size;

        const radius = 30;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grd.addColorStop(0, 'rgba(255,255,255,0.9)');
        grd.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        texture.needsUpdate = true;
    }

    public update(dt: number): void {
        super.update(dt);
        this._time += dt;

        this._trails.forEach((tr) => {
            tr.smoothedTarget.lerp(this._target3D, this._settings.smoothing);

            tr.points.unshift(this._getWavePoint(tr, this._time));
            if (tr.points.length > WindLines._TRAIL_LEN) tr.points.pop();

            tr.geometry.setPoints(
                tr.points.map((p: Vector3) => p.clone()),
                (p: number) => {
                    const edge = 0.1;
                    if (p < edge)     return MathUtils.lerp(0.05, tr.material.lineWidth, p / edge);
                    if (p > 1 - edge) return MathUtils.lerp(0.05, tr.material.lineWidth, (1 - p) / edge);
                    return tr.material.lineWidth;
                },
            );
        });
    }

    private _getWavePoint(tr: Trail, t: number): Vector3 {
        const idx = tr.points.length;
        const { amplitudeXY: aXY, amplitudeZ: aZ } = this._settings;

        const wave = new Vector3(
            Math.sin(t * tr.speed         + tr.phase + idx * 0.20) * aXY,
            Math.cos(t * tr.speed * 1.3   + tr.phase + idx * 0.15) * aXY,
            Math.sin(t * tr.speed * 0.7   + tr.phase + idx * 0.10) * aZ,
        );
        return new Vector3().copy(tr.smoothedTarget).add(tr.offset).add(wave);
    }

    public override reset(): void {}

    public dispose(): void {
        window.removeEventListener('hand:update', this._onHandUpdate);
        for (const trail of this._trails) {
            this.remove(trail.mesh);
            trail.geometry.dispose();
            trail.material.dispose();
        }
        this._trails = [];

        if (this._debugRaycastPoint) {
            MainThreeApp.scene.remove(this._debugRaycastPoint);
            this._debugRaycastPoint.geometry.dispose();
            (this._debugRaycastPoint.material as MeshBasicMaterial).dispose();
            this._debugRaycastPoint = null;
        }
    }
}