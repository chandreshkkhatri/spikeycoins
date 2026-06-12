import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

// Import routes
import accountsRouter from "./routes/accounts";
import authRouter from "./routes/auth";
import binanceRouter from "./routes/binance";
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
import journalRouter from "./routes/journal";
import adminRouter from "./routes/admin";

// Import crypto module
import { cryptoRouter, initializeCryptoServices } from "./crypto";

// Import markets module
import { marketsRouter } from "./markets/routes";
import { BinanceProvider, getMarketRegistry } from "./markets";

// Import database connection
// import connectDB from "./lib/mongodb";

// Import price service for server-side WebSocket
import binancePriceService from "./lib/binance-price-service";

// Import order monitor for auto-cancelling SL/TP
import binanceOrderMonitor from "./lib/binance-order-monitor";

// Import demo account service
import { demoAccountService } from "./lib/demo-account-service";

// Import cron jobs
import { startResearchCron } from "./jobs/researchCron";

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

      // Allow Vercel deployments (branch previews, etc.)
      if (origin.endsWith('.vercel.app')) {
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

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "spikey-coins-secret-key",
    resave: false,
    saveUninitialized: false,
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

// Connect to MongoDB handled by initializeCryptoServices
// connectDB().catch((err) => {
//   console.error("Failed to connect to MongoDB:", err);
// });

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
app.use("/api/journal", journalRouter);

// Crypto API routes
app.use("/api", cryptoRouter);

// Unified Markets API routes
app.use("/api/markets", marketsRouter);

// Admin routes (requires authentication)
app.use("/api/admin", adminRouter);

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   API URL: http://localhost:${PORT}`);
  
  // Start Binance price service for caching
  console.log("📡 Starting Binance price service...");
  binancePriceService.start();

  // Start order monitor after a delay so user-facing requests take priority
  // during the deploy transition burst.
  console.log("📡 Binance order monitor will start in 30s...");
  setTimeout(() => {
    console.log("📡 Starting Binance order monitor...");
    binanceOrderMonitor.start().catch((err) => {
      console.error("Failed to start order monitor:", err);
    });
  }, 30_000);

  // Start crypto services (Binance WebSocket, Market Overview, etc.)
  console.log("📡 Starting crypto services...");
  initializeCryptoServices()
    .then(async () => {
      // Load demo account config from DB now that DB is connected
      await demoAccountService.initialize();

      // Start research cron job after crypto services are ready
      console.log("📅 Starting research cron job...");
      startResearchCron();
    })
    .catch((err) => {
      console.error("Failed to start crypto services:", err);
    });

  // Register market providers
  console.log("📡 Registering market providers...");
  const marketRegistry = getMarketRegistry();
  marketRegistry.registerProvider(new BinanceProvider());
  // Note: UpstoxProvider requires user auth, registered on-demand
});

export default app;
