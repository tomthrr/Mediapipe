import {
    Mesh,
    Vector3,
    LinearFilter,
    RGBAFormat,
    ShaderMaterial,
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

export default class PortalThermalVision extends ThreeActorBase {
    private static readonly _DEBUG_INIT_KEY: string = '__portalThermalVisionDebugInit';

    private _time: number = 0;
    private _cameraController: ThreeCameraControllerBase;
    private _cubeTester: Mesh | null = null;
    private _portalMesh: Mesh | null = null;
    private _portalMaterial: ShaderMaterial | null = null;

    private _renderTarget: THREE.WebGLRenderTarget | null = null;
    private _renderPixels: Uint8Array = new Uint8Array(0);
    private _captureWidth: number = 0;
    private _captureHeight: number = 0;

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
        captureHeight: 1080,
        smoothing: 0.07,
    };

    private readonly _right = new Vector3();
    private readonly _up = new Vector3();
    private readonly _forward = new Vector3();

    private static readonly _VERTEX_SHADER = `
        varying vec4 vClipPos;

        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vClipPos = projectionMatrix * viewMatrix * worldPos;
            gl_Position = vClipPos;
        }
    `;

    private static readonly _FRAGMENT_SHADER = `
        // https://www.shadertoy.com/view/XdGXDh
        // Thermal vision shader by maldicion069
        
        uniform sampler2D uSceneTex;
        uniform float uTime;
        uniform vec2 uResolution;

        varying vec4 vClipPos;

        vec3 thermal_vision(in vec3 color) {
            vec3 colors[3];

            colors[0] = vec3(0.0, 0.0, 1.0);
            colors[1] = vec3(1.0, 1.0, 0.0);
            colors[2] = vec3(1.0, 0.0, 0.0);

            float luminance = dot(vec3(0.40, 0.38, 0.25), color);

            if(luminance < 0.5) {
                color = mix(colors[0], colors[1], luminance / 0.5);
            } else {
                color = mix(colors[1], colors[2], (luminance - 0.5) / 0.5);   
            }
            return color;
        }

        vec2 colorShift(vec2 uv) {
            return vec2(
                uv.x,
                uv.y + sin(uTime)*0.02
            );
        }

        float noise(vec2 uv) {
            return clamp(texture(uSceneTex, uv.xy + uTime*6.0).r +
                texture(uSceneTex, uv.xy - uTime*4.0).g, 0.96, 1.0);
        }

        vec2 colorshift(vec2 uv, float amount, float rand) {
            
            return vec2(
                uv.x,
                uv.y + amount * rand * sin(uv.y * uResolution.y * 0.12 + uTime)
            );
        }

        void main() {
            vec2 uv = (vClipPos.xy / max(vClipPos.w, 0.0001)) * 0.5 + 0.5;

            vec3 ctexture = texture2D(uSceneTex, uv).rgb;
            // add color thermal vision effect
            vec3 color = thermal_vision(ctexture);
            color = thermal_vision(color.rgb);

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    constructor() {
        super();
        this._cameraController = ThreeCameraControllerManager.get(CameraId.THREE_MAIN);
        this._initMesh();
        window.addEventListener('hand:update', this._onHandUpdate);
        this._initDebug();
    }

    private _initDebug(): void {
        if (!DebugManager.isActive) return;

        const folder = DebugManager.getGuiFolder(DebugGuiTitle.PORTAIL_THERMAL_VISION);
        const anyFolder = folder as unknown as Record<string, unknown>;
        if (anyFolder[PortalThermalVision._DEBUG_INIT_KEY]) return;
        anyFolder[PortalThermalVision._DEBUG_INIT_KEY] = true;

        folder.add(this._settings, 'enabled').name('enabled');
        folder.add(this._settings, 'handDepth', -10, 10, 0.01).name('handDepth');
        folder.add(this._settings, 'handSpread', 0, 10, 0.01).name('handSpread');
        folder.add(this._settings, 'smoothing', 0.01, 0.5, 0.01).name('smoothing');
        folder
            .add(this._settings, 'captureHeight', 64, 480, 1)
            .name('captureHeight')
            .onChange(() => this._ensureRenderTarget());
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
        });
        mat.dispose();

        const shaderMat = new ShaderMaterial({
            vertexShader: PortalThermalVision._VERTEX_SHADER,
            fragmentShader: PortalThermalVision._FRAGMENT_SHADER,
            uniforms: {
                uSceneTex: { value: null },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            },
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        shaderMat.toneMapped = false;

        const mesh = new THREE.Mesh(geo, shaderMat);
        mesh.frustumCulled = false;
        this._portalMesh = mesh;
        this._portalMaterial = shaderMat;
        this.add(mesh);
        return mesh;
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

        this._captureSceneToRenderTarget();
        if (this._portalMaterial) {
            this._portalMaterial.uniforms.uTime.value = this._time;
        }

        if (this._cubeTester) {
            this._cubeTester.rotation.x = this._time * 0.5;
            this._cubeTester.rotation.y = this._time * 0.3;
        }

        this._updatePortalMesh();
    }

    private _captureSceneToRenderTarget(): void {
        if (!this._renderTarget || !this._portalMesh || !this._portalMaterial) return;

        const renderer = MainThreeApp.renderer;
        const previousRenderTarget = renderer.getRenderTarget();

        this._portalMesh.visible = false;
        renderer.setRenderTarget(this._renderTarget);
        renderer.clear();
        renderer.render(MainThreeApp.scene, this._cameraController.camera);
        renderer.setRenderTarget(previousRenderTarget);
        this._portalMesh.visible = true;

        this._portalMaterial.uniforms.uSceneTex.value = this._renderTarget.texture;
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

    public override reset(): void { }

    public dispose(): void {
        window.removeEventListener('hand:update', this._onHandUpdate);

        if (this._portalMesh) {
            this._portalMesh.geometry.dispose();
            (this._portalMesh.material as THREE.Material).dispose();
            this._portalMesh = null;
        }
        this._portalMaterial = null;

        if (this._renderTarget) {
            this._renderTarget.dispose();
            this._renderTarget = null;
        }

        if (this._cubeTester) {
            this._cubeTester.geometry.dispose();
            (this._cubeTester.material as THREE.Material).dispose();
            this._cubeTester = null;
        }
    }
}
