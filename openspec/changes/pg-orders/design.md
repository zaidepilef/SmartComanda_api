## Context

Ver proposal.md — Why. `orderRepository.js` (Mongo `orders`) y `loyaltyService.claimOrder` (acceso directo a la colección Mongo `orders`). Los ordenes tienen un shape simple pero con dos campos opacos (`items`, `status_history`) y filtros de listado variados: por tenant (siempre), branch (`foodtruckId`), `status` (array), `orderType`, `paymentStatus`, `paymentMethod`, rango `createdAt`, y búsqueda `q` (clientContact regex OR number). Orden `createdAt DESC` con `offset`/`limit`. El checkout usa `total`, `paymentStatus`, `foodtruckId`, `number`, `orderType`, `clientPhone` (loyalty).

Fase intermedia: `customerRepository`/`loyaltyRepository` siguen en Mongo (no este cambio). `claimOrder` necesita abandonar Mongo ahora porque `loyaltyService.awardForOrder` se invoca en `payOrder` y `createOrder`; hasta `pg-orders`, `claimOrder` tira error.

## Goals / Non-Goals

**Goals:**
- Tabla `orders` (migración `009`) + reescritura del repo con firmas idénticas.
- `items` y `status_history` como `JSONB`; `number` como `INTEGER`; `total` `NUMERIC(12,4)`; `points_awarded` `BOOLEAN`.
- Mover `claimOrder` de `loyaltyService.js` a `orderRepository.updateOrderPointsAwarded(orderId)`.
- Listado con todos los filtros actuales y orden/limit/offset idénticos.

**Non-Goals:**
- Paginación nueva ni `cursor` (misma que Mongo: `skip/limit`).
- Busqueda full-text (la actual: ILIKE sobre `client_contact` + igualdad de `number`).
- Migrar datos.

## Decisions

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS orders (
    id              VARCHAR(24)   PRIMARY KEY,
    tenant_id       VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
    foodtruck_id    VARCHAR(24)   REFERENCES branches(id) ON DELETE CASCADE,
    number          INTEGER       NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'new',
    order_type      VARCHAR(20)   NOT NULL DEFAULT 'takeaway',
    payment_status  VARCHAR(20)   NOT NULL DEFAULT 'pending',
    payment_method  VARCHAR(30),
    client_contact  VARCHAR(255),
    client_phone    VARCHAR(50),
    points_awarded  BOOLEAN       NOT NULL DEFAULT FALSE,
    items           JSONB         NOT NULL,
    status_history  JSONB         NOT NULL DEFAULT '[]'::jsonb,
    total           NUMERIC(12,4) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant         ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_foodtruck      ON orders(foodtruck_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_type     ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created        ON orders(created_at DESC);
```

- Columnas en snake_case; `foodtruck_id` conserva el nombre de dominio de Mongo (no renombrar a `branch_id`) para no tocar consumidores.
- `payment_method` `VARCHAR(30)` (cash/debit/credit/transfer) o null.

### 2. Mapper `rowToOrder`

```js
{
  _id, id, tenantId, foodtruckId: row.foodtruck_id,
  number: Number(row.number), status, orderType: row.order_type,
  paymentStatus: row.payment_status, paymentMethod: row.payment_method ?? null,
  clientContact: row.client_contact ?? null, clientPhone: row.client_phone ?? null,
  pointsAwarded: row.points_awarded, items: row.items,
  statusHistory: row.status_history, total: Number(row.total),
  createdAt: row.created_at, updatedAt: row.updated_at,
}
```

### 3. Serialización de JSONB

- `items`: los entries ya llevan `dishId` como hex (los dishes vienen de PG); se insertan con `JSON.stringify` tal cual. `stockApplied` se actualiza luego con `updateOrderItems`.
- `status_history`: entries `{ status, at: ISO, by: hex }`. En `createOrder`, `by: branch._id` (hex). En `updateOrderStatus`, `by: actorId` (hex) — se elimina la normalización `toOrderObjectId(actorId) ?? actorId` de Mongo.

### 4. Queries (semántica 1:1 con Mongo)

- `listOrders`: `WHERE` dinámica. `status` array → `status = ANY($n::varchar[])`; `foodtruck_id` para `branchId`; rango `created_at >= from AND <= to`; `q` → `(client_contact ILIKE $n OR number = $n)` solo cuando `Number(q)` es entero (misma lógica que Mongo). Orden `created_at DESC`, `LIMIT`/`OFFSET`.
- `findOrderById(orderId, tenantId?)`: `WHERE id = $1 [AND tenant_id = $2]`, devuelve `null` si no existe.
- `updateOrderStatus(orderId, status, actorId)`: `SET status, updated_at, status_history = status_history || $3::jsonb` con `$3` = array de un entry, `RETURNING *`; sin filas → null (el servicio ya valida transición antes).
- `payOrder(orderId, paymentMethod)`: `UPDATE ... SET payment_status='paid', payment_method, updated_at WHERE id=$1 AND payment_status='pending' RETURNING *`.
- `updateOrderPointsAwarded(orderId)`: `UPDATE ... SET points_awarded=TRUE, updated_at WHERE id=$1 AND points_awarded IS NOT TRUE RETURNING *` — reemplaza el `findOneAndUpdate({_id, pointsAwarded:{$ne:true}}, {$set:{pointsAwarded:true}})` de `loyaltyService.claimOrder`; devuelve orden o `null`.

### 5. `loyaltyService.claimOrder`

```js
async function claimOrder(orderId) {
  return orderRepository.updateOrderPointsAwarded(orderId);
}
```
Se eliminan imports de `mongodb` y `getMongoClient` en `loyaltyService.js` (quedan `customerRepository` y `loyaltyRepository` importados, ambos Mongo por ahora: fases posteriores).

## Risks / Trade-offs

- **[Risk] `status` con array vacío** → El query schema agrega al menos un valor; `= ANY` con array vacío devuelve cero filas, equivalente a Mongo `$in: []` (sin filtro? No: Mongo `{status: {$in: []}}` no matchea nada, igual que SQL). No cambia.
- **[Risk] Fechas dentro de JSONB quedan como ISO strings** → `status_history` es opaco para los clientes; `Date` no es un tipo JSON. Aceptado (los strings ISO son univocos).
- **[Risk] `q` numérica**: `number` entero → condicion `number = $n`. `Number("1e3")` es entero pero raro en input; Mongo tenía el mismo comportamiento (`Number.isInteger(number)`). Equivalente.
- **[Risk] `loyaltyService` sigue dependiendo de repos Mongo** → Esta fase solo elimina el acceso directo a `orders` de Mongo; `customerRepository`/`loyaltyRepository` siguen Mongo hasta `pg-customers`/`pg-loyalty`. Se documenta que `awardForOrder` no estará funcional hasta esas fases.

## Migration Plan

1. `009_create_orders.js` — tabla + índices.
2. Reescribir `orderRepository.js`; agregar `updateOrderPointsAwarded`.
3. Ajustar `loyaltyService.js` (`claimOrder` → repo; quitar imports Mongo).
4. `npm test` + verificación en BD dev (HTTP: crear orden, listar filtros q/branch/status, pay → puntos).

Rollback: reescribir repo + servicio; migración aditiva.

## Open Questions

Ninguna.