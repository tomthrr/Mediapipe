import { DomKeyboardManager, DomPointerManager } from '@benjos/cookware';
import { KeyboardConstant } from '@benjos/spices';
import { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { CameraId } from '../../constants/experiences/CameraId';
import MainThreeApp from '../../engines/threes/app/MainThreeApp';
import ThreeRaycasterManager from '../../managers/threes/ThreeRaycasterManager';
import { ThreeCameraType, type ThreeCameraOptions } from '../../types/cameraTypes';
import ThreeCameraControllerBase from './bases/ThreeCameraControllerBase';

export default class DebugThreeCameraController extends ThreeCameraControllerBase<OrbitControls> {
    private static readonly _DEBUG_CAMERA_OPTIONS: ThreeCameraOptions = {
        type: ThreeCameraType.PERSPECTIVE,
        fov: 75,
        aspect: window.innerWidth / window.innerHeight,
        near: 0.1,
        far: 1000,
    };
    private static readonly _DEFAULT_CAMERA_POSITION: Vector3 = new Vector3(0, 1.5, 3);
    private static readonly _CONTROLS_DAMPING_FACTOR: number = 0.05;
    private static readonly _CONTROLS_CENTER_KEY: string = KeyboardConstant.CODES.CONTROL_LEFT;

    // Add at class level
    private _hitPoints: Vector3[] = [];
    private static readonly _MAX_HIT_POINTS = 64;

    constructor() {
        super(CameraId.THREE_DEBUG, DebugThreeCameraController._DEBUG_CAMERA_OPTIONS);
        this._camera.position.copy(DebugThreeCameraController._DEFAULT_CAMERA_POSITION);
        this._setControls();
        this.disable();
    }

    public override enable(): void {
        super.enable();
        DomPointerManager.onPointerDown.add(this._onMouseDown);
    }

    public override disable(): void {
        super.disable();
        DomPointerManager.onPointerDown.remove(this._onMouseDown);
    }

    private _setControls(): void {
        this._controls = new OrbitControls(this._camera, MainThreeApp.domElementContainer);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = DebugThreeCameraController._CONTROLS_DAMPING_FACTOR;
    }

    private readonly _onMouseDown = (): void => {
        if (DomKeyboardManager.isKeyDown(DebugThreeCameraController._CONTROLS_CENTER_KEY)) {
            const statue = MainThreeApp.scene.getObjectByName('STATUE001');
            if (!statue) return;

            const intersect = ThreeRaycasterManager.castFromCameraToPointer([statue]);
            if (intersect.length === 0) return;

            const hitPoint = intersect[0].point.clone();

            // Cap the array to avoid runaway growth
            if (this._hitPoints.length < DebugThreeCameraController._MAX_HIT_POINTS) {
                this._hitPoints.push(hitPoint);
            }

            // Sync all children that have a shader
            statue.traverse((child) => {
                if (!(child)) return;
                const shader = child.material.userData.shader;
                if (!shader) return;

                const arr = shader.uniforms.uHitPoints.value as Vector3[];
                this._hitPoints.forEach((p, i) => {
                    arr[i].copy(p); // mutate in-place, no allocation
                });
                shader.uniforms.uHitCount.value = this._hitPoints.length;
            });
        }
    };
}
