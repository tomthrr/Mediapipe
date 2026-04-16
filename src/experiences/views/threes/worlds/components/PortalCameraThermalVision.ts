import {
    LinearFilter,
    Mesh,
    ShaderMaterial,
    SRGBColorSpace,
    VideoTexture,
    Vector3,
} from 'three';
import DebugManager from '../../../../managers/DebugManager';
import { DebugGuiTitle } from '../../../../constants/experiences/DebugGuiTitle';
import MainThreeApp from '../../../../engines/threes/app/MainThreeApp';
import PortalBase from './PortalBase';
import * as THREE from 'three';

export default class PortalCameraThermalVision extends PortalBase {
    private static readonly _DEBUG_INIT_KEY: string = '__portalCameraThermalVisionDebugInit';

    private _time: number = 0;
    private _portalMaterial: ShaderMaterial | null = null;
    private _videoTexture: VideoTexture | null = null;
    private _previousSceneBackground: THREE.Texture | THREE.Color | null = null;

    private static readonly _VERTEX_SHADER = `
        varying vec4 vClipPos;

        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vClipPos = projectionMatrix * viewMatrix * worldPos;
            gl_Position = vClipPos;
        }
    `;

    private static readonly _FRAGMENT_SHADER = `
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

            if (luminance < 0.5) {
                color = mix(colors[0], colors[1], luminance / 0.5);
            } else {
                color = mix(colors[1], colors[2], (luminance - 0.5) / 0.5);
            }

            return color;
        }

        void main() {
            vec2 uv = (vClipPos.xy / max(vClipPos.w, 0.0001)) * 0.5 + 0.5;
            vec3 ctexture = texture2D(uSceneTex, uv).rgb;
            vec3 color = thermal_vision(ctexture);
            color = thermal_vision(color);
            gl_FragColor = vec4(color, 1.0);
        }
    `;

    constructor() {
        super();
        this._initMesh();
        this._initDebug();
    }

    private _initDebug(): void {
        if (!DebugManager.isActive) return;

        const folder = DebugManager.getGuiFolder(DebugGuiTitle.PORTAIL_THERMAL_VISION);
        const anyFolder = folder as unknown as Record<string, unknown>;
        if (anyFolder[PortalCameraThermalVision._DEBUG_INIT_KEY]) return;
        anyFolder[PortalCameraThermalVision._DEBUG_INIT_KEY] = true;

        folder.add(this._portalSettings, 'enabled').name('enabled');
        folder.add(this._portalSettings, 'handDepth', -10, 10, 0.01).name('handDepth');
        folder.add(this._portalSettings, 'handSpread', 0, 10, 0.01).name('handSpread');
        folder.add(this._portalSettings, 'smoothing', 0.01, 0.5, 0.01).name('smoothing');
    }

    private _initMesh(): void {
        this._createPortalActor();
        this._initVideoTexture();
    }

    private _createPortalActor(): Mesh {
        const tmpMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        tmpMat.dispose();

        const shaderMat = new ShaderMaterial({
            vertexShader: PortalCameraThermalVision._VERTEX_SHADER,
            fragmentShader: PortalCameraThermalVision._FRAGMENT_SHADER,
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

        const mesh = super._createPortalMesh(shaderMat);
        this._portalMaterial = shaderMat;
        return mesh;
    }

    private _initVideoTexture(): boolean {
        if (this._videoTexture) return true;

        const video = document.getElementById('webcam') as HTMLVideoElement | null;
        if (!video) return false;

        const texture = new VideoTexture(video);
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;

        this._videoTexture = texture;

        if (this._portalMaterial) {
            this._portalMaterial.uniforms.uSceneTex.value = texture;
        }

        if (this._previousSceneBackground === null) {
            this._previousSceneBackground = MainThreeApp.scene.background as THREE.Texture | THREE.Color | null;
        }
        MainThreeApp.scene.background = texture;



        return true;
    }

    public update(dt: number): void {
        super.update(dt);
        this._time += dt;

        this._initVideoTexture();
        if (this._portalMaterial) {
            if (this._videoTexture) {
                this._portalMaterial.uniforms.uSceneTex.value = this._videoTexture;
            }
            this._portalMaterial.uniforms.uTime.value = this._time;
            this._portalMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        }

        this._updatePortalMeshFromHands();
    }

    public override reset(): void {}

    public dispose(): void {
        this._disposePortalBase();
        this._portalMaterial = null;

        if (this._videoTexture) {
            this._videoTexture.dispose();
            this._videoTexture = null;
        }

        MainThreeApp.scene.background = this._previousSceneBackground;
        this._previousSceneBackground = null;
    }
}
