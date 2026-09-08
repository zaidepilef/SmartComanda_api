## Why

`loyaltyRepository.js` aún almacena en MongoDB (colección `loyalty-transactions`). `loyaltyService.awardForOrder` persiste transacciones (`createTransaction`) y consulta por `sourceOrderId`; con el servidor solo en PG esos pasos fallan (`TypeError`), por lo que otorgar puntos en una orden paga termina en `500` o en un `catch` silencioso. Es la última fase de `MIGRATION.md` y completa la migración Mongo → PG del runtime.

## What Changes

- Crear tabla PG `loyalty_transactions` (migración `011`), con FKs a `orders`, `customers`, `branches` y `tenant`
- Reescribir `src/repositories/loyaltyRepository.js` de Mongo a PG manteniendo firmas: `createTransaction`, `findBySourceOrderId`; `toObjectId` interno pasa a normalización hex
- `points` como `INTEGER` (conteo de puntos); `type` como `VARCHAR(20)`; `source_order_id`/`customer_id` como `VARCHAR(24)` hex
- El modelo `src/models/loyaltyTransaction.js` deja de usarse en el repo (su `toLoyaltyTransactionDocument` dejaba de ser útil); las constantes de validación (si se usan) se conservan
- Sin cambios en API, servicios ni validaciones (mismas firmas)
- Sin importar datos de Mongo (migración limpia)

## Capabilities

### New Capabilities

_(ninguna — storage-only)_

### Modified Capabilities

_(ninguna — `skip_specs: true` en `.openspec.yaml`)_

## Impact

- `src/migrations-pg/011_create_loyalty_transactions.js` — **NUEVO**
- `src/repositories/loyaltyRepository.js` — reescritura completa Mongo → PG
- `src/models/loyaltyTransaction.js` — `toLoyaltyTransactionDocument` deja de ser consumido por el repo (verificar usos antes de eliminar)
- Consumidor intacto: `loyaltyService.js` (`createTransaction` — ya sin acceso directo a Mongo tras `pg-orders`)
- Con esta fase, `MIGRATION.md` queda: 0 repos Mongo en runtime