import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import config from "../ecosystem.config.js";

test("PM2 runs the production frontend and API with their own runtimes", () => {
  expect(config.apps).toHaveLength(2);
  const web = config.apps.find((app) => app.name === "rakitara-web");
  const api = config.apps.find((app) => app.name === "rakitara-api");
  expect(web).toMatchObject({
    interpreter: "node",
    args: "start --hostname 127.0.0.1 --port 3000",
  });
  expect(api).toMatchObject({
    interpreter: "bun",
    script: "server/index.ts",
    env: { API_HOST: "127.0.0.1" },
  });

  for (const app of config.apps) {
    expect(app.cwd).toBe(resolve(import.meta.dir, ".."));
    expect(existsSync(resolve(app.cwd, app.script))).toBe(true);
    expect(app.env.NODE_ENV).toBe("production");
    expect(app.exec_mode).toBe("fork");
    expect(app.instances).toBe(1);
    expect(app.kill_timeout).toBeGreaterThan(10000);
    expect(
      Object.keys(app.env).some((key) =>
        /SECRET|PASSWORD|DATABASE_URL/.test(key),
      ),
    ).toBe(false);
  }
});
