/**
 * Offscreen portrait renderer — the **fallback** path.
 *
 * Normally `lib/portraits.ts` serves all 50 faces from the build-time sprite
 * atlas (`scripts/gen-portraits.mjs`) and this class has nothing to do: `step()`
 * sees every id already covered and retires on the first call. It only actually
 * renders when the atlas is missing (or `?portraits=render` forces it, which is
 * how the atlas itself gets built).
 *
 * When it does run: one head-and-shoulders render per frame into a small render
 * target, read back, sRGB-encoded and stored as a data URL. Its own tiny Scene +
 * camera, so it never touches the town's lights or the R3F object tree.
 */
import * as THREE from "three";
import { buildCharacter, type CharacterRig } from "./builder";
import { createAnim, posePortrait } from "./animation";
import { appearanceOf, castOf } from "./appearance";
import { hash01 } from "../palette";
import { hasPortrait, markPortraitsComplete, portraitsPending, setPortrait } from "@/lib/portraits";

const SIZE = 192;

export class PortraitRenderer {
  private queue: string[] = [];
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  private rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true, samples: 0 });
  private pixels = new Uint8Array(SIZE * SIZE * 4);
  private canvas: HTMLCanvasElement | null = null;
  private img: ImageData | null = null;
  private key = new THREE.DirectionalLight("#fff4e0", 2.6);
  private fill = new THREE.DirectionalLight("#cfe2ff", 1.1);
  private rim = new THREE.DirectionalLight("#ffffff", 0.9);
  private hemi = new THREE.HemisphereLight("#dfe8f4", "#6a5a4a", 1.4);
  private done = false;

  constructor(ids: string[]) {
    this.queue = ids.slice();
    this.key.position.set(-1.2, 1.6, 2.2);
    this.fill.position.set(1.8, 0.6, 1.4);
    this.rim.position.set(0.6, 1.2, -2.2);
    this.scene.add(this.key, this.fill, this.rim, this.hemi);
    this.scene.background = new THREE.Color("#e8e2d8");
  }

  get pending() { return this.queue.length; }

  /** render the next portrait (call once per frame after the main render) */
  step(gl: THREE.WebGLRenderer) {
    if (this.done) return;
    // still waiting to hear whether the atlas exists — don't render anything yet
    if (portraitsPending()) return;
    // with the atlas in place every id is already covered and the queue drains in
    // one step; anyone the atlas is missing still gets rendered here (self-healing)
    let id = this.queue.shift();
    while (id && hasPortrait(id)) id = this.queue.shift();
    if (!id) { this.retire(); return; }
    let rig: CharacterRig | null = null;
    try {
      rig = buildCharacter(id, appearanceOf(id), castOf(id));
      const anim = createAnim(rig);
      posePortrait(anim, 0);
      const mesh = rig.mesh;
      mesh.castShadow = false;
      mesh.rotation.y = -0.55; // 3/4 view: turn the character toward the camera's right
      this.scene.add(mesh);
      const d = rig.dims;
      const top = rig.headTop + d.headH * 0.12, bottom = d.chestY - d.H * 0.02;
      const cy = (top + bottom) / 2, span = top - bottom;
      const dist = (span / 2) / Math.tan((this.camera.fov / 2) * Math.PI / 180) * 1.02;
      this.camera.position.set(0.08 * span, cy + span * 0.08, dist);
      this.camera.lookAt(0, cy, 0);
      this.camera.updateProjectionMatrix();
      // backdrop hue from the character's id so cards stay distinguishable
      const hue = hash01(id, 5);
      (this.scene.background as THREE.Color).setHSL(hue, 0.28, 0.78);

      const prevRT = gl.getRenderTarget();
      const prevClear = gl.autoClear;
      gl.setRenderTarget(this.rt);
      gl.autoClear = true;
      gl.render(this.scene, this.camera);
      gl.readRenderTargetPixels(this.rt, 0, 0, SIZE, SIZE, this.pixels);
      gl.setRenderTarget(prevRT);
      gl.autoClear = prevClear;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.skeleton.dispose();
      setPortrait(id, this.encode());
    } catch (e) {
      console.warn("portrait failed for", id, e);
      if (rig) { this.scene.remove(rig.mesh); rig.mesh.geometry.dispose(); rig.mesh.skeleton.dispose(); }
    }
  }

  private retire() {
    this.done = true;
    this.queue.length = 0;
    markPortraitsComplete();
    this.rt.dispose();
    this.img = null;
  }

  /** linear RGBA (render targets skip the renderer's output encoding) → sRGB PNG data URL, flipped to top-down */
  private encode(): string {
    const c = (this.canvas ??= document.createElement("canvas"));
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext("2d")!;
    const img = (this.img ??= ctx.createImageData(SIZE, SIZE));
    const src = this.pixels, dst = img.data;
    for (let y = 0; y < SIZE; y++) {
      const sy = SIZE - 1 - y;
      for (let x = 0; x < SIZE; x++) {
        const si = (sy * SIZE + x) * 4, di = (y * SIZE + x) * 4;
        dst[di] = LUT[src[si]]; dst[di + 1] = LUT[src[si + 1]]; dst[di + 2] = LUT[src[si + 2]]; dst[di + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
}

// linear → sRGB lookup for 8-bit values (with a touch of filmic roll-off so highlights don't clip)
const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let v = i / 255;
  v = v / (1 + v * 0.15) * 1.15;
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  LUT[i] = Math.max(0, Math.min(255, Math.round(s * 255)));
}
