import {
    Mesh,
    LinearFilter,
    RGBAFormat,
    ShaderMaterial,
    UnsignedByteType,
} from 'three';
import DebugManager from '../../../../managers/DebugManager';
import { DebugGuiTitle } from '../../../../constants/experiences/DebugGuiTitle';
import MainThreeApp from '../../../../engines/threes/app/MainThreeApp';
import PortalBase from './PortalBase';
import * as THREE from 'three';

export default class PortalThermalVision extends PortalBase {
    private static readonly _DEBUG_INIT_KEY: string = '__portalThermalVisionDebugInit';

    private _time: number = 0;
    private _cubeTester: Mesh | null = null;
    private _portalMaterial: ShaderMaterial | null = null;

    private _renderTarget: THREE.WebGLRenderTarget | null = null;
    private _renderPixels: Uint8Array = new Uint8Array(0);
    private _captureWidth: number = 0;
    private _captureHeight: number = 0;

    private readonly _settings = {
        captureHeight: 1080,
        thermalIntensity: 1.0,
        scanlineStrength: 0.05,
        noiseStrength: 1.0,
        distortionStrength: 0.05,
        crtBend: 2.0,
        shiftR: 0.008,
        shiftG: 0.009,
        shiftB: 0.008,
    };

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
        uniform float uThermalIntensity;
        uniform float uScanlineStrength;
        uniform float uNoiseStrength;
        uniform float uDistortionStrength;
        uniform float uCrtBend;
        uniform float uShiftR;
        uniform float uShiftG;
        uniform float uShiftB;

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

        float scanline(vec2 uv) {
            return sin(uResolution.y * uv.y * 0.7 - uTime * 10.0);
        }

        float slowscan(vec2 uv) {
            return sin(uResolution.y * uv.y * 0.02 + uTime * 6.0);
        }

        vec2 scandistort(vec2 uv) {
            float scan1 = clamp(cos(uv.y * 2.0 + uTime), 0.0, 1.0);
            float scan2 = clamp(cos(uv.y * 2.0 + uTime + 4.0) * 10.0, 0.0, 1.0) ;
            float amount = scan1 * scan2 * uv.x; 
            
            uv.x -= uDistortionStrength * mix(texture(uSceneTex, vec2(uv.x, amount)).r * amount, amount, 0.9);

            return uv;
            
        }

