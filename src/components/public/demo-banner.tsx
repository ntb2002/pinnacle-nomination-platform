import { env } from "@/lib/env";

/** Shown on demo deployments so invented judges and entries are never taken as real. */
export function DemoBanner() {
  if (env().DEMO_MODE !== "true") return null;
  return (
    <div className="bg-signal-text text-on-ink">
      <p className="container-page py-2 text-sm font-semibold">
        Demonstration site. The people, companies, judges and entries shown here are fictional.
      </p>
    </div>
  );
}
