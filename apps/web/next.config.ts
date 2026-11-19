import type { NextConfig } from "next";

/**
 * The viewer talks to the engine same-origin at /api/* and the Next server proxies
 * to the engine (ENGINE_URL, default http://localhost:4000). This keeps SSE and
 * fetches on one origin, which browsers and sandboxes like. Set
 * NEXT_PUBLIC_ENGINE_URL to talk to the engine directly instead.
 *
 * REPLAY_EXPORT=1 builds the season replay as a static site (out/), for hosting on
 * Cloudflare Workers static assets: no engine, no rewrites, no server routes.
 * Files named page.live.tsx / route.live.ts(x) need the engine or a Node server
 * and are left out of that build (they are normal routes in every other mode).
 */
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:4000";
const EXPORT = process.env.REPLAY_EXPORT === "1";
const EXT = ["tsx", "ts", "jsx", "js"];

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a second build/serve run beside a dev server without the
  // two fighting over .next (used by the perf measurement runs).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  pageExtensions: EXPORT ? EXT : ["live.tsx", "live.ts", ...EXT],
  ...(EXPORT
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        env: { NEXT_PUBLIC_REPLAY: process.env.NEXT_PUBLIC_REPLAY || "s1" },
      }
    : {
        async rewrites() {
          return [
            // /api/og/* are this app's own OG-image routes. They are *dynamic* app routes,
            // and Next checks dynamic routes AFTER afterFiles rewrites, so without this
            // exclusion the proxy below would swallow them. (story/share agent)
            { source: "/api/og/:path*", destination: "/api/og/:path*" },
            { source: "/api/:path*", destination: `${ENGINE_URL}/api/:path*` },
            { source: "/healthz", destination: `${ENGINE_URL}/healthz` },
          ];
        },
      }),
};

export default nextConfig;
