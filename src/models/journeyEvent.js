export const JOURNEY_EVENT_TYPES = Object.freeze({
  QR_OPENED: "qr_opened",
  MENU_LOADED: "menu_loaded",
  MENU_FAILED: "menu_failed",
  IDENTITY_SUBMITTED: "identity_submitted",
  ITEM_ADDED: "item_added",
  ITEM_REMOVED: "item_removed",
  CART_OPENED: "cart_opened",
  ORDER_SUBMITTED: "order_submitted",
  ORDER_CREATED: "order_created",
  ORDER_FAILED: "order_failed",
});

export const JOURNEY_EVENT_SOURCES = Object.freeze({
  CLIENT: "client",
  SERVER: "server",
});

// Etapas del recorrido, de menor a mayor avance (ver spec customer-journey-viewer).
export const JOURNEY_STAGES = Object.freeze({
  QR_OPENED: "qr_opened",
  IDENTIFIED: "identified",
  WITH_CART: "with_cart",
  ORDER_SUBMITTED: "order_submitted",
  ORDER_FAILED: "order_failed",
  ORDER_CREATED: "order_created",
});

export const JOURNEY_SESSION_HEADER = "x-journey-session";

export const JOURNEY_ABANDON_AFTER_MS = 30 * 60 * 1000;
export const JOURNEY_RETENTION_DAYS = 90;
