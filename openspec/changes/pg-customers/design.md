## Context

Ver proposal.md — Why. `customerRepository.js` (Mongo `customers`). Three funciones: `findByTenantAndPhone` (busca por `{tenantId, phone}`), `upsertCustomer` (upsert por `{tenantId, phone}`, setOnInsert `pointsBalance:0` y `createdAt`, set `updatedAt`, `firstName` solo si viene), `incrementBalance` (`$inc` pointsBalance). Los ids referenciados ya llegan hex de servicios PG. `pointsBalance` en Mongo es `number`.

## Goals / Non-Goals

**Goals:**
- Tabla `customers` (migración `010`) con unicidad `(tenant_id, phone)`.
- Reescribir las 3 funciones con la misma semántica de upsert/incremento.
- `rowToCustomer` con `pointsBalance: Number(...)`.

**Non-Goals:**
- Historial de puntos por customer (fuera de alcance; `loyalty_transactions` es fase 5).
- Migrar datos.

## Decisions

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS customers (
    id             VARCHAR(24)   PRIMARY KEY,
    tenant_id      VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
    phone          VARCHAR(50)   NOT NULL,
    first_name     VARCHAR(150),
    points_balance INTEGER       NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customers_tenant_phone UNIQUE (tenant_id, phone)
);
```

- `points_balance INTEGER` (puntos son conteos enteros; `computePoints` hace `Math.floor`). `UNIQUE (tenant_id, phone)` materializa el lookup de Mongo y reserva el índice.
- `phone VARCHAR(50)` (número de contacto).

### 2. `upsertCustomer` con `ON CONFLICT`

```sql
INSERT INTO customers (id, tenant_id, phone, first_name, points_balance)
VALUES ($1, $2, $3, $4, 0)
ON CONFLICT (tenant_id, phone)
DO UPDATE SET
  first_name = COALESCE(EXCLUDED.first_name, customers.first_name),
  updated_at = NOW()
RETURNING *
```

- `first_name` se resuelve `customer.firstName ?? null`; semántica igual a Mongo (`firstName` es set y se conserva si no viene). `points_balance` solo en INSERT (setOnInsert).

### 3. `incrementBalance`

`UPDATE customers SET points_balance = points_balance + $2, updated_at = NOW() WHERE id = $1 RETURNING *` — equivalente a `$inc`. Devuelve `null` si no hay fila (toCustomerObjectId inválido → `null`).

### 4. Mapper

`rowToCustomer`: `{ _id, id, tenantId, phone, firstName ?? null, pointsBalance: Number, createdAt, updatedAt }`.

## Risks / Trade-offs

- **[Risk] `points_balance` INTEGER vs NUMERIC** → Puntos son enteros por diseño (`Math.floor`); no se admite decimal. Si un futuro beneficio necesitara decimales, ALTER numérica es trivial. Alternativa descartada por claridad/dro si no hay necesidad.
- **[Risk] `phone` como clave de unicidad compuesta** → Refleja exactamente Mongo (`{tenantId, phone}` en upsert). Mantener igual comportamiento; si un día se requiere multi-cuenta por teléfono, es un cambio de dominіо (no storage).

## Migration Plan

1. `010_create_customers.js`.
2. Reescribir `customerRepository.js`.
3. `npm test` + verificación: upsert público (crea customer), `getCustomerBalance`, incremento de puntos.

Rollback: reescribir repo; migración aditiva.

## Open Questions

Ninguna.