import { ObjectId } from "mongodb";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export function toObjectIdHex(id) {
  if (typeof id !== "string" || !OBJECT_ID_PATTERN.test(id)) {
    return null;
  }
  return id;
}

export function isValidObjectIdHex(id) {
  return typeof id === "string" && OBJECT_ID_PATTERN.test(id);
}

export function generateObjectIdHex() {
  return new ObjectId().toHexString();
}
