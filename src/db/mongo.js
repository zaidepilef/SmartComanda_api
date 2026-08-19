import { MongoClient } from "mongodb";

const CONNECT_TIMEOUT_MS = 5000;

let client = null;
let connected = false;

export async function connectMongo(uri) {
  if (client) {
    return client;
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
  });

  client.on("close", () => {
    connected = false;
  });

  client.on("error", () => {
    connected = false;
  });

  try {
    await client.connect();
    connected = true;
  } catch (error) {
    await client.close().catch(() => {});
    client = null;
    throw error;
  }
}

export function isMongoConnected() {
  return client !== null && connected;
}

export function getMongoClient() {
  return client;
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    connected = false;
  }
}