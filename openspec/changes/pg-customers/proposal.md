## Why

`customerRepository.js` aún almacena en MongoDB (colección `customers`). El flujo del menú público (`POST /api/public/orders`) hace `upsertCustomer` antes de crear la orden, y los endpoints de saldo/customer dependen de `findByTenantAndPhone`. Con el servidor solo en PG, esos steps fallan (`TypeError`). Es la fase 4 de `MIGRATION.md`; su salida desbloquea a `pg-loyalty` (los puntos se registran contra el customer).

## What Changes

- Crear tabla PG `customers` (migración `010`)
- Reescribir `src/repositories/customerRepository.js` de Mongo a PG manteniendo firmas: `findByTenantAndPhone`, `upsertCustomer`, `incrementBalance`
- `points_balance` como `INTEGER` (los puntos son conteos enteros, no montos); `UNIQUE (tenant_id, phone)` reemplaza el filtro de upsert de Mongo; `firstName` se actualiza con `COALESCE(EXCLUDED.first_name, customers.first_name)` en el path upsert
- `toCustomerObjectId`/normalización sin uso externo (los ids llegan hex desde servicios PG) — no se exporta
- Sin cambios en API, servicios ni validaciones (mismas firmas)
- Sin importar datos de Mongo (migración limpia)

## Capabilities

### New Capabilities

_(ninguna — storage-only)_

### Modified Capabilities

_(ninguna — `skip_specs: true` en `.openspec.yaml`)_

## Impact

- `src/migrations-pg/010_create_customers.js` — **NUEVO**
- `src/repositories/customerRepository.js` — reescritura completa Mongo → PG
- Consumidores intactos: `customerService.js` (upsert/getBalance), `publicService.js` (`createPublicOrder`, `getCustomerBalance`), `loyaltyService.js` (`findByTenantAndPhone`, `incrementBalance`)
- `loyaltyRepository.js` sigue en Mongo (fase `pg-loyalty`)