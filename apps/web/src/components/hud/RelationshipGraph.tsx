"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import type { RelationshipState } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { CAST, npcName, moodColor, relColor, initials } from "./lib";

interface Node extends SimulationNodeDatum { id: string }
interface Link extends SimulationLinkDatum<Node> { type: string; affinity: number }

const TYPE_PRIORITY = ["spouse", "romantic", "family", "enemy", "rival", "tenant", "friend", "mentor", "business", "colleague"];

/** Collapse directed a→b / b→a edges into one undirected link per pair. */
function undirected(rels: RelationshipState[]): Link[] {
  const m = new Map<string, Link>();
  for (const r of rels) {
    const [x, y] = r.a < r.b ? [r.a, r.b] : [r.b, r.a];
    const k = `${x}|${y}`;
    const cur = m.get(k);
    if (!cur) m.set(k, { source: x, target: y, type: r.type, affinity: r.affinity });
    else {
      cur.affinity = (cur.affinity + r.affinity) / 2;
      if (TYPE_PRIORITY.indexOf(r.type) < TYPE_PRIORITY.indexOf(cur.type)) cur.type = r.type;
    }
  }
  return [...m.values()];
}

export default function RelationshipGraph({ height = 300 }: { height?: number }) {
  const rels = useWorld((s) => s.snapshot?.relationships);
  const npcIds = useWorld((s) => Object.keys(s.npcs).join(","));
  // primitive selector: re-render only when some mood actually changes
  const moodKey = useWorld((s) => { let k = ""; for (const id in s.npcs) k += s.npcs[id].mood.slice(0, 2); return k; });
  const selectNpc = useWorld((s) => s.selectNpc);
  const selectedId = useWorld((s) => s.ui.selectedNpcId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const [width, setWidth] = useState(360);

  const ids = useMemo(() => {
    const live = npcIds ? npcIds.split(",") : [];
    return live.length ? live : CAST.map((c) => c.id);
  }, [npcIds]);
  const links = useMemo(() => undirected(rels ?? []), [rels]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el); setWidth(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // simulation
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    const nodes: Node[] = ids.map((id) => prev.get(id) ?? { id, x: width / 2 + (Math.random() - 0.5) * width * 0.6, y: height / 2 + (Math.random() - 0.5) * height * 0.6 });
    const nodeSet = new Set(ids);
    const ls: Link[] = links.filter((l) => nodeSet.has(l.source as string) && nodeSet.has(l.target as string)).map((l) => ({ ...l }));
    nodesRef.current = nodes; linksRef.current = ls;

    const sim = forceSimulation<Node>(nodes)
      .force("link", forceLink<Node, Link>(ls).id((d) => d.id).distance((l) => 30 + (100 - Math.abs(l.affinity)) * 0.4).strength((l) => 0.25 + Math.abs(l.affinity) / 250))
      .force("charge", forceManyBody().strength(-45).distanceMax(160))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(11))
      .alpha(prev.size ? 0.4 : 1)
      .alphaDecay(0.03);

    const draw = () => {
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const npcs = useWorld.getState().npcs;
      const hov = hoverRef.current;
      const sel = useWorld.getState().ui.selectedNpcId;
      const focus = hov ?? sel;
      // clamp nodes inside the canvas
      for (const n of nodes) { n.x = Math.max(14, Math.min(width - 14, n.x ?? 0)); n.y = Math.max(14, Math.min(height - 18, n.y ?? 0)); }
      // edges
      for (const l of ls) {
        const s = l.source as Node, t = l.target as Node;
        const a = Math.abs(l.affinity) / 100;
        const related = focus && (s.id === focus || t.id === focus);
        ctx.strokeStyle = relColor(l.type);
        ctx.globalAlpha = focus ? (related ? 0.95 : 0.06) : 0.18 + a * 0.5;
        ctx.lineWidth = 0.6 + a * 2.2;
        ctx.beginPath(); ctx.moveTo(s.x ?? 0, s.y ?? 0); ctx.lineTo(t.x ?? 0, t.y ?? 0); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // nodes
      for (const n of nodes) {
        const mood = npcs[n.id]?.mood;
        const r = n.id === focus ? 8 : 5.5;
        ctx.beginPath(); ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
        ctx.fillStyle = moodColor(mood);
        ctx.globalAlpha = focus && n.id !== focus && !ls.some((l) => ((l.source as Node).id === focus && (l.target as Node).id === n.id) || ((l.target as Node).id === focus && (l.source as Node).id === n.id)) ? 0.35 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = n.id === sel ? 2 : 1;
        ctx.strokeStyle = n.id === sel ? "#ff3b5c" : "rgba(11,16,32,0.9)";
        ctx.stroke();
        if ((n.id === focus && n.id !== hov) || width > 420) {
          ctx.fillStyle = n.id === focus ? "#fff" : "rgba(226,232,240,0.7)";
          ctx.font = `${n.id === focus ? "600 10px" : "9px"} ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.id === focus ? npcName(n.id) : initials(npcName(n.id)), n.x ?? 0, (n.y ?? 0) + r + 10);
        }
      }
    };
    drawRef.current = draw;
    sim.on("tick", draw);
    return () => { sim.stop(); };
  }, [ids, links, width, height]);

  // redraw when moods/selection change without restarting the simulation
  useEffect(() => { drawRef.current(); }, [moodKey, selectedId]);

  const nearest = (mx: number, my: number): Node | null => {
    let best: Node | null = null, bd = 12 * 12;
    for (const n of nodesRef.current) { const dx = (n.x ?? 0) - mx, dy = (n.y ?? 0) - my, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } }
    return best;
  };

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      <canvas ref={canvasRef} style={{ width, height, cursor: hover ? "pointer" : "default" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const n = nearest(e.clientX - rect.left, e.clientY - rect.top);
          const id = n?.id ?? null;
          if (id !== hoverRef.current) { hoverRef.current = id; setHover(n ? { id: n.id, x: n.x ?? 0, y: n.y ?? 0 } : null); drawRef.current(); }
          else if (n) setHover({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 });
        }}
        onMouseLeave={() => { hoverRef.current = null; setHover(null); drawRef.current(); }}
        onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const n = nearest(e.clientX - rect.left, e.clientY - rect.top); if (n) selectNpc(n.id); }}
      />
      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-md border border-[var(--hud-border-strong)] bg-[rgba(2,6,23,0.92)] px-2 py-1 text-[11px] text-white shadow-lg"
          style={{ left: Math.min(width - 140, Math.max(0, hover.x + 10)), top: Math.max(0, hover.y - 30) }}>
          <div className="font-semibold">{npcName(hover.id)}</div>
          <HoverMeta id={hover.id} />
        </div>
      )}
    </div>
  );
}

function HoverMeta({ id }: { id: string }) {
  const mood = useWorld((s) => s.npcs[id]?.mood);
  const activity = useWorld((s) => s.npcs[id]?.activity);
  return <div className="text-[10px] text-slate-400"><span style={{ color: moodColor(mood) }}>{mood ?? "—"}</span>{activity ? ` · ${activity}` : ""}</div>;
}
