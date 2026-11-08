import { expect, test } from "bun:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPassword } from "./password.ts";

async function generate(password: string) {
  const child = Bun.spawn([process.execPath, new URL("./hash-password.ts", import.meta.url).pathname], {
    stdin: new Blob([password]), stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { hash: stdout.trim(), stderr, exitCode };
}

test("password generator accepts passwords shorter than 16 characters", async () => {
  const result = await generate("short\n");
  expect(result.exitCode).toBe(0);
  expect(await verifyPassword("short", result.hash)).toBe(true);
});

test("password generator still rejects empty passwords", async () => {
  const result = await generate("\n");
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("Password cannot be empty");
  expect(result.hash).toBe("");
});

test("password generator retains the maximum password length", async () => {
  const result = await generate("x".repeat(1025));
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("Password too long");
});

test("an escaped .env hash survives Bun loading and config validation", async () => {
  const { hash } = await generate("short");
  const directory = await mkdtemp(join(tmpdir(), "rakitara-hash-"));
  const file = join(directory, ".env");
  try {
    await writeFile(file, `ADMIN_PASSWORD_HASH=${hash.replaceAll("$", "\\$")}\n`);
    const env = { ...process.env };
    delete env.ADMIN_PASSWORD_HASH;
    const code = `import { readConfig } from ${JSON.stringify(new URL("./config.ts", import.meta.url).href)};
      import { verifyPassword } from ${JSON.stringify(new URL("./password.ts", import.meta.url).href)};
      const config = readConfig(process.env);
      console.log(await verifyPassword("short", config.ADMIN_PASSWORD_HASH));`;
    const child = Bun.spawn([process.execPath, "--env-file", file, "-e", code], {
      cwd: directory,
      env: { ...env, NODE_ENV: "test", DATABASE_URL: "postgresql://localhost/test", APP_ORIGIN: "http://localhost:3000", SESSION_SECRET: "test-only-session-secret-for-config", ADMIN_USERNAME: "owner" },
      stdout: "pipe", stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("true");
  } finally {
    await unlink(file);
    await rmdir(directory);
  }
});
