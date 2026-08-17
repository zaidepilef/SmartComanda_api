import { ObjectId } from "mongodb";
import * as tenantRepository from "../repositories/tenantRepository.js";
import * as customerRepository from "../repositories/customerRepository.js";
import * as loyaltyRepository from "../repositories/loyaltyRepository.js";
import { getMongoClient } from "../db/mongo.js";
import { ORDER_STATUSES } from "../models/order.js";

export async function getRule(tenantId) {
  const tenant = await tenantRepository.findTenantById(tenantId);

  if (!tenant?.loyalty?.pointsPerAmount) {
    return null;
  }

  return {
    pointsPerAmount: tenant.loyalty.pointsPerAmount,
    currency: tenant.loyalty.currency ?? "CLP",
  };
}

export function computePoints(total, rule) {
  if (!rule || rule.pointsPerAmount <= 0 || total <= 0) {
    return 0;
  }

  return Math.floor(total / rule.pointsPerAmount);
}

async function claimOrder(orderId) {
  const objectId = ObjectId.isValid(orderId) ? new ObjectId(orderId) : null;

  if (!objectId) {
    return null;
  }

  return getMongoClient()
    .db()
    .collection("orders")
    .findOneAndUpdate(
      { _id: objectId, pointsAwarded: { $ne: true } },
      { $set: { pointsAwarded: true, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
}

export async function awardForOrder(order, { tenantId, branchId }) {
  if (
    order?.orderType !== "qr" ||
    !order?.clientPhone ||
    order?.status === ORDER_STATUSES.CANCELLED
  ) {
    return null;
  }

  const rule = await getRule(tenantId);

  if (!rule) {
    return null;
  }

  const points = computePoints(order.total, rule);

  if (points <= 0) {
    await claimOrder(order._id);
    return 0;
  }

  const claimed = await claimOrder(order._id);

  if (!claimed) {
    return null;
  }

  const customer = await customerRepository.findByTenantAndPhone(
    tenantId,
    order.clientPhone
  );

  if (!customer) {
    console.warn(
      `Customer for phone ${order.clientPhone} missing while awarding points for order ${order._id}.`
    );
    return 0;
  }

  try {
    await loyaltyRepository.createTransaction({
      tenantId,
      branchId,
      customerId: customer._id,
      type: "earn",
      points,
      sourceOrderId: order._id,
    });

    await customerRepository.incrementBalance(customer._id, points);
  } catch (error) {
    console.error(
      `Failed to persist points for order ${order._id}.`,
      error
    );
    return 0;
  }

  return points;
}