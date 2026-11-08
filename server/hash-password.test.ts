import { expect, test } from "bun:test";
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
