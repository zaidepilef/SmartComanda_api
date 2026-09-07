# Migración MongoDB → PostgreSQL — Estado

Migración por dominio de la API (`@backend`). El servidor arranca solo con PostgreSQL (`runPgMigrations`); los repos que aún usan Mongo están rotos en runtime hasta migrarse.

## Haz completado

| Fase | Cambio OpenSpec | Commit (rama develop) | Estado |
|------|----------------|-----------------------|--------|
| cash sessions | `pg-cash-session-totals` | `9a7dc4f` | ✅ verificado, 30/30 tests |
| ingredients | `pg-ingredients` | `9a7dc4f` | ✅ verificado, CRUD + duplicados OK |
| dishes | `pg-dishes` | `1b783ed` | ✅ verificado, CRUD + JSONB recipe OK |

Detalle por fase en `openspec/changes/<cambio>/`.

## Siguientes fases (por dependencias)

1. `pg-stocks` — `stockRepository.js` (usado por `computeDishCostPerBranch` y orden de stock)
2. `pg-movements` — `movementRepository.js`
3. `pg-orders` — `orderRepository.js` (depende de dishes + customers)
4. `pg-customers` — `customerRepository.js`
5. `pg-loyalty` — `loyaltyRepository.js`

Servicios con acceso directo a Mongo aún por migrar:
- `src/services/fifoService.js` (`getMongoClient()`)
- `src/services/loyaltyService.js` (`getMongoClient()`)

Repos ya en PG: `userRepository`, `tenantRepository`, `branchRepository`, `roleRepository`, `userRoleRepository`, `revokedTokenRepository`, `cashSessionRepository`, `ingredientRepository`, `dishRepository`.

## Convenciones de migración (ya establecidas)

- `id VARCHAR(24)` hex + `generateObjectIdHex`/`toObjectIdHex` (utils/id.js)
- `NUMERIC(12,4)` para montos/costos
- Tablas normalizadas separadas; `237`/JSONB solo donde el consumo es opaco (recipe/branch_prices de dishes)
- Error `23505` → `ConflictError`; `ILIKE` + `escapeLike` para búsquedas case-insensitive
- `rowTo<i>X</i>` mapea snake_case → camelCase con `_id` y `id`
- Migraciones numéricas en `src/migrations-pg/` corren solas al boot
- Cambios OpenSpec de storage-only usan `skip_specs: true`
- Migración limpia: no se importan datos de Mongo
- Ids `ObjectId` que llegan de la capa de servicio se normalizan a hex al serializar

## Pendientes administrativos

- `origin/develop` está 1 commit detrás del local: falta `git push` del commit `1b783ed`
- Verificar qué servicios/controllers quedan tocando repos Mongo al migrar cada dominio