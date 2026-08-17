import { getMongoClient } from "../db/mongo.js";
import * as stockRepository from "../repositories/stockRepository.js";

const ROUND_SCALE = 4;

function roundQuantity(value) {
  return Math.round(value * 10 ** ROUND_SCALE) / 10 ** ROUND_SCALE;
}

function supportsTransactions(client) {
  const type = client.topology?.description?.type;
  return (
    type === "ReplicaSetWithPrimary" ||
    type === "Sharded" ||
    type === "LoadBalanced"
  );
}

export function planFifoConsumption(batches, quantity) {
  let remaining = quantity;
  const breakdown = [];

  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }

    const batchQuantity = batch.quantity ?? 0;

    if (batchQuantity <= 0) {
      continue;
    }

    const take = roundQuantity(Math.min(batchQuantity, remaining));

    if (take > 0) {
      breakdown.push({
        batchId: batch._id,
        quantity: take,
        unitCost: batch.unitCost ?? 0,
      });
      remaining -= take;
    }
  }

  return {
    breakdown,
    fulfilled: remaining <= 1e-9,
    remaining: roundQuantity(remaining),
  };
}

export function computeFifoCost(batches, quantity, fallbackCost = 0) {
  const plan = planFifoConsumption(batches, quantity);

  let cost = plan.breakdown.reduce((acc, item) => acc + item.quantity * item.unitCost, 0);

  if (!plan.fulfilled) {
    cost += plan.remaining * fallbackCost;
  }

  return cost;
}

async function applyBatchUpdates(batches, breakdown, { session } = {}) {
  const applied = [];

  for (const item of breakdown) {
    const batch = batches.find((candidate) => String(candidate._id) === String(item.batchId));
    const previousQuantity = batch?.quantity ?? 0;
    const nextQuantity = roundQuantity(previousQuantity - item.quantity);

    try {
      await stockRepository.updateBatchQuantity(item.batchId, nextQuantity, { session });
      applied.push({ batchId: item.batchId, previousQuantity });
    } catch (error) {
      for (const entry of applied) {
        await stockRepository
          .updateBatchQuantity(entry.batchId, entry.previousQuantity, { session })
          .catch(() => {});
      }
      throw error;
    }
  }
}

export async function withWriteTransaction(work) {
  const client = getMongoClient();

  if (!supportsTransactions(client)) {
    return { transactionUnsupported: true };
  }

  let session = null;

  try {
    session = client.startSession();
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      await session.abortTransaction().catch(() => {});
    }
    throw error;
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }
}

export async function consumeFifo({ tenantId, branchId, ingredientId, quantity }, { session } = {}) {
  const batches = await stockRepository.listBatches({ tenantId, branchId, ingredientId });

  const available = roundQuantity(
    batches.reduce((acc, batch) => acc + (batch.quantity ?? 0), 0)
  );

  if (available + 1e-9 < quantity) {
    return { applied: false, available, breakdown: [] };
  }

  const plan = planFifoConsumption(batches, quantity);

  await applyBatchUpdates(batches, plan.breakdown, { session });

  return { applied: true, available, breakdown: plan.breakdown };
}