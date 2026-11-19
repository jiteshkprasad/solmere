/**
 * Shared material helpers for the environment: a wind-sway + masked instance
 * tint patch for MeshStandardMaterial (via onBeforeCompile) and the global
 * time/wind uniforms that drive it.
 */
import * as THREE from "three";

/** shared uniforms — updated once per frame by <Town/> */
export const envUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },        // 1 = gentle breeze, ~2.5 during a storm
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
};

/**
 * Patch a standard material so that
 *  - vertices sway with the wind by their `aWind` attribute (0 = anchored, 1 = tip),
 *  - instance colours multiply only vertices with `aTint` = 1 (so trunks keep their colour).
 */
export function windTintMaterial(opts: THREE.MeshStandardMaterialParameters & { sway?: number; tint?: boolean; wind?: boolean }): THREE.MeshStandardMaterial {
  const { sway = 1, tint = true, wind = true, ...params } = opts;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, ...params });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = envUniforms.uTime;
    shader.uniforms.uWind = envUniforms.uWind;
    shader.uniforms.uWindDir = envUniforms.uWindDir;
    shader.uniforms.uSway = { value: sway };
    let vs = shader.vertexShader;
    vs = vs.replace("#include <common>", `#include <common>
      uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uSway;
      attribute float aWind; attribute float aTint;`);
    if (tint) {
      vs = vs.replace("#include <color_vertex>", THREE.ShaderChunk.color_vertex.replace("vColor.xyz *= instanceColor.xyz;", "vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, aTint);"));
    }
    if (wind) {
      vs = vs.replace("#include <begin_vertex>", `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 iPos = (modelMatrix * instanceMatrix)[3].xyz;
        #else
          vec3 iPos = modelMatrix[3].xyz;
        #endif
        float ph = iPos.x * 0.21 + iPos.z * 0.17;
        float gust = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.3 + sin(uTime * 5.1 + ph * 2.3) * 0.12;
        float amp = aWind * aWind * uSway * (0.05 + 0.06 * uWind) * uWind;
        transformed.xz += uWindDir * gust * amp;
        transformed.y -= abs(gust) * amp * 0.25;`);
    }
    shader.vertexShader = vs;
  };
  m.customProgramCacheKey = () => `windtint:${sway}:${tint}:${wind}`;
  return m;
}

