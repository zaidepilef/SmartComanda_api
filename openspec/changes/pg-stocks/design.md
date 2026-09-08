## Context

Ver proposal.md — Why. `stockRepository.js` usa MongoDB (`stocks`) con `ObjectId` para `tenantId`/`branchId`/`ingredientId`, y `fifoService.js` abre sesión de transacción sobre el cliente Mongo en `withWriteTransaction`. El boot es solo PG (`runPgMigrations`), por lo que `getMongoClient()` retorna `null` y todos los flujos de stock fallan con `TypeError`.

Hechos observados que condicionan el diseño:

- Forma real de un batch en Mongo (verificado en BD dev): `{ _id, tenantId, branchId, ingredientId, quantity (number), unitCost (number), createdAt, updatedAt }`. Las referencias son hex de 24 chars (ObjectId).
- `listBatches` filtra `{ tenantId?, branchId?, ingredientId? }` y ordena `createdAt ASC`. Lo usan `dishService.computeDishCostPerBranch` (dishIngredients), `inventoryService.listStock` (`{ tenantId, branchId? }`), `orderService.tryDeductDishStock` y `fifoService.consumeFifo` (`{ tenantId, branchId, ingredientId }`).
- Los consumidores leen `batch.quantity ?? 0`, `batch.unitCost ?? 0`, `String(batch.ingredientId)`/`batch.branchId` para agrupar, y `batch._id` como identidad (breakdown FIFO → `String(_id)`).
- `createBatch` devuelve el documento insertado; `inventoryService.adjustStock` usa `batch._id` como `batchId` del movimiento posterior.
- `updateBatchQuantity(batchId, quantity, { session })`: si `quantity <= 0` → borra el batch (`findOneAndDelete`); si no, `$set: { quantity, updatedAt }`. Lo usan `fifoService.applyBatchUpdates`, pasando `session` (hoy: sesión Mongo).
- `fifoService.withWriteTransaction(work)` retorna `{ transactionUnsupported: true }` cuando Mongo no soporta transacciones (standalone), y los callers (`inventoryService.adjustStock`, `orderService.tryDeductDishStock`) contemplan ese fallback. Con PG, la transacción está siempre disponible.
- `toStockObjectId` solo se usa internamente en `stockRepository.js`.
- `pg` (Pool) ya está en uso en todos los repos PG; `getPgPool()` devuelve el pool global.

## Goals / Non-Goals

**Goals:**
- Crear tabla PG `stocks` (migración `007`) con las 3 refs a `VARCHAR(24)` e índices por consulta.
- Reescribir `stockRepository.js` a PG con firmas y formas de retorno idénticas.
- `fifoService.withWriteTransaction` a transacción PG nativa (mis‑ma semántica: `work(session)`).
- Migración limpia (sin importar datos Mongo), consistente con `MIGRATION.md`.

**Non-Goals:**
- Migrar `movements`, `orders`, `customers`, `loyalty` (fases separadas `pg-*`).
- Cambiar servicios de negocio/validaciones/API que consumen `listBatches`/`createBatch`/`updateBatchQuantity`.
- Mantener la conexión Mongo en runtime (el servidor ya no la usa).
- Agregar índices GIN/optimizaciones de consulta de gran volumen (fuera de alcance).

