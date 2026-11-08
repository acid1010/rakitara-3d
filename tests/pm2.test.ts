import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
    interpreter: "none",
    script: "bun",
    args: ["run", "server/index.ts"],
    env: { API_HOST: "127.0.0.1" },
  });

  for (const app of config.apps) {
    expect(app.cwd).toBe(resolve(import.meta.dir, ".."));
    expect(
      app.interpreter === "none"
        ? !!Bun.which(app.script)
        : existsSync(resolve(app.cwd, app.script)),
    ).toBe(true);
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

test("the PM2 API command runs top-level await without a require wrapper", async () => {
  const api = config.apps.find((app) => app.name === "rakitara-api");
  if (!api) throw new Error("Missing API process");
  expect(api.interpreter).toBe("none");
  if (!Array.isArray(api.args))
    throw new Error("Expected explicit Bun arguments");
  const directory = await mkdtemp(join(tmpdir(), "rakitara-pm2-"));
  const file = join(directory, "startup.ts");
  try {
    await writeFile(
      file,
      'await Promise.resolve(); console.log("async-startup-ok");\n',
    );
    const child = Bun.spawn([api.script, api.args[0], file], {
      cwd: api.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("async-startup-ok");
    expect(stderr).not.toContain("require() async module");
  } finally {
    await unlink(file);
    await rmdir(directory);
  }
});
