export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant (
        id            VARCHAR(24)   PRIMARY KEY,
        name          VARCHAR(150)  NOT NULL,
        rut           VARCHAR(20)   UNIQUE,
        razon_social  VARCHAR(255),
        email         VARCHAR(255),
        phone         VARCHAR(50),
        address       VARCHAR(255),
        active        BOOLEAN       NOT NULL DEFAULT TRUE,
        loyalty       JSONB,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roles (
        id            BIGSERIAL PRIMARY KEY,
        code          VARCHAR(50)   NOT NULL,
        name          VARCHAR(100)  NOT NULL,
        description   TEXT,
        system_role   BOOLEAN       NOT NULL DEFAULT FALSE,
        tenant_id     VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_roles_code UNIQUE (code),
        CONSTRAINT uq_roles_tenant_code UNIQUE (tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS users (
        id              VARCHAR(24)   PRIMARY KEY,
        tenant_id       VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        first_name      VARCHAR(100),
        last_name       VARCHAR(100),
        name            VARCHAR(100),
        email           VARCHAR(255)  NOT NULL,
        password_hash   VARCHAR(255)  NOT NULL,
        status          VARCHAR(20)   NOT NULL DEFAULT 'active',
        branch_id       VARCHAR(24),
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_users_email UNIQUE (email)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
        user_id     VARCHAR(24)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id     BIGINT        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        tenant_id   VARCHAR(24)   REFERENCES tenant(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
        jti        VARCHAR(64)   PRIMARY KEY,
        expires_at TIMESTAMPTZ   NOT NULL,
        created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_tenant       ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_status       ON users(status);
    CREATE INDEX IF NOT EXISTS idx_user_roles_role    ON user_roles(role_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_tenant  ON user_roles(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_revoked_expires    ON revoked_tokens(expires_at);
  `);

  await pool.query(`
    INSERT INTO roles (code, name, description, system_role) VALUES
        ('sysadmin', 'Sistema',       'Acceso total a la plataforma',       TRUE),
        ('owner',    'Propietario',   'Dueño del tenant / restaurant',      TRUE),
        ('admin',    'Administrador', 'Administración del tenant',           TRUE),
        ('cashier',  'Cajero',        'Operación de caja / POS',             TRUE)
    ON CONFLICT (code) DO NOTHING
  `);
}
