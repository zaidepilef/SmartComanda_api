## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/010_create_customers.js` (table `customers` with `UNIQUE (tenant_id, phone)`) — verify it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/customerRepository.js` for PG: `findByTenantAndPhone`, `upsertCustomer` (`INSERT ... ON CONFLICT (tenant_id, phone) DO UPDATE SET first_name = COALESCE(EXCLUDED.first_name, customers.first_name), updated_at = NOW() RETURNING *`), `incrementBalance`; `rowToCustomer` with `pointsBalance: Number` — verify import

## 3. Verification

- [x] 3.1 Run `npm test` — verify all existing tests still pass
- [x] 3.2 Verify migration 010 applies and `customers` exists (schema_migrations has `010`)
- [x] 3.3 Live check: `POST /api/public/orders` upserts/looks up customer; `GET /api/public/customer-balance` (or equivalent) returns `pointsBalance`; repeated order with same phone does not duplicate customer
- [x] 3.4 Cleanup temporary DB rows created during verification