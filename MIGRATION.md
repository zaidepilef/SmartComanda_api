# Migración MongoDB → PostgreSQL — Estado

Migración por dominio de la API (`@backend`). El servidor arranca solo con PostgreSQL (`runPgMigrations`); los repos que aún usan Mongo están rotos en runtime hasta migrarse.

## Haz completado

| Fase | Cambio OpenSpec | Commit (rama develop) | Estado |
|------|----------------|-----------------------|--------|
| cash sessions | `pg-cash-session-totals` | `9a7dc4f` | ✅ verificado, 30/30 tests |
| ingredients | `pg-ingredients` | `9a7dc4f` | ✅ verificado, CRUD + duplicados OK |
| dishes | `pg-dishes` | `1b783ed` | ✅ verificado, CRUD + JSONB recipe OK |
| stocks | `pg-stocks` | `162b803` | ✅ verificado, FIFO + costos OK |
| movements | `pg-movements` | (este commit) | ✅ verificado, entry/exit 201, list 200 |
| orders | `pg-orders` | (este commit) | ✅ verificado, create/list/status/pay |
| customers | `pg-customers` | (este commit) | ✅ verificado, upsert + balance |
| loyalty | `pg-loyalty` | (este commit) | ✅ verificado, earn points en pay |

Detalle por fase en `openspec/changes/<cambio>/`.

## Siguientes fases (por dependencias)

No quedan repos de datos pendientes de migrar. El runtime ya no llama a `getMongoClient()`; `mongodb` solo se usa en `utils/id.js` y `dishService.js` para la clase `ObjectId` (generación/normalización de hex, no acceso a DB).

Servicios con acceso directo a Mongo aún por migrar: ninguno (todos ya en PG o con transacciones PG).

Repos ya en PG: `userRepository`, `tenantRepository`, `branchRepository`, `roleRepository`, `userRoleRepository`, `revokedTokenRepository`, `cashSessionRepository`, `ingredientRepository`, `dishRepository`, `stockRepository`, `movementRepository`, `orderRepository`, `customerRepository`, `loyaltyRepository`.

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