import { AssetUtils, DomKeyboardManager, DomPointerManager, DomResizeManager, TickerManager } from '@benjos/cookware';
import { AssetId } from '../constants/experiences/AssetId';
import DebugManager from '../managers/DebugManager';
import LoaderManager from '../managers/LoaderManager';
import ThreeAssetsManager from '../managers/threes/ThreeAssetsManager';
import ThreeCameraControllerManager from '../managers/threes/ThreeCameraControllerManager';
import ThreeRaycasterManager from '../managers/threes/ThreeRaycasterManager';
import MediapipeManager from '../managers/MediapipeManager';

class InitCommand {
    public init(): void {
        this._initUtils();
        this._initProxies();
        this._initManagers();
        this._initCommonAssets();
        this._initThreeSharedAssets();
    }

    private _initUtils(): void {
        AssetUtils.Init();
    }

    private _initProxies(): void {
        //
    }

    private _initManagers(): void {
        TickerManager.init();
        DomKeyboardManager.init();
        DomPointerManager.init();
        ThreeAssetsManager.init();
        ThreeCameraControllerManager.init();
        DomResizeManager.init();
        DebugManager.init();
        ThreeRaycasterManager.init();
        LoaderManager.init();
        MediapipeManager.init();
    }

    private _initCommonAssets(): void {
        //
    }

    private _initThreeSharedAssets(): void {
        ThreeAssetsManager.addHDR(AssetId.THREE_HDR_TEMPLATE, AssetUtils.GetPath('hdrs/template.hdr'));
        ThreeAssetsManager.addModel(AssetId.THREE_GLTF_TEMPLATE, AssetUtils.GetPath('models/template.glb'));
        ThreeAssetsManager.addTexture(AssetId.THREE_TEXTURE_TEMPLATE, AssetUtils.GetPath('textures/template.jpg'));
        ThreeAssetsManager.addFont(AssetId.THREE_FONT_TEMPLATE, AssetUtils.GetPath('fonts/template.typeface.json'));

        ThreeAssetsManager.addHDR(AssetId.THREE_HDR_1, AssetUtils.GetPath('hdrs/ferndale_studio_05_1k.hdr'));
        ThreeAssetsManager.addHDR(AssetId.THREE_HDR_2, AssetUtils.GetPath('hdrs/wooden_studio_10_1k.hdr'));
        ThreeAssetsManager.addHDR(AssetId.THREE_HDR_3, AssetUtils.GetPath('hdrs/pink_sunrise_1k.hdr'));

        ThreeAssetsManager.addModel(AssetId.THREE_GLTF_DUNES, AssetUtils.GetPath('models/desert_statue_uv.glb'));
        ThreeAssetsManager.addTexture(AssetId.THREE_TEXTURE_DUNES_ARM, AssetUtils.GetPath('textures/dunes/dunes_arm.png'));
        ThreeAssetsManager.addTexture(AssetId.THREE_TEXTURE_DUNES_NORMAL, AssetUtils.GetPath('textures/dunes/dunes_normal.png'));
    }
}

export default new InitCommand();
