## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/007_create_stocks.js` with the `stocks` table (`id`, `tenant_id`, `branch_id`, `ingredient_id` VARCHAR(24), `quantity`/`unit_cost` NUMERIC(12,4), timestamps) and indexes — verify it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/stockRepository.js` for PG: `toStockObjectId` → `toObjectIdHex`, `createBatch`/`listBatches`/`updateBatchQuantity` with `getPgPool`, dynamic WHERE + `ORDER BY created_at ASC` in `listBatches`, `DELETE` when `quantity <= 0` in `updateBatchQuantity`, and `rowToBatch` mapper with `Number()` on `quantity`/`unitCost` — verify the module imports cleanly
- [x] 2.2 Support `{ session }` in `updateBatchQuantity` using a PG client when provided (`session ?? getPgPool()`) — verify `fifoService.applyBatchUpdates` needs no signature change

## 3. fifoService Transactions

- [x] 3.1 Replace `fifoService.withWriteTransaction` Mongo session logic with a PG transaction (`pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK` + `finally release`), removing `getMongoClient`/`supportsTransactions` — verify `consumeFifo`/`applyBatchUpdates`/`planFifoConsumption`/`computeFifoCost` are unchanged

## 4. Verification

- [ ] 4.1 Run `npm test` — verify all existing tests still pass
- [ ] 4.2 Verify migration 007 applies on startup and the `stocks` table exists — check `schema_migrations` contains `007`
- [x] 4.3 Live verification against the dev DB: `GET /api/dishes` with the reported `tenantId`+`branchId` returns HTTP 200 with per-dish `cost`; `GET /api/inventory/stock` for that tenant/branch works; `adjustStock` (entry → exit) persists in `stocks` and reduces quantity
- [x] 4.4 Cleanup temporary DB rows created during verification