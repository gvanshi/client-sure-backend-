import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import dbConnect from "./config/db.js";
import paymentsRoute from "./route/payments.js";
// import dummyCheckoutRoute from "./route/dummyCheckout.js"; // DISABLED - Using PhonePe
import phonepeRoute from "./route/phonepe.js";
import authRoute from "./route/auth.js";
import userRoute from "./route/user.js";
import adminRoute from "./route/admin.js";
import resourcesRoute from "./route/resources.js";
import leadsRoute from "./route/leads.js";
import communityRoute from "./route/community.js";
import notificationsRoute from "./route/notifications.js";
import referralsRoute from "./route/referrals.js";
import composeRoute from "./route/compose.js";
import tokensRoute from "./route/tokens.js";
// import dummyTokenCheckoutRoute from "./route/dummyTokenCheckout.js"; // DISABLED - Using PhonePe
import {
  startTokenRefreshCron,
  startSubscriptionExpiryCron,
} from "./services/cronJobs.js";
import { seedTokenPackages } from "./seed/seedTokenPackages.js";
// import { seedInitialData } from "./services/seedData.js"; // Disabled seed data

dotenv.config();
const PORT = process.env.PORT || 5001;

const app = express();

// CORS Configuration - Comprehensive setup for Vercel deployment
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.BACKEND_URL,
  "http://localhost:3000",
  "http://localhost:5000", // Add backend localhost for dummy checkout
  "http://localhost:5173",
  "https://client-sure-frontend.vercel.app",
  "https://client-sure-backend.vercel.app", // Add backend production URL
  process.env.BASE_URL,
  // Add any preview deployments
  "https://client-sure-frontend-git-main-ysatyam129s-projects.vercel.app",
].filter(Boolean);

// Log allowed origins for debugging
console.log("🔒 CORS Allowed Origins:", allowedOrigins);
console.log("🌐 BASE_URL from env:", process.env.BASE_URL);

app.use(
  cors({
    origin: true, // Allow all origins in development - simplify for debugging
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
      "Cache-Control",
      "Pragma",
      "x-signature",
    ],
    exposedHeaders: [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Credentials",
    ],
    optionsSuccessStatus: 200,
    preflightContinue: false,
  })
);
// Additional middleware
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Trust proxy for Vercel
app.set("trust proxy", 1);

// Database connection
try {
  await dbConnect();
} catch (error) {
  console.error("Failed to connect to database:", error.message);
  process.exit(1);
}

// Seed data disabled - only user-generated data will be stored
// seedInitialData();

// Seed token packages on startup - DISABLED to prevent data reset on every deployment
// Run manually using: node src/seed/seedTokenPackages.js
// seedTokenPackages().catch(console.error);

// Start cron jobs
startTokenRefreshCron();
startSubscriptionExpiryCron();

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "ClientSure API is working",
    status: "success",
    timestamp: new Date().toISOString(),
    cors: {
      allowedOrigins: allowedOrigins,
      requestOrigin: req.get("Origin") || "No origin header",
    },
  });
});

// Health check with CORS debugging
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    cors: {
      configured: true,
      allowedOrigins: allowedOrigins,
      requestOrigin: req.get("Origin") || "No origin header",
      userAgent: req.get("User-Agent"),
    },
    environment: process.env.NODE_ENV || "development",
  });
});

// API Health check endpoint for frontend compatibility
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "ClientSure API is healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    database: "connected",
    environment: process.env.NODE_ENV || "development",
    cors: {
      configured: true,
      requestOrigin: req.get("Origin") || "No origin header",
    },
  });
});

app.use("/api/payments", paymentsRoute);
app.use("/api/phonepe", phonepeRoute); // PhonePe payment gateway
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/admin", adminRoute);
app.use("/api/resources", resourcesRoute);
app.use("/api/leads", leadsRoute);
app.use("/api/community", communityRoute);
app.use("/api/notifications", notificationsRoute);
app.use("/api/referrals", referralsRoute);
app.use("/api/compose", composeRoute);
app.use("/api/tokens", tokensRoute);

// Dummy checkout routes - DISABLED (PhonePe is now the primary payment gateway)
// Uncomment these if you need to temporarily revert to dummy checkout
// app.use("/", dummyCheckoutRoute);
// app.use("/api", dummyTokenCheckoutRoute);

app.listen(PORT, () => {
  console.log(`🚀 ClientSure Server is running on port ${PORT}`);
  console.log(
    `💳 Payment endpoint: ${
      process.env.BACKEND_URL || "http://localhost:" + PORT
    }/api/payments/create-order`
  );
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔒 CORS configured for origins:`, allowedOrigins);
});

// Export for Vercel
export default app;
