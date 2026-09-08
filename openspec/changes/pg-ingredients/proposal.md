## Why

The `ingredients` collection is still stored in MongoDB, but the server boots with PostgreSQL only (`server.js` connects PG, not Mongo). This makes the ingredients endpoints broken at runtime. This migrates the ingredients domain's storage to PostgreSQL as part of the domain-by-domain Mongo→PG migration (Phase 1 — ingredients has no dependencies, so it's the natural starting point for the remaining domains).

## What Changes

- Add `ingredients` table to PostgreSQL via a new migration `004_create_ingredients.js`.
- Rewrite `ingredientRepository.js` from MongoDB to PostgreSQL (`getPgPool`), preserving the same function signatures and return shapes.
- Keep the exact function set: `createIngredient`, `updateIngredient`, `listIngredients`, `findIngredientById`, `findIngredientsByIds`, `findIngredientByNameAndTenant`, `toIngredientObjectId`.
- No API changes: controllers, services, routes, and Zod validation stay the same.

## Capabilities

_Skipped — pure storage-layer migration. API behavior, endpoints, and contracts are unchanged. See `skip_specs: true` in `.openspec.yaml`._

## Impact

- **Repository**: `ingredientRepository.js` — full rewrite (Mongo → PG)
- **Migration**: new `src/migrations-pg/004_create_ingredients.js`
- **Callers (unchanged behavior)**: `ingredientService.js`, `dishService.js`, `inventoryService.js`, `orderService.js` — all call `ingredientRepository.*` functions; signatures stay identical
- **No API or validation changes**
