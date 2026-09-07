## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/003_create_cash_sessions.js` with `cash_sessions` and `cash_session_totals` tables — verify with `node -e "import('./src/migrations-pg/003_create_cash_sessions.js')"` that it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/cashSessionRepository.js`: replace all Mongo calls with PG queries (`getPgPool`). Implement `createCashSession`, `findOpenByBranch`, `findSessionById`, `closeSession`, `incrementTotals` — verify each function exports correctly by importing the module
- [x] 2.2 Implement `incrementTotals` with PG UPSERT: `INSERT INTO cash_session_totals ... ON CONFLICT (session_id, method) DO UPDATE SET amount = cash_session_totals.amount + EXCLUDED.amount` — verify SQL syntax by reviewing the query

## 3. Model Updates

- [x] 3.1 Update `src/models/cashSession.js`: deprecate `createCashSessionTotals()` (no longer needed since totals start as empty rows) — verify the function still exists but is unused by the new repository

## 4. Constants Update

- [x] 4.1 Update `src/utils/paymentMethods.js`: expand `PAYMENT_METHODS` to include `mercadopago`, `points`, `wallet` — verify the array contains all 7 methods

## 5. Service Adaptation

- [x] 5.1 Update `src/services/cashSessionService.js`: in `openCashSession`, remove `totals: createCashSessionTotals()` from the create call; in `closeCashSession`, replace `session.totals` read with a separate query to `cash_session_totals` and build the totals object — verify the service logic still produces the same close behavior (closingAmounts, difference computation)

## 6. Verification

- [x] 6.1 Run `npm test` — verify all 3 existing test files pass (fifoService, inventorySchemas, postgres)
- [x] 6.2 Run `npm run dev` — verify server starts without errors and PG migration 003 runs successfully (check console output for "Running PG migration 003")
