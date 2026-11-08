import "dotenv/config";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { createDb } from "./db.ts";

const config = readConfig();
const db = createDb(config.DATABASE_URL);
await db.$connect();
const { app, sessionStore } = createApp(config, db);
const server = app.listen(config.API_PORT, config.API_HOST, () => {
  console.log(`API listening on ${config.API_HOST}:${config.API_PORT}`);
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    try {
      await sessionStore.close();
      await db.$disconnect();
      clearTimeout(deadline);
      process.exit(0);
    } catch { process.exit(1); }
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
