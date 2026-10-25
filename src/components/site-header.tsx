import Link from "next/link";
import { SummitMark } from "./summit-mark";

export function SiteHeader() {
  return (
    <header className="on-ink bg-ink text-on-ink">
      <div className="container-page flex flex-wrap items-center justify-between gap-4 py-4">
        <Link href="/" className="group flex items-center gap-3 no-underline">
          <SummitMark className="h-5 w-8 text-signal" />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-2xl font-semibold tracking-tight">
              Pinnacle Awards
            </span>
            <span className="text-xs text-on-ink-muted">
              Syracuse University Center for the Creator Economy
            </span>
          </span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <li>
              <Link href="/" className="text-on-ink underline-offset-4 hover:underline">
                Home
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
