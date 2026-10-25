import type { Metadata } from "next";
import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/public-sans";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Every route renders per request so the CSP nonce from src/proxy.ts applies
// to all of them, including not-found and error pages (docs/architecture.md → Runtime).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Pinnacle Awards", template: "%s | Pinnacle Awards" },
  description:
    "The Pinnacle Awards recognize the executives building the creator economy, judged on a published methodology by a named panel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-US" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 bg-surface font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:px-4 focus:py-3 focus:shadow-lg focus-visible:outline-signal"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
