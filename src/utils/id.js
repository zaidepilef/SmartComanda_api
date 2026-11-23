import { randomBytes } from "node:crypto";

const ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export function toObjectIdHex(id) {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    return null;
  }
  return id;
}

export function isValidObjectIdHex(id) {
  return typeof id === "string" && ID_PATTERN.test(id);
}

// 24-hex id: 4-byte big-endian seconds timestamp + 8 random bytes.
// Same format as the historical ids, so existing rows and API contracts stay valid.
export function generateObjectIdHex() {
  const timestamp = Buffer.alloc(4);
  timestamp.writeUInt32BE(Math.floor(Date.now() / 1000));
  return Buffer.concat([timestamp, randomBytes(8)]).toString("hex");
}
