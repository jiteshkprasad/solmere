/**
 * Signage: every sign in town is painted into ONE canvas atlas (bold sans text, wood/painted
 * board backgrounds, hand-drawn pictograms, light weathering) and drawn as textured quads in a
 * single mesh. No font downloads — canvas 2D only. Built on the client by <Buildings/>.
 */
import * as THREE from "three";

export type SignIcon = "anchor" | "scissors" | "loaf" | "crest" | "key" | "fish" | "wrench" | "keg" | "cup" | "needle" | "cross" | "letter" | "house" | "hammer" | "apple" | "book" | "bell" | "boat" | "tea" | "star" | "none";
export type SignKind = "board" | "hanging" | "modern" | "chalk" | "tolet" | "notice" | "clock" | "post" | "warning";

export interface SignSpec {
  kind: SignKind;
  text: string;
  sub?: string;
  icon?: SignIcon;
  bg?: string; fg?: string; border?: string;
  /** metres */
  w: number; h: number;
}
export interface SignPlacement { spec: SignSpec; x: number; y: number; z: number; ry: number; twoSided: boolean }
export interface UVRect { u0: number; v0: number; u1: number; v1: number }

const PX_PER_M = 128;
const FONT = "'Trebuchet MS', 'Segoe UI', 'DejaVu Sans', Arial, Helvetica, sans-serif";

export class SignAtlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private x = 0; private y = 0; private rowH = 0;
  private cache = new Map<string, UVRect>();
  tex: THREE.CanvasTexture;
  constructor(public size = 2048) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = size; this.canvas.height = size;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.fillStyle = "#000"; this.ctx.fillRect(0, 0, size, size);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
  }

  add(s: SignSpec): UVRect {
    const key = JSON.stringify(s);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const pw = Math.min(this.size, Math.round(s.w * PX_PER_M)), ph = Math.round(s.h * PX_PER_M);
    if (this.x + pw + 4 > this.size) { this.x = 0; this.y += this.rowH + 4; this.rowH = 0; }
    if (this.y + ph > this.size) { return { u0: 0, v0: 0, u1: 0, v1: 0 }; }
    const x = this.x, y = this.y;
    this.x += pw + 4; this.rowH = Math.max(this.rowH, ph);
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.beginPath(); this.ctx.rect(0, 0, pw, ph); this.ctx.clip();
    drawSign(this.ctx, s, pw, ph);
    this.ctx.restore();
    // canvas y grows down; texture v grows up (flipY = true by default)
    const r: UVRect = { u0: x / this.size, u1: (x + pw) / this.size, v0: 1 - (y + ph) / this.size, v1: 1 - y / this.size };
    this.cache.set(key, r);
    this.tex.needsUpdate = true;
    return r;
  }
}

/* ---------------------------------- painting ---------------------------------- */

function rand(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function woodGrain(c: CanvasRenderingContext2D, w: number, h: number, base: string, seed = 1) {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  const r = rand(seed);
  c.globalAlpha = 0.16;
  for (let i = 0; i < 40; i++) {
    c.strokeStyle = r() > 0.5 ? "#000" : "#fff";
    c.lineWidth = 1 + r() * 2;
    const y = r() * h;
    c.beginPath(); c.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) c.lineTo(x, y + Math.sin(x * 0.05 + i) * 3 + (r() - 0.5) * 2);
    c.stroke();
  }
  c.globalAlpha = 1;
}
function weather(c: CanvasRenderingContext2D, w: number, h: number, seed = 3, amount = 0.12) {
  const r = rand(seed);
  c.globalAlpha = amount;
  for (let i = 0; i < 60; i++) {
    c.fillStyle = r() > 0.5 ? "#2a1e12" : "#ffffff";
    const x = r() * w, y = r() * h, s = 2 + r() * 10;
    c.beginPath(); c.ellipse(x, y, s, s * (0.4 + r()), r() * 3, 0, Math.PI * 2); c.fill();
  }
  // darker bottom edge / streaks
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalAlpha = 1;
}
function fitText(c: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, weight = 800): number {
  let size = maxH;
  for (; size > 8; size -= 1) {
    c.font = `${weight} ${size}px ${FONT}`;
    if (c.measureText(text).width <= maxW) break;
  }
  return size;
}
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, maxH: number, fg: string, opts: { shadow?: string; weight?: number; align?: CanvasTextAlign; upper?: boolean } = {}) {
  const t = opts.upper === false ? text : text.toUpperCase();
  fitText(c, t, maxW, maxH, opts.weight ?? 800);
  c.textAlign = opts.align ?? "center"; c.textBaseline = "middle";
  if (opts.shadow) { c.fillStyle = opts.shadow; c.fillText(t, x + 2, y + 3); }
  c.fillStyle = fg; c.fillText(t, x, y);
}