        // from https://www.shadertoy.com/view/4sf3Dr
        // Thanks, Jasper
        vec2 crt(vec2 coord, float bend) {
            // put in symmetrical coords
            coord = (coord - 0.5) * 2.0;

            coord *= 0.5;	
            
            // deform coords
            coord.x *= 1.0 + pow((abs(coord.y) / bend), 2.0);
            coord.y *= 1.0 + pow((abs(coord.x) / bend), 2.0);

            // transform back to 0.0 - 1.0 space
            coord  = (coord / 1.0) + 0.5;

            return coord;
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

            vec2 sd_uv = scandistort(uv);
            vec2 crt_uv = crt(sd_uv, uCrtBend);

            // Récupère le rand AVANT de modifier color
            vec4 rand = texture(uSceneTex, vec2(uTime * 0.01, uTime * 0.02));

            // Sample avec color shift par canal sur la texture BRUTE
            float r = texture(uSceneTex, crt(colorshift(sd_uv, uShiftR, rand.r), uCrtBend)).r;
            float g = texture(uSceneTex, crt(colorshift(sd_uv, uShiftG, rand.g), uCrtBend)).g;
            float b = texture(uSceneTex, crt(colorshift(sd_uv, uShiftB, rand.b), uCrtBend)).b;

            // Applique thermal_vision sur la couleur reconstituée
            vec3 rawColor = vec3(r, g, b);
            vec3 thermalColor = thermal_vision(rawColor);
            vec3 color = mix(rawColor, thermalColor, clamp(uThermalIntensity, 0.0, 1.0));

            // Scanlines
            vec3 scanline_color = vec3(scanline(crt_uv));
            vec3 slowscan_color = vec3(slowscan(crt_uv));

            color = mix(color, mix(scanline_color, slowscan_color, 0.5), uScanlineStrength);
            color *= mix(1.0, noise(uv), uNoiseStrength);

            // vec3 ctexture = texture2D(uSceneTex, uv).rgb;
            // vec3 color = thermal_vision(ctexture);

            gl_FragColor = vec4(thermal_vision(color), 1.0);
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
        if (anyFolder[PortalThermalVision._DEBUG_INIT_KEY]) return;
        anyFolder[PortalThermalVision._DEBUG_INIT_KEY] = true;

        folder.add(this._portalSettings, 'enabled').name('enabled');
        folder.add(this._portalSettings, 'handDepth', -10, 10, 0.01).name('handDepth');
        folder.add(this._portalSettings, 'handSpread', 0, 10, 0.01).name('handSpread');
        folder.add(this._portalSettings, 'smoothing', 0.01, 0.5, 0.01).name('smoothing');
        folder
            .add(this._settings, 'captureHeight', 64, 480, 1)
            .name('captureHeight')
            .onChange(() => this._ensureRenderTarget());
        folder.add(this._settings, 'thermalIntensity', 0, 1, 0.001).name('thermal');
        folder.add(this._settings, 'scanlineStrength', 0, 0.3, 0.001).name('scanline');
        folder.add(this._settings, 'noiseStrength', 0, 1.5, 0.001).name('noise');
        folder.add(this._settings, 'distortionStrength', 0, 0.2, 0.001).name('distortion');
        folder.add(this._settings, 'crtBend', 0.8, 5, 0.01).name('crtBend');
        folder.add(this._settings, 'shiftR', 0, 0.08, 0.001).name('shiftR');
        folder.add(this._settings, 'shiftG', 0, 0.08, 0.001).name('shiftG');
        folder.add(this._settings, 'shiftB', 0, 0.08, 0.001).name('shiftB');
    }

    private _initMesh(): void {
        this._generateCubeTester();
        this._createPortalActor();
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

    private _createPortalActor(): Mesh {
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
                uThermalIntensity: { value: this._settings.thermalIntensity },
                uScanlineStrength: { value: this._settings.scanlineStrength },
                uNoiseStrength: { value: this._settings.noiseStrength },
                uDistortionStrength: { value: this._settings.distortionStrength },
                uCrtBend: { value: this._settings.crtBend },
                uShiftR: { value: this._settings.shiftR },
                uShiftG: { value: this._settings.shiftG },
                uShiftB: { value: this._settings.shiftB },
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

    public update(dt: number): void {
        super.update(dt);
        this._time += dt;

        this._captureSceneToRenderTarget();
        if (this._portalMaterial) {
            this._portalMaterial.uniforms.uTime.value = this._time;
            this._portalMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
            this._portalMaterial.uniforms.uThermalIntensity.value = this._settings.thermalIntensity;
            this._portalMaterial.uniforms.uScanlineStrength.value = this._settings.scanlineStrength;
            this._portalMaterial.uniforms.uNoiseStrength.value = this._settings.noiseStrength;
            this._portalMaterial.uniforms.uDistortionStrength.value = this._settings.distortionStrength;
            this._portalMaterial.uniforms.uCrtBend.value = this._settings.crtBend;
            this._portalMaterial.uniforms.uShiftR.value = this._settings.shiftR;
            this._portalMaterial.uniforms.uShiftG.value = this._settings.shiftG;
            this._portalMaterial.uniforms.uShiftB.value = this._settings.shiftB;
        }

        if (this._cubeTester) {
            this._cubeTester.rotation.x = this._time * 0.5;
            this._cubeTester.rotation.y = this._time * 0.3;
        }

        this._updatePortalMeshFromHands();
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

    public override reset(): void { }

    public dispose(): void {
        this._disposePortalBase();
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
