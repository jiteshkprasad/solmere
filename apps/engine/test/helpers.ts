import { loadContent } from "../src/core/content.js";
import { createWorld } from "../src/core/world.js";
import { runHeadless } from "../src/core/scheduler.js";
import { MockBrain } from "../src/brain/mock.js";
import type { World } from "../src/core/types.js";

export function makeWorld(seed: number | string = 1, log?: (s: string) => void): World {
  const content = loadContent();
  return createWorld(content, new MockBrain(), { seed, headless: true, log });
}

export async function runDays(w: World, days: number): Promise<World> {
  await runHeadless(w, days, 1);
  return w;
}
