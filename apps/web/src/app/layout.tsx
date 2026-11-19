import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

const GA_ID = "G-YZDY7659DT";
const CF_BEACON = '{"token": "1ed2a604f6804a8aa0c38beeb6a0d2d1"}';
const TAGS = process.env.REPLAY_EXPORT === "1";
const SITE = (process.env.REPLAY_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const REPLAY_DESC = "A harbour town of 50 people, run by AI for 30 days: everything they said, chose and voted came from AI. It ends in an election.";
export const metadata: Metadata = process.env.REPLAY_EXPORT === "1"
  ? {
      metadataBase: new URL(SITE),
      title: "Solmere — a month in a town run by AI",
      description: REPLAY_DESC,
      openGraph: { type: "website", url: SITE + "/", siteName: "Solmere", title: "A month in Solmere", description: REPLAY_DESC, images: [{ url: SITE + "/og-replay/home.png", width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", title: "A month in Solmere", description: REPLAY_DESC, images: [SITE + "/og-replay/home.png"] },
    }
  : { title: "Solmere — NPC World", description: "50 people, one town, run by AI." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        {TAGS && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}</Script>
            <Script src="https://static.cloudflareinsights.com/beacon.min.js" strategy="afterInteractive" data-cf-beacon={CF_BEACON} />
          </>
        )}
      </body>
    </html>
  );
}
