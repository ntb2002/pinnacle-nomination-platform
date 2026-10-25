import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { getActor } from "@/server/auth/session";
import { SummitMark } from "./summit-mark";

const ROLE_HOME = {
  NOMINATOR: { href: "/entries", label: "Your entries" },
  JUDGE: { href: "/judge", label: "Judging" },
  ADMIN: { href: "/admin", label: "Admin" },
} as const;

const PUBLIC_LINKS = [
  { href: "/categories", label: "Categories" },
  { href: "/fees", label: "Fees and deadlines" },
  { href: "/methodology", label: "Methodology" },
  { href: "/judges", label: "Judges" },
];

const linkClass = "text-on-ink underline-offset-4 hover:underline";

export async function SiteHeader() {
  const actor = await getActor();
  return (
    <header className="on-ink bg-ink text-on-ink">
      <div className="container-page flex flex-wrap items-center justify-between gap-4 py-4">
        <Link href="/" className="flex items-center gap-3 no-underline">
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
            {PUBLIC_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
            {actor ? (
              <>
                <li>
                  <Link href={ROLE_HOME[actor.role].href} className={linkClass}>
                    {ROLE_HOME[actor.role].label}
                  </Link>
                </li>
                <li>
                  <form action={signOutAction}>
                    <button type="submit" className={`${linkClass} cursor-pointer`}>
                      Sign out
                    </button>
                  </form>
                </li>
              </>
            ) : (
              <li>
                <Link href="/sign-in" className={linkClass}>
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
