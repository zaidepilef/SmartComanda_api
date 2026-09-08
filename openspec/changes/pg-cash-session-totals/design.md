## Context

`cashSessionRepository.js` currently stores payment totals as a MongoDB nested object `{ cash: 0, debit: 0, credit: 0, transfer: 0 }` on each session document. Increments use `$inc` on `totals.${method}`. The server boots with PG only (`server.js` connects Postgres, no Mongo), so this repository is broken at runtime. This change rewrites it for PG as part of the domain-by-domain Mongo→PG migration.

Current callers:
- `orderService.js` — calls `incrementTotals(branchId, tenantId, method, total)` in 2 places (on order creation with paymentMethod, and on payOrder)
- `cashSessionService.js` — `openCashSession` creates session with `createCashSessionTotals()`; `closeCashSession` reads `session.totals` to compute closing differences

## Goals / Non-Goals

**Goals:**
- Replace Mongo `$inc` with PG UPSERT on `cash_session_totals` table
- Support 7 payment methods: `cash`, `debit`, `credit`, `transfer`, `mercadopago`, `points`, `wallet`
- Allow adding new payment methods without schema changes
- Preserve exact functional behavior: same API, same service logic, same response shapes

**Non-Goals:**
- Migrating other Mongo collections (separate phases)
- Changing API contracts or controller logic
- Adding tests (none exist for this domain currently)

## Decisions

### 1. Separate `cash_session_totals` table over fixed columns

**Chosen:** `cash_session_totals(session_id, method, amount)` with composite PK.

**Alternative:** 4 fixed columns (`total_cash`, `total_debit`, `total_credit`, `total_transfer`) on `cash_sessions`.

**Rationale:** User explicitly chose Option B. The system now supports 7 methods (was 4) and may grow further. A separate table handles this naturally. The UPSERT pattern is clean and matches the Mongo `$inc` semantics 1:1.

### 2. UPSERT for incrementTotals

```sql
INSERT INTO cash_session_totals (session_id, method, amount)
VALUES ($1, $2, $3)
ON CONFLICT (session_id, method)
DO UPDATE SET amount = cash_session_totals.amount + EXCLUDED.amount;
```

Returns the updated row via `RETURNING *`. This is atomic and equivalent to Mongo's `findOneAndUpdate` with `$inc`.

### 3. Totals initialization on session creation

**Chosen:** Do NOT pre-insert rows for each method. Start with zero rows. `closeCashSession` reads existing rows and falls back to 0 for missing methods.

**Rationale:** Pre-inserting 7 rows per session is wasteful (most sessions use 1-2 methods). The close logic already iterates `PAYMENT_METHODS` and defaults to 0, so missing rows are handled naturally.

### 4. Reading totals for closeCashSession

Replace `session.totals ?? createCashSessionTotals()` with a separate query:

```sql
SELECT method, amount FROM cash_session_totals WHERE session_id = $1
```

Build a `{ cash: 0, debit: 0, ... }` object from the rows (defaulting missing methods to 0). This keeps the close logic identical to current behavior.

### 5. Session object shape returned by repositories

**Current Mongo shape:**
```js
{ _id, tenantId, branchId, openedBy, status, totals: { cash: 0, ... }, orderCount, ... }
```

**PG shape from repository:**
```js
{ id, tenantId, branchId, openedBy, status, orderCount, ... }
```

`totals` is NOT embedded. Callers that need totals (only `closeCashSession`) fetch them separately. `findOpenByBranch` and `findSessionById` do NOT join totals — they return the session without totals. This avoids N+1 and keeps reads minimal.

### 6. PAYMENT_METHODS expansion

```js
// Before
export const PAYMENT_METHODS = Object.freeze(["cash", "debit", "credit", "transfer"]);

// After
export const PAYMENT_METHODS = Object.freeze([
  "cash", "debit", "credit", "transfer",
  "mercadopago", "points", "wallet",
]);
```

`cashSessionService.closeCashSession` already iterates `PAYMENT_METHODS` and defaults to 0, so it automatically supports the new methods without logic changes.

### 7. ID generation pattern

Follow the existing PG pattern: `generateObjectIdHex()` from `utils/id.js` for new session IDs. The `cash_sessions.id` is `VARCHAR(24)` matching the existing convention.

## Risks / Trade-offs

- **[Risk] `closeCashSession` relies on PAYMENT_METHODS iteration** → If a new method is added later and an old session has a total for it, the close diff computation still works (it iterates PAYMENT_METHODS, not the stored totals). No risk.
- **[Trade-off] Extra query on close** → `closeCashSession` now does a SELECT for totals before closing. This is negligible (single PK lookup) and only happens on close, not per-order.
- **[Trade-off] No pre-initialized rows** → If a caller reads totals for a session that has no orders yet, it gets an empty object `{}`. All callers already default missing methods to 0, so this is safe.

## Files Modified

| File | Change |
|------|--------|
| `src/migrations-pg/003_create_cash_sessions.js` | **NEW** — creates `cash_sessions` and `cash_session_totals` tables |
| `src/repositories/cashSessionRepository.js` | Full rewrite: Mongo → PG |
| `src/services/cashSessionService.js` | Minor: `closeCashSession` reads totals from new table shape; `openCashSession` no longer passes `totals` |
| `src/models/cashSession.js` | `createCashSessionTotals()` deprecated/removed (no longer needed) |
| `src/utils/paymentMethods.js` | `PAYMENT_METHODS` expanded to 7 methods |

## Migration Plan

1. Create PG migration `003_create_cash_sessions.js` — runs automatically on startup via `runPgMigrations`
2. Rewrite `cashSessionRepository.js` — swap Mongo for PG queries
3. Update `cashSessionService.js` — adapt close logic to new totals shape
4. Update `PAYMENT_METHODS` — add 3 new methods
5. Run `npm test` to verify existing tests pass (fifoService, inventorySchemas, postgres)
6. Manual smoke test: open session → create order with payment → close session → verify totals

Rollback: Revert code changes. Migration is additive (new tables), safe to leave in place.
