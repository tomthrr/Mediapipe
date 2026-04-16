import { Mesh, type Group, type Object3D } from 'three';
import { SkeletonUtils } from 'three/examples/jsm/Addons.js';
import type { AssetId } from '../../../../constants/experiences/AssetId';
import type { Object3DId } from '../../../../constants/experiences/Object3dId';
import ThreeAssetsManager from '../../../../managers/threes/ThreeAssetsManager';
import ThreeActorBase from './ThreeActorBase';

export interface ModelBaseParams {
    object3DId?: Object3DId;
    castShadow?: boolean;
    receiveShadow?: boolean;
}

export default abstract class ThreeModelBase extends ThreeActorBase {
    protected _assetId: AssetId;
    protected _parameters: ModelBaseParams;
    declare protected _model: Group | Object3D | Mesh;

    constructor(assetId: AssetId, params: ModelBaseParams = {}) {
        super();
        this._assetId = assetId;
        this._parameters = params || {};

        this._generateModel();
    }

    protected _generateModel(): void {
        const originalModel = ThreeAssetsManager.getModel(this._assetId).scene;
        const model = SkeletonUtils.clone(originalModel);

        this._model = this._parameters.object3DId
            ? (model.getObjectByName(this._parameters.object3DId) ?? model)
            : model;

        this._model.traverse((child) => {
            if (child instanceof Mesh) {
                if(child.name === 'STATUE001') {
                    child.geometry.computeBoundingBox();
                };
                if (this._parameters.castShadow) child.castShadow = true;
                if (this._parameters.receiveShadow) child.receiveShadow = true;
            }
        });

        this.add(this._model);
    }

    public update(dt: number): void {
        super.update(dt);
    }
}
