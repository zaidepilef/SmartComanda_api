## Why

`stockRepository.js` aún almacena en MongoDB (colección `stocks`) y, además, `fifoService.js` accede a `getMongoClient()` directamente en `withWriteTransaction`. El servidor arranca solo con PostgreSQL, por lo que cualquier flujo que toque stock —`GET /api/dishes` con `branchId`, inventario (`/api/inventory/*`) y descuento de stock al crear órdenes (`/api/orders`, `/api/public/orders`)— termina en `500 Internal server error` (`TypeError: Cannot read properties of null`). Es la fase siguiente a `pg-dishes` y la pieza que bloquea a `pg-movements` y `pg-orders` (dependencias por orden de proyectos).

## What Changes

- Crear tabla PG `stocks` (migración `007`)
- Reescribir `src/repositories/stockRepository.js` de Mongo a PG con firmas y formas de retorno idénticas (`createBatch`, `listBatches`, `updateBatchQuantity`)
- Migrar `fifoService.withWriteTransaction` de transacción Mongo (`getMongoClient().startSession()`) a transacción nativa PG (`BEGIN`/`COMMIT`/`ROLLBACK` con `pool.connect()`); `consumeFifo`/`applyBatchUpdates`/`planFifoConsumption`/`computeFifoCost` quedan intactos
- `id` y los ids referenciados (`tenant_id`, `branch_id`, `ingredient_id`) como `VARCHAR(24)` hex con `toObjectIdHex`/`generateObjectIdHex` (convención ya establecida)
- Sin cambios en API, servicios de negocio ni validaciones (los consumidores usan el namespace del repo y las firmas actuales)
- Sin importar datos de Mongo (migración limpia, decisión del proyecto — `MIGRATION.md`)

## Capabilities

### New Capabilities

_(ninguna — no hay cambios de comportamiento observable; storage-only)_

### Modified Capabilities

_(ninguna — `skip_specs: true` en `.openspec.yaml`, mismo criterio que `pg-cash-session-totals`, `pg-ingredients` y `pg-dishes`)_

## Impact

- `src/migrations-pg/007_create_stocks.js` — **NUEVO**
- `src/repositories/stockRepository.js` — reescritura completa Mongo → PG
- `src/services/fifoService.js` — solo cambia `withWriteTransaction` (Mongo session → transacción PG); el resto del archivo intacto
- Consumidores intactos (mismas firmas): `dishService.js` (`computeDishCostPerBranch` → `listBatches`), `inventoryService.js` (`listStock`, `adjustStock`, `listMovements` indirecto), `orderService.js` (`tryDeductDishStock`), `fifoService.js` (`updateBatchQuantity`, `listBatches`)
- `movementRepository.js`, `orderRepository.js`, `customerRepository.js`, `loyaltyRepository.js` siguen en Mongo (fases posteriores); esta fase no los desbloquea
- Atiende la convención establecida: `id VARCHAR(24)`, `NUMERIC(12,4)`, `toObjectIdHex`, migraciones auto-run al boot