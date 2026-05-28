import { z } from "zod";

export const configPatchRevisionOperationSchema = z.object({
  path: z.string().min(1),
  nextContent: z.string().nullable(),
});

export const configPatchReviseRequestSchema = z.object({
  operations: z.array(configPatchRevisionOperationSchema).min(1),
});
