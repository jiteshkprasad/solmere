/**
 * Rig cache: one skinned character per NPC id, built on first request and
 * kept for the life of the page (remounting the scene never rebuilds them).
 */
import { buildCharacter, type CharacterRig } from "./builder";
import { createAnim, type AnimInstance } from "./animation";
import { appearanceOf, castOf } from "./appearance";

export interface Character { rig: CharacterRig; anim: AnimInstance }

const cache = new Map<string, Character>();

export function getCharacter(id: string): Character {
  let c = cache.get(id);
  if (!c) {
    const rig = buildCharacter(id, appearanceOf(id), castOf(id));
    c = { rig, anim: createAnim(rig) };
    cache.set(id, c);
  }
  return c;
}

export function hasCharacter(id: string) { return cache.has(id); }
export { buildCharacter, createAnim, appearanceOf, castOf };
export type { CharacterRig, AnimInstance };
