## Why

`orderRepository.js` aún almacena en MongoDB (colección `orders`) y `loyaltyService.claimOrder` accede directo a la colección Mongo `orders`. Todo el ciclo de vida de pedidos (`GET/POST /api/orders`, `/api/orders/:id`, status, pay) y el flujo público (`/api/public/orders`) terminan en `500` (`TypeError`). La fase depende de `pg-dishes`/`pg-ingredients`/`pg-stocks` (precios, recetas y stock ya en PG) y de `pg-movements` (los movimientos `sale` se escriben en PG). Es la fase 3 de `MIGRATION.md`.

## What Changes

- Crear tabla PG `orders` (migración `009`); `items` y `status_history` como `JSONB` (consumo opaco, mismo criterio que `recipe`/`branch_prices` de `dishes`)
- Reescribir `src/repositories/orderRepository.js` de Mongo a PG manteniendo firmas: `listOrders`, `findOrderById`, `updateOrderStatus`, `createOrder`, `updateOrderItems`, `payOrder`
- Agregar `updateOrderPointsAwarded(orderId)` al repo y mover `claimOrder` de `loyaltyService.js` (hoy hace `getMongoClient().db().collection("orders").findOneAndUpdate(...)`) a ese repo, eliminando el acceso directo a Mongo en el servicio
- `number` como `INTEGER`; `total` como `NUMERIC(12,4)`; `points_awarded` como `BOOLEAN`; `toOrderObjectId` pasa a `toObjectIdHex`
- Sin cambios en API, servicios de negocio ni validaciones (mismas firmas y formas de retorno; `foodtruckId` se conserva como campo en el mapeo `rowToOrder`)
- Sin importar datos de Mongo (migración limpia)

## Capabilities

### New Capabilities

_(ninguna — storage-only)_

### Modified Capabilities

_(ninguna — `skip_specs: true` en `.openspec.yaml`)_

## Impact

- `src/migrations-pg/009_create_orders.js` — **NUEVO**
- `src/repositories/orderRepository.js` — reescritura completa Mongo → PG
- `src/services/loyaltyService.js` — `claimOrder` deja de tocar Mongo y usa `orderRepository.updateOrderPointsAwarded`
- Consumidores intactos: `orderService.js`, `publicService.js` (`createPublicOrder`), `loyaltyService.js` (`awardForOrder` → `claimOrder` / `customerRepository`)
- `customerRepository.js` y `loyaltyRepository.js` siguen en Mongo (fases `pg-customers` / `pg-loyalty`); `awardForOrder` seguirá fallando ahí hasta esas fases