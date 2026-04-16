import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { DebugGuiTitle } from '../../../constants/experiences/DebugGuiTitle';
import MainThreeApp from '../../../engines/threes/app/MainThreeApp';
import DebugManager from '../../../managers/DebugManager';

type BokehUniforms = {
    focus: { value: number };
    aperture: { value: number };
    maxblur: { value: number };
};

export default class BokehThreePass extends BokehPass {
    private static readonly _FOLDER_TITLE: string = 'Bokeh';

    private static readonly _DEFAULT_FOCUS: number = 0.1;
    private static readonly _MIN_FOCUS: number = 0.1;
    private static readonly _MAX_FOCUS: number = 50;

    private static readonly _DEFAULT_APERTURE: number = 0.0002;
    private static readonly _MIN_APERTURE: number = 0;
    private static readonly _MAX_APERTURE: number = 0.01;

    private static readonly _DEFAULT_MAX_BLUR: number = 0.008;
    private static readonly _MIN_MAX_BLUR: number = 0;
    private static readonly _MAX_MAX_BLUR: number = 0.1;

    constructor() {
        super(MainThreeApp.scene, MainThreeApp.cameraController.camera, {
            focus: BokehThreePass._DEFAULT_FOCUS,
            aperture: BokehThreePass._DEFAULT_APERTURE,
            maxblur: BokehThreePass._DEFAULT_MAX_BLUR,
        });

        if (DebugManager.isActive) this._initDebug();
    }

    private _initDebug(): void {
        const composersFolder = DebugManager.getGuiFolder(DebugGuiTitle.THREE_COMPOSERS);
        const folder = composersFolder.addFolder(BokehThreePass._FOLDER_TITLE);
        const uniforms = this.uniforms as BokehUniforms;

        folder.add(this, 'enabled').name('enabled');
        folder
            .add(uniforms.focus, 'value', BokehThreePass._MIN_FOCUS, BokehThreePass._MAX_FOCUS, 0.1)
            .name('focus');
        folder
            .add(
                uniforms.aperture,
                'value',
                BokehThreePass._MIN_APERTURE,
                BokehThreePass._MAX_APERTURE,
                0.0001,
            )
            .name('aperture');
        folder
            .add(
                uniforms.maxblur,
                'value',
                BokehThreePass._MIN_MAX_BLUR,
                BokehThreePass._MAX_MAX_BLUR,
                0.001,
            )
            .name('max blur');
    }
}