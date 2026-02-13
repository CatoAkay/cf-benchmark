// File: apps/api/src/validators.ts
import { z } from "zod";

export const CompetitionSchema = z.enum(["OPEN", "GAMES"]);
export const DivisionSchema = z.enum(["MEN", "WOMEN"]);

// MVP: vi lar "email" være en identifier (kan være email, brukernavn, æøå, osv.)
export const LogResultSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .transform((v) => (v ?? "").trim()),
    workoutId: z.string().min(1),
    timeSeconds: z.number().int().positive().optional(),
    reps: z.number().int().nonnegative().optional(),
    loadKg: z.number().positive().optional(),
    tiebreakSecs: z.number().int().nonnegative().optional(),
  })
  .refine((v) => !!v.userId || !!v.email, {
    message: "Du må sende userId eller email",
    path: ["userId"],
  });

export type LogResultInput = z.infer<typeof LogResultSchema>;
