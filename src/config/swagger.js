import swaggerJsdoc from "swagger-jsdoc";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SmartComanda API",
      version: "1.0.0",
      description: "API de automatización de pedidos para restaurantes. Incluye autenticación, gestión de usuarios, tenants y sucursales.",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Servidor local de desarrollo",
      },
    ],
    tags: [
      { name: "Auth", description: "Autenticación y registro de usuarios" },
      { name: "Users", description: "Gestión de usuarios" },
      { name: "Tenants", description: "Gestión de tenants" },
      { name: "Branches", description: "Gestión de sucursales" },
      { name: "Ingredients", description: "Gestión de ingredientes" },
      { name: "Dishes", description: "Gestión de platos y recetas" },
      { name: "Inventory", description: "Control de stock e inventario" },
      { name: "Orders", description: "Gestión de pedidos" },
      { name: "Health", description: "Estado del servicio" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Identificador del usuario" },
            firstName: { type: "string", description: "Nombre del usuario" },
            lastName: { type: "string", description: "Apellido del usuario" },
            email: { type: "string", format: "email", description: "Correo electrónico" },
            name: { type: "string", description: "Nombre alternativo" },
            roles: {
              type: "array",
              items: {
                type: "string",
                enum: ["sysadmin", "owner", "admin", "cashier"],
              },
              description: "Roles del usuario (múltiples roles permitidos)",
            },
            tenantId: { type: "string", description: "Identificador del tenant asociado" },
            status: {
              type: "string",
              enum: ["active", "inactive", "pending"],
              description: "Estado del usuario",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Tenant: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Identificador del tenant" },
            name: { type: "string", description: "Nombre del tenant" },
            rut: { type: "string", description: "RUT del tenant" },
            razonSocial: { type: "string", description: "Razón social" },
            active: { type: "boolean", description: "Indica si el tenant está activo" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Branch: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Identificador de la sucursal" },
            tenantId: { type: "string", description: "Identificador del tenant asociado" },
            name: { type: "string", description: "Nombre de la sucursal" },
            type: { type: "string", enum: ["Sucursal", "FoodTruck"], description: "Tipo de sucursal" },
            address: { type: "string", description: "Dirección" },
            city: { type: "string", description: "Ciudad" },
            phone: { type: "string", description: "Teléfono" },
            active: { type: "boolean", description: "Indica si la sucursal está activa" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", description: "Correo electrónico del usuario" },
            password: { type: "string", description: "Contraseña del usuario" },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            token: { type: "string", description: "Token JWT de autenticación" },
            expiresIn: { type: "number", description: "Segundos hasta la expiración del token" },
            user: { $ref: "#/components/schemas/User" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Mensaje de error" },
          },
        },
        PaginatedUsers: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/User" } },
            pagination: {
              type: "object",
              properties: {
                page: { type: "number" },
                limit: { type: "number" },
                total: { type: "number" },
                totalPages: { type: "number" },
              },
            },
          },
        },
        Ingredient: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Identificador del ingrediente" },
            tenantId: { type: "string", description: "Identificador del tenant asociado" },
            name: { type: "string", description: "Nombre del ingrediente" },
            unit: { type: "string", description: "Unidad de medida" },
            dimension: {
              type: "string",
              enum: ["count", "mass", "volume"],
              description: "Dimensión del ingrediente",
            },
            unitCost: { type: "number", description: "Costo unitario" },
            notes: { type: "string", description: "Notas adicionales" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Dish: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Identificador del plato" },
            tenantId: { type: "string", description: "Identificador del tenant asociado" },
            name: { type: "string", description: "Nombre del plato" },
            salePrice: { type: "number", description: "Precio de venta" },
            recipe: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ingredientId: { type: "string" },
                  quantity: { type: "number" },
                  unit: { type: "string" },
                },
              },
              description: "Receta del plato",
            },
            active: { type: "boolean", description: "Indica si el plato está activo" },
            description: { type: "string", description: "Descripción del plato" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        StockItem: {
          type: "object",
          properties: {
            ingredientId: { type: "string" },
            branchId: { type: "string" },
            quantity: { type: "number", description: "Cantidad agregada del ingrediente en la sucursal" },
            unitCost: { type: "number", description: "Costo promedio ponderado de los lotes restantes" },
            totalValue: { type: "number", description: "Valorización del stock en bodega" },
            batchCount: { type: "number", description: "Cantidad de lotes vigentes" },
          },
        },
        Movement: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            ingredientId: { type: "string" },
            branchId: { type: "string" },
            type: { type: "string", enum: ["entry", "exit", "sale"] },
            quantity: { type: "number" },
            unitCost: { type: "number", description: "Costo unitario del lote (entradas)" },
            batchId: { type: "string", description: "Lote creado (entradas)" },
            batches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  batchId: { type: "string" },
                  quantity: { type: "number" },
                  unitCost: { type: "number" },
                },
              },
              description: "Desglose FIFO de lotes consumidos (salidas/ventas)",
            },
            orderId: { type: "string" },
            reason: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        OrderRequest: {
          type: "object",
          required: ["foodtruckId", "items"],
          properties: {
            foodtruckId: { type: "string", description: "Identificador del foodtruck" },
            clientContact: { type: "string", description: "Contacto del cliente" },
            items: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["dishId", "quantity"],
                properties: {
                  dishId: { type: "string" },
                  quantity: { type: "integer", minimum: 1 },
                  stockApplied: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        Order: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Identificador del pedido" },
            foodtruckId: { type: "string" },
            clientContact: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  dishId: { type: "string" },
                  quantity: { type: "integer" },
                  stockApplied: { type: "boolean" },
                },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: ["./src/controllers/*.js", "./src/routes/health.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export default swaggerSpec;