function drawSign(c: CanvasRenderingContext2D, s: SignSpec, w: number, h: number) {
  const seed = s.text.length * 31 + w;
  const fg = s.fg ?? "#fff6e0";
  switch (s.kind) {
    case "board": {
      woodGrain(c, w, h, s.bg ?? "#4a2e1c", seed);
      c.strokeStyle = s.border ?? "#d8b45a"; c.lineWidth = Math.max(3, h * 0.05); c.strokeRect(c.lineWidth, c.lineWidth, w - c.lineWidth * 2, h - c.lineWidth * 2);
      const iconW = s.icon && s.icon !== "none" ? h * 0.9 : 0;
      if (iconW) drawIcon(c, s.icon!, h * 0.55, h / 2, h * 0.36, fg);
      label(c, s.text, iconW + (w - iconW) / 2, h / 2, w - iconW - h * 0.4, h * 0.62, fg, { shadow: "rgba(0,0,0,0.5)" });
      weather(c, w, h, seed, 0.1);
      break;
    }
    case "hanging": {
      woodGrain(c, w, h, s.bg ?? "#3a2517", seed);
      c.strokeStyle = s.border ?? "#c9a24a"; c.lineWidth = Math.max(3, h * 0.04); c.strokeRect(c.lineWidth, c.lineWidth, w - c.lineWidth * 2, h - c.lineWidth * 2);
      if (s.icon && s.icon !== "none") drawIcon(c, s.icon, w / 2, h * 0.42, Math.min(w, h) * 0.3, fg);
      label(c, s.text, w / 2, h * 0.82, w * 0.9, h * 0.2, fg, { shadow: "rgba(0,0,0,0.5)" });
      weather(c, w, h, seed, 0.14);
      break;
    }
    case "modern": {
      c.fillStyle = s.bg ?? "#23262b"; c.fillRect(0, 0, w, h);
      c.fillStyle = s.border ?? "#c8b48a"; c.fillRect(0, h - Math.max(3, h * 0.06), w, Math.max(3, h * 0.06));
      const iconW = s.icon && s.icon !== "none" ? h * 0.9 : 0;
      if (iconW) drawIcon(c, s.icon!, h * 0.5, h / 2, h * 0.3, s.border ?? "#c8b48a");
      label(c, s.text, iconW + (w - iconW) / 2, h / 2, w - iconW - h * 0.3, h * 0.5, fg, { weight: 700 });
      break;
    }
    case "chalk": {
      c.fillStyle = "#6b4a30"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#22262a"; c.fillRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
      const lines = [s.text, ...(s.sub ? s.sub.split("|") : [])];
      const lh = (h * 0.8) / lines.length;
      lines.forEach((t, i) => label(c, t, w / 2, h * 0.12 + lh * (i + 0.5), w * 0.8, lh * 0.7, i === 0 ? "#fff8dc" : "#cfe7c5", { weight: 700, upper: i === 0 }));
      c.globalAlpha = 0.25; c.fillStyle = "#fff"; c.fillRect(w * 0.08, h * 0.9, w * 0.3, 2); c.globalAlpha = 1;
      break;
    }
    case "tolet": {
      c.fillStyle = s.bg ?? "#f2f0ea"; c.fillRect(0, 0, w, h);
      c.fillStyle = s.border ?? "#1f2f5a"; c.fillRect(0, 0, w, h * 0.32);
      label(c, s.text, w / 2, h * 0.16, w * 0.9, h * 0.24, "#ffffff");
      label(c, s.sub ?? "", w / 2, h * 0.66, w * 0.9, h * 0.5, s.border ?? "#1f2f5a", { weight: 900 });
      weather(c, w, h, seed, 0.06);
      break;
    }
    case "notice": {
      c.fillStyle = "#6b4a30"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#b8a37c"; c.fillRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);
      const r = rand(seed);
      // pinned papers
      for (let i = 0; i < 7; i++) {
        const px = w * 0.08 + r() * w * 0.6, py = h * 0.12 + r() * h * 0.5, pw = w * 0.16 + r() * w * 0.14, ph = h * 0.2 + r() * h * 0.22;
        c.fillStyle = ["#fffdf0", "#fde9b8", "#dbe9ff", "#ffd7d7"][i % 4]; c.fillRect(px, py, pw, ph);
        c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 1;
        for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(px + 4, py + (ph * k) / 5); c.lineTo(px + pw - 4 - r() * pw * 0.3, py + (ph * k) / 5); c.stroke(); }
        c.fillStyle = "#c0392b"; c.beginPath(); c.arc(px + pw / 2, py + 3, 3, 0, Math.PI * 2); c.fill();
      }
      label(c, s.text, w / 2, h * 0.04 + h * 0.05, w * 0.8, h * 0.1, "#fff3d0", { weight: 700 });
      break;
    }
    case "clock": {
      const r = Math.min(w, h) / 2 - 2;
      c.fillStyle = "#2c2c2c"; c.beginPath(); c.arc(w / 2, h / 2, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#f6f1e3"; c.beginPath(); c.arc(w / 2, h / 2, r * 0.9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#2c2c2c"; c.lineWidth = Math.max(2, r * 0.06);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * r * 0.72, h / 2 + Math.sin(a) * r * 0.72); c.lineTo(w / 2 + Math.cos(a) * r * 0.84, h / 2 + Math.sin(a) * r * 0.84); c.stroke(); }
      c.lineWidth = Math.max(3, r * 0.08); c.lineCap = "round";
      c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(-Math.PI / 2 + 0.6) * r * 0.45, h / 2 + Math.sin(-Math.PI / 2 + 0.6) * r * 0.45); c.stroke();
      c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(-Math.PI / 2 + 2.1) * r * 0.68, h / 2 + Math.sin(-Math.PI / 2 + 2.1) * r * 0.68); c.stroke();
      c.fillStyle = "#2c2c2c"; c.beginPath(); c.arc(w / 2, h / 2, r * 0.06, 0, Math.PI * 2); c.fill();
      break;
    }
    case "post": {
      // finger-post / warning stake
      c.fillStyle = s.bg ?? "#e9e2cf"; c.fillRect(0, 0, w, h);
      c.strokeStyle = s.border ?? "#3b2a1a"; c.lineWidth = Math.max(3, h * 0.08); c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
      label(c, s.text, w / 2, h / 2, w * 0.86, h * 0.6, s.fg ?? "#2a1e12", { weight: 900 });
      weather(c, w, h, seed, 0.12);
      break;
    }
    case "warning": {
      c.fillStyle = s.bg ?? "#e8c23a"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#1a1a1a";
      const stripe = h * 0.16;
      c.fillRect(0, 0, w, stripe); c.fillRect(0, h - stripe, w, stripe);
      const lines = [s.text, ...(s.sub ? s.sub.split("|") : [])];
      const lh = (h - stripe * 2) / lines.length;
      lines.forEach((t, i) => label(c, t, w / 2, stripe + lh * (i + 0.5), w * 0.9, lh * 0.72, "#1a1a1a", { weight: 900 }));
      weather(c, w, h, seed, 0.15);
      break;
    }
  }
}

