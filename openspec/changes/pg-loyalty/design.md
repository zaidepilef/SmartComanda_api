## Context

Ver proposal.md — Why. `loyaltyRepository.js` (Mongo `loyalty-transactions`). Solo dos funciones: `createTransaction` (insert con ObjectIds) y `findBySourceOrderId`. `LOYALTY_TRANSACTION_TYPES = ["earn"]` define el único `type`. `awardForOrder` (loyaltyService) llama `createTransaction` para registrar puntos ganados; `findBySourceOrderId` no tiene consumidores hoy. La tabla solo acumula historial (append-only).

## Goals / Non-Goals

**Goals:**
- Tabla `loyalty_transactions` (migración `011`) con FKs a tenant/branch/customer/order.
- Reescribir `createTransaction`/`findBySourceOrderId`.
- Verificar si `toLoyaltyTransactionDocument`/`LOYALTY_TRANSACTION_TYPES` de `models/loyaltyTransaction.js` quedan en uso; eliminar solo lo no utilizado.

**Non-Goals:**
- Lógica de negocio de puntos (se mantiene en `loyaltyService`).
- Migrar datos.

## Decisions

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id              VARCHAR(24)  PRIMARY KEY,
    tenant_id       VARCHAR(24)  REFERENCES tenant(id) ON DELETE CASCADE,
    branch_id       VARCHAR(24)  REFERENCES branches(id) ON DELETE CASCADE,
    customer_id     VARCHAR(24)  REFERENCES customers(id) ON DELETE CASCADE,
    source_order_id VARCHAR(24)  REFERENCES orders(id) ON DELETE CASCADE,
    type            VARCHAR(20)  NOT NULL,
    points          INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_order    ON loyalty_transactions(source_order_id);
```

- Corre después de `009` (orders) y `010` (customers): FKs resolubles.
- `points INTEGER` (conteo); `type VARCHAR(20)` (hoy solo `earn`).

### 2. Queries

- `createTransaction(transaction)`: `INSERT (id, tenant_id, branch_id, customer_id, source_order_id, type, points) VALUES (...)` con `id = generateObjectIdHex()`; retorna `rowToLoyaltyTransaction(rows[0])`. Los ids ya llegan hex de `loyaltyService` (`tenantId`, `branchId`, `customerId`, `sourceOrderId` desde `order._id`) — sin normalización extra.
- `findBySourceOrderId(sourceOrderId)`: `SELECT ... WHERE source_order_id = $1` (tolera ids no hex con `toObjectIdHex`).

### 3. Mapper

`rowToLoyaltyTransaction`: `{ _id, id, tenantId, branchId, customerId, sourceOrderId, type, points: Number, createdAt }`.

### 4. Modelo `loyaltyTransaction.js`

`LOYALTY_TRANSACTION_TYPES` se conserva (API de constante del dominio). `toLoyaltyTransactionDocument(left)` se elimina si no queda otro consumidor (grep previo: solo `loyaltyRepository`).

## Risks / Trade-offs

- **[Risk] FK `source_order_id` hace el insert fallar si la orden no existe** → Siempre se pasa `order._id` real desde `awardForOrder`. Si en el futuro se audita, es la protección deseada (integridad referencial).
- **[Risk] `points` INTEGER** → Igual que `customers.points_balance`; enteros por diseño.

## Migration Plan

1. `011_create_loyalty_transactions.js`.
2. Reescribir `loyaltyRepository.js`; ajustar/eliminar modelo no usado.
3. `npm test` + verificación: orden QR paga → puntos en `loyalty_transactions` mientras el tenant tenga rule; `findBySourceOrderId` responde la transacción.

Rollback: reescribir repo; migración aditiva.

## Open Questions

Ninguna.