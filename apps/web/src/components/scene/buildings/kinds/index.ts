/** Dispatch: which builder makes which location. */
import type { Ctx } from "../layout";
import { bakery, generalStore, cafe, flatAboveCafe, tavern, roomAboveTavern, barber, tailor, brewery, carpentry, garage, inn, chaiStall, bank, realty } from "./shops";
import { townHall, clinic, school, chapel, postOffice, harbourOffice, fishMarket } from "./civic";
import { house } from "./homes";
import { docks, lighthouse, studio, beach } from "./harbour";
import { lindqvistFarm, haddadFarm, orchardStore } from "./farm";
import { townSquare, park } from "./open";
import { stdBuilding } from "./common";

const BY_ID: Record<string, (ctx: Ctx) => void> = {
  bakery, general_store: generalStore, cafe, flat_cafe: flatAboveCafe, tavern, room_costa: roomAboveTavern, barber, tailor, brewery, carpentry, garage, inn, chai_stall: chaiStall, bank, realty,
  town_hall: townHall, clinic, school, temple: chapel, post_office: postOffice, harbour_office: harbourOffice, fish_market: fishMarket,
  docks, lighthouse, studio, beach,
  lindqvist_farm: lindqvistFarm, haddad_farm: haddadFarm, orchard: orchardStore,
  town_square: townSquare, park,
};

export function buildLocation(ctx: Ctx) {
  const id = ctx.p.loc.id;
  const b = BY_ID[id];
  if (b) { b(ctx); return; }
  if (ctx.p.loc.type === "home") { house(ctx); return; }
  // generic fallback
  const s = ctx.p.spec;
  stdBuilding(ctx, { w: s.w, d: s.d, h: s.h, storeys: s.storeys, wall: { color: s.wall, trim: s.trim }, roof: { type: "gable", color: s.roofColor, rise: s.roofH } });
}
