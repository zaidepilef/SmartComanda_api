## Context

`ingredientRepository.js` currently stores ingredients in MongoDB (`ingredients` collection) with `_id` ObjectIds and `tenantId` ObjectId references. The server boots with PG only, so this repository is broken at runtime. This rewrites it for PG as Phase 1 of the remaining Mongo→PG migration — ingredients has no dependencies, so it's the natural first domain.

Consumers of `ingredientRepository` (all via namespace access, none change their calls):
- `ingredientService.js` — `findIngredientById`, `findIngredientByNameAndTenant`, `listIngredients`, `createIngredient`, `updateIngredient`
- `dishService.js` — `findIngredientsByIds`
- `inventoryService.js` — `findIngredientsByIds`, `findIngredientById`
- `orderService.js` — `findIngredientsByIds`

## Goals / Non-Goals

**Goals:**
- Create `ingredients` PG table
- Rewrite `ingredientRepository.js` to PG with identical function signatures and return shapes
- Preserve exact functional behavior (no API/service/validation changes)

**Non-Goals:**
- Migrating `dishes`, `stocks`, `movements`, `orders` (separate phases)
- Adding tests (no existing test infra for ingredients CRUD)
- Importing existing Mongo data (clean migration, per project decision)

## Decisions

### 1. Schema

```sql
CREATE TABLE IF NOT EXISTS ingredients (
    id          VARCHAR(24)    PRIMARY KEY,
    tenant_id   VARCHAR(24)    REFERENCES tenant(id) ON DELETE CASCADE,
    name        VARCHAR(150)   NOT NULL,
    unit        VARCHAR(20)    NOT NULL,
    dimension   VARCHAR(10)    NOT NULL,
    unit_cost   NUMERIC(12,4)  NOT NULL DEFAULT 0,
    notes       TEXT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingredients_tenant_name ON ingredients(tenant_id, name);
```

- `id` follows the `VARCHAR(24)` ObjectId-hex convention used across PG tables.
- `unit_cost NUMERIC(12,4)` matches the 4-decimal precision standard used in the codebase.
- Unique constraint on `(tenant_id, name)` mirrors the Mongo unique index; PG error code `23505` maps to `ConflictError`.

### 2. ID mapping

`toIngredientObjectId` currently returns a Mongo `ObjectId`. In the PG version it returns the validated 24-char hex string (via `toObjectIdHex` from `utils/id.js`), consistent with how `userRepository` and `cashSessionRepository` were migrated. Callers use it as a plain string key (`String(x) === String(y)`), so this is compatible.

### 3. Case-insensitive name search

Mongo used `^name$` with case-insensitive regex. PG equivalent uses `ILIKE`:
```sql
WHERE tenant_id = $1 AND name ILIKE $2  -- $2 = escaped name
```
Search filter for `listIngredients` uses `name ILIKE '%' || $1 || '%'` for partial match, mirroring the `q` regex behavior.

### 4. Duplicate key → ConflictError

Mongo error code `11000` maps to `ConflictError`. PG error code `23505` (unique_violation) provides the same, via the existing `isDuplicateKeyError` pattern in `userRepository.js`.

### 5. Return shape

`rowToIngredient(row)` maps PG snake_case columns to the camelCase shape callers expect: `_id`, `id`, `tenantId`, `name`, `unit`, `dimension`, `unitCost`, `notes`, `createdAt`, `updatedAt`. Matching the existing `rowToUser` / `rowToSession` convention.

## Risks / Trade-offs

- **[Risk] `findIngredientsByIds` must preserve input order semantics** → Mongo returns docs in collection order; callers build `Map(String(_id) → ingredient)` and look up, so order doesn't matter. Safe.
- **[Risk] `findIngredientByNameAndTenant` case sensitivity** → Mongo was case-insensitive; `ILIKE` preserves that exactly.
- **[Trade-off] `id` remains a hex string, not a native PG type** → Consistent with all existing PG tables (users, tenants, branches, cash_sessions). No change in convention.
- **[Risk] Empty `ids` array** → `findIngredientsByIds` returns `[]` immediately (same guard as Mongo version).

## Files Modified

| File | Change |
|------|--------|
| `src/migrations-pg/004_create_ingredients.js` | **NEW** — creates `ingredients` table |
| `src/repositories/ingredientRepository.js` | Full rewrite: Mongo → PG |

## Migration Plan

1. Create PG migration `004_create_ingredients.js` — runs automatically on startup
2. Rewrite `ingredientRepository.js` — swap Mongo for PG queries
3. Run `npm test` to verify existing tests pass
4. Verify migration 004 applies and `ingredients` table exists

Rollback: Revert code changes. Migration is additive (new table), safe to leave in place.

## Open Questions

None.
