import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = EnvSchema.parse(process.env);
