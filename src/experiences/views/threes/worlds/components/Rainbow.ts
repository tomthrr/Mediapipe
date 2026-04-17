import { AdditiveBlending, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, ShaderMaterial, SphereGeometry, Vector2, type MeshStandardMaterialParameters } from 'three';
import { AssetId } from '../../../../constants/experiences/AssetId';
import ThreeAssetsManager from '../../../../managers/threes/ThreeAssetsManager';
import ThreeActorBase from '../../bases/components/ThreeActorBase';

export default class Rainbow extends ThreeActorBase {
    private static readonly _DEFAULT_GEOMETRY_RADIUS = 1;
    private static readonly _DEFAULT_GEOMETRY_WIDTH_SEGMENTS = 64;
    private static readonly _DEFAULT_GEOMETRY_HEIGHT_SEGMENTS = 64;
    private static readonly _DEFAULT_MATERIAL_REPEAT = 1.5;
    private static readonly _DEFAULT_MATERIAL_OPTIONS: MeshStandardMaterialParameters = {
        color: 0xffffff,
        metalness: 0.7,
        roughness: 0.2,
        envMapIntensity: 0,
    };
    declare private _geometry: PlaneGeometry;
    declare private _material: ShaderMaterial;
    declare private _mesh: Mesh;

    constructor() {
        super();

        this._generateGeometry();
        this._generateMaterial();
        this._generateMesh();
    }

    private _generateGeometry(): void {
        this._geometry = new PlaneGeometry(
            1, 1, 64, 64
        );
    }

    private _generateMaterial(): void {
        const normalMat = ThreeAssetsManager.getTexture(AssetId.THREE_TEXTURE_TEMPLATE);
        normalMat.repeat.set(Rainbow._DEFAULT_MATERIAL_REPEAT, Rainbow._DEFAULT_MATERIAL_REPEAT);
        normalMat.wrapS = normalMat.wrapT = RepeatWrapping;

        this._material = new ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new Vector2(window.innerWidth, window.innerHeight) },
            },
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
            vertexShader: `
                varying vec2 vUv;
                
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec2 uResolution;

                varying vec2 vUv;

                vec3 palette(float t) {
                    return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.7, 0.4) * t + vec3(0.0, 0.15, 0.30)));
                }

                vec2 random2(vec2 st){
                    st = vec2( dot(st,vec2(127.1,311.7)),
                            dot(st,vec2(269.5,183.3)) );
                    return -1.0 + 2.0*fract(sin(st)*43758.5453123);
                }

                // Gradient Noise by Inigo Quilez - iq/2013
                // https://www.shadertoy.com/view/XdXGW8
                float noise(vec2 st) {
                    vec2 i = floor(st);
                    vec2 f = fract(st);

                    vec2 u = f*f*(3.0-2.0*f);

                    return mix( mix( dot( random2(i + vec2(0.0,0.0) ), f - vec2(0.0,0.0) ),
                                    dot( random2(i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
                                mix( dot( random2(i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ),
                                    dot( random2(i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
                }
                
                void main() {
                    float frequency = 10.0;
                    float amplitude = 0.02;
                    float speed = 2.0;

                    float n = noise(vec2(vUv.x * 8.0, uTime * 0.5)) * 0.02;

                    vec3 color = vec3(0.0);

                    // nombre de bandes
                    float bandsCount = 6.0;

                    for (float i = 0.0; i < 6.0; i++) {
                        float wave = sin(vUv.x * frequency + uTime * speed + i * 2.0) * amplitude + n;

                        float y = vUv.y;

                        float top = smoothstep(0.48 + wave + n, 0.49 + wave + n, y);
                        float bottom = smoothstep(0.52 + wave - n, 0.51 + wave - n, y);

                        float band = top * bottom;

                        vec3 c = palette(vUv.x + i * 0.3 + uTime * 0.1);

                        color += mix(vec3(0.0), c, band);
                    }

                    float alpha = length(color);
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });
    }

    private _generateMesh(): void {
        this._mesh = new Mesh(this._geometry, this._material);
        this._mesh.position.set(0, 1, 0);
        this._mesh.castShadow = true;
        this._mesh.receiveShadow = true;
        this.add(this._mesh);
    }

    public override reset(): void {
    }

    public update(dt: number): void {
        super.update(dt);
        this._material.uniforms.uTime.value += dt;
    }
}
