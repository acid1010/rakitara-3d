import { expect, test } from "bun:test";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { createDb } from "./db.ts";

test("health endpoints return public liveness without a database connection", async () => {
  const config = readConfig({
    NODE_ENV: "test", DATABASE_URL: "postgresql://localhost:1/health_test", APP_ORIGIN: "http://localhost:3000",
    SESSION_SECRET: "test-only-session-secret-for-health", ADMIN_USERNAME: "owner",
    ADMIN_PASSWORD_HASH: `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`,
  });
  const db = createDb(config.DATABASE_URL);
  const { app, sessionStore } = createApp(config, db);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    for (const path of ["/health", "/api/health"]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await sessionStore.close();
    await db.$disconnect();
  }
});
