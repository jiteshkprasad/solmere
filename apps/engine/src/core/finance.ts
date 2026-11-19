import type { Loan } from "@npcworld/schema";
import type { World } from "./types.js";
import { emit } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { bizAcct, npcAcct, round, transfer, TREASURY } from "./ledger.js";
import { landlordOf, rentTier } from "./world.js";
import { applyAffinity } from "./relationships.js";
import { teleport } from "./movement.js";

const BANK = "bank";

/** Weekly rent to the home's owner (marcus_vale for most rentals). Missed 3 times -> eviction. */
export function collectRent(w: World): void {
  const eco = w.content.economy;
  const sym = eco.currency.symbol;
  for (const npc of Object.values(w.npcs)) {
    const landlord = landlordOf(w, npc.id);
    if (!landlord) continue;
    const rt = w.rt[npc.id];
    const weekly = round(eco.rent.weekly[rentTier(npc.home)] * w.rentMultiplier);
    const due = round(weekly + rt.tenancy.arrears);
    const home = w.content.locations[npc.home].name;
    if (transfer(w, npcAcct(npc.id), npcAcct(landlord), due, { trade: false })) {
      rt.tenancy = { missedRent: 0, arrears: 0 };
      emit(w, "rent", `${npc.name} pays ${sym}${due} rent for ${home} to ${w.npcs[landlord].name}.`, { actors: [npc.id, landlord], locationId: npc.home, importance: 2, quiet: true });
      continue;
    }
    rt.tenancy.missedRent += 1;
    rt.tenancy.arrears = due;
    w.missedRentToday += 1;
    emit(w, "rent_missed", `${npc.name} misses rent on ${home}: ${sym}${due} owed to ${w.npcs[landlord].name} (${rt.tenancy.missedRent} missed).`, {
      actors: [npc.id, landlord], locationId: npc.home, importance: 7, data: { due, missed: rt.tenancy.missedRent },
    });
    applyAffinity(w, landlord, npc.id, -5);
    applyAffinity(w, npc.id, landlord, -4);
    rt.triggers.push(`You missed this week's rent (${sym}${due} owed to ${w.npcs[landlord].name}). That's ${rt.tenancy.missedRent} missed.`);
    if (rt.tenancy.missedRent >= eco.rent.evictAfterMissed) evict(w, npc.id, landlord);
  }
}

function evict(w: World, npcId: string, landlord: string): void {
  const npc = w.npcs[npcId];
  const rt = w.rt[npcId];
  const oldHome = w.content.locations[npc.home].name;
  const newHome = npc.home === "inn" ? "beach" : "inn";
  const where = newHome === "inn" ? "They take a room at the inn." : "With nowhere left to go, they are sleeping rough on the beach.";
  emit(w, "eviction", `${w.npcs[landlord].name} evicts ${npc.name} from ${oldHome}. ${where}`, {
    actors: [npcId, landlord], locationId: npc.home, importance: 9,
    witnesses: [npcId, landlord, "beatrice_fontaine", "priya_nair"],
  });
  rt.evicted = true;
  rt.tenancy = { missedRent: 0, arrears: 0 };
  const wasHere = npc.locationId === npc.home;
  npc.home = newHome;
  if (wasHere) teleport(w, npc, newHome);
  applyAffinity(w, npcId, landlord, -20);
  rt.triggers.push(`You have been EVICTED by ${w.npcs[landlord].name}. ${where}`);
}

