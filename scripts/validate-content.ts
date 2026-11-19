import { readFileSync } from "node:fs";
import { CastContent, TownContent, RelationshipsContent, EconomyContent, EventsContent } from "../packages/schema/src/index";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), "utf8"));
const cast = CastContent.parse(read("cast.json"));
const town = TownContent.parse(read("town.json"));
const rel = RelationshipsContent.parse(read("relationships.json"));
const eco = EconomyContent.parse(read("economy.json"));
const ev = EventsContent.parse(read("events.json"));

const errors: string[] = [];
const npcIds = new Set(cast.npcs.map((n) => n.id));
if (npcIds.size !== 50) errors.push(`expected 50 unique npc ids, got ${npcIds.size}`);
const locIds = new Set(town.locations.map((l) => l.id));
for (const n of cast.npcs) {
  if (!locIds.has(n.home)) errors.push(`${n.id}: home ${n.home} missing`);
  if (!locIds.has(n.workplace)) errors.push(`${n.id}: workplace ${n.workplace} missing`);
  if (n.employer && n.employer !== "self" && n.employer !== "town" && !locIds.has(n.employer) && !npcIds.has(n.employer)) errors.push(`${n.id}: employer ${n.employer} unknown`);
}
for (const l of town.locations) {
  if (l.owner !== "town" && !npcIds.has(l.owner)) errors.push(`location ${l.id}: owner ${l.owner} unknown`);
  for (const g of [...(l.sells ?? []), ...(l.buys ?? []), ...(l.produces ?? [])]) if (!eco.goods[g]) errors.push(`location ${l.id}: unknown good ${g}`);
}
for (const e of rel.edges) {
  if (!npcIds.has(e.a)) errors.push(`edge a ${e.a} unknown`);
  if (!npcIds.has(e.b)) errors.push(`edge b ${e.b} unknown`);
}
for (const c of rel.seededConflicts) for (const a of c.actors) if (!npcIds.has(a)) errors.push(`conflict ${c.id}: actor ${a} unknown`);
for (const c of ev.deck) {
  for (const t of c.targets ?? []) if (!npcIds.has(t)) errors.push(`event ${c.id}: target ${t} unknown`);
  if (Array.isArray(c.broadcast)) for (const b of c.broadcast) if (!locIds.has(b) && !town.districts.some((d) => d.id === b)) errors.push(`event ${c.id}: broadcast ${b} unknown`);
}
for (const l of town.locations.filter((l) => l.type === "business")) if (eco.startingBusinessAccounts[l.id] === undefined) errors.push(`business ${l.id}: no starting account`);
const jobs = new Map<string, number>();
for (const n of cast.npcs) jobs.set(n.job, (jobs.get(n.job) ?? 0) + 1);
console.log("NPCs:", npcIds.size, "| locations:", locIds.size, "| edges:", rel.edges.length, "| conflicts:", rel.seededConflicts.length, "| event cards:", ev.deck.length);
console.log("jobs:", [...jobs.entries()].map(([k, v]) => `${k}×${v}`).join(", "));
if (errors.length) { console.error("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("content OK");
