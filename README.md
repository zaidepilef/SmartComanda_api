# SmartComanda API

Backend para gestión de restaurantes y food trucks. Arquitectura dual: **PostgreSQL** (identidad/tenants/usuarios/sucursales) + **MongoDB** (menú/inventario/pedidos/caja).

## Stack

- **Runtime**: Node.js 22 (ESM)
- **Framework**: Express 5
- **Validación**: Zod 4
- **Auth**: JWT + bcrypt + Cloudflare Turnstile
- **Docs**: Swagger/OpenAPI 3.0
- **Base de datos**: PostgreSQL 16 + MongoDB 8

## Requisitos

- Node.js ≥ 22
- Docker (para PostgreSQL y MongoDB)
- npm

## Inicio rápido

```bash
# 1. Levantar bases de datos
cd ../SmartComanda
docker compose up -d postgres mongodb

# 2. Instalar dependencias
cd ../SmartComanda_api
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 4. Ejecutar
npm run dev
```

La API arranca en `http://localhost:3000`. Las migraciones corren automáticamente al iniciar.

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | Sí | URL de PostgreSQL (`postgresql://user:pass@host:5432/db`) |
| `JWT_SECRET` | Sí | Secretos JWT (mínimo 32 caracteres) |
| `MONGODB_URI` | No | URI de MongoDB (default: `mongodb://localhost:27017/smartcomanda`) |
| `PORT` | No | Puerto de la API (default: `3000`) |
| `JWT_EXPIRES_IN` | No | Expiración del JWT (default: `1h`) |
| `TURNSTILE_SECRET_KEY` | No | Secret de Cloudflare Turnstile para captcha |
| `SYSADMIN_EMAIL` | No | Email del superadmin (default: `fel.di.rod@gmail.com`) |
| `ENABLE_API_DOCS` | No | Habilitar Swagger docs (default: `true` fuera de producción) |

## Endpoints

### Auth (`/api/auth`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| POST | `/login` | Login, devuelve JWT | Público |
| POST | `/register` | Auto-registro (requiere captcha) | Público |
| GET | `/me` | Usuario autenticado | Auth |
| POST | `/logout` | Revocar token | Auth |

### Users (`/api/users`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| GET | `/` | Listar usuarios (paginado) | Auth |
| POST | `/` | Crear usuario | sysadmin/admin |
| GET | `/:id` | Obtener usuario | Auth (scoped) |
| PUT | `/:id` | Actualizar usuario | sysadmin/admin |
| DELETE | `/:id` | Eliminar usuario | sysadmin |

### Tenants (`/api/tenants`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| GET | `/` | Listar tenants | Auth |
| GET | `/:id` | Obtener tenant | Auth (scoped) |
| POST | `/` | Crear tenant | sysadmin |
| PUT | `/:id` | Actualizar tenant | Auth (scoped) |

### Branches (`/api/branches`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| GET | `/` | Listar sucursales | Auth |
| POST | `/` | Crear sucursal | manager |
| PUT | `/:id` | Actualizar sucursal | manager |
| GET | `/:id` | Obtener sucursal | manager |

### Ingredients (`/api/ingredients`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| GET | `/` | Listar ingredientes | manager |
| POST | `/` | Crear ingrediente | manager |
| PUT | `/:id` | Actualizar ingrediente | manager |

### Dishes (`/api/dishes`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| GET | `/` | Listar platos | Auth |
| POST | `/` | Crear plato + receta | manager |
| PUT | `/:id` | Actualizar plato | manager |

### Inventory (`/api/inventory`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| GET | `/stock` | Stock por ingrediente+sucursal | manager |
| POST | `/stock/adjustments` | Ajuste de stock (FIFO) | manager |
| GET | `/movements` | Historial de movimientos | manager |

### Orders (`/api/orders`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| POST | `/` | Crear pedido | Auth |
| GET | `/` | Listar/filtrar pedidos | Auth |
| GET | `/:id` | Obtener pedido | Auth |
| PATCH | `/:id/status` | Cambiar estado (máquina de estados) | Auth |
| PATCH | `/:id/pay` | Pagar pedido | Auth |

### Cash Sessions (`/api/cash-sessions`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| POST | `/` | Abrir sesión de caja | Auth |
| GET | `/current` | Sesión abierta actual | Auth |
| POST | `/:id/close` | Cerrar sesión de caja | Auth |

### Public (`/api/public`)

| Método | Ruta | Descripción | Acceso |
|--------|------|-------------|--------|
| GET | `/menu` | Menú público (por tenant+sucursal) | Público |
| POST | `/orders` | Pedido QR público | Público |
| GET | `/customers/balance` | Balance de puntos por teléfono | Público |

### Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado de la API y bases de datos |

## Estructura del proyecto

```
src/
├── config/          # Configuración (env, swagger)
├── controllers/     # Adaptadores HTTP (request → service → response)
├── db/              # Conexiones y migraciones (PG + Mongo)
├── middleware/       # Auth, roles, rate limit, validación Zod
├── migrations/      # Migraciones MongoDB (9)
├── migrations-pg/   # Migraciones PostgreSQL (2)
├── models/          # Constantes y esquemas de dominio
├── repositories/    # Capa de acceso a datos
├── routes/          # Definición de endpoints
├── services/        # Lógica de negocio
├── utils/           # Helpers (errores, ObjectId, tenant scope)
└── validation/      # Schemas Zod para request validation
```

## Arquitectura de datos

### PostgreSQL — Dominio de identidad
- `tenant` — Restaurantes/empresas
- `roles` — Roles del sistema (sysadmin, owner, admin, cashier)
- `users` / `user_roles` — Usuarios y sus roles
- `revoked_tokens` — Tokens JWT revocados
- `branches` — Sucursales con métodos de pago y numeración de pedidos

### MongoDB — Dominio de tenant
- `ingredients` / `dishes` — Menú con recetas
- `stocks` / `inventory-movements` — Inventario FIFO por lote
- `orders` — Pedidos con máquina de estados
- `cash-sessions` — Sesiones de caja (abrir/cerrar)
- `customers` / `loyalty-transactions` — Clientes y puntos de fidelidad

## Test

```bash
npm test
```

Usa el runner nativo de Node.js (`node --test`). Tests unitarios de lógica FIFO y validación de schemas Zod.

## Docker

```bash
# Build de la imagen
docker build -t smartcomanda-api .

# Ejecutar (requiere DBs corriendo)
docker run -p 3000:3000 --env-file .env smartcomanda-api
```

## Licencia

MIT
