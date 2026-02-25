/**
 * Backfill Migration: Add _id to order items that are missing it.
 * 
 * Problem: Orders created before orderItemSchema was a proper subdocument schema
 * don't have _id on their items. The return system requires items._id for
 * positional updates.
 * 
 * This script:
 * 1. Finds all orders where any item lacks an _id
 * 2. Generates a new ObjectId for each missing _id
 * 3. Updates the order atomically
 * 
 * Safe to run multiple times (idempotent).
 * 
 * Usage: node --input-type=module scripts/backfill-item-ids.js
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

// Find all orders where at least one item is missing _id
const cursor = ordersCollection.find({
  'items': { $elemMatch: { _id: { $exists: false } } }
});

let updated = 0;
let skipped = 0;

for await (const order of cursor) {
  let needsUpdate = false;
  const updatedItems = order.items.map(item => {
    if (!item._id) {
      needsUpdate = true;
      return { ...item, _id: new mongoose.Types.ObjectId() };
    }
    return item;
  });

  if (needsUpdate) {
    await ordersCollection.updateOne(
      { _id: order._id },
      { $set: { items: updatedItems } }
    );
    updated++;
    console.log(`✅ Backfilled _id for order ${order._id} (${updatedItems.length} items)`);
  } else {
    skipped++;
  }
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
await mongoose.disconnect();
process.exit(0);
