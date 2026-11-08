# Operations API

Express 5 + Prisma 7, separate Bun process. Next.js proxies `/api/*` to `API_INTERNAL_URL` (default `http://127.0.0.1:3001`). No frontend login screen is included.

## Setup

1. Install with `bun install`. Copy **missing values** from `.env.example` into your existing `.env`; do not overwrite your database credentials.
2. Generate a password hash without exposing the password in shell history (zsh):

   ```zsh
   read -rs 'password?Owner password: '
   print -rn -- "$password" | bun run api:hash-password
   unset password
   ```

   Save the resulting `scrypt$...` value as `ADMIN_PASSWORD_HASH`. Generate `SESSION_SECRET` with `openssl rand -hex 32`. Keep secrets out of git and all `NEXT_PUBLIC_*` variables.
3. Review migrations before applying:
   - **Empty database:** `bun run db:deploy`.
   - **Existing database:** back up first. Compare the database against `202611080001_initial`; baseline that migration **only if the original tables match** using `bunx prisma migrate resolve --applied 202611080001_initial`. Then deploy the safety migration. Do not mark the second migration applied: it adds session tables, maintenance void fields, checks, indexes and triggers. Existing invalid rows will cause migration failure; fix deliberately, never reset production.
4. `bun run db:generate`, then `bun run api:dev` and `bun run dev` in separate terminals. Set `price_per_kwh` through the API before completing a job.

Production: `NODE_ENV=production bun run api:start`. Requires HTTPS `APP_ORIGIN`, PostgreSQL connectivity, migrations and generated Prisma Client. Serve frontend and `/api` under the **same origin**. TLS terminates at your reverse proxy; configure `TRUST_PROXY` to its actual IPs/subnets so Express recognizes HTTPS. Firewall the backend port; a trusted proxy must replace forwarded headers. Leave database TLS certificate verification enabled. Use a restricted runtime database role without schema ownership, DDL or TRUNCATE privileges; migrations use a separate role.

Sessions live in PostgreSQL, expire after eight hours, and use HttpOnly, SameSite=Strict cookies (Secure and `__Host-` prefix in production). Login rotates session IDs. Logout deletes its session. Changing username/password hash invalidates existing sessions. There is no registration, password reset, MFA or roles.

Every write requires `Origin: APP_ORIGIN` and `Content-Type: application/json`, including login/logout. No cross-origin CORS access. SameSite cookies plus strict origin verification protect against CSRF. Successful login attempts count toward a shared **20 attempts / 15 minutes** database limit; per-process IP limit is 10 / 15 minutes. An attacker can temporarily lock out the single owner; add edge throttling/MFA before higher-risk exposure. General process-local limit: 300 requests/minute/IP. Edge limits are needed for multiple replicas.

## HTTP contract

- Prefix `/api`; all routes except `/health` and `/auth/login` require owner session.
- Money in request/response: decimal **strings**, no exponents. Inputs allow 12 integer digits, 2 decimal places. Computed unit costs retain up to 4 decimal places; trailing zeros are not guaranteed. Grams/counts: integers.
- Timestamps returned as UTC ISO strings. Operational dates are server-generated; manual transactions accept optional ISO `occurredAt` with timezone. Jobs start/finish now; no backdated production in v1.
- Lists accept `limit` (1–100, default 50), `offset` (0–100000). Voided/inactive records remain visible. `/products` includes computed `onHand`. `/stock-movements` also accepts `productId`.
- `/jobs` also accepts `status` (`PRINTING`, `DONE`) and `voided` (`include`, `exclude`, `only`; default `include`). `/sales` accepts `payment` (`paid`, `unpaid`) and the same `voided` filter. `GET /jobs/:id` and `GET /sales/:id` retrieve a record for completion/payment forms.
- Errors: `{ "error": "message", "details": [...] }` (details only for validation). HTTP 400 invalid input, 401 unauthenticated, 403 origin failure, 404 missing row, 409 invalid state/conflict, 413 oversized body, 415 non-JSON write, 429 throttled, 500 unexpected failure.
- Writes are not generally idempotent: do not blindly retry purchases, new jobs, sales, adjustments or manual transactions after an ambiguous network failure. Check the list first. Finish/pay/void reject repeats. Serializable transactions retry database conflicts internally; no external effects occur in those callbacks.

