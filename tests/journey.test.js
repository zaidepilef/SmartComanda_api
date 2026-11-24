import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { connectPostgres, closePostgres, getPgPool } from "../src/db/postgres.js";
import { runPgMigrations } from "../src/db/migrations-pg.js";
import * as tenantRepo from "../src/repositories/tenantRepository.js";
import * as branchRepo from "../src/repositories/branchRepository.js";
import * as journeyService from "../src/services/journeyService.js";
import { journeyEventBatchSchema, journeyRangeQuerySchema } from "../src/validation/journeySchemas.js";
import { JOURNEY_STAGES } from "../src/models/journeyEvent.js";
import { ForbiddenError, NotFoundError } from "../src/utils/errors.js";
import { generateObjectIdHex } from "../src/utils/id.js";

const TENANT_IDS = [];

async function cleanup() {
  if (TENANT_IDS.length > 0) {
    // ON DELETE CASCADE borra sucursales, clientes y eventos del tenant.
    await getPgPool().query("DELETE FROM tenant WHERE id = ANY($1::varchar[])", [TENANT_IDS]);
  }
  TENANT_IDS.length = 0;
}

test.before(async () => {
  await runPgMigrations(connectPostgres());
});

test.after(async () => {
  await cleanup();
  await closePostgres();
});

async function createTenantWithBranch() {
  const tenantId = generateObjectIdHex();
  TENANT_IDS.push(tenantId);
  await tenantRepo.createTenant({ _id: tenantId, name: "Journey Tenant" });
  const branch = await branchRepo.createBranch({ tenantId, name: "Journey Branch" });
  return { tenantId, branchId: String(branch._id) };
}

const now = () => new Date().toISOString();

// Rango que incluye con margen los eventos recién creados (el límite "to" es exclusivo).
const recentRange = () =>
  journeyRangeQuerySchema.parse({
    from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    to: new Date(Date.now() + 60 * 1000).toISOString(),
  });
const PHONE = "+56900000001";

// ── deriveStage (puro) ──────────────────────────────────────────────

test("deriveStage: precedence and abandonment", () => {
  const recent = new Date();
  const old = new Date(Date.now() - 31 * 60 * 1000);
  const base = { identified: false, cartQuantity: 0, lastOrderStep: null, orderId: null };

  assert.equal(journeyService.deriveStage({ ...base, lastActivityAt: recent }).stage, JOURNEY_STAGES.QR_OPENED);
  assert.equal(
    journeyService.deriveStage({ ...base, identified: true, lastActivityAt: recent }).stage,
    JOURNEY_STAGES.IDENTIFIED
  );
  assert.equal(
    journeyService.deriveStage({ ...base, identified: true, cartQuantity: 2, lastActivityAt: recent }).stage,
    JOURNEY_STAGES.WITH_CART
  );
  assert.equal(
    journeyService.deriveStage({ ...base, cartQuantity: 2, lastOrderStep: "order_failed", lastActivityAt: recent })
      .stage,
    JOURNEY_STAGES.ORDER_FAILED
  );

  const abandoned = journeyService.deriveStage({ ...base, cartQuantity: 1, lastActivityAt: old });
  assert.deepEqual(abandoned, { stage: JOURNEY_STAGES.WITH_CART, abandoned: true });

  const created = journeyService.deriveStage({ ...base, orderId: "x", lastActivityAt: old });
  assert.deepEqual(created, { stage: JOURNEY_STAGES.ORDER_CREATED, abandoned: false });
});

// ── Validación del lote ─────────────────────────────────────────────

test("batch schema: rejects order_created from the client, extra fields and oversized batches", () => {
  const ids = { tenantId: generateObjectIdHex(), branchId: generateObjectIdHex(), sessionId: randomUUID() };

  assert.equal(
    journeyEventBatchSchema.safeParse({ ...ids, events: [{ type: "order_created", occurredAt: now() }] }).success,
    false
  );
  assert.equal(
    journeyEventBatchSchema.safeParse({
      ...ids,
      events: [{ type: "qr_opened", occurredAt: now(), data: { phone: PHONE } }],
    }).success,
    false
  );
  const tooMany = Array.from({ length: 51 }, () => ({ type: "qr_opened", occurredAt: now() }));
  assert.equal(journeyEventBatchSchema.safeParse({ ...ids, events: tooMany }).success, false);
  assert.equal(
    journeyEventBatchSchema.safeParse({ ...ids, events: [{ type: "qr_opened", occurredAt: now() }] }).success,
    true
  );
});

test("range schema: defaults to last 24h and rejects ranges over 31 days", () => {
  const parsed = journeyRangeQuerySchema.parse({});
  assert.ok(parsed.to - parsed.from === 24 * 60 * 60 * 1000);
  assert.equal(
    journeyRangeQuerySchema.safeParse({ from: "2026-01-01T00:00:00Z", to: "2026-03-01T00:00:00Z" }).success,
    false
  );
});

