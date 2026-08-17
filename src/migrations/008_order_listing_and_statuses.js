const ORDERS_COLLECTION = "orders";

export async function up(db) {
  const orders = db.collection(ORDERS_COLLECTION);

  await orders.createIndex({ tenantId: 1, foodtruckId: 1, createdAt: -1 });
  await orders.createIndex({ status: 1 });

  await orders.updateMany(
    { status: { $exists: false } },
    { $set: { status: "new" } }
  );

  await orders.updateMany(
    { status: { $in: ["pending"] } },
    { $set: { status: "new" } }
  );

  await orders.updateMany(
    { statusHistory: { $exists: false } },
    {
      $set: {
        statusHistory: [
          {
            status: "new",
            at: new Date(),
            by: null,
          },
        ],
      },
    }
  );
}