import { Mesh, Vector3 } from 'three';
import ThreeActorBase from '../../bases/components/ThreeActorBase';
import { type MediapipeHandsSnapshot } from '../../../../managers/MediapipeManager';
import ThreeCameraControllerManager from '../../../../managers/threes/ThreeCameraControllerManager';
import { CameraId } from '../../../../constants/experiences/CameraId';
import type ThreeCameraControllerBase from '../../../../cameras/threes/bases/ThreeCameraControllerBase';
import * as THREE from 'three';

type HandTips = {
    topLeft: Vector3;
    bottomLeft: Vector3;
    topRight: Vector3;
    bottomRight: Vector3;
};

export default abstract class PortalBase extends ThreeActorBase {
    protected _cameraController: ThreeCameraControllerBase;
    protected _portalMesh: Mesh | null = null;
    protected _portalPositions: Float32Array | null = null;

    protected readonly _portalSettings = {
        enabled: true,
        handDepth: -2,
        handSpread: 4,
        smoothing: 0.07,
    };

    protected readonly _right = new Vector3();
    protected readonly _up = new Vector3();
    protected readonly _forward = new Vector3();

    private readonly _tmpFromCam = new Vector3();

    private readonly _rawCorners: HandTips = {
        topLeft: new Vector3(),
        bottomLeft: new Vector3(),
        topRight: new Vector3(),
        bottomRight: new Vector3(),
    };

    private readonly _targetCorners: HandTips = {
        topLeft: new Vector3(),
        bottomLeft: new Vector3(),
        topRight: new Vector3(),
        bottomRight: new Vector3(),
    };

    private readonly _smoothedCorners: HandTips = {
        topLeft: new Vector3(),
        bottomLeft: new Vector3(),
        topRight: new Vector3(),
        bottomRight: new Vector3(),
    };

    private readonly _tmpLeft = new Vector3();
    private readonly _tmpRight = new Vector3();

    constructor() {
        super();
        this._cameraController = ThreeCameraControllerManager.get(CameraId.THREE_MAIN);
        window.addEventListener('hand:update', this._onHandUpdate);
    }

    protected _createPortalMesh(material: THREE.Material): Mesh {
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

        const mesh = new THREE.Mesh(geo, material);
        mesh.frustumCulled = false;
        this._portalMesh = mesh;
        this.add(mesh);
        return mesh;
    }

    protected _updatePortalMeshFromHands(): void {
        if (!this._portalMesh || !this._portalPositions) return;

        this._computeRigidTargetCorners();

        const s = this._portalSettings.smoothing;
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

    protected _samplePortalWorldPoint(u: number, v: number, out: Vector3): void {
        this._tmpLeft.copy(this._smoothedCorners.topLeft).lerp(this._smoothedCorners.bottomLeft, v);
        this._tmpRight.copy(this._smoothedCorners.topRight).lerp(this._smoothedCorners.bottomRight, v);
        out.copy(this._tmpLeft).lerp(this._tmpRight, u);
    }

    protected _disposePortalBase(): void {
        window.removeEventListener('hand:update', this._onHandUpdate);

        if (this._portalMesh) {
            this._portalMesh.geometry.dispose();
            (this._portalMesh.material as THREE.Material).dispose();
            this._portalMesh = null;
        }
    }

    private _handToWorld(tip: { x: number; y: number; z: number }): Vector3 {
        const camera = this._cameraController.camera;

        const nx = (tip.x - 0.5) * -2;
        const ny = (0.5 - tip.y) * 2;

        camera.matrixWorld.extractBasis(this._right, this._up, this._forward);
        this._forward.negate();

        return new Vector3()
            .copy(camera.position)
            .addScaledVector(this._forward, this._portalSettings.handDepth)
            .addScaledVector(this._right, nx * this._portalSettings.handSpread)
            .addScaledVector(this._up, ny * this._portalSettings.handSpread);
    }

    private _onHandUpdate = (e: CustomEvent<MediapipeHandsSnapshot>): void => {
        if (!this._portalSettings.enabled) return;
        const { left, right } = e.detail;

        if (left?.indexTip) this._rawCorners.topLeft.copy(this._handToWorld(left.indexTip));
        if (left?.thumb) this._rawCorners.bottomLeft.copy(this._handToWorld(left.thumb));
        if (right?.indexTip) this._rawCorners.topRight.copy(this._handToWorld(right.indexTip));
        if (right?.thumb) this._rawCorners.bottomRight.copy(this._handToWorld(right.thumb));
    };

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
            .addScaledVector(this._forward, this._portalSettings.handDepth)
            .addScaledVector(this._right, x)
            .addScaledVector(this._up, y);
    }
}
