import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import { HttpError } from "./errors.ts";
import { verifyPassword } from "./password.ts";

declare module "express-session" {
  interface SessionData { owner?: string; }
}

export function authentication(config: Config, db: Db) {
  const PgStore = connectPgSimple(session);
  const store = new PgStore({ conString: config.DATABASE_URL, schemaName: new URL(config.DATABASE_URL).searchParams.get("schema") ?? "public", createTableIfMissing: false });
  const production = config.NODE_ENV === "production";
  const cookieName = production ? "__Host-rakitara" : "rakitara";
  // Changing the owner credentials invalidates every existing session.
  const owner = createHash("sha256").update(`${config.ADMIN_USERNAME}:${config.ADMIN_PASSWORD_HASH}`).digest("hex");
  const middleware = session({
    store, name: cookieName, secret: config.SESSION_SECRET, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: production, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000, path: "/" },
  });
  const requireOwner: RequestHandler = (req, _res, next) => {
    if (req.session.owner !== owner) return next(new HttpError(401, "Authentication required"));
    next();
  };
  const router = Router();
  let verifying = false;
  router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    const input = z.strictObject({ username: z.string().min(1).max(100), password: z.string().min(1).max(1024) }).parse(req.body);
    // One owner: a shared database counter also limits distributed brute-force attempts.
    const schema = new URL(config.DATABASE_URL).searchParams.get("schema") ?? "public";
    const throttleTable = Prisma.raw(`"${schema.replaceAll('"', '""')}"."LoginThrottle"`);
    const allowed = await db.$queryRaw<{ attempts: number }[]>`
      INSERT INTO ${throttleTable} AS throttle ("key", "attempts", "expiresAt") VALUES ('owner', 1, (NOW() AT TIME ZONE 'UTC') + INTERVAL '15 minutes')
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN throttle."expiresAt" <= (NOW() AT TIME ZONE 'UTC') THEN 1 ELSE throttle."attempts" + 1 END,
        "expiresAt" = CASE WHEN throttle."expiresAt" <= (NOW() AT TIME ZONE 'UTC') THEN (NOW() AT TIME ZONE 'UTC') + INTERVAL '15 minutes' ELSE throttle."expiresAt" END
      WHERE throttle."expiresAt" <= (NOW() AT TIME ZONE 'UTC') OR throttle."attempts" < 20
      RETURNING "attempts"`;
    if (!allowed.length) throw new HttpError(429, "Too many login attempts; retry after 15 minutes");
    if (verifying) throw new HttpError(429, "Login already in progress; retry shortly");
    verifying = true;
    let passwordValid: boolean;
    try { passwordValid = await verifyPassword(input.password, config.ADMIN_PASSWORD_HASH); }
    finally { verifying = false; }
    const actualUser = createHash("sha256").update(input.username).digest();
    const expectedUser = createHash("sha256").update(config.ADMIN_USERNAME).digest();
    if (!passwordValid || !timingSafeEqual(actualUser, expectedUser)) throw new HttpError(401, "Invalid credentials");
    await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.owner = owner;
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.json({ username: config.ADMIN_USERNAME });
  });
  router.get("/me", requireOwner, (_req, res) => res.json({ username: config.ADMIN_USERNAME }));
  router.post("/logout", requireOwner, async (req, res) => {
    await new Promise<void>((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie(cookieName, { path: "/", httpOnly: true, secure: production, sameSite: "strict" });
    res.status(204).end();
  });
  return { middleware, router, requireOwner, store };
}
