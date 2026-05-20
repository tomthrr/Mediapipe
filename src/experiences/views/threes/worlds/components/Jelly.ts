import ThreeModelBase from '../../bases/components/ThreeModelBase';
import { AssetId } from '../../../../constants/experiences/AssetId';
import { Object3DId } from '../../../../constants/experiences/Object3dId';
import { type MediapipeHandsSnapshot } from '../../../../managers/MediapipeManager';
import * as THREE from 'three';
import ThreeCameraControllerBase from '../../../../cameras/threes/bases/ThreeCameraControllerBase';
import ThreeCameraControllerManager from '../../../../managers/threes/ThreeCameraControllerManager';
import { CameraId } from '../../../../constants/experiences/CameraId';
import { WiggleBone } from 'wiggle';
import DebugManager from '../../../../managers/DebugManager';
import { DebugGuiTitle } from '../../../../constants/experiences/DebugGuiTitle';

type SkinnedMeshWithSkeleton = THREE.SkinnedMesh & { skeleton: THREE.Skeleton };

export default class Jelly extends ThreeModelBase {
	protected _cameraController: ThreeCameraControllerBase;

	private readonly _root: THREE.Group = new THREE.Group();
	private readonly _wiggleBones: WiggleBone[] = [];
	private _rootBone: THREE.Bone | null = null;

	private readonly _rootOrigin = new THREE.Vector3();
	private readonly _targetRootOffset = new THREE.Vector3();
	private readonly _smoothedRootOffset = new THREE.Vector3();

	private readonly _wiggleBoneParams: Array<{ bone: THREE.Bone; name: string; stiffness?: number; damping?: number; velocity?: number }> = [];

	private readonly _handSettings = {
		enabled: true,
		smoothing: 0.1,
		maxOffsetX: 0.9,
		maxOffsetY: 0.9,
		maxOffsetZ: 0.35,
		wiggleVelocity: 0.4,
	};

	private readonly _renderSettings = {
		renderOrder: 100,
		depthWrite: true,
		depthTest: true,
	};

	private static readonly _DEBUG_INIT_KEY: string = '__jellyDebugInit';

