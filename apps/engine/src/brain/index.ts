/**
 * Brain selector. Engine core imports ONLY this file.
 *   BRAIN=mock            -> MockBrain (deterministic, free)  [apps/engine/src/brain/mock.ts]
 *   OPENROUTER_API_KEY set -> OpenRouterBrain                  [apps/engine/src/brain/openrouter/index.ts]
 */
import type { Brain } from "@npcworld/schema";
import { MockBrain } from "./mock.js";
import { createOpenRouterBrain } from "./openrouter/index.js";

export function createBrain(): Brain {
  if (process.env.BRAIN === "mock" || !process.env.OPENROUTER_API_KEY) {
    console.log("[brain] using MockBrain");
    return new MockBrain();
  }
  return createOpenRouterBrain({
    apiKey: process.env.OPENROUTER_API_KEY,
    bulkModel: process.env.BULK_MODEL ?? "deepseek/deepseek-v4-flash-0731",
    midModel: process.env.MID_MODEL ?? "openai/gpt-5.6-luna",
    dailyBudgetUsd: Number(process.env.DAILY_BUDGET_USD ?? 3),
  });
}
