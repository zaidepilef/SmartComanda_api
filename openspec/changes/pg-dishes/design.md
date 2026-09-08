## Context

Ver proposal.md — Why. `dishRepository.js` usa MongoDB (`dishes`) y el boot es solo PG, dominios dishes/inventory/orders rotos en runtime. Esta fase migra `dishes` (fase 2; `ingredients` ya está en PG). Los consumidores acceden solo por namespace del repo y no cambian llamadas.

Hechos observados que condicionan el diseño:

- `dishService.createDish`/`updateDishById` convierten `recipe[].ingredientId` y `branchPrices[].branchId` en instancias `ObjectId` (Mongo) antes de llamar al repo. El repo PG debe normalizarlos a hex string **al serializar**.
- Los consumidores comparan ids con `String(x) === String(y)` (`resolveDishPrice` en `orderService:42` y `publicService:18`, `assertNameAvailable`, `dish.recipe` en `orderService:337`) → devolver ids como hex string es transparente.
- `findDishesByIngredientId` (usado por `ingredientService:89`) filtra por `recipe.ingredientId` embebido → requerirá búsqueda JSONB.
- `dishRepository.createDish` NO usa `toDishDocument` (no aplica defaults de `category`/`icon`); los consumidores hacen `dish.category ?? "general"` y `dish.icon` — preservar `null` cuando ausente.
- `listDishes` ordena por `name` ASC y filtra por `q` (regex contiene, case-insensitive) — equivalente PG: `name ILIKE '%' || $n || '%'`.
- `stockRepository.listBatches` sigue en Mongo (fase `pg-stocks`); no bloquea esta fase.

## Goals / Non-Goals

**Goals:**
- Crear tabla PG `dishes` (migración `005`) con `recipe` y `branch_prices` como `JSONB`
- Reescribir `dishRepository.js` a PG con firmas y formas de retorno idénticas
- Normalizar `ObjectId` → hex strings en `recipe`/`branchPrices` al guardar
- `findDishesByIngredientId` mantiene semántica (embebido en `recipe.ingredientId`)

**Non-Goals:**
- Migrar `stocks`, `movements`, `orders`, `customers`, `loyalty` (fases separadas)
- Cambiar servicios/validaciones/API
- Importar datos Mongo existentes (migración limpia, decisión del proyecto)
- Eliminar `toDishDocument` (no lo usa el repo; puede quedar para referencia o limpiarse en una fase de limpieza)

## Decisions

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS dishes (
    id             VARCHAR(24)    PRIMARY KEY,
    tenant_id      VARCHAR(24)    REFERENCES tenant(id) ON DELETE CASCADE,
    name           VARCHAR(150)   NOT NULL,
    sale_price     NUMERIC(12,4)  NOT NULL,
    active         BOOLEAN        NOT NULL DEFAULT TRUE,
    description    TEXT,
    category       VARCHAR(100),
    icon           VARCHAR(20),
    recipe         JSONB          NOT NULL DEFAULT '[]'::jsonb,
    branch_prices  JSONB,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dishes_tenant_name ON dishes(tenant_id, name);
```

- `recipe` JSONB: array de `{ ingredientId: "<hex>", quantity: number, unit: string }`.
- `branch_prices` JSONB nullable: array de `{ branchId: "<hex>", price: number }`.
- `id` sigue la convención `VARCHAR(24)` hex; `sale_price NUMERIC(12,4)`; unique `(tenant_id, name)` → `23505` → `ConflictError`.

### 2. Normalización de ObjectId al serializar JSONB

`toRecipeLine`/`toBranchPrice` en `dishService` entregan `ObjectId` reales. El repo PG los convierte a hex string antes de `JSON.stringify`:

```js
const hex = (value) => (value ? String(value) : null);
// recipe → [{ ingredientId: hex(line.ingredientId), quantity, unit }]
```

`String(ObjectId)` produce el hex. Alternativa descartada: confiar en `toJSON` del driver Mongo → implícito y frágil. El repo devuelve el JSONB parseado tal cual (hex strings), compatible con `String()` de los consumidores.

### 3. ID mapping

`toDishObjectId` pasa a devolver el hex validado vía `toObjectIdHex` (patrón `ingredientRepository`/`userRepository`). `generateObjectIdHex` para nuevas filas.

### 4. `findDishesByIngredientId` → búsqueda JSONB

Mongo: `{ "recipe.ingredientId": objectId }`. PG: filtro de contención:

```sql
SELECT * FROM dishes WHERE recipe @> $1::jsonb
```

con `$1` = `JSON.stringify([{ ingredientId: "<hex>" }])`. Es índice-explotable con GIN si se necesitara; para este volumen es suficiente.

### 5. Escrituras dinámicas

`updateDish` construye `SET` dinámico (patrón `ingredientRepository.updateIngredient`): mapa de columna para campos escalares + serialización JSONB para `recipe`/`branchPrices` + `updated_at = NOW()`. Sin claves en `update` → `NotFoundError`.

## Risks / Trade-offs

- **[Risk] Ids tipo `ObjectId` que llegan de la capa de servicio** → Normalización explícita a hex en el repo; verif con prueba de ciclo completo (create → read → compare con `String`).
- **[Risk] `findDishesByIngredientId` con JSONB `@>`** → Semántica correcta (existe al menos un elemento `recipe` con ese `ingredientId`); no depende de orden. Mitigación: prueba unitaria con multi-ingrediente.
- **[Trade-off] `recipe`/`branchPrices` como JSONB embebido en vez de tablas normalizadas** → Coincide con la forma de consumo (arrays opacos, solo `.find`/`.map` con `String()`) y con el patrón `payment_methods JSONB` ya presente en `branches` (migración `002`). Normalizar no aporta consultas nuevas ni integridad extra visible.
- **[Risk] `category`/`icon` null** → `publicService` y `dishService` usan `?? "general"`; `category` also `dish.category ?? "general"` en menú público; mapper devuelve null → sin romper. Mitigación: mapper explícito `row.category ?? null`.
- **[Risk] Firma `updateDish(id, update)` con `recipe` ya transformado (ObjectId)** → Normalización en el mismo flujo de serialización.
- **[Risk] Sin tocar `toDishDocument`** → Queda código muerto referenciando el modelo Mongo; deuda mínima, se limpia en fase de limpieza si se quiere.

## Migration Plan

1. Migración `005_create_dishes.js` — `CREATE TABLE IF NOT EXISTS` + unique index; corre sola al boot (`runPgMigrations`)
2. Reescribir `dishRepository.js` (queries PG, `rowToDish`, normalización hex)
3. `npm test` — suites existentes deben pasar
4. Verificación: migración `005` en `schema_migrations`; ciclo CRUD de prueba contra la BD dev (create/read/update/byName/byIngredientId/case-insensitive/duplicado→ConflictError)

Rollback: revertir código; la migración es aditiva (tabla nueva), seguro dejarla.

## Open Questions

Ninguna.