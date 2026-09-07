## 1. PG Migration

- [x] 1.1 Create `src/migrations-pg/005_create_dishes.js` with the `dishes` table (recipe/branch_prices JSONB) and `(tenant_id, name)` unique index — verify with `node -e "import('./src/migrations-pg/005_create_dishes.js')"` that it exports `up(pool)`

## 2. Repository Rewrite

- [x] 2.1 Rewrite `src/repositories/dishRepository.js` for PG: replace Mongo calls with `getPgPool`, map error code `23505` → `ConflictError`, use `ILIKE` for name searches and `recipe @> $n::jsonb` for `findDishesByIngredientId` — verify all functions import correctly by importing the module
- [x] 2.2 Add `rowToDish` mapper and ObjectId→hex normalization for `recipe`/`branchPrices`: PG snake_case rows → camelCase shape `{ _id, id, tenantId, name, salePrice, active, description, category, icon, recipe, branchPrices, createdAt, updatedAt }` — verify output shape on a live dish via a one-off script

## 3. Verification

- [x] 3.1 Run `npm test` — verify all existing tests still pass
- [x] 3.2 Verify migration 005 applies on startup and the `dishes` table exists — run the DB migration runner and check `schema_migrations` contains `005`
- [x] 3.3 Verify full CRUD cycle on the development DB: create (with recipe containing a real ingredient id), read by id, find by name case-insensitive, `findDishesByIngredientId`, update, duplicate name → `ConflictError`, cleanup rows