	constructor() {
		super(AssetId.THREE_GLTF_JELLY, {
			object3DId: Object3DId.STATUE,
			castShadow: true,
			receiveShadow: true,
		});

		this._model.scale.set(0.8, 0.8, 0.8);

		this._model.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});

		this._cameraController = ThreeCameraControllerManager.get(CameraId.THREE_MAIN);
		this.add(this._root);
	}

	public override init(): void {
		super.init();
		this._setupWiggleRig();
		this._setupRenderSettings();
		window.addEventListener('hand:update', this._onHandUpdate as EventListener);
		this._initDebug();
	}

	public override update(dt: number): void {
		super.update(dt);

		if (this._rootBone) {
			this._smoothedRootOffset.lerp(this._targetRootOffset, this._handSettings.smoothing);
			this._rootBone.position.copy(this._rootOrigin).add(this._smoothedRootOffset);
			this._rootBone.updateMatrixWorld(true);
		}

		for (const wiggleBone of this._wiggleBones) {
			wiggleBone.update(dt);
		}
	}

	public override dispose(): void {
		window.removeEventListener('hand:update', this._onHandUpdate as EventListener);

		for (const wiggleBone of this._wiggleBones) {
			wiggleBone.dispose();
		}
		this._wiggleBones.length = 0;
		this._rootBone = null;

		super.dispose();
	}

	private _setupWiggleRig(): void {
		if (this._wiggleBones.length > 0) return;

		const skinnedMesh = this._findSkinnedMesh(this._model);
		if (!skinnedMesh?.skeleton?.bones?.length) return;

		for (const bone of skinnedMesh.skeleton.bones) {
			if (!bone.parent || !(bone.parent as THREE.Bone).isBone) {
				if (!this._rootBone) {
					this._rootBone = bone;
					this._rootOrigin.copy(bone.position);
				}
				continue;
			}

			let params: { stiffness?: number; damping?: number; velocity?: number } = {};
			if (bone.name === 'Bone001' || bone.name === 'Bone002' || bone.name === 'Bone003' || bone.name === 'Bone004') {
				params = { stiffness: 700, damping: 28 };
			} else {
				params = { velocity: this._handSettings.wiggleVelocity };
			}

			const wiggleBone = new WiggleBone(bone, params);
			this._wiggleBones.push(wiggleBone);
			this._wiggleBoneParams.push({
				bone,
				name: bone.name,
				...params,
			});
		}
	}

	private _setupRenderSettings(): void {
		this._model.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.renderOrder = this._renderSettings.renderOrder;
				if (child.material instanceof THREE.Material) {
					child.material.depthWrite = this._renderSettings.depthWrite;
					child.material.depthTest = this._renderSettings.depthTest;
				}
			}
		});
	}

	private _findSkinnedMesh(root: THREE.Object3D): SkinnedMeshWithSkeleton | null {
		let found: SkinnedMeshWithSkeleton | null = null;

		root.traverse((child) => {
			if (found) return;
			if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
				found = child as SkinnedMeshWithSkeleton;
			}
		});

		return found;
	}

	private _onHandUpdate = (e: CustomEvent<MediapipeHandsSnapshot>): void => {
		if (!this._handSettings.enabled) return;

		const hand = e.detail.right ?? e.detail.left;
		if (!hand) {
			this._targetRootOffset.set(0, 0, 0);
			return;
		}

		const point = (hand.isFist && hand.fist) ? hand.fist : (hand.indexTip ?? hand.wrist);

		const nx = (point.x - 0.5) * -2;
		const ny = (0.5 - point.y) * 2;
		const nz = (point.z - 0.5) * 2;

		this._targetRootOffset.set(
			THREE.MathUtils.clamp(nx, -1, 1) * this._handSettings.maxOffsetX,
			0, // Y never changes
			THREE.MathUtils.clamp(nz, -1, 1) * this._handSettings.maxOffsetZ,
		);
	};

	private _initDebug(): void {
		if (!DebugManager.isActive) return;

		const folder = DebugManager.getGuiFolder(DebugGuiTitle.JELLY);
		const anyFolder = folder as unknown as Record<string, unknown>;
		if (anyFolder[Jelly._DEBUG_INIT_KEY]) return;
		anyFolder[Jelly._DEBUG_INIT_KEY] = true;

		const handFolder = folder.addFolder('Hand Control');
		handFolder.add(this._handSettings, 'enabled').name('enabled');
		handFolder.add(this._handSettings, 'smoothing', 0.01, 0.5, 0.01).name('smoothing');
		handFolder.add(this._handSettings, 'maxOffsetX', 0, 2, 0.1).name('maxOffsetX');
		handFolder.add(this._handSettings, 'maxOffsetY', 0, 2, 0.1).name('maxOffsetY');
		handFolder.add(this._handSettings, 'maxOffsetZ', 0, 1, 0.05).name('maxOffsetZ');

		const wiggleFolder = folder.addFolder('Wiggle Bones');
		wiggleFolder.add(this._handSettings, 'wiggleVelocity', 0.01, 1, 0.05).name('velocity');

		for (let i = 0; i < this._wiggleBoneParams.length; i++) {
			const boneParam = this._wiggleBoneParams[i];
			const boneFolder = wiggleFolder.addFolder(`${boneParam.name}`);

			if (boneParam.stiffness !== undefined) {
				boneFolder.add(boneParam, 'stiffness', 0, 2000, 10).name('stiffness');
			}
			if (boneParam.damping !== undefined) {
				boneFolder.add(boneParam, 'damping', 0, 100, 1).name('damping');
			}
			if (boneParam.velocity !== undefined) {
				boneFolder.add(boneParam, 'velocity', 0.01, 1, 0.05).name('velocity');
			}
		}

		const renderFolder = folder.addFolder('Render');
		renderFolder.add(this._renderSettings, 'renderOrder', 0, 1000, 1).name('renderOrder').onChange(() => {
			this._setupRenderSettings();
		});
		renderFolder.add(this._renderSettings, 'depthWrite').name('depthWrite').onChange(() => {
			this._setupRenderSettings();
		});
		renderFolder.add(this._renderSettings, 'depthTest').name('depthTest').onChange(() => {
			this._setupRenderSettings();
		});
	}
}