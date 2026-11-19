/**
 * Shapes of the static season files written by apps/engine/src/replay/export.ts.
 * Kept here (not in @npcworld/schema) because only the replay viewer reads them.
 */
import type { Newspaper, WorldSnapshot, ElectionState } from "@npcworld/schema";

export type MomentKind = "decision" | "election" | "incident" | "romance" | "feud" | "town";

export interface Moment {
  s: number; day: number; hour: number; minute: number;
  kind: MomentKind | string; title: string; text: string;
  actors: string[]; locationId: string | null; score: number;
}

export interface ChapterStage { stage: string; s: number; day: number; text: string; choice?: string }
export interface Chapter { id: string; title: string; actors: string[]; stages: ChapterStage[] }

export interface Manifest {
  season: string;
  title: string;
  days: number;
  dayStarts: Record<string, number>;
  end: number;
  chapters: Chapter[];
  moments: Moment[];
  election: ElectionState | null;
  papers: Array<{ day: number; headline: string }>;
}

/** [sim-minute, frame]. Frames are StreamFrames except: ticks carry only changed npc fields, pos may omit `ids`. */
export type RawFrame = [number, { kind: string; [k: string]: unknown }];

export interface DayFile { day: number; start: number; end: number; snapshot: WorldSnapshot; frames: RawFrame[] }

export type Papers = Newspaper[];
