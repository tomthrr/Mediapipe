import { CanvasTexture, Mesh, Vector3, type WebGLProgramParametersWithUniforms } from "three";
import { AssetId } from "../../../../constants/experiences/AssetId";
import { Object3DId } from "../../../../constants/experiences/Object3dId";
import ThreeModelBase from "../../bases/components/ThreeModelBase";

export default class Statue extends ThreeModelBase {
    private static readonly _HIT_MASK_SIZE = 1024;

    private readonly _hitMaskCanvas: HTMLCanvasElement;
    private readonly _hitMaskCtx: CanvasRenderingContext2D;
    private readonly _hitMaskTexture: CanvasTexture;

    constructor() {
        super(AssetId.THREE_GLTF_DUNES, {
            object3DId: Object3DId.STATUE,
            castShadow: true,
            receiveShadow: true,
        });

        this._hitMaskCanvas = document.createElement('canvas');
        this._hitMaskCanvas.width = Statue._HIT_MASK_SIZE;
        this._hitMaskCanvas.height = Statue._HIT_MASK_SIZE;
        this._hitMaskCtx = this._hitMaskCanvas.getContext('2d')!;
        this._hitMaskCtx.fillStyle = 'black';
        this._hitMaskCtx.fillRect(0, 0, Statue._HIT_MASK_SIZE, Statue._HIT_MASK_SIZE);

        this._hitMaskTexture = new CanvasTexture(this._hitMaskCanvas);
        this._hitMaskTexture.needsUpdate = true;

        // Expose a painter on the statue root so other systems can update it (WindLines/Mediapipe).
        this._model.userData.hitMaskPainter = {
            canvas: this._hitMaskCanvas,
            ctx: this._hitMaskCtx,
            texture: this._hitMaskTexture,
            size: Statue._HIT_MASK_SIZE,
        };

        this._model.traverse((child) => {
            if (!(child instanceof Mesh)) return;

            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const material of materials) {
                // Force UV support so the shader has access to vUv.
                material.defines = { ...(material.defines ?? {}), USE_UV: '' };
                material.needsUpdate = true;

                material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
                    shader.uniforms.uHitMask = { value: this._hitMaskTexture };

                    shader.fragmentShader = `
                        uniform sampler2D uHitMask;
                        ${shader.fragmentShader}
                    `.replace(
                        `#include <dithering_fragment>`,
                        `
                        float hitStrength = texture2D(uHitMask, vUv).r;
                        vec3 hitColor = vec3(0.0, 0.1, 1.0);
                        gl_FragColor.rgb = mix(gl_FragColor.rgb, hitColor, clamp(hitStrength, 0.0, 1.0));
                        #include <dithering_fragment>`,
                    );

                    material.userData.shader = shader;
                };
            }
        });
    }

    public override reset(): void {
        //
    }

    public update(dt: number): void {
        super.update(dt);
    }
}
