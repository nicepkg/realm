import { z } from "zod";

export const turnRuntimeSchema = z.object({
  adapterKind: z.enum(["package", "subprocess", "fake"]),
  packageName: z.string().min(1).optional(),
  packageVersion: z.string().min(1).optional(),
  binary: z.string().min(1).optional(),
  fallback: z
    .object({
      adapterKind: z.literal("subprocess"),
      status: z.enum(["not-used", "available", "unavailable", "disabled"]),
      reason: z.string().min(1).optional(),
    })
    .optional(),
});

export type TurnRuntime = z.infer<typeof turnRuntimeSchema>;
