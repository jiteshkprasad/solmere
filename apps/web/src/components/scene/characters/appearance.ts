/**
 * Typed view of content/appearance.json + the cast entry a character is built from.
 * The JSON is the spec; this file only names its fields.
 */
import type { NpcContent } from "@npcworld/schema";
import appearanceJson from "../../../../../../content/appearance.json";
import castJson from "../../../../../../content/cast.json";

export type Build = "slight" | "average" | "sturdy" | "heavy" | "wiry";
export type AgeBand = "young" | "adult" | "middle" | "senior" | "elder";
export type HairStyle =
  | "short" | "cropped" | "buzz" | "bald" | "balding" | "bun" | "ponytail" | "braids" | "locs" | "afro" | "bob" | "long"
  | "curly" | "wavy" | "slicked" | "tied" | "headwrap" | "hijab" | "shaved-sides";
export type FacialHair = "none" | "stubble" | "moustache" | "goatee" | "beard-short" | "beard-full" | "beard-grey";
export type HatKind = "sou'wester" | "bowler" | "fedora" | "straw" | "tam" | "wide-brim" | "knit" | "constable";
export type CapKind = "captain" | "flat" | "postal";
export type GlassesKind = "round" | "rectangular" | "thin" | "reading" | "chain" | "small";

export interface Hair {
  style: HairStyle;
  color: string;                 // palette key
  greying?: boolean; greyStreak?: boolean; tips?: string; wrap?: string; veil?: boolean; dye?: string;
  neat?: boolean; messy?: boolean; unkempt?: boolean; wild?: boolean; big?: boolean; loose?: boolean; long?: boolean; short?: boolean;
  high?: boolean; low?: boolean; lowBun?: boolean; tight?: boolean; tiedBack?: boolean; single?: boolean; jasmine?: string;
  upTwist?: boolean; topTwists?: boolean; undercut?: boolean; pompadour?: boolean; sideParting?: boolean; thinning?: boolean;
  wisps?: boolean; sharp?: boolean; thick?: boolean; sunBleached?: boolean;
}

export interface Outfit {
  top: string; bottom: string; shoes: string;
  sleeves?: "rolled"; sleeveless?: boolean;
  apron?: string; leatherApron?: boolean; rubberApron?: boolean; barberApron?: boolean; toolBelt?: string;
  coat?: string; labCoat?: boolean; navalCoat?: boolean; longCoat?: boolean; waxJacket?: boolean; oilskin?: boolean; tooBig?: boolean; epaulettes?: string;
  jacket?: string; armyJacket?: boolean; denim?: boolean; blazer?: boolean | string; suit?: string; cardigan?: string; sweater?: string; hoodie?: string; hoodUp?: boolean;
  vest?: string; waistcoat?: string; shirt?: string; tee?: string; tunic?: string; openCollar?: boolean; plaid?: string;
  dress?: string; pattern?: string; sari?: string; border?: string; habit?: string; collar?: string; lace?: boolean; kilt?: string; tartan?: string;
  overalls?: string; coverall?: string; scrubs?: boolean; uniform?: boolean; postal?: boolean; trim?: string; belt?: string; badge?: string;
  hat?: HatKind; hatColor?: string; cap?: CapKind; capColor?: string; beanie?: string; bandana?: string; goggles?: string;
  scarf?: string; shawl?: string; tie?: string; bowTie?: string; pocketSquare?: string; sash?: string; lanyard?: string; brooch?: string; watchChain?: string; watch?: string;
  glasses?: GlassesKind; sunglassesOnHead?: boolean; earrings?: "hoops" | "gold" | "many"; bangles?: string; rings?: boolean; necklace?: string; pendant?: string; nosePin?: boolean;
  stethoscope?: string; measuringTape?: string; pinCushion?: string; headphones?: string; towelOnShoulder?: string; keys?: string; prayerBeads?: string;
  pencilBehindEar?: boolean; notebook?: boolean; rag?: string; gloves?: string; cane?: string; lantern?: string; guitar?: string;
  backpack?: string; totebag?: string; duffel?: string; bag?: string;
  boots?: boolean; wellies?: boolean; sneakers?: boolean; polished?: boolean;
  tattoo?: string; paintStains?: string[]; oilStains?: boolean; sawdust?: boolean; patched?: boolean; holes?: boolean; worn?: boolean; ruddy?: boolean; weathered?: boolean; stooped?: boolean;
}

export interface Appearance {
  skin: string; hair: Hair; facialHair: FacialHair; height: number; build: Build; age: AgeBand; outfit: Outfit; prop: string; signature: string;
}

interface AppearanceFile { palette: { skin: Record<string, string>; hair: Record<string, string> }; npcs: Record<string, Appearance> }
const file = appearanceJson as unknown as AppearanceFile;

export const PALETTE = file.palette;
export const APPEARANCES: Record<string, Appearance> = file.npcs;
export const CAST: NpcContent[] = (castJson as unknown as { npcs: NpcContent[] }).npcs;
const castById = new Map(CAST.map((c) => [c.id, c]));

export const skinHex = (key: string) => PALETTE.skin[key] ?? key;
export const hairHex = (key: string) => PALETTE.hair[key] ?? key;

/** Fallback for an id that has no entry (live engine with a changed cast): a plain townsperson. */
const DEFAULT_APPEARANCE: Appearance = {
  skin: "light", hair: { style: "short", color: "brown" }, facialHair: "none", height: 1.74, build: "average", age: "adult",
  outfit: { top: "#8a8f9a", bottom: "#3d3a36", shoes: "#2a2a2a" }, prop: "none", signature: "",
};
export const appearanceOf = (id: string): Appearance => APPEARANCES[id] ?? DEFAULT_APPEARANCE;
export const castOf = (id: string): NpcContent | undefined => castById.get(id);