## Decisions

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS stocks (
    id            VARCHAR(24)   PRIMARY KEY,
    tenant_id     VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
    branch_id     VARCHAR(24)   REFERENCES branches(id) ON DELETE CASCADE,
    ingredient_id VARCHAR(24)   REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity      NUMERIC(12,4) NOT NULL,
    unit_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stocks_tenant     ON stocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stocks_lookup     ON stocks(tenant_id, branch_id, ingredient_id, created_at);
```

- Misma semántica de campos que el documento Mongo; `quantity`/`unit_cost` usan `NUMERIC(12,4)` como el resto del esquema (verificable contra `dishes.sale_price`, `ingredients.unit_cost` y `cash_session_totals.amount`).
- Índice compuesto `(tenant_id, branch_id, ingredient_id, created_at)` cubre el filtro + orden de `listBatches` (el principal uso). `branch_id` puede ser `branch_id IS NULL` en Mongo? No: `listBatches` filtra `branchId` siempre que se envíe; `createBatch` siempre lo setea. Mantenerlo `NOT NULL` y en el índice.
- `created_at` repetido en el índice también cubre `ORDER BY created_at ASC` sin tabla `sort`.

### 2. Batch → fila PG (mapper)

`rowToBatch(row)` devuelve la forma consumida por los servicios:

```js
{
  _id: row.id, id: row.id,
  tenantId: row.tenant_id,
  branchId: row.branch_id,
  ingredientId: row.ingredient_id,
  quantity: Number(row.quantity),
  unitCost: Number(row.unit_cost),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}
```

- `quantity`/`unitCost` como `Number` (los consumidores hacen `batch.quantity ?? 0` y sumas). En Mongo ya eran números; el driver PG los devuelve como strings para `NUMERIC`, por eso el `Number(...)` explícito (mismo patrón que `rowToDish`/`rowToIngredient`).
- `_id` y `id` ambos como hex string para compatibilidad con `String(batch._id)` en el breakdown FIFO.

### 3. Signals del repo → PG

- `toStockObjectId(id)` → `toObjectIdHex(id)` (patrón `dishRepository`/`ingredientRepository`).
- `generateObjectIdHex()` para `id` de nuevos batches.
- `listBatches`: `WHERE` dinámica con `tenant_id = $n AND branch_id = $n AND ingredient_id = $n` según filtros presentes, `ORDER BY created_at ASC`. Identical a `listIngredients`/`listDishes`.
- `createBatch`: `INSERT ... RETURNING *` devolviendo `rowToBatch(rows[0])`.
- `updateBatchQuantity(batchId, quantity, { session })`:
  - `run = session ?? getPgPool()`; si `quantity <= 0` → `DELETE FROM stocks WHERE id = $1 RETURNING *`; si no → `UPDATE stocks SET quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *`. Devuelve `rowToBatch(rows[0] ?? null)`.
  - El parámetro `session` pasa a ser un cliente PG (`pg.PoolClient`) cuando viene de `withWriteTransaction`; `null`/`undefined` → pool global. Firma idéntica → `fifoService.applyBatchUpdates` no cambia.

### 4. `fifoService.withWriteTransaction` → transacción PG nativa

Reemplaza el bloque Mongo (sesión `startSession`) por:

```js
export async function withWriteTransaction(work) {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
```

- PG soporta transacciones siempre → se elimina `supportsTransactions`/`getMongoClient()` de `fifoService.js`. El caso `{ transactionUnsupported: true }` ya no ocurre; los callers que lo contemplan (`inventoryService:174`, `orderService:417`) siguen siendo válidos porque con PG la transacción siempre aplica y el resultado es el del `work`.
- El `client` inyectado a `work(session)` se propaga a `stockRepository.updateBatchQuantity` como `session`, que lo usa como driver de query. READ consistency: `fifoService.consumeFifo` hace `listBatches` sin sesión (igual que hoy, donde la lectura tampoco usaba la sesión). Se mantiene el comportamiento observable.

### 5. No transacción en `listBatches`

Igual que el repo Mongo actual (`find(filter)` sin sesión), `listBatches` siempre consulta el pool global. Evita acoplar lecturas al cliente de transacción y coincide con la semántica de las fases anteriores.

## Risks / Trade-offs

- **[Risk] `quantity` puede pasar a 0/negativo en un `adjustStock` de salida** → `updateBatchQuantity` con `quantity <= 0` borra la fila, igual que el `findOneAndDelete` de Mongo. Mantener la condición `<= 0` (no `< 0`). Mitigación: prueba unitaria con `adjustStock` type `exit` completo.
- **[Risk] Lectura `listBatches` fuera de la transacción PG** → Si otra escritura concurrente cambia el batch entre `listBatches` y `updateBatchQuantity`, el `UPDATE ... WHERE id = $1` solo afecta la fila con la quantity recalculada en `applyBatchUpdates` (recalcula `previousQuantity - item.quantity` desde la lectura). Es el mismo riesgo que en Mongo y no empeora: `applyBatchUpdates` re-lee del breakdown con `String(candidate._id)`. Se documenta como límite conocido (evil serializable no usado).
- **[Risk] Índice `idx_stocks_lookup` sin GIN** → Volumen bajo (decenas de filas hoy, 13 en dev); el índice B-tree compuesto basta. Si el volumen crece, fase posterior puede agregar particionado/GIN. Trade-off consciente.
- **[Risk] `branch_id`/`ingredient_id` `NOT NULL`** → `createBatch` siempre los setea en Mongo; no hay caso null en los consumidores. Mantener NOT NULL simplifica el índice.
- **[Risk] Drivers devuelven `NUMERIC` como string** → `Number(...)` en `rowToBatch`. Sin `Number()`, `batch.quantity ?? 0` y las sumas seguirían funcionando, pero `computeFifoCost` y `roundQuantity` operarían coaccionando strings; normalizar a número en el mapper evita bugs silenciosos.

## Migration Plan

1. Migración `007_create_stocks.js` — `CREATE TABLE IF NOT EXISTS` + índices; corre sola al boot (`runPgMigrations`).
2. Reescribir `stockRepository.js` (queries PG, `rowToBatch`, normalización hex, `updateBatchQuantity` con `session`).
3. Actualizar `fifoService.js` — `withWriteTransaction` a transacción PG; quitar imports de `mongodb`/`mongo.js` que queden sin uso; verificar que `consumeFifo`/`applyBatchUpdates` no cambian.
4. `npm test` — suites existentes deben pasar (`fifoService.test.js` cubre `planFifoConsumption`/`computeFifoCost`, que no cambian).
5. Verificación contra la BD dev: migración `007` en `schema_migrations`; `GET /api/dishes` con `branchId` deja de dar 500 y devuelve `cost` por plato; ciclo `listStock`/`adjustStock` (entrada→salida) y verificación de `stocks` en PG.

Rollback: revertir `stockRepository.js`/`fifoService.js`; la migración es aditiva (tabla nueva), seguro dejarla.

## Open Questions

Ninguna.