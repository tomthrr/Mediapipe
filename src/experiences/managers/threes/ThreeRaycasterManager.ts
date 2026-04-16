import { DomPointerManager } from '@benjos/cookware';
import { Raycaster, Vector2, type Intersection, type Object3D, type Object3DEventMap } from 'three';
import MainThreeApp from '../../engines/threes/app/MainThreeApp';

class ThreeRaycasterManager {
    private readonly _raycaster = new Raycaster();
    private readonly _pointerPosition = new Vector2();
    
    public init(): void {
    }

    public castFromCameraToPointer(objects: Object3D[], recursive = true): Intersection<Object3D<Object3DEventMap>>[] {
        this._pointerPosition.set(DomPointerManager.ndcX, DomPointerManager.ndcY);
        this._raycaster.setFromCamera(this._pointerPosition, MainThreeApp.cameraController.camera);
        const intersects = this._raycaster.intersectObjects(objects, recursive);
        return intersects;
    }

    public castFromCameraToNdc(
        ndcX: number,
        ndcY: number,
        objects: Object3D[],
        recursive = true,
    ): Intersection<Object3D<Object3DEventMap>>[] {
        this._pointerPosition.set(ndcX, ndcY);
        this._raycaster.setFromCamera(this._pointerPosition, MainThreeApp.cameraController.camera);
        return this._raycaster.intersectObjects(objects, recursive);
    }
}

export default new ThreeRaycasterManager();
