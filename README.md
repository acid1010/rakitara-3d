This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Operations API

Separate Express API: setup, authentication, endpoints, accounting policies and deployment requirements in [server/README.md](server/README.md).
Run `bun run api:dev` alongside the frontend. Next.js forwards `/api/*` to the API process.

## Owner workspace

The frontend includes sign-in, production, materials/purchases, products/stock, sales/payments, printers/maintenance, the cash journal, and electricity settings. Open `/login` after configuring the API owner credentials. The API and frontend must share the same origin (`APP_ORIGIN`, normally `http://localhost:3000` for development).

The interface uses English, IDR and Asia/Jakarta (WIB). Records are voided or deactivated, never deleted. Interrupted writes are not retried automatically: inspect the relevant list before repeating an uncertain action. This release does not provide financial reports or direct printer telemetry.

Checks: `bun run frontend:test`, `bun run api:test`, `bunx next typegen`, `bunx tsc --noEmit`, `bun run lint`, and `bun run build`. Database tests require an explicitly supplied `TEST_DATABASE_URL`; see the API README before using it. Frontend tests cover exact money formatting, form payloads, pagination, API errors and ambiguous writes.

## Production with PM2

`ecosystem.config.js` runs `rakitara-web` with Node.js on `127.0.0.1:3000` and `rakitara-api` with Bun on loopback (`API_PORT` from the environment, default `3001`). Both use production mode and a 12-second stop timeout so the API can finish its 10-second shutdown. Node.js, Bun and PM2 must be available on the deployment user's PATH.

Configure the production environment first: HTTPS `APP_ORIGIN`, owner credentials, session secret, database connection, generated Prisma Client and applied migrations; see [server/README.md](server/README.md). Keep credentials in the server environment or its untracked env files, not the ecosystem config. If the API port changes, set the matching `API_INTERNAL_URL` **before building** because Next.js records the proxy destination during the build.

```sh
bun run build
pm2 start ecosystem.config.js
pm2 save
```

Terminate HTTPS at a reverse proxy pointed at `127.0.0.1:3000`; keep `/api` on that same public origin. Configure `TRUST_PROXY` for the actual proxy addresses. For boot persistence, run `pm2 startup` and follow its platform-specific instructions, then `pm2 save` again. After deploying a new build, restart only these apps with `pm2 restart ecosystem.config.js --update-env`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
