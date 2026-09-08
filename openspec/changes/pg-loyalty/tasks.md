## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/011_create_loyalty_transactions.js` (table `loyalty_transactions` with FKs to tenant/branches/customers/orders + indexes) — verify it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/loyaltyRepository.js` for PG: `createTransaction`, `findBySourceOrderId`; `rowToLoyaltyTransaction` with `points: Number` — verify import
- [x] 2.2 Remove `toLoyaltyTransactionDocument` from `src/models/loyaltyTransaction.js` if/only-if it has no remaining consumers (keep `LOYALTY_TRANSACTION_TYPES`)

## 3. Verification

- [x] 3.1 Run `npm test` — verify all existing tests still pass
- [x] 3.2 Verify migration 011 applies and `loyalty_transactions` exists (schema_migrations has `011`)
- [x] 3.3 Live check: create a QR paid order for a tenant with loyalty rule → `loyalty_transactions` row created and `customers.points_balance` incremented via HTTP; confirm no Mongo access remains in src runtime paths
- [x] 3.4 Cleanup temporary DB rows created during verification