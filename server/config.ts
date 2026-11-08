import { z } from "zod";

export function readConfig(env: Record<string, string | undefined> = process.env) {
  const config = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    APP_ORIGIN: z.url().refine((v) => new URL(v).origin === v, "Use an origin without a trailing slash"),
    SESSION_SECRET: z.string().min(32),
    ADMIN_USERNAME: z.string().trim().min(1).max(100),
    ADMIN_PASSWORD_HASH: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    API_HOST: z.string().default("127.0.0.1"),
    TRUST_PROXY: z.string().optional(),
  }).parse(env);
  if (config.NODE_ENV === "production" && !config.APP_ORIGIN.startsWith("https://")) {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }
  return config;
}
export type Config = ReturnType<typeof readConfig>;
