import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

// Import routes
import accountsRouter from "./routes/accounts";
import authRouter from "./routes/auth";
import binanceRouter from "./routes/binance";
import dbRouter from "./routes/db";
import fundsRouter from "./routes/funds";
import historicalDataRouter from "./routes/historical-data";
import holdingsRouter from "./routes/holdings";
import notificationsRouter from "./routes/notifications";
import ordersRouter from "./routes/orders";
import positionsRouter from "./routes/positions";
import pricesRouter from "./routes/prices";
import searchRouter from "./routes/search";
import settingsRouter from "./routes/settings";
import tradingRouter from "./routes/trading";
import upstoxRouter from "./routes/upstox";
import watchlistRouter from "./routes/watchlist";
import inviteRouter from "./routes/invite";
import gymRouter from "./routes/gym";

// Import crypto module
import { cryptoRouter, initializeCryptoServices } from "./crypto";

// Import database connection
import connectDB from "./lib/mongodb";

// Import price service for server-side WebSocket
import binancePriceService from "./lib/binance-price-service";

// Import order monitor for auto-cancelling SL/TP
import binanceOrderMonitor from "./lib/binance-order-monitor";

const app: Application = express();
const PORT = process.env.PORT || 8000;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Vite proxy requests)
      if (!origin) return callback(null, true);

      // In development, allow localhost on any port
      if (
        process.env.NODE_ENV !== "production" &&
        origin?.includes("localhost")
      ) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser
app.use(cookieParser());

// Session middleware with MongoDB store (prevents memory leaks in production)
const mongoUrl = process.env.MONGODB_URI || "mongodb://localhost:27017/open-mandi";
app.use(
  session({
    secret: process.env.SESSION_SECRET || "open-mandi-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl,
      collectionName: "sessions",
      ttl: 24 * 60 * 60, // 24 hours in seconds
      autoRemove: "native", // Use MongoDB TTL index for cleanup
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Logging middleware
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Connect to MongoDB
// Connect to MongoDB handled in startServer


// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use("/api/accounts", accountsRouter);
app.use("/api/auth", authRouter);
app.use("/api/binance", binanceRouter);
app.use("/api/db", dbRouter);
app.use("/api/funds", fundsRouter);
app.use("/api/historical-data", historicalDataRouter);
app.use("/api/holdings", holdingsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/positions", positionsRouter);
app.use("/api/prices", pricesRouter);
app.use("/api/search", searchRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/trading", tradingRouter);
app.use("/api/upstox", upstoxRouter);
app.use("/api/watchlist", watchlistRouter);
app.use("/api/invites", inviteRouter);
app.use("/api/gym", gymRouter);

// Crypto API routes
app.use("/api", cryptoRouter);

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Track MongoDB connection status
let isMongoConnected = false;

// Attempt MongoDB connection with retry logic
const connectWithRetry = async (retryCount = 0, maxRetries = 5, delayMs = 5000): Promise<boolean> => {
  try {
    await connectDB();
    isMongoConnected = true;
    console.log("✅ MongoDB connected successfully");
    return true;
  } catch (err) {
    isMongoConnected = false;
    if (retryCount < maxRetries) {
      console.warn(`⚠️ MongoDB connection failed (attempt ${retryCount + 1}/${maxRetries}). Retrying in ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return connectWithRetry(retryCount + 1, maxRetries, delayMs);
    } else {
      console.error("❌ MongoDB connection failed after max retries. Server running in degraded mode.");
      return false;
    }
  }
};

// Background retry if initial connection fails
const startBackgroundRetry = () => {
  const retryInterval = setInterval(async () => {
    if (isMongoConnected) {
      clearInterval(retryInterval);
      return;
    }
    console.log("🔄 Attempting to reconnect to MongoDB...");
    try {
      await connectDB();
      isMongoConnected = true;
      console.log("✅ MongoDB reconnected successfully");
      clearInterval(retryInterval);
      
      // Start services that depend on DB
      console.log("📡 Starting deferred services after DB reconnection...");
      initializeCryptoServices().catch((err) => {
        console.error("Failed to start crypto services:", err);
      });
      binanceOrderMonitor.start().catch((err) => {
        console.error("Failed to start order monitor:", err);
      });
    } catch (err) {
      console.warn("⚠️ MongoDB still unavailable, will retry...");
    }
  }, 30000); // Retry every 30 seconds
};

// Start server
const startServer = async () => {
  // Try to connect to MongoDB (but don't crash if it fails)
  const dbConnected = await connectWithRetry(0, 3, 3000);

  // Start HTTP server regardless of DB status
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`   API URL: http://localhost:${PORT}`);
    console.log(`   MongoDB: ${dbConnected ? "✅ Connected" : "⚠️ Disconnected (degraded mode)"}`);
    
    // Start Binance price service (doesn't need DB)
    console.log("📡 Starting Binance price service...");
    binancePriceService.start();

    if (dbConnected) {
      // Start order monitor for auto-cancelling SL/TP orders
      console.log("📡 Starting Binance order monitor...");
      binanceOrderMonitor.start().catch((err) => {
        console.error("Failed to start order monitor:", err);
      });

      // Start crypto services (Binance WebSocket, Market Overview, etc.)
      console.log("📡 Starting crypto services...");
      initializeCryptoServices().catch((err) => {
        console.error("Failed to start crypto services:", err);
      });
    } else {
      // Start background retry for MongoDB
      console.log("🔄 Starting background MongoDB reconnection...");
      startBackgroundRetry();
    }
  });
};

startServer();

export default app;

