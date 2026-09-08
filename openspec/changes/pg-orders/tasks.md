## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/009_create_orders.js` (table `orders` + indexes; `items`/`status_history` JSONB) — verify it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/orderRepository.js` for PG: `listOrders` (all filters incl. `status = ANY`, range, `q` ILIKE/number), `findOrderById`, `updateOrderStatus` (append `status_history`), `createOrder`, `updateOrderItems`, `payOrder`, plus new `updateOrderPointsAwarded(orderId)`; `rowToOrder` mapper keeps `foodtruckId`/`clientPhone`/`pointsAwarded` and `Number()` on `total`/`number` — verify import
- [x] 2.2 Update `src/services/loyaltyService.js`: `claimOrder` delegates to `orderRepository.updateOrderPointsAwarded`; remove `mongodb`/`getMongoClient` imports — verify no direct Mongo access remains in the service

## 3. Verification

- [x] 3.1 Run `npm test` — verify all existing tests still pass
- [x] 3.2 Verify migration 009 applies and `orders` exists (schema_migrations has `009`)
- [x] 3.3 Live check: create an order via `/api/orders` and via `/api/public/orders`; `listOrders` with filters (`q`, `branchId`, `status`); update status; `payOrder` — all HTTP 2xx (points path still limited by Mongo customers/loyalty)
- [x] 3.4 Cleanup temporary DB rows created during verification