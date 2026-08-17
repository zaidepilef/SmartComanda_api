import { ObjectId } from "mongodb";
import { getMongoClient } from "../db/mongo.js";
import { toLoyaltyTransactionDocument } from "../models/loyaltyTransaction.js";

const LOYALTY_TRANSACTIONS_COLLECTION = "loyalty-transactions";

function getLoyaltyTransactionsCollection() {
  return getMongoClient().db().collection(LOYALTY_TRANSACTIONS_COLLECTION);
}

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function createTransaction(transaction) {
  const document = toLoyaltyTransactionDocument({
    ...transaction,
    tenantId: toObjectId(transaction.tenantId),
    branchId: toObjectId(transaction.branchId),
    customerId: toObjectId(transaction.customerId),
    sourceOrderId: toObjectId(transaction.sourceOrderId),
  });

  const result = await getLoyaltyTransactionsCollection().insertOne(document);
  return { ...document, _id: result.insertedId };
}

export async function findBySourceOrderId(sourceOrderId) {
  return getLoyaltyTransactionsCollection().findOne({
    sourceOrderId: toObjectId(sourceOrderId),
  });
}