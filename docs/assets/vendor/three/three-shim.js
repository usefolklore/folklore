// Bridge: re-export the classes the local postprocessing addons need
// from the THREE UMD global (loaded via <script src="three.min.js">).
// This keeps everything on a single THREE class identity so
// UnrealBloomPass works against 3d-force-graph's renderer/scene.
const T = window.THREE;
if (!T) throw new Error('three-shim: window.THREE is not defined');
export const AdditiveBlending      = T.AdditiveBlending;
export const BufferGeometry        = T.BufferGeometry;
export const Clock                 = T.Clock;
export const Color                 = T.Color;
export const Float32BufferAttribute = T.Float32BufferAttribute;
export const HalfFloatType         = T.HalfFloatType;
export const Mesh                  = T.Mesh;
export const MeshBasicMaterial     = T.MeshBasicMaterial;
export const NoBlending            = T.NoBlending;
export const OrthographicCamera    = T.OrthographicCamera;
export const ShaderMaterial        = T.ShaderMaterial;
export const UniformsUtils         = T.UniformsUtils;
export const Vector2               = T.Vector2;
export const Vector3               = T.Vector3;
export const WebGLRenderTarget     = T.WebGLRenderTarget;
export default T;
