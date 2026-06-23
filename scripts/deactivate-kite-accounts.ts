/**
 * One-off migration: deactivate any existing Kite (Zerodha) accounts after
 * Kite support was removed from the platform.
 *
 * - Sets `isActive: false` on every account with `accountType: "kite"` so they
 *   stop appearing in the app (rows are preserved — this is reversible).
 * - Drops the now-unused `kiteconnectsessions` collection.
 *
 * Run with: npx ts-node scripts/deactivate-kite-accounts.ts
 *
 * Operates directly on the raw collections (not the typed Mongoose model),
 * since the model's `accountType` enum no longer allows "kite".
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from the backend's .env
dotenv.config({ path: path.join(__dirname, '../web-server/.env') });

async function run() {
  const uri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/spikeycoins';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.');

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No DB connection');

    // 1. Deactivate existing Kite accounts (raw collection write)
    const accounts = db.collection('accounts');
    const kiteCount = await accounts.countDocuments({ accountType: 'kite' });
    console.log(`Found ${kiteCount} Kite account(s).`);

    if (kiteCount > 0) {
      const result = await accounts.updateMany(
        { accountType: 'kite' },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
      console.log(`Deactivated ${result.modifiedCount} Kite account(s).`);
    }

    // 2. Drop the unused KiteConnect session collection if present
    const collections = await db
      .listCollections({ name: 'kiteconnectsessions' })
      .toArray();
    if (collections.length > 0) {
      await db.collection('kiteconnectsessions').drop();
      console.log('Dropped `kiteconnectsessions` collection.');
    } else {
      console.log('No `kiteconnectsessions` collection to drop.');
    }

    console.log('Migration complete.');
  } catch (error: any) {
    console.error('Migration error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