/** simple pictograms, drawn centred at (x,y) with radius r */
function drawIcon(c: CanvasRenderingContext2D, icon: SignIcon, x: number, y: number, r: number, col: string) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = col; c.fillStyle = col; c.lineCap = "round"; c.lineJoin = "round";
  c.lineWidth = Math.max(2, r * 0.18);
  const P = () => c.beginPath();
  switch (icon) {
    case "anchor":
      P(); c.arc(0, -r * 0.75, r * 0.18, 0, Math.PI * 2); c.stroke();
      P(); c.moveTo(0, -r * 0.57); c.lineTo(0, r * 0.85); c.stroke();
      P(); c.moveTo(-r * 0.5, -r * 0.25); c.lineTo(r * 0.5, -r * 0.25); c.stroke();
      P(); c.arc(0, r * 0.2, r * 0.7, 0.2, Math.PI - 0.2); c.stroke();
      P(); c.moveTo(-r * 0.9, r * 0.2); c.lineTo(-r * 0.62, r * 0.45); c.stroke();
      P(); c.moveTo(r * 0.9, r * 0.2); c.lineTo(r * 0.62, r * 0.45); c.stroke();
      break;
    case "scissors":
      P(); c.arc(-r * 0.4, r * 0.55, r * 0.28, 0, Math.PI * 2); c.stroke();
      P(); c.arc(r * 0.4, r * 0.55, r * 0.28, 0, Math.PI * 2); c.stroke();
      P(); c.moveTo(-r * 0.25, r * 0.35); c.lineTo(r * 0.55, -r * 0.9); c.stroke();
      P(); c.moveTo(r * 0.25, r * 0.35); c.lineTo(-r * 0.55, -r * 0.9); c.stroke();
      break;
    case "loaf":
      P(); c.moveTo(-r * 0.9, r * 0.5); c.lineTo(-r * 0.9, -r * 0.1); c.quadraticCurveTo(-r * 0.9, -r * 0.7, -r * 0.3, -r * 0.7); c.lineTo(r * 0.3, -r * 0.7); c.quadraticCurveTo(r * 0.9, -r * 0.7, r * 0.9, -r * 0.1); c.lineTo(r * 0.9, r * 0.5); c.closePath(); c.fill();
      c.strokeStyle = "#3a2517"; c.lineWidth = Math.max(2, r * 0.12);
      for (let i = -1; i <= 1; i++) { P(); c.moveTo(i * r * 0.4 - r * 0.15, -r * 0.45); c.lineTo(i * r * 0.4 + r * 0.15, -r * 0.1); c.stroke(); }
      break;
    case "crest":
      P(); c.moveTo(-r * 0.8, -r * 0.8); c.lineTo(r * 0.8, -r * 0.8); c.lineTo(r * 0.8, r * 0.1); c.quadraticCurveTo(r * 0.8, r * 0.7, 0, r * 0.95); c.quadraticCurveTo(-r * 0.8, r * 0.7, -r * 0.8, r * 0.1); c.closePath(); c.fill();
      c.fillStyle = "#3a2517"; P(); c.moveTo(0, -r * 0.55); c.lineTo(r * 0.35, r * 0.05); c.lineTo(0, r * 0.6); c.lineTo(-r * 0.35, r * 0.05); c.closePath(); c.fill();
      break;
    case "key":
      P(); c.arc(-r * 0.45, 0, r * 0.38, 0, Math.PI * 2); c.stroke();
      P(); c.moveTo(-r * 0.07, 0); c.lineTo(r * 0.95, 0); c.stroke();
      P(); c.moveTo(r * 0.55, 0); c.lineTo(r * 0.55, r * 0.4); c.stroke();
      P(); c.moveTo(r * 0.85, 0); c.lineTo(r * 0.85, r * 0.3); c.stroke();
      break;
    case "fish":
      P(); c.moveTo(-r * 0.9, 0); c.quadraticCurveTo(-r * 0.3, -r * 0.75, r * 0.45, 0); c.quadraticCurveTo(-r * 0.3, r * 0.75, -r * 0.9, 0); c.fill();
      P(); c.moveTo(r * 0.4, 0); c.lineTo(r * 0.95, -r * 0.5); c.lineTo(r * 0.95, r * 0.5); c.closePath(); c.fill();
      c.fillStyle = "#3a2517"; P(); c.arc(-r * 0.55, -r * 0.12, r * 0.08, 0, Math.PI * 2); c.fill();
      break;
    case "wrench":
      c.save(); c.rotate(-Math.PI / 4);
      P(); c.moveTo(0, -r * 0.2); c.lineTo(0, r * 0.95); c.stroke();
      P(); c.arc(0, -r * 0.45, r * 0.42, Math.PI * 0.15, Math.PI * 1.85); c.stroke();
      c.restore();
      break;
    case "keg":
      P(); c.moveTo(-r * 0.6, -r * 0.8); c.quadraticCurveTo(-r * 0.95, 0, -r * 0.6, r * 0.8); c.lineTo(r * 0.6, r * 0.8); c.quadraticCurveTo(r * 0.95, 0, r * 0.6, -r * 0.8); c.closePath(); c.fill();
      c.strokeStyle = "#3a2517"; c.lineWidth = Math.max(2, r * 0.12);
      P(); c.moveTo(-r * 0.75, -r * 0.4); c.lineTo(r * 0.75, -r * 0.4); c.stroke();
      P(); c.moveTo(-r * 0.75, r * 0.4); c.lineTo(r * 0.75, r * 0.4); c.stroke();
      break;
    case "cup":
      P(); c.moveTo(-r * 0.6, -r * 0.4); c.lineTo(-r * 0.45, r * 0.6); c.lineTo(r * 0.45, r * 0.6); c.lineTo(r * 0.6, -r * 0.4); c.closePath(); c.fill();
      P(); c.arc(r * 0.72, 0, r * 0.3, -Math.PI / 2, Math.PI / 2); c.stroke();
      P(); c.moveTo(-r * 0.7, r * 0.85); c.lineTo(r * 0.7, r * 0.85); c.stroke();
      for (let i = -1; i <= 1; i++) { P(); c.moveTo(i * r * 0.28, -r * 0.6); c.quadraticCurveTo(i * r * 0.28 + r * 0.12, -r * 0.8, i * r * 0.28, -r * 0.98); c.stroke(); }
      break;
    case "tea":
      P(); c.moveTo(-r * 0.5, -r * 0.2); c.lineTo(-r * 0.35, r * 0.7); c.lineTo(r * 0.35, r * 0.7); c.lineTo(r * 0.5, -r * 0.2); c.closePath(); c.fill();
      P(); c.moveTo(-r * 0.55, -r * 0.5); c.quadraticCurveTo(0, -r * 0.9, r * 0.2, -r * 0.5); c.stroke();
      break;
    case "needle":
      P(); c.moveTo(-r * 0.8, r * 0.8); c.lineTo(r * 0.7, -r * 0.7); c.stroke();
      P(); c.arc(r * 0.62, -r * 0.62, r * 0.14, 0, Math.PI * 2); c.stroke();
      c.lineWidth = Math.max(2, r * 0.1);
      P(); c.moveTo(r * 0.5, -r * 0.5); c.bezierCurveTo(-r * 0.2, -r * 0.2, r * 0.3, r * 0.5, -r * 0.5, r * 0.1); c.stroke();
      break;
    case "cross":
      c.fillStyle = "#d8262c";
      c.fillRect(-r * 0.3, -r * 0.9, r * 0.6, r * 1.8); c.fillRect(-r * 0.9, -r * 0.3, r * 1.8, r * 0.6);
      break;
    case "letter":
      c.fillRect(-r * 0.9, -r * 0.6, r * 1.8, r * 1.2);
      c.strokeStyle = "#3a2517"; P(); c.moveTo(-r * 0.9, -r * 0.6); c.lineTo(0, r * 0.1); c.lineTo(r * 0.9, -r * 0.6); c.stroke();
      break;
    case "house":
      P(); c.moveTo(-r * 0.9, 0); c.lineTo(0, -r * 0.85); c.lineTo(r * 0.9, 0); c.lineTo(r * 0.65, 0); c.lineTo(r * 0.65, r * 0.8); c.lineTo(-r * 0.65, r * 0.8); c.lineTo(-r * 0.65, 0); c.closePath(); c.fill();
      break;
    case "hammer":
      P(); c.moveTo(-r * 0.7, r * 0.8); c.lineTo(r * 0.3, -r * 0.2); c.stroke();
      c.fillRect(r * 0.0, -r * 0.85, r * 0.9, r * 0.5);
      break;
    case "apple":
      P(); c.arc(-r * 0.3, r * 0.15, r * 0.5, 0, Math.PI * 2); c.fill();
      P(); c.arc(r * 0.3, r * 0.15, r * 0.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#3f7d3a"; P(); c.moveTo(0, -r * 0.3); c.quadraticCurveTo(r * 0.1, -r * 0.7, r * 0.4, -r * 0.8); c.stroke();
      break;
    case "book":
      c.fillRect(-r * 0.9, -r * 0.6, r * 0.85, r * 1.2); c.fillRect(r * 0.05, -r * 0.6, r * 0.85, r * 1.2);
      c.strokeStyle = "#3a2517"; c.lineWidth = Math.max(2, r * 0.08);
      for (let k = 0; k < 3; k++) { P(); c.moveTo(-r * 0.75, -r * 0.35 + k * r * 0.3); c.lineTo(-r * 0.2, -r * 0.35 + k * r * 0.3); c.stroke(); P(); c.moveTo(r * 0.2, -r * 0.35 + k * r * 0.3); c.lineTo(r * 0.75, -r * 0.35 + k * r * 0.3); c.stroke(); }
      break;
    case "bell":
      P(); c.moveTo(-r * 0.7, r * 0.5); c.quadraticCurveTo(-r * 0.7, -r * 0.8, 0, -r * 0.8); c.quadraticCurveTo(r * 0.7, -r * 0.8, r * 0.7, r * 0.5); c.closePath(); c.fill();
      P(); c.arc(0, r * 0.7, r * 0.18, 0, Math.PI * 2); c.fill();
      break;
    case "boat":
      P(); c.moveTo(-r * 0.9, r * 0.2); c.lineTo(r * 0.9, r * 0.2); c.lineTo(r * 0.6, r * 0.7); c.lineTo(-r * 0.6, r * 0.7); c.closePath(); c.fill();
      P(); c.moveTo(0, r * 0.2); c.lineTo(0, -r * 0.9); c.stroke();
      P(); c.moveTo(r * 0.05, -r * 0.8); c.lineTo(r * 0.7, 0); c.lineTo(r * 0.05, 0); c.closePath(); c.fill();
      break;
    case "star":
      P(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
      break;
    default: break;
  }
  c.restore();
}

/* ------------------------------- sign geometry --------------------------------- */

/** textured quads for every sign; one mesh, one material */
export function buildSignGeometry(placements: SignPlacement[], atlas: SignAtlas): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  const v = new THREE.Vector3();
  for (const p of placements) {
    const r = atlas.add(p.spec);
    const hw = p.spec.w / 2, hh = p.spec.h / 2;
    const c = Math.cos(p.ry), s = Math.sin(p.ry);
    const quad = (flip: boolean) => {
      // local x → world (x*c, z*-s)?? rotation about y: (x, z) → (x cos + z sin, -x sin + z cos)
      const corners: [number, number, number][] = flip
        ? [[hw, -hh, 0], [-hw, -hh, 0], [-hw, hh, 0], [hw, hh, 0]]
        : [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]];
      const uvs = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
      const n = flip ? [-s, 0, -c] : [s, 0, c];
      const zo = p.twoSided ? (flip ? -0.045 : 0.045) : 0.012;
      const W = corners.map(([lx, ly, lz]) => { v.set(lx * c + (lz + zo) * s, ly, -lx * s + (lz + zo) * c); return [p.x + v.x, p.y + v.y, p.z + v.z]; });
      const order = [0, 1, 2, 0, 2, 3];
      for (const i of order) { pos.push(W[i][0], W[i][1], W[i][2]); nrm.push(n[0], n[1], n[2]); uv.push(uvs[i][0], uvs[i][1]); }
    };
    quad(false);
    if (p.twoSided) quad(true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}
