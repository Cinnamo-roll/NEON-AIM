import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  CORS_ORIGIN: z.string().min(1).default("http://127.0.0.1:5173"),
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  return environmentSchema.parse(source);
}
