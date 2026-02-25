/**
 * Backfill Migration: Set default return tracking fields on order items.
 *
 * Problem: Orders created before the orderItemSchema included return fields
 * have items without returnStatus, returnRequestedQty, or returnRequestedAt.
 * These missing fields cause the admin aggregation pipeline to produce
 * false positives (null $ne 'none' is true in MongoDB).
 *
 * This script sets defaults only on items that are missing the fields,
 * preserving any existing return data.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage: node scripts/backfill-return-defaults.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log('Connected to MongoDB');

const db = mongoose.connection.db;
const ordersCollection = db.collection('orders');

// Find orders with items missing returnStatus
const cursor = ordersCollection.find({
  'items': { $elemMatch: { returnStatus: { $exists: false } } }
});

let updated = 0;
let skipped = 0;

for await (const order of cursor) {
  let needsUpdate = false;
  const updatedItems = order.items.map(item => {
    if (item.returnStatus === undefined || item.returnStatus === null) {
      needsUpdate = true;
      return {
        ...item,
        returnStatus: 'none',
        returnRequestedQty: item.returnRequestedQty ?? 0,
        returnRequestedAt: item.returnRequestedAt ?? null
      };
    }
    return item;
  });

  if (needsUpdate) {
    await ordersCollection.updateOne(
      { _id: order._id },
      { $set: { items: updatedItems } }
    );
    updated++;
  } else {
    skipped++;
  }
}

console.log(`Done. Updated: ${updated}, Skipped (already OK): ${skipped}`);
await mongoose.disconnect();
process.exit(0);
