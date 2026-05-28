import { z } from "zod";

/**
 * Normalized audit timeline entry. Derived server-side from `audit.created`,
 * `tool.called`, and `state.patch.committed` events so the inspector can render
 * a full audit timeline (actor / target / visibility / timestamp) without
 * re-deriving event semantics in the UI. `denied` flags entries that should
 * also appear in the denials sub-view.
 */
export const auditEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["audit", "tool", "state-patch", "impersonation"]),
  actorId: z.string().min(1),
  action: z.string().min(1),
  target: z.string().optional(),
  reason: z.string().optional(),
  visibility: z.string().optional(),
  denied: z.boolean(),
  seq: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const listAuditsResponseSchema = z.object({
  audits: z.array(auditEntrySchema),
});
