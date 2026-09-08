## Why

`movementRepository.js` aún almacena en MongoDB (colección `inventory-movements`). El servidor arranca solo con PG, por lo que `createMovement`/`listMovements` lanzan `TypeError` (`getMongoClient()` retorna null). Afecta `POST /api/inventory/stock/adjustments` (entradas y salidas: el movimiento se escribe después del stock en PG) y la creación de órdenes con descuento de stock (`sale`). Es la fase inmediata siguiente a `pg-stocks` según `MIGRATION.md` y la que desbloquea el cierre funcional de `pg-orders`.

## What Changes

- Crear tabla PG `inventory_movements` (migración `008`)
- Reescribir `src/repositories/movementRepository.js` de Mongo a PG con firmas idénticas (`createMovement`, `listMovements`); `toMovementObjectId` pasa a `toObjectIdHex`
- `batches` (desglose FIFO opaco, array de `{batchId, quantity, unitCost}`) se almacena como `JSONB`, normalizando `batchId` a hex
- `id` y referencias (`tenant_id`, `ingredient_id`, `branch_id`, `batch_id`, `order_id`, `created_by`) como `VARCHAR(24)` hex; `quantity`/`unit_cost` como `NUMERIC(12,4)`
- Sin cambios en API, servicios ni validaciones (los consumidores usan el namespace del repo y firmas actuales)
- Sin importar datos de Mongo (migración limpia — `MIGRATION.md`)

## Capabilities

### New Capabilities

_(ninguna — storage-only)_

### Modified Capabilities

_(ninguna — `skip_specs: true` en `.openspec.yaml`)_

## Impact

- `src/migrations-pg/008_create_inventory_movements.js` — **NUEVO**
- `src/repositories/movementRepository.js` — reescritura completa Mongo → PG
- Consumidores intactos: `inventoryService.js` (`adjustStock` entry/exit, `listMovements`), `orderService.js` (`tryDeductDishStock` → movimientos `sale`)
- Con esta fase, `/api/inventory/*` queda 100% en PG