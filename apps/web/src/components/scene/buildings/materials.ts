/**
 * Shared materials for buildings & props.
 *  - townMaterial(): ONE vertex-coloured flat-shaded standard material for every merged
 *    building geometry and every instanced prop. A `glow` vertex attribute (vec3) is added
 *    as emissive radiance scaled by the `uNight` uniform, so windows, lanterns, signs' lamps,
 *    stained glass etc. light up at night without extra materials or lights.
 *  - signMaterial(): the sign atlas (canvas texture) with an emissive map that brightens at night.
 */
import * as THREE from "three";

export const nightUniform = { value: 0 };

let _town: THREE.MeshStandardMaterial | null = null;
export function townMaterial(): THREE.MeshStandardMaterial {
  if (_town) return _town;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0.0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 glow;\nvarying vec3 vGlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight;\nvarying vec3 vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * (0.05 + 1.45 * uNight);");
  };
  m.customProgramCacheKey = () => "town-glow-v1";
  _town = m;
  return m;
}

let _sign: THREE.MeshStandardMaterial | null = null;
export function signMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  if (_sign && _sign.map === tex) return _sign;
  _sign = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0, roughness: 0.8, metalness: 0, side: THREE.FrontSide });
  return _sign;
}

/** per-frame update from the sky state (called by <Buildings/>) */
export function updateNight(night: number) {
  nightUniform.value = night;
  if (_sign) _sign.emissiveIntensity = 0.55 * night;
}