| Method | Path | Input |
|---|---|---|
| GET | `/health` | Liveness only, not database readiness |
| POST | `/auth/login` | `username`, `password`; returns session cookie |
| GET | `/auth/me` | Current username |
| POST | `/auth/logout` | `{}` |
| GET, POST | `/printers` | POST: `name`, `purchaseCost`, `lifespanHours`, `avgWatts`; optional `model`, `purchasedAt` (YYYY-MM-DD) |
| PATCH | `/printers/:id` | Partial printer fields, `isActive`; blocked during a running job |
| GET, POST | `/materials` | POST: `name`, `color`; optional `lowStockGrams` |
| PATCH | `/materials/:id` | Partial material fields, `isActive`; no balance/cost writes |
| GET, POST | `/products` | POST: `name`, `materialId`, `estGrams`, `estPrintMinutes`, `listPrice`; optional `isCustom` |
| PATCH | `/products/:id` | Partial product fields except `materialId`; optional `isActive` |
| GET, POST | `/purchases` | POST: `materialId`, `grams`, `totalCost`; optional `supplier` |
| GET, POST | `/jobs` | POST: `productId`, `printerId`, `qtyPlanned`; optional `note` |
| POST | `/jobs/:id/finish` | `qtyGood`, `qtyFailed`, `gramsUsed`; `failureReason` iff failures; optional `note` |
| GET, POST | `/sales` | POST: `productId`, `qty`, `unitPrice`; optional `customerName`, `customerPhone`, `paymentMethod` (immediate payment) |
| POST | `/sales/:id/pay` | `paymentMethod`: TRANSFER, QRIS or CASH; full payment only |
| GET, POST | `/adjustments` | POST: exactly one `productId`/`materialId`, nonzero `qtyDelta`, `reason`; optional `note` |
| GET, POST | `/maintenance` | POST: `printerId`, `type`; optional positive `cost`, `notes` |
| GET, POST | `/transactions` | POST MANUAL only: `kind`, positive `amount`; optional `category`, `note`, `occurredAt` |
| POST | `/{purchases,jobs,sales,adjustments,maintenance,transactions}/:id/void` | `reason`; transaction void only for MANUAL rows |
| GET | `/stock-movements` | Read-only append-only ledger |
| GET | `/settings` | Settings list |
| PUT | `/settings/price_per_kwh` | `value`: nonnegative decimal string |

No DELETE endpoints. PATCH master data only; historical costs remain snapshots. Product material is immutable: create another SKU instead. One running job per printer. Material is consumed on completion, not reserved at start; concurrent jobs may start but cannot complete without sufficient stock. Deactivating a material/product with a running job is blocked.

## Costing / accounting policy

- Material purchase updates pooled weighted-average cost; cash OUT, no immediate P&L expense. Purchases are assumed paid.
- HPP: actual grams × current material average + elapsed hours × printer purchaseCost/lifespanHours + elapsed hours × avgWatts/1000 × price_per_kwh. Cost components and unit cost round half-up to 4 decimal places; journal amounts to 2. Printer settings cannot change during running jobs; electricity rate/material average are taken at completion.
- `qtyGood + qtyFailed` must equal `qtyPlanned`. Mixed failures are absorbed into good units; a fully failed job has null unitCost, no production stock, non-cash WASTE expense. Costs below half a cent produce no journal row.
- Production updates finished-product weighted average. Sale snapshots `unitCogs` and deducts units immediately, paid or unpaid. Empty product stock resets average to zero.
- Sales revenue/COGS belong to the **Sale** record at `soldAt`, not cash journal P&L. SALE_PAYMENT affects cash only; prevents double-counting revenue when paid. Reporting must combine sales revenue − COGS with non-void P&L journal entries; no reports implemented yet.
- EQUIPMENT_PURCHASE and owner capital/draw affect cash, not immediate P&L. Machine depreciation is allocated through production HPP. **ELECTRICITY_BILL affects cash only**, because energy is allocated through HPP; treating the full bill as another expense would double-count. This simplified model does not reconcile idle power, utility variance or unallocated depreciation. OPEX/maintenance affect cash and P&L. Recording a printer does not silently create an equipment purchase: record its cash payment separately when applicable.
- Adjustments use current average cost, affect inventory and non-cash P&L. Only MISCOUNT permits increases. Positive adjustments require positive on-hand, valued stock; opening stock must enter via purchases/production. Other reasons only remove stock.
- Voids correct erroneous entries, **not physical returns/refunds**. Reason required; source and linked AUTO journal are voided atomically; stock reversal is a new row. Paid sales cannot be voided without a refund workflow. An unpaid sale or adjustment can reverse only its latest product movement. Production voids require no later material/product activity and no earlier mixed product stock. Purchase voids require no later material activity and no earlier mixed stock. Historical revaluation is deliberately unsupported. Use compensating adjustments for physical stock changes, not falsified voids.
- Database checks cover bounds, lifecycle fields, source links, payment fields, void reasons; unique indexes prevent duplicate movements/running printers. Triggers reject business DELETEs and StockMovement UPDATEs. Cross-record valuation/balance invariants remain service-owned: do not write business tables directly. Authentication sessions are infrastructure and may be deleted/pruned.

## Checks

```sh
bun run db:generate
bunx tsc --noEmit
bun run lint
bun run api:test
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/rakitara_test bun run api:test
```

Without `TEST_DATABASE_URL`, database tests are explicitly skipped. With it, tests create a random isolated schema, apply both migrations there, run HTTP/auth and real transactional/concurrency checks, then drop only that schema. Test role needs CREATE SCHEMA. Never use production credentials for tests. The current Prisma 7/pg 8 combination can emit a pg concurrent-query deprecation warning from Prisma internals; do not upgrade pg to 9 without adapter compatibility checks.
