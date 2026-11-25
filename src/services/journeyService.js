import * as journeyEventRepository from "../repositories/journeyEventRepository.js";
import { normalizeChileanMobile } from "../utils/phone.js";
import * as branchRepository from "../repositories/branchRepository.js";
import * as customerService from "./customerService.js";
import * as branchService from "./branchService.js";
import { assertPublicBranch } from "./publicService.js";
import {
  JOURNEY_ABANDON_AFTER_MS,
  JOURNEY_EVENT_SOURCES,
  JOURNEY_EVENT_TYPES as T,
  JOURNEY_RETENTION_DAYS,
  JOURNEY_STAGES as S,
} from "../models/journeyEvent.js";
import { NotFoundError } from "../utils/errors.js";
import { isValidObjectIdHex } from "../utils/id.js";

// Hora del evento según el cliente, acotada para que un reloj mal configurado
// no ordene la sesión fuera de lugar.
const MAX_CLIENT_PAST_MS = 24 * 60 * 60 * 1000;
const MAX_CLIENT_FUTURE_MS = 5 * 60 * 1000;
const MAX_REASON_LENGTH = 200;

function clampOccurredAt(value, now) {
  const time = new Date(value).getTime();

  if (Number.isNaN(time) || time > now + MAX_CLIENT_FUTURE_MS || time < now - MAX_CLIENT_PAST_MS) {
    return new Date(now);
  }

  return new Date(time);
}

function truncate(text) {
  return typeof text === "string" ? text.slice(0, MAX_REASON_LENGTH) : undefined;
}

/** Guarda un lote de eventos del cliente para una sesión. */
export async function ingestClientEvents({ tenantId, branchId, sessionId, events }) {
  await assertPublicBranch(tenantId, branchId);

  const now = Date.now();
  const rows = [];

  for (const event of events) {
    let customerId = null;
    let data = event.data ?? {};

    if (event.type === T.IDENTITY_SUBMITTED) {
      // Se guarda solo la referencia al cliente, nunca el nombre ni el teléfono.
      const customer = await customerService.upsertCustomer({
        tenantId,
        phone: data.phone,
        name: data.name,
      });
      customerId = customer?._id ?? null;
      data = {};
    }

    rows.push({
      tenantId,
      branchId,
      sessionId,
      type: event.type,
      source: JOURNEY_EVENT_SOURCES.CLIENT,
      customerId,
      data,
      occurredAt: clampOccurredAt(event.occurredAt, now),
    });
  }

  return journeyEventRepository.insertEvents(rows);
}

function describeFailure(status, body) {
  const details = Array.isArray(body?.details)
    ? body.details.map((detail) => `${detail.path}: ${detail.message}`).join("; ")
    : "";
  const message = [body?.error, details].filter(Boolean).join(" — ");
  return { status, reason: truncate(message || `HTTP ${status}`) };
}

/**
 * Registra desde el servidor el resultado de un intento de pedido público.
 * Solo se registra si el tenant y la sucursal existen y coinciden, para que
 * nadie pueda escribir eventos en la sucursal de otro tenant.
 */
export async function recordOrderOutcome({ sessionId, tenantId, branchId, phone, status, body }) {
  if (!isValidObjectIdHex(tenantId) || !isValidObjectIdHex(branchId)) {
    return false;
  }

  const branch = await branchRepository.findBranchById(branchId);

  if (!branch || String(branch.tenantId) !== String(tenantId)) {
    return false;
  }

  const created = (status === 201 || status === 200) && body?.orderId;
  let customerId = null;

  if (typeof phone === "string" && phone.trim() !== "") {
    const customer = await customerService.getCustomerByPhone({
      tenantId,
      phone: normalizeChileanMobile(phone) ?? phone.trim(),
    });
    customerId = customer?._id ?? null;
  }

  await journeyEventRepository.insertEvents([
    {
      tenantId,
      branchId,
      sessionId,
      type: created ? T.ORDER_CREATED : T.ORDER_FAILED,
      source: JOURNEY_EVENT_SOURCES.SERVER,
      customerId,
      orderId: created ? body.orderId : null,
      data: created
        ? { number: body.number, total: body.total }
        : describeFailure(status, body),
      occurredAt: new Date(),
    },
  ]);

  return true;
}

/** Etapa actual de una sesión según las reglas del spec customer-journey-viewer. */
export function deriveStage(session, now = Date.now()) {
  let stage;

  if (session.orderId || session.lastOrderStep === T.ORDER_CREATED) {
    stage = S.ORDER_CREATED;
  } else if (session.lastOrderStep === T.ORDER_FAILED) {
    stage = S.ORDER_FAILED;
  } else if (session.lastOrderStep === T.ORDER_SUBMITTED) {
    stage = S.ORDER_SUBMITTED;
  } else if (session.cartQuantity > 0) {
    stage = S.WITH_CART;
  } else if (session.identified) {
    stage = S.IDENTIFIED;
  } else {
    stage = S.QR_OPENED;
  }

  const inactiveMs = now - new Date(session.lastActivityAt).getTime();
  const abandoned = stage !== S.ORDER_CREATED && inactiveMs >= JOURNEY_ABANDON_AFTER_MS;

  return { stage, abandoned };
}

async function resolveBranch(actor, branchId) {
  const branch = await branchService.getBranchById(actor, branchId);
  return { tenantId: String(branch.tenantId), branchId: String(branch._id) };
}

export async function listSessions(actor, branchId, { from, to, limit }) {
  const scope = await resolveBranch(actor, branchId);
  const sessions = await journeyEventRepository.listSessions({ ...scope, from, to, limit });
  const now = Date.now();

  return sessions.map((session) => {
    const { stage, abandoned } = deriveStage(session, now);
    const { lastOrderStep, ...rest } = session;
    return {
      ...rest,
      stage,
      abandoned,
      lastFailure: stage === S.ORDER_FAILED ? session.lastFailure : null,
    };
  });
}

export async function getSessionTimeline(actor, branchId, sessionId) {
  const scope = await resolveBranch(actor, branchId);
  const events = await journeyEventRepository.listSessionEvents({ ...scope, sessionId });

  if (events.length === 0) {
    throw new NotFoundError("Session not found.");
  }

  return { sessionId, events };
}

export async function getFunnel(actor, branchId, { from, to }) {
  const scope = await resolveBranch(actor, branchId);
  const funnel = await journeyEventRepository.funnel({ ...scope, from, to });
  return { from, to, ...funnel };
}

export async function purgeExpiredEvents() {
  return journeyEventRepository.deleteOlderThan(JOURNEY_RETENTION_DAYS);
}
