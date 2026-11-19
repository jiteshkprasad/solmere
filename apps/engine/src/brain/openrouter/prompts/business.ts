import { z } from "zod";
import type { BrainContext, BusinessDecision, BusinessState } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, enumOf, example, money, renderLiveContext, renderPersona, renderPrices } from "./common.js";

export function buildBusinessPrompt(ctx: BrainContext, business: BusinessState, competitors: Record<string, number>) {
  const goods = Object.keys(business.prices);
  const goodEnum = enumOf(goods, "goods");
  const schema = z.object({
    prices: z.array(z.object({ good: goodEnum, price: z.number().min(0) })).describe("new price for every good you sell; keep the same number if unchanged"),
    hire: z.string().nullable().describe("npc id to hire, or null"),
    fire: z.string().nullable().describe("npc id to let go, or null"),
    takeLoan: z.number().min(0).nullable().describe("crowns to borrow from the bank, or null"),
    reasoning: z.string().describe("2–3 sentences in your voice"),
    publicStatement: z.string().nullable().describe("one line you'd say to the town about the change, or null to say nothing"),
  });

  const last7 = business.pnlHistory.slice(-7);
  const rev = last7.reduce((a, b) => a + b.revenue, 0);
  const costs = last7.reduce((a, b) => a + b.costs, 0);
  const inv = Object.entries(business.inventory);

  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
It is the weekly business decision for ${business.locationId}, which you own. Look at the ledger, the stock, what competitors charge and the cash in the account, then decide in character:
- prices: a price for every good you sell (same number = unchanged). Small moves (5–15%) are normal; big ones need a reason (stock rotting, a rival undercutting, a debt due). Customers notice and remember.
- hire / fire: an npc id or null. Hiring costs a daily wage; firing makes an enemy. Only hire someone you plausibly know is available.
- takeLoan: crowns to borrow or null. Loans charge weekly interest; missed payments end badly.
- reasoning: 2–3 sentences in your voice, the actual arithmetic included.
- publicStatement: one line you would say aloud to customers about the change, or null.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ prices: [{ good: "twine", price: 8.5 }, { good: "rope", price: 14 }], hire: null, fire: null, takeLoan: null, reasoning: "The mill is up and I cleared 210 crowns on 260 of costs last week. Half a crown on a spool keeps the shelves stocked without sending the fishers to the city cart. No loan; the bank already has my cart on paper.", publicStatement: "Twine's half a crown more from Monday. Blame the mill, not me." })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { maxMemories: 10, maxRelationships: 10 }),
    "",
    `LEDGER for ${business.locationId}:`,
    `Account: ${money(business.account)}. ${business.open ? "Open" : "Closed"}. Today so far: revenue ${money(business.revenueToday)}, costs ${money(business.costsToday)}.`,
    `Last ${last7.length} day(s): revenue ${money(rev)}, costs ${money(costs)}, net ${money(rev - costs)}.${last7.length ? ` By day: ${last7.map((d) => `d${d.day} +${Math.round(d.revenue)}/-${Math.round(d.costs)}`).join(", ")}.` : ""}`,
    `Your prices: ${renderPrices(business.prices, 20)}.`,
    `Stock: ${inv.length ? inv.map(([g, n]) => `${g.replace(/_/g, " ")} ×${n}`).join(", ") : "empty"}.`,
    `Employees: ${business.employees.length ? business.employees.join(", ") : "none"}.${business.wageOverrides && Object.keys(business.wageOverrides).length ? ` Wage overrides: ${Object.entries(business.wageOverrides).map(([k, v]) => `${k} ${money(v)}/day`).join(", ")}.` : ""}`,
    `Competitor prices: ${Object.keys(competitors).length ? renderPrices(competitors, 20) : "no direct competitor"}.`,
    "",
    "Make this week's decision. Return the JSON.",
  ].join("\n");

  const map = (w: z.infer<typeof schema>): BusinessDecision => {
    const prices: Record<string, number> = { ...business.prices };
    for (const p of w.prices) if (p.good in prices && Number.isFinite(p.price) && p.price >= 0) prices[p.good] = Math.round(p.price * 100) / 100;
    const id = (s: string | null) => (s && s.trim() && !/^(null|none|nobody|no one)$/i.test(s.trim()) ? s.trim().toLowerCase().replace(/\s+/g, "_") : null);
    return {
      prices,
      hire: id(w.hire),
      fire: id(w.fire),
      takeLoan: w.takeLoan && w.takeLoan > 0 ? Math.round(w.takeLoan) : null,
      reasoning: w.reasoning.trim(),
      publicStatement: w.publicStatement && w.publicStatement.trim() ? w.publicStatement.trim() : null,
    };
  };

  return { system, user, schema, map, maxTokens: 900 };
}
