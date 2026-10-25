import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env, isRealProduction } from "@/lib/env";
import { db } from "@/server/db";
import { emailOutbox } from "@/server/db/schema";

export const metadata: Metadata = { title: "Dev mailbox", robots: { index: false } };

/**
 * Development mailbox: the latest outbox messages, including live sign-in links, with
 * no authentication. Exists only with EMAIL_TRANSPORT=outbox outside real production.
 */
export default async function DevMailboxPage() {
  if (isRealProduction() || env().EMAIL_TRANSPORT !== "outbox") notFound();
  const messages = await db
    .select()
    .from(emailOutbox)
    .orderBy(desc(emailOutbox.createdAt))
    .limit(25);
  return (
    <div className="container-page py-12">
      <h1 className="font-display text-4xl font-semibold">Dev mailbox</h1>
      <p className="mt-2 text-slate">
        Emails the app would have sent. Newest first. Development only.
      </p>
      {messages.length === 0 ? (
        <p className="mt-8">No messages yet.</p>
      ) : (
        <ol className="mt-8 flex flex-col gap-6">
          {messages.map((m) => (
            <li key={m.id} className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg font-semibold">{m.subject}</h2>
              <p className="text-sm text-slate">
                To {m.toAddress} at {m.createdAt.toISOString()}
              </p>
              <pre
                className="mt-3 whitespace-pre-wrap break-words font-sans text-sm"
                data-testid="email-text"
              >
                {linkify(m.textBody)}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Renders URLs in a plain-text email body as links. */
function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} className="font-semibold text-ink underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
