# AGENTS.md — SmartComanda API

## Stack

- Node.js 22, **ESM** (`"type": "module"` in package.json)
- Express 5, Zod 4, PostgreSQL (pg driver)
- DB: **PostgreSQL** = en DOCKER se encuentra los contenedores y volumennes y tambien PGadmin; 
- No linter, formatter, or type checker configured — code style is enforced manually

## Commands

```bash
npm run dev        # node --watch src/server.js (auto-reload)
npm test           # node --test 'tests/**/*.test.js' (Node built-in runner)
```

DB scripts (`db:up`, `db:down`, etc.) reference `../scripts/` — they expect the sibling `SmartComanda` repo to exist.

---

description: Revisa el estado del repo. Úsalo cuando pidan "commit a main", "sube los cambios" o "haz commit".
mode: primary

permission:
bash:
"git status": allow
"git diff*": allow
"git log*": allow
"git add*": allow
"git commit*": allow
"git push*": allow
"git checkout main": allow
"*": ask

---

Eres un agente especializado en versionar código. Tu único trabajo es revisar los cambios, hacer commit y subirlos a la rama `main`.

## Procedimiento

1. **Inspecciona el estado** antes de tocar nada:

   * `git status`
   * `git diff`
   * `git diff --staged`
   * `git log --oneline -10` para conocer el estilo de los mensajes de commit del repo.

2. **Confirma que estás en `main`** con `git branch --show-current`. Si no estás en `main`, cambia con `git checkout main` antes de continuar.

3. **Revisa qué vas a commitear.** No commitees archivos que no correspondan:

   * Nunca incluyas secretos, claves, `.env`, `node_modules` ni archivos ignorados.
   * Revisa `.gitignore` si hace falta.
   * Solo escenifica archivos intencionales, nunca `git add .` a ciegas salvo que sea lo correcto.

4. **Redacta un mensaje de commit claro** siguiendo el estilo de los commits anteriores del repo, por ejemplo: `fix:`, `feat:`, `refactor:`, en español o inglés según la convención existente.

5. **Commit y push**:

   * `git add <archivos>`
   * `git commit -m "<mensaje>"`
   * `git push origin main`

6. **Verifica** que el push fue exitoso, que `git status` quede limpio y que la rama esté sincronizada con `origin/main`.

## Reglas importantes

* No modifiques código ni archivos; solo versionas.
* Si hay cambios sin relacionar o el pull falla, detente y avísale al usuario.
* Si el working tree está limpio y no hay nada que commitear, dímelo.
* No hagas cambios de configuración de git, no hagas force-push ni crees ramas nuevas, a menos que se te pida explícitamente.


## Architecture

Layers follow a strict flow: **route → controller → service → repository → DB**

| Directory | Role |
|-----------|------|
| `src/routes/` | Express router definitions, one file per domain |
| `src/controllers/` | HTTP adapters (parse request, call service, send response) |
| `src/services/` | Business logic |
| `src/repositories/` | Data access (PG or Mongo) |
| `src/models/` | Domain constants and schemas |
| `src/validation/` | Zod schemas for request validation |
| `src/middleware/` | Auth (JWT), role guards, rate limit, Zod validation |
| `src/db/` | Connection pools and migration runners |
| `src/migrations-pg/` | PostgreSQL migrations (run auto on startup) |
| `src/migrations/` | MongoDB migrations |

Entry point: `src/server.js` — connects PG, runs PG migrations, then starts Express. Mongo connects lazily per-request via middleware.
# Referencias a módulos (@)

Cuando el usuario escriba una mención con `@` (p. ej. `@backend`), se refiere al repositorio/ubicación independiente de ESE módulo, NO al monorepo. Este patrón se aplicará a todos los módulos a medida que vayan separándose. este ya esta separado

Cada módulo tiene su propio repositorio dedicado:

| Módulo | Repositorio | Ruta remota |
|--------|-------------|-------------|
| @backend | SmartComanda_api | `https://github.com/zaidepilef/SmartComanda_api.git` | corre como localhost:3000 y los demas repos en desarrollo apunta directoa localhost:3000, en produccion apunta a la imagen
| @frontend-admin | SmartComanda_admin | `https://github.com/zaidepilef/SmartComanda_admin.git` | corre aparte en otro repo
| @frontend-pos | SmartComanda_pos | `https://github.com/zaidepilef/SmartComanda_pos.git` | corre aparte en otro repo 
| @postgres | Corriendo en docker para desarrollo y en rproduccion es ta una imagen de dokploy | — |

Reglas:

- Al tocar código de un módulo `@X`, operar dentro de su repositorio dedicado (clonado en `/Users/ougt/Documents/GitHub/<Repo>`), no en el monorepo.
- Commitear y empujar en el repo del módulo correspondiente

---

Arquitectura/ubicaciones actuales:

- `backend` → repo independiente `SmartComanda_api` (`/Users/ougt/Documents/GitHub/SmartComanda_api`), referido como `@backend`.
- `frontend-admin` → repo independiente `SmartComanda_admin` (`/Users/ougt/Documents/GitHub/SmartComanda_admin`), referido como `@frontend-admin`.
- `frontend-pos` → repo independiente `SmartComanda_pos` (`/Users/ougt/Documents/GitHub/SmartComanda_pos`), referido como `@frontend-pos`.
- `frontend-client` → repo independiente `SmartComanda_client` (`/Users/ougt/Documents/GitHub/SmartComanda_client`), referido como `@frontend-client`.



---

# Principios de desarrollo

Todo desarrollo debe seguir:

- Spec Driven Development (SDD).
- OpenSpec como fuente de verdad.
- Clean Code.
- SOLID.
- DRY.
- KISS.
- Seguridad por diseño.
- Separación de responsabilidades.

---

# Flujo obligatorio antes de modificar código

Antes de implementar cualquier cambio:

1. Revisar este archivo AGENTS.md.
2. Revisar documentación existente.
3. Revisar archivos dentro de:


/openspec/specs


4. Entender impacto del cambio.
5. Proponer solución cuando sea necesario.

No realizar cambios grandes sin especificación.

---

# OpenSpec Workflow

Para nuevas funcionalidades:

1. Crear propuesta.


/opsx-propose


2. Analizar requisitos.


/opsx-explore


3. Crear especificación.


/opsx-spec


4. Implementar cambios.


/opsx-apply


5. Validar.


6. Archivar cuando corresponda.


/opsx-archive


---

# Backend

Referencia: `@backend` = repo `SmartComanda_api`.

Ubicación: `/Users/ougt/Documents/GitHub/SmartComanda_api`
Tecnología:

- Node.js.
- JavaScript/TypeScript.
- API REST.

Reglas:

- Operar dentro del repo `SmartComanda_api` (clonado en `/Users/ougt/Documents/GitHub/SmartComanda_api`), NO en `/SmartComanda/backend`.
- Mantener separación por capas.
- No mezclar lógica de negocio con rutas.
- Validar entradas.
- Manejar errores correctamente.
- No exponer información sensible.

Preferir estructura:

src/

├── controllers
├── services
├── repositories
├── models
├── routes
├── middleware
├── config
└── utils

## Conventions

- All route files mount at `/api/<domain>` (see `src/server.js` for full list)
- Swagger docs auto-generated via `swagger-jsdoc`, served at `/api/docs` (disabled in prod)
- Auth: JWT + bcrypt; optional Cloudflare Turnstile captcha on public registration
- Tests are unit-level only (FIFO logic, Zod schemas, Postgres connection check) — no integration test infra
- Environment config loaded from `src/config/env.js` via dotenv; see `env.example` for required vars
