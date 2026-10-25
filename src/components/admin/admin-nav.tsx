import { headers } from "next/headers";
import Link from "next/link";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/settings", label: "Dates and fees" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/rubrics", label: "Rubrics" },
];

/** Secondary navigation for the admin area. Marks the current section. */
export async function AdminNav() {
  const path = ((await headers()).get("x-pathname") ?? "/admin").split("?")[0] ?? "/admin";
  const isCurrent = (href: string) =>
    href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`);
  return (
    <nav aria-label="Admin" className="border-b border-line bg-surface">
      <ul className="container-page flex flex-wrap gap-x-6 gap-y-2 py-3 text-sm">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={isCurrent(i.href) ? "page" : undefined}
              className="font-semibold text-slate underline-offset-4 hover:text-ink hover:underline aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-signal aria-[current=page]:decoration-2"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
