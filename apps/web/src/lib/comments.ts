/** Comments API client (replay site only; the Worker serves /api/comments*). */
export interface Comment { id: number; target: string; name: string; body: string; at: number }

export async function listComments(target: string): Promise<Comment[]> {
  const r = await fetch(`/api/comments?target=${encodeURIComponent(target)}`);
  if (!r.ok) throw new Error("load failed");
  return ((await r.json()) as { comments: Comment[] }).comments;
}

export async function commentCounts(): Promise<Record<string, number>> {
  const r = await fetch("/api/comments/counts");
  return r.ok ? ((await r.json()) as Record<string, number>) : {};
}

let siteKey: Promise<string> | null = null;
export function turnstileSiteKey(): Promise<string> {
  return (siteKey ??= fetch("/api/comments/config").then((r) => r.json()).then((j: { siteKey?: string }) => j.siteKey ?? "").catch(() => ""));
}

export async function postComment(c: { target: string; name: string; body: string; token: string }): Promise<Comment> {
  const r = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
  const j = (await r.json().catch(() => ({}))) as { comment?: Comment; error?: string };
  if (!r.ok || !j.comment) throw new Error(j.error ?? "Couldn't post that. Try again.");
  return j.comment;
}

export async function reportComment(id: number): Promise<void> {
  await fetch("/api/comments/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
}

export function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d} d ago` : new Date(ms).toLocaleDateString();
}
