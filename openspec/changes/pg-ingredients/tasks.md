## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/004_create_ingredients.js` with the `ingredients` table and `(tenant_id, name)` unique index — verify with `node -e "import('./src/migrations-pg/004_create_ingredients.js')"` that it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/ingredientRepository.js`: replace all Mongo calls with PG queries (`getPgPool`), mapping error code `23505` → `ConflictError` and using `ILIKE` for name searches — verify all functions import correctly by importing the module
- [x] 2.2 Add `rowToIngredient` mapper: PG snake_case columns → camelCase shape `{ _id, id, tenantId, name, unit, dimension, unitCost, notes, createdAt, updatedAt }` — verify output shape on a live row via a one-off query in `psql`

## 3. Verification

- [x] 3.1 Run `npm test` — verify all existing tests still pass
- [x] 3.2 Verify migration 004 applies on startup and the `ingredients` table exists — run the DB migration runner and check `schema_migrations` contains `004`