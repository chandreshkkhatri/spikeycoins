import mongoose from "mongoose";
import DatabaseConnection from "../crypto/services/DatabaseConnection";

// In Express, we don't have global caching like Next.js
// But we can still implement a simple cache
// This is kept for backward compatibility with existing code
async function connectDB(): Promise<typeof mongoose> {
  // Use the central DatabaseConnection service
  if (!DatabaseConnection.isConnectionReady()) {
    await DatabaseConnection.initialize();
  }
  
  return mongoose;
}

export default connectDB;











