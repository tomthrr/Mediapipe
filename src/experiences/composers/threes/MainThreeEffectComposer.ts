import type { Camera, Scene, WebGLRenderer } from "three";
import ThreeEffectComposerBase from "./bases/ThreeEffectComposerBase";
import KuwaharaThreePass from "./passes/KuwaharaThreePass";
import BokehThreePass from "./passes/BokehThreePass";

export default class MainThreeEffectComposer extends ThreeEffectComposerBase {
    constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
        super(renderer, scene, camera);
    }

    protected override _addPasses(): void {
        super._addPasses();
        //this._addPass(new KuwaharaThreePass());
        this._addPass(new BokehThreePass());
    }

    public override update(dt: number): void {
        super.update(dt);
    }
}
