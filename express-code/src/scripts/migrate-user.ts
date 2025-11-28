/**
 * Migration Script: Migrate default_user data to authenticated user
 * 
 * This script migrates all data from the "default_user" userId to a specified
 * authenticated user's ID.
 * 
 * Usage:
 *   1. First, create an account by registering or logging in with Google
 *   2. Get your new user ID from the database or the /api/auth/me endpoint
 *   3. Run this script with: npx ts-node src/scripts/migrate-user.ts <new_user_id>
 * 
 * Example:
 *   npx ts-node src/scripts/migrate-user.ts 674f1234567890abcdef1234
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/flip-safe";

const OLD_USER_ID = "default_user";

async function migrateUser(newUserId: string) {
  console.log("🚀 Starting migration...");
  console.log(`   From: ${OLD_USER_ID}`);
  console.log(`   To: ${newUserId}`);
  console.log("");

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not available");
    }

    // Migrate accounts collection
    const accountsResult = await db.collection("accounts").updateMany(
      { userId: OLD_USER_ID },
      { $set: { userId: newUserId } }
    );
    console.log(`📦 Accounts: ${accountsResult.modifiedCount} documents migrated`);

    // Migrate watchlists collection
    const watchlistsResult = await db.collection("watchlists").updateMany(
      { userId: OLD_USER_ID },
      { $set: { userId: newUserId } }
    );
    console.log(`📋 Watchlists: ${watchlistsResult.modifiedCount} documents migrated`);

    // Summary
    console.log("");
    console.log("✅ Migration completed successfully!");
    console.log("");
    console.log("Summary:");
    console.log(`   - Accounts migrated: ${accountsResult.modifiedCount}`);
    console.log(`   - Watchlists migrated: ${watchlistsResult.modifiedCount}`);
    console.log("");
    console.log("Next steps:");
    console.log("   1. Log in to the app with your new account");
    console.log("   2. Verify your trading accounts and watchlists are visible");
    console.log("   3. Delete this migration script");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
  }
}

// Main execution
const newUserId = process.argv[2];

if (!newUserId) {
  console.error("❌ Error: New user ID is required");
  console.log("");
  console.log("Usage: npx ts-node src/scripts/migrate-user.ts <new_user_id>");
  console.log("");
  console.log("To get your new user ID:");
  console.log("   1. Register or log in with Google at /login");
  console.log("   2. Call GET /api/auth/me with your access token");
  console.log("   3. The response will contain your user ID in the _id field");
  process.exit(1);
}

// Validate ObjectId format
if (!/^[a-f\d]{24}$/i.test(newUserId)) {
  console.error("❌ Error: Invalid user ID format. Must be a 24-character hex string.");
  process.exit(1);
}

migrateUser(newUserId);
