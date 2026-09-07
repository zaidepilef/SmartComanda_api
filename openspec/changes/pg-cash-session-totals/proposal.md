## Why

The `cash-sessions` MongoDB collection stores payment totals as a nested object (`{ cash: 0, debit: 0, credit: 0, transfer: 0 }`), incremented via `$inc`. This is part of the broader Mongo→PG migration (Phase 6). The current `PAYMENT_METHODS` constant only supports 4 methods, but the system needs to support `mercadopago`, `points`, and `wallet`. A normalized `cash_session_totals` table solves both problems: it supports unlimited payment methods without schema changes, and translates cleanly to PG's UPSERT pattern.

## What Changes

- Add `cash_session_totals` table with `(session_id, method)` composite PK and `amount NUMERIC(12,4)` — no fixed columns on `cash_sessions`.
- Replace Mongo's `$inc` on `totals.${method}` with PG UPSERT:
  ```sql
  INSERT INTO cash_session_totals (session_id, method, amount)
  VALUES ($1, $2, $3)
  ON CONFLICT (session_id, method)
  DO UPDATE SET amount = cash_session_totals.amount + EXCLUDED.amount;
  ```
- Update `PAYMENT_METHODS` to include all 7 methods: `cash`, `debit`, `credit`, `transfer`, `mercadopago`, `points`, `wallet`.
- Rewrite `cashSessionRepository` to use PG: `createCashSession`, `findOpenByBranch`, `findSessionById`, `closeSession`, `incrementTotals`.
- Rewrite `cashSessionService.closeCashSession` to read totals from the `cash_session_totals` table (via JOIN or separate query) instead of `session.totals` nested object.
- Add a PG migration file `003_create_cash_sessions.js` for the new tables.
- Update `createCashSessionTotals()` in `models/cashSession.js` to initialize rows in `cash_session_totals` on session creation (or remove if totals start at 0 implicitly).

## Capabilities

_Skipped — pure storage-layer migration. API behavior, endpoints, and contracts are unchanged. See `skip_specs: true` in `.openspec.yaml`._

## Impact

- **Repositories**: `cashSessionRepository.js` — full rewrite (Mongo → PG)
- **Services**: `cashSessionService.js` — `closeCashSession` reads totals from new table shape; `openCashSession` initializes totals rows
- **Services**: `orderService.js` — calls `incrementTotals` (signature stays the same, implementation changes underneath)
- **Models**: `cashSession.js` — `createCashSessionTotals()` may become a no-op or return empty array (totals are rows, not embedded doc)
- **Constants**: `utils/paymentMethods.js` — `PAYMENT_METHODS` expanded to 7 methods
- **Migrations**: new `src/migrations-pg/003_create_cash_sessions.js`
- **No API changes**: controllers and routes stay the same
- **No existing tests** for cash sessions — no test updates needed
