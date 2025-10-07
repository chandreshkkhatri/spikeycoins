import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/flip-safe";

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// In Express, we don't have global caching like Next.js
// But we can still implement a simple cache
let cached: MongooseCache = { conn: null, promise: null };

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts);
  }

  try {
    cached.conn = await cached.promise;
    console.log("✅ Connected to MongoDB");
    return cached.conn;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    cached.promise = null;
    throw error;
  }
}

export default connectDB;
