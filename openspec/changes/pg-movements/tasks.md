## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/008_create_inventory_movements.js` (table `inventory_movements` + indexes) — verify it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/movementRepository.js` for PG: `createMovement`/`listMovements` with `getPgPool`, `toMovementObjectId` → `toObjectIdHex`, `batches` serialized as JSONB with hex `batchId`, `rowToMovement` with `Number()` on `quantity`/`unitCost` — verify menu imports cleanly

## 3. Verification

- [x] 3.1 Run `npm test` — verify all existing tests still pass
- [x] 3.2 Verify migration 008 applies and `inventory_movements` exists (schema_migrations has `008`)
- [x] 3.3 Live check: `POST /api/inventory/stock/adjustments` entry and exit now return 201/200 (no more 500 at movement write); `GET /api/inventory/movements` works; stocks reduced correctly
- [x] 3.4 Cleanup temporary DB rows created during verification