/** Weekly loan service: interest + 1/40 of principal. Three missed payments -> default. */
export function serviceLoans(w: World): void {
  const eco = w.content.economy;
  const sym = eco.currency.symbol;
  for (const loan of w.loans) {
    if (loan.balance <= 0) continue;
    const npc = w.npcs[loan.borrower];
    if (!npc) continue;
    const payment = round(loan.balance * loan.weeklyRate + loan.principal / 40);
    const ownedBiz = Object.values(w.businesses).find((b) => b.owner === npc.id);
    const payer = ownedBiz && ownedBiz.account >= payment ? bizAcct(ownedBiz.locationId) : npcAcct(npc.id);
    if (transfer(w, payer, bizAcct(BANK), payment, { trade: false })) {
      loan.balance = round(Math.max(0, loan.balance - (payment - loan.balance * loan.weeklyRate)));
      npc.debt = round(w.loans.filter((l) => l.borrower === npc.id).reduce((a, l) => a + l.balance, 0));
      emit(w, "loan", `${npc.name} makes a loan payment of ${sym}${payment} to the bank (balance ${sym}${loan.balance}).`, { actors: [npc.id, w.businesses[BANK].owner], locationId: BANK, importance: 3, quiet: true });
      continue;
    }
    loan.missedPayments += 1;
    loan.balance = round(loan.balance * (1 + loan.weeklyRate));
    npc.debt = round(w.loans.filter((l) => l.borrower === npc.id).reduce((a, l) => a + l.balance, 0));
    const banker = w.businesses[BANK].owner;
    if (loan.missedPayments > eco.bank.defaultAfterMissedPayments) continue; // already in default: the bank has written it off
    if (loan.missedPayments === eco.bank.defaultAfterMissedPayments) {
      emit(w, "loan_default", `${npc.name} has defaulted on a ${sym}${loan.principal} loan from the bank after ${loan.missedPayments} missed payments.`, {
        actors: [npc.id, banker], locationId: BANK, importance: 9, witnesses: [npc.id, banker, "priya_nair"],
      });
      applyAffinity(w, banker, npc.id, -15);
      w.rt[npc.id].triggers.push(`The bank has declared you in DEFAULT on your loan (${loan.missedPayments} missed payments).`);
    } else {
      emit(w, "loan", `${npc.name} misses a loan payment of ${sym}${payment} (${loan.missedPayments} missed).`, { actors: [npc.id, banker], locationId: BANK, importance: 6, drama: 5 });
      w.rt[npc.id].triggers.push(`You missed a loan payment of ${sym}${payment}. The bank has noticed (${loan.missedPayments} missed).`);
    }
  }
}

/** A business owner takes a loan from the bank (BusinessDecision.takeLoan). */
export function takeLoan(w: World, borrower: string, bizId: string, amount: number): Loan | null {
  const eco = w.content.economy;
  const b = w.businesses[bizId];
  const bank = w.businesses[BANK];
  if (!b || !bank || amount <= 0) return null;
  if (w.loans.some((l) => l.borrower === borrower && l.missedPayments >= eco.bank.defaultAfterMissedPayments)) return null; // no credit for defaulters
  const max = Math.max(200, (w.npcs[borrower].wallet + b.account) * eco.bank.maxLoanMultipleOfWallet);
  amount = round(Math.min(amount, max, bank.account * 0.25));
  if (amount < 50 || !transfer(w, bizAcct(BANK), bizAcct(bizId), amount, { trade: false })) return null;
  const loan: Loan = { id: `loan_${bizId}_${w.clock.day}`, borrower, principal: amount, balance: amount, weeklyRate: eco.bank.loanRateWeekly, missedPayments: 0, createdDay: w.clock.day };
  w.loans.push(loan);
  w.npcs[borrower].debt = round(w.npcs[borrower].debt + amount);
  const sym = eco.currency.symbol;
  emit(w, "loan", `${w.npcs[borrower].name} takes a ${sym}${amount} loan from Ashdown & Co. for ${w.content.locations[bizId].name}.`, { actors: [borrower, bank.owner], locationId: BANK, importance: 6 });
  return loan;
}

/** Tax day: businesses pay taxRate on the last 10 days of revenue; NPCs on wallet above a floor. */
export function collectTax(w: World): void {
  const sym = w.content.economy.currency.symbol;
  let total = 0;
  for (const b of Object.values(w.businesses)) {
    if (b.locationId === BANK) continue;
    const revenue = b.pnlHistory.slice(-10).reduce((a, p) => a + p.revenue, 0) + b.revenueToday;
    const tax = round(revenue * w.taxRate);
    if (tax > 0 && transfer(w, bizAcct(b.locationId), TREASURY, tax, { trade: false })) total += tax;
    else if (tax > 0) addMemory(w, b.owner, "observation", `${w.content.locations[b.locationId].name} couldn't pay its ${sym}${tax} tax bill.`, 6);
  }
  for (const npc of Object.values(w.npcs)) {
    const tax = round(Math.max(0, npc.wallet - 150) * w.taxRate);
    if (tax > 0 && transfer(w, npcAcct(npc.id), TREASURY, tax, { trade: false })) total += tax;
  }
  emit(w, "system", `Tax collected: ${sym}${round(total)} at ${Math.round(w.taxRate * 100)}%. Treasury now ${sym}${round(w.treasury)}.`, { actors: [w.election.mayor, "aylin_demir"], locationId: "town_hall", importance: 3, drama: 3 });
}
