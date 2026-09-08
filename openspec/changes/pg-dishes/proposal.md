## Why

`dishRepository.js` aún almacena en MongoDB (`dishes` collection) y el servidor arranca solo con PostgreSQL, por lo que el dominio de platos está roto en runtime. Es la fase siguiente a `pg-ingredients` (los platos referencian ingredientes ya migrados).

## What Changes

- Crear tabla PG `dishes` (migración `005`)
- Reescribir `src/repositories/dishRepository.js` de Mongo a PG con firmas y formas de retorno idénticas
- `recipe` y `branchPrices` pasan a `JSONB`, con `recipe[].ingredientId` y `branchPrices[].branchId` guardados como hex string (los servicios hacen `String(_id)`/`String(ingredientId)`)
- `findDishesByIngredientId` migra a una búsqueda JSONB (needle en `recipe` array)
- Error `23505` → `ConflictError`; `ILIKE` para búsqueda por nombre (mismo patrón que `pg-ingredients`)
- Sin cambios en API, servicios ni validaciones

## Capabilities

### New Capabilities

_(ninguna — no hay cambios de comportamiento observable; storage-only)_

### Modified Capabilities

_(ninguna — `skip_specs: true` en `.openspec.yaml`, mismo criterio que `pg-cash-session-totals` y `pg-ingredients`)_

## Impact

- `src/migrations-pg/005_create_dishes.js` — **NUEVO**
- `src/repositories/dishRepository.js` — reescritura completa Mongo → PG
- Consumidores intactos (usa el namespace del repo, no cambian llamadas): `dishService.js`, `orderService.js` (`findDishesByIds`, `dish.recipe`, `dish.branchPrices`), `publicService.js` (`listDishes`, `findDishesByIds`), `ingredientService.js` (`findDishesByIngredientId`)
- `stockRepository.listBatches` sigue en Mongo (fase `pg-stocks` posterior); no bloquea esta fase
- Atiende la convención establecida: `id VARCHAR(24)`, `NUMERIC(12,4)`, `toObjectIdHex`, migraciones auto-run al boot