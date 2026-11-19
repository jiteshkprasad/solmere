/**
 * One comment thread (a day or a moment of the season): list, a name + comment form with an invisible
 * Turnstile check, and a Report link per comment. `tone="paper"` styles it for the Herald page.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { ago, listComments, postComment, reportComment, turnstileSiteKey, type Comment } from "@/lib/comments";

type TS = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TS; __tsLoading?: Promise<void> } }

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return (window.__tsLoading ??= new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("turnstile"));
    document.head.appendChild(s);
  }));
}

const NAME_KEY = "solmere.commentName";
const REPORTED_KEY = "solmere.reported";

export default function CommentsThread({ target, title, tone = "dark" }: { target: string; title?: string; tone?: "dark" | "paper" }) {
  const [items, setItems] = useState<Comment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [tsFail, setTsFail] = useState(false);
  const [reported, setReported] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    try { setName(localStorage.getItem(NAME_KEY) ?? ""); setReported(JSON.parse(localStorage.getItem(REPORTED_KEY) ?? "[]")); } catch { /* private mode */ }
  }, []);

  const load = useCallback(() => {
    setItems(null); setFailed(false);
    listComments(target).then(setItems).catch(() => { setItems([]); setFailed(true); });
  }, [target]);
  useEffect(load, [load]);

  // the spam check: invisible unless Cloudflare wants a click
  useEffect(() => {
    let dead = false;
    Promise.all([turnstileSiteKey(), loadTurnstile()]).then(([key]) => {
      if (dead || !key || !box.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: key, appearance: "interaction-only", theme: tone === "paper" ? "light" : "dark", size: "flexible",
        "refresh-expired": "auto",
        callback: (t: string) => { setToken(t); setTsFail(false); }, "expired-callback": () => setToken(""),
        "error-callback": () => { setToken(""); setTsFail(true); }, retry: "auto",
      });
    }).catch(() => { if (!dead) setTsFail(true); });
    return () => { dead = true; if (widget.current && window.turnstile) { window.turnstile.remove(widget.current); widget.current = null; } };
  }, [tone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!token) {
      setError(tsFail ? "The spam check couldn't run in this browser. Reload the page, or try another browser." : "One moment: the spam check is still loading.");
      return;
    }
    setBusy(true);
    try {
      const c = await postComment({ target, name: name.trim(), body: body.trim(), token });
      setItems((xs) => [c, ...(xs ?? [])]);
      track("comment_post", { target });
      setBody("");
      try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* ignore */ }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setToken("");
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    }
  };

  const report = async (id: number) => {
    if (reported.includes(id)) return;
    const next = [...reported, id];
    setReported(next);
    try { localStorage.setItem(REPORTED_KEY, JSON.stringify(next.slice(-200))); } catch { /* ignore */ }
    await reportComment(id).catch(() => {});
  };

  const P = tone === "paper";
  const c = {
    text: P ? "text-[#1d1a15]" : "text-slate-100",
    muted: P ? "text-[#6b604c]" : "text-slate-400",
    field: P ? "border-[#1d1a15]/30 bg-white/70 text-[#1d1a15] placeholder:text-[#8a7f6a]" : "border-white/15 bg-black/30 text-slate-100 placeholder:text-slate-500",
    card: P ? "border-[#1d1a15]/15" : "border-white/10",
  };

  return (
    <section className={`flex min-h-0 flex-col gap-2 ${c.text}`} aria-label={title ?? "Comments"}>
      {title && <h3 className="text-[13px] font-semibold">{title}</h3>}
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={2} required
          placeholder="What do you make of it?" aria-label="Your comment"
          className={`w-full resize-none rounded-lg border px-2.5 py-2 text-[13px] leading-snug outline-none focus:border-[#a78bfa] ${c.field}`} />
        <div className="flex items-center gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="Your name" aria-label="Your name"
            className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[13px] outline-none focus:border-[#a78bfa] ${c.field}`} />
          <button type="submit" disabled={busy || !body.trim() || !name.trim()}
            className="shrink-0 rounded-lg bg-[#ff3b5c] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
        <div ref={box} />
        {error && <p className="text-[12px] text-[#ff6b81]" role="alert">{error}</p>}
        <p className={`text-[11px] ${c.muted}`}>Comments are public. Be kind; no links. <a href="/privacy" className="underline">Privacy</a></p>
      </form>
      <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pb-1">
        {items === null && <li className={`text-[12px] ${c.muted}`}>Loading comments…</li>}
        {failed && <li className={`text-[12px] ${c.muted}`}>Comments couldn&apos;t load. <button type="button" onClick={load} className="underline">Try again</button></li>}
        {items && !failed && items.length === 0 && <li className={`text-[12px] ${c.muted}`}>No comments yet. Be the first.</li>}
        {items?.map((m) => (
          <li key={m.id} className={`rounded-lg border px-2.5 py-1.5 ${c.card}`}>
            <div className="flex items-baseline gap-2 text-[12px]">
              <span className="font-semibold">{m.name}</span>
              <span className={c.muted}>{ago(m.at)}</span>
              <span className="flex-1" />
              <button type="button" onClick={() => report(m.id)} disabled={reported.includes(m.id)}
                className={`text-[11px] ${c.muted} hover:underline disabled:no-underline`}>
                {reported.includes(m.id) ? "Reported" : "Report"}
              </button>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-snug">{m.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
