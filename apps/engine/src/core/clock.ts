import type { SimTime } from "@npcworld/schema";
import type { ClockState, World } from "./types.js";

/**
 * Sim time. Real-time mode: 1 sim-hour = `simHourRealMinutes` real minutes (5 by default),
 * i.e. a tick every real second advances 60/(5*60) = 0.2 sim-minutes = 12 sim-seconds.
 * The 23:00-06:00 block (7 sim-hours) is fast-forwarded in `sleepBlockRealMinutes` (~5).
 */
export const MINUTES_PER_DAY = 1440;

export function defaultSpeed(simHourRealMinutes: number): number {
  return 60 / (simHourRealMinutes * 60); // sim-minutes per real second
}

export function sleepSpeed(sleepStart: number, sleepEnd: number, sleepBlockRealMinutes: number): number {
  const hours = ((sleepEnd - sleepStart) + 24) % 24;
  return (hours * 60) / (sleepBlockRealMinutes * 60);
}

export function inSleepBlock(hour: number, sleepStart: number, sleepEnd: number): boolean {
  return sleepStart > sleepEnd ? hour >= sleepStart || hour < sleepEnd : hour >= sleepStart && hour < sleepEnd;
}

export function makeClock(headless: boolean, simHourRealMinutes: number): ClockState {
  return {
    day: 1,
    dayMinutes: 5 * 60 + 59, // 05:59 so the 06:00 hooks fire on the first tick
    speed: defaultSpeed(simHourRealMinutes),
    paused: false,
    headless,
    headlessStep: 1,
    wallMs: Date.now(),
    totalTicks: 0,
  };
}

export function hourFloat(c: ClockState): number {
  return c.dayMinutes / 60;
}

export function absMinutes(c: ClockState): number {
  return (c.day - 1) * MINUTES_PER_DAY + c.dayMinutes;
}

export function absHours(c: ClockState): number {
  return absMinutes(c) / 60;
}

export function toSimTime(w: World): SimTime {
  const c = w.clock;
  const { sleepStart, sleepEnd } = w.content.town.clock;
  const hour = Math.floor(c.dayMinutes / 60);
  return {
    day: c.day,
    hour,
    minute: Math.floor(c.dayMinutes % 60),
    sleeping: inSleepBlock(hour, sleepStart, sleepEnd),
    wallMs: c.wallMs,
    speed: currentSpeed(w),
    paused: c.paused,
  };
}

/** sim-minutes per real second right now (fast-forwards through the night). */
export function currentSpeed(w: World): number {
  const c = w.clock;
  const { sleepStart, sleepEnd, sleepBlockRealMinutes } = w.content.town.clock;
  if (c.headless) return c.headlessStep;
  const hour = Math.floor(c.dayMinutes / 60);
  if (inSleepBlock(hour, sleepStart, sleepEnd)) return Math.max(c.speed, sleepSpeed(sleepStart, sleepEnd, sleepBlockRealMinutes));
  return c.speed;
}

export interface Advance {
  dtMinutes: number;
  /** integer minutes-of-day crossed (exclusive of start, inclusive of end), in order; day rollover handled */
  crossed: Array<{ day: number; minute: number }>;
  newDay: boolean;
}

/** Advance the clock by `dtMinutes` and report every whole minute boundary crossed. */
export function advanceClock(c: ClockState, dtMinutes: number): Advance {
  const crossed: Advance["crossed"] = [];
  let newDay = false;
  const startAbs = Math.floor(c.dayMinutes);
  let endMinutes = c.dayMinutes + dtMinutes;
  let day = c.day;
  let from = startAbs + 1;
  let endFloor = Math.floor(endMinutes);
  while (endMinutes >= MINUTES_PER_DAY) {
    for (let m = from; m < MINUTES_PER_DAY; m++) crossed.push({ day, minute: m });
    day += 1;
    newDay = true;
    endMinutes -= MINUTES_PER_DAY;
    endFloor = Math.floor(endMinutes);
    from = 0;
  }
  for (let m = from; m <= endFloor; m++) crossed.push({ day, minute: m });
  c.day = day;
  c.dayMinutes = endMinutes;
  c.wallMs = Date.now();
  c.totalTicks += 1;
  return { dtMinutes, crossed, newDay };
}

export function fmtTime(day: number, minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = Math.floor(minuteOfDay % 60);
  return `D${day} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtClock(c: ClockState): string {
  return fmtTime(c.day, c.dayMinutes);
}
