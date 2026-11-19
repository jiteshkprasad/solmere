/**
 * Explore controls: a tiny bridge from HUD buttons (outside the canvas) to the camera rig.
 * The rig registers handlers; the HUD calls them. Lives on globalThis for the same reason as
 * viewInset.ts (Next can hand this module to two chunks).
 */
export interface CameraApi {
  /** turn around the look-at point (radians, + = clockwise seen from above) */
  rotate: (rad: number) => void;
  /** tilt (radians, + = look more from above) */
  tilt: (rad: number) => void;
  /** zoom by a factor (<1 = closer) */
  zoom: (factor: number) => void;
  /** fly back to the whole-town view */
  home: () => void;
}

const KEY = "__solmereCameraApi";
type G = typeof globalThis & { [KEY]?: Partial<CameraApi> };

export function cameraApi(): Partial<CameraApi> {
  const g = globalThis as G;
  return (g[KEY] ??= {});
}

export function registerCameraApi(api: CameraApi) {
  Object.assign(cameraApi(), api);
}
