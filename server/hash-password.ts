import { hashPassword } from "./password.ts";

// Read stdin, not argv: passwords must not appear in shell history or process listings.
let password = "";
for await (const chunk of process.stdin) {
  password += chunk;
  if (password.length > 1024) throw new Error("Password too long");
}
password = password.replace(/\r?\n$/, "");
if (!password.length) throw new Error("Password cannot be empty");
console.log(await hashPassword(password));
