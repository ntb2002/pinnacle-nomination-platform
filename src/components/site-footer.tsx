import Link from "next/link";

const LINKS = [
  { href: "/methodology", label: "Judging methodology" },
  { href: "/conflict-of-interest", label: "Conflict-of-interest policy" },
  { href: "/judges", label: "Judging panel" },
  { href: "/fees", label: "Fees and deadlines" },
];

export function SiteFooter() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="container-page grid gap-6 py-10 text-sm text-slate sm:grid-cols-[2fr_1fr]">
        <div>
          <p className="font-display text-lg font-semibold text-ink">Pinnacle Awards</p>
          <p className="mt-2 max-w-md">
            Presented by the Center for the Creator Economy at Syracuse University.
          </p>
          <p className="mt-4">© {year} Syracuse University</p>
        </div>
        <nav aria-label="Program">
          <ul className="flex flex-col gap-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
