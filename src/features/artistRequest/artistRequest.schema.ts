import z from "zod";

export const artistRequestSchema = z.object({
  stageName: z
    .string()
    .trim()
    .min(2, "Stage name must be 2 characters long.")
    .max(50, "Stage name cannot exceed 50 characters"),
  bio: z
    .string()
    .trim()
    .max(500, "Bio cannot exceed 500 characters")
    .optional(),
  reason: z
    .string()
    .trim()
    .max(1000, "Reason cannot exceed 1000 characters")
    .optional(),
});

export const artistApprovedSchema = z.object({
  requestId: z.string(),
});
export type ArtistRequestInput = z.infer<typeof artistRequestSchema>;
export type artistApprovedInput = z.infer<typeof artistApprovedSchema>;
