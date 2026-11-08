import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { authentication } from "./auth.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import { HttpError } from "./errors.ts";
import { apiRoutes } from "./routes.ts";

export function createApp(config: Config, db: Db) {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY) app.set("trust proxy", config.TRUST_PROXY.split(",").map((v) => v.trim()));
  app.use(helmet());
  app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.get(["/health", "/api/health"], (_req, res) => res.json({ status: "ok" }));
  app.use("/api", rateLimit({ windowMs: 60000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
  app.use("/api", (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.get("origin") !== config.APP_ORIGIN || req.get("sec-fetch-site") === "cross-site") {
      return next(new HttpError(403, "Invalid request origin"));
    }
    if (!req.is("application/json")) return next(new HttpError(415, "Content-Type must be application/json"));
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  const auth = authentication(config, db);
  app.use("/api", auth.middleware);
  app.use("/api/auth", auth.router);
  app.use("/api", auth.requireOwner, apiRoutes(db));
  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Invalid input", details: error.issues.map(({ path, message }) => ({ path, message })) });
      return;
    }
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped: Record<string, [number, string]> = {
        P2025: [404, "Record not found"], P2002: [409, "Record already exists"], P2003: [409, "Related record not found"],
        P2000: [400, "Value exceeds database limits"], P2004: [409, "Database constraint rejected this operation"],
        P2020: [400, "Numeric value exceeds database limits"], P2034: [409, "Concurrent update; retry the operation"],
      };
      const match = mapped[error.code];
      if (match) { res.status(match[0]).json({ error: match[1] }); return; }
    }
    if (error && typeof error === "object" && "type" in error) {
      if (error.type === "entity.parse.failed") { res.status(400).json({ error: "Invalid JSON" }); return; }
      if (error.type === "entity.too.large") { res.status(413).json({ error: "Request body too large" }); return; }
    }
    // Avoid logging request bodies, credentials, or database query parameters.
    console.error("API request failed", error instanceof Error ? error.name : "UnknownError");
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errors);
  return { app, sessionStore: auth.store };
}
