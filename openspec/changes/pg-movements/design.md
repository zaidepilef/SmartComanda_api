## Context

Ver proposal.md — Why. `movementRepository.js` usa Mongo (`inventory-movements`). Los movimientos son un registro histórico (append-only): se crean desde `inventoryService.adjustStock` (entry/exit) y `orderService.tryDeductDishStock` (`sale`), y se leen agregados/filtrados en `listMovements` (sin paginación hoy, `ORDER BY createdAt DESC`). El consumidor clave del shape devuelto es el cliente HTTP (`listMovements` y `adjustStock`), no lógica de negocio.

Forma real de un documento Mongo (verificado): `{ _id, tenantId, ingredientId, branchId?, quantity, type, reason, createdBy?, createdAt, unitCost?, batchId?, batches?, orderId? }`. `batches` es el desglose FIFO opaco `[{ batchId, quantity, unitCost }]`.

## Goals / Non-Goals

**Goals:**
- Tabla PG `inventory_movements` (migración `008`) con columnas `MOVEMENTS` y `batches` como `JSONB`.
- `createMovement`/`listMovements` con firmas y formas de retorno equivalentes; `toMovementObjectId` → `toObjectIdHex`.
- Desbloquear `/api/inventory/*` completo.

**Non-Goals:**
- Paginación de movimientos (no existe hoy; la agrega una futura feature).
- LÓGICA agregada por ingrediente/branch en SQL (el servicio sólo agrupa o filtra en memoria/query simple hoy).
- Migrar datos de Mongo.

## Decisions

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS inventory_movements (
    id            VARCHAR(24)   PRIMARY KEY,
    tenant_id     VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
    ingredient_id VARCHAR(24)   REFERENCES ingredients(id) ON DELETE CASCADE,
    branch_id     VARCHAR(24)   REFERENCES branches(id) ON DELETE CASCADE,
    quantity      NUMERIC(12,4) NOT NULL,
    type          VARCHAR(30)   NOT NULL,
    reason        TEXT,
    unit_cost     NUMERIC(12,4),
    batch_id      VARCHAR(24)   REFERENCES stocks(id) ON DELETE SET NULL,
    batches       JSONB,
    order_id      VARCHAR(24),
    created_by    VARCHAR(24),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movements_tenant_ingredient ON inventory_movements(tenant_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_movements_tenant_branch     ON inventory_movements(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_movements_created           ON inventory_movements(created_at);
```

- `quantity`/`unit_cost` `NUMERIC(12,4)` por convención; `type` `VARCHAR(30)` (entry/exit/sale/otros).
- `batches` JSONB normalizando cada `batchId` a hex antes de insertar (criterio opaco, como `recipe` de dishes). `batch_id` (movimiento entry) es FK a `stocks` con `ON DELETE SET NULL` — permite borrar batches sin perder el historial.
- `order_id` NO referencia a `orders` aquí porque `orders` aún no existe (migración `009` posterior); queda `VARCHAR(24)` + índice por tenant en el mismo lookup. SQL no exige FK.

### 2. Mapper

`rowToMovement(row)` devuelve `{ _id, id, tenantId, ingredientId, branchId ?? null, quantity: Number, type, reason ?? null, createdBy ?? null, createdAt, unitCost ?? null, batchId ?? null, batches ?? null, orderId ?? null }` — `Number()` en `quantity`/`unitCost` (los drivers devuelven string para `NUMERIC`), tal como `rowToBatch`/`rowToDish`.

### 3. Serialización entrada → fila

`createMovement(movement)` normaliza a hex `toHex()` (devuelve `value != null ? String(value) : null`); `batchId`/`orderId`/`branchId`/`createdBy`/`ingredientId`/`tenantId` y los `batchId` de `batches`. `batches` sólo se serializa si se recibe (JSON.stringify con entries `{ batchId, quantity, unitCost }`). El resto sigue el shape real de Mongo.

### 4. listMovements

`WHERE` dinámica con `tenant_id`/`ingredient_id`/`branch_id` cuando llegan (sin normalizar a hex porque los ids ya vienen hex de los servicios PG; `findIngredientsByIds` etc. devuelven hex). `ORDER BY created_at DESC`. Sin `limit`/`offset` (hoy Mongo no pagina).

## Risks / Trade-offs

- **[Risk] Shape de `batches`/ids cambia de ObjectId a hex string en respuestas HTTP** → Los clientes admin/pos ya consumen hex en precios de platos (patrón `branchPrices`) y los `String(...)` siguen funcionando. Migración aceptable y ya acordada en fases anteriores.
- **[Risk] `order_id` sin FK** → `order_id` se valida implícitamente por el flujo (`tryDeductDishStock` recibe `order._id` real). Historico no pierde integridad por diseño; si se quiere estricto, ALTER en `009`.
- **[Risk] `batches` JSONB sin validación de schema** → Igual criterio de opacidad de `recipe`. Patrón ya establecido.

## Migration Plan

1. `008_create_inventory_movements.js` — tabla + índices (auto-run al boot).
2. Reescribir `movementRepository.js` (queries PG, `rowToMovement`, serialización hex, `toMovementObjectId` → `toObjectIdHex`; verificar que `toObjectIdHex` exista en `utils/id.js`).
3. `npm test` + verificación en BD dev: ciclos entry/exit por HTTP (ajustes de inventario) y lectura de movimientos.

Rollback: reescribir el repo; la migración es aditiva.

## Open Questions

Ninguna.