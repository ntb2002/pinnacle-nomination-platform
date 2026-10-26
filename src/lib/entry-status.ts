export type EntryStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";

/** What a nominator sees for each status: a short label and the next step. */
export const NOMINATOR_STATUS: Record<EntryStatus, { label: string; next: string }> = {
  DRAFT: { label: "Draft", next: "Finish the entry, review it, then pay to submit." },
  SUBMITTED: {
    label: "Submitted",
    next: "Paid and submitted. Program staff are checking it before judging.",
  },
  RETURNED: {
    label: "Returned for changes",
    next: "Program staff asked for changes. Update the entry and resubmit; there is no new fee.",
  },
  APPROVED: { label: "Accepted for judging", next: "Your entry is eligible and will be judged." },
};

export const RELATIONSHIP_LABEL = {
  SELF: "Self-nomination",
  PEER: "Nominated by a peer",
  STAFF: "Nominated by CCE staff",
} as const;

export type ReturnReason = "INCOMPLETE" | "WRONG_CATEGORY" | "OTHER";

/** Why an entry was returned, in the words the nominator and admins see. */
export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  INCOMPLETE: "Incomplete",
  WRONG_CATEGORY: "Wrong category",
  OTHER: "Other",
};

/** Status as the program team sees it. */
export const ADMIN_STATUS_LABEL: Record<EntryStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Needs review",
  RETURNED: "Returned",
  APPROVED: "Approved",
};