// ── Ingesta, eventos de servidor y consultas ────────────────────────

test("journey: ingest, server outcome, sessions, timeline and funnel", async () => {
  const { tenantId, branchId } = await createTenantWithBranch();
  const sessionId = randomUUID();
  const actor = { roles: ["admin"], tenantId };

  await journeyService.ingestClientEvents({
    tenantId,
    branchId,
    sessionId,
    events: [
      { type: "qr_opened", occurredAt: now() },
      { type: "identity_submitted", occurredAt: now(), data: { name: "Ana", phone: PHONE } },
      { type: "item_added", occurredAt: now(), data: { dishId: generateObjectIdHex(), quantity: 2 } },
      { type: "order_submitted", occurredAt: now(), data: { itemCount: 2, total: 1000 } },
    ],
  });

  const recorded = await journeyService.recordOrderOutcome({
    sessionId,
    tenantId,
    branchId,
    phone: PHONE,
    status: 400,
    body: { error: "Invalid payload.", details: [{ path: "name", message: "name must not be empty." }] },
  });
  assert.equal(recorded, true);

  // Ningún evento guarda nombre ni teléfono.
  const { rows } = await getPgPool().query(
    "SELECT data::text AS data FROM customer_journey_events WHERE session_id = $1",
    [sessionId]
  );
  assert.ok(rows.every((row) => !row.data.includes(PHONE) && !row.data.includes("Ana")));

  const range = recentRange();
  const [session] = await journeyService.listSessions(actor, branchId, range);
  assert.equal(session.sessionId, sessionId);
  assert.equal(session.stage, JOURNEY_STAGES.ORDER_FAILED);
  assert.equal(session.customerName, "Ana");
  assert.equal(session.customerPhone, PHONE);
  assert.match(session.lastFailure.reason, /name must not be empty/);

  const timeline = await journeyService.getSessionTimeline(actor, branchId, sessionId);
  assert.deepEqual(
    timeline.events.map((event) => event.type),
    ["qr_opened", "identity_submitted", "item_added", "order_submitted", "order_failed"]
  );
  assert.equal(timeline.events.at(-1).source, "server");

  const funnel = await journeyService.getFunnel(actor, branchId, range);
  assert.equal(funnel.qrOpened, 1);
  assert.equal(funnel.identified, 1);
  assert.equal(funnel.withCart, 1);
  assert.equal(funnel.orderSubmitted, 1);
  assert.equal(funnel.orderCreated, 0);
  assert.equal(funnel.failedAttempts, 1);
});

test("journey: funnel is cumulative when client events are missing", async () => {
  const { tenantId, branchId } = await createTenantWithBranch();
  const actor = { roles: ["admin"], tenantId };
  const sessionId = randomUUID();

  // Solo el evento de servidor: el cliente no llegó a enviar los suyos.
  await journeyService.recordOrderOutcome({
    sessionId,
    tenantId,
    branchId,
    status: 400,
    body: { error: "Invalid payload." },
  });

  const funnel = await journeyService.getFunnel(actor, branchId, recentRange());
  assert.equal(funnel.qrOpened, 1);
  assert.equal(funnel.identified, 1);
  assert.equal(funnel.withCart, 1);
  assert.equal(funnel.orderSubmitted, 1);
  assert.equal(funnel.orderCreated, 0);
  assert.equal(funnel.failedAttempts, 1);
});

test("journey: rejects branches of another tenant", async () => {
  const a = await createTenantWithBranch();
  const b = await createTenantWithBranch();
  const range = journeyRangeQuerySchema.parse({});

  await assert.rejects(
    () =>
      journeyService.ingestClientEvents({
        tenantId: a.tenantId,
        branchId: b.branchId,
        sessionId: randomUUID(),
        events: [{ type: "qr_opened", occurredAt: now() }],
      }),
    NotFoundError
  );

  const recorded = await journeyService.recordOrderOutcome({
    sessionId: randomUUID(),
    tenantId: a.tenantId,
    branchId: b.branchId,
    status: 400,
    body: {},
  });
  assert.equal(recorded, false);

  await assert.rejects(
    () => journeyService.listSessions({ roles: ["admin"], tenantId: a.tenantId }, b.branchId, range),
    ForbiddenError
  );
});

test("journey: timeline of an unknown session is not found", async () => {
  const { tenantId, branchId } = await createTenantWithBranch();
  await assert.rejects(
    () => journeyService.getSessionTimeline({ roles: ["admin"], tenantId }, branchId, randomUUID()),
    NotFoundError
  );
});
