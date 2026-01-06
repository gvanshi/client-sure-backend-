import jwt from "jsonwebtoken";
import { User } from "../models/index.js";

// JWT Authentication Middleware
export const authenticateToken = async (req, res, next) => {
  try {
    // Check for token in Authorization header (Bearer TOKEN) or cookies
    const cookieToken = req.cookies?.userToken;
    const headerToken = req.headers.authorization?.replace("Bearer ", "");
    const token = headerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    // Verify JWT token with proper error handling
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Invalid token" });
      }
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired" });
      }
      return res.status(401).json({ error: "Token verification failed" });
    }

    // Validate decoded token structure - handle different JWT formats
    let userId;
    if (decoded.userId) {
      userId = decoded.userId;
    } else if (decoded.id) {
      userId = decoded.id;
    } else if (decoded.payload && decoded.payload.userId) {
      userId = decoded.payload.userId;
    } else if (decoded.payload && decoded.payload.id) {
      userId = decoded.payload.id;
    } else {
      console.error('Invalid token structure:', decoded);
      return res.status(401).json({ error: "Invalid token structure" });
    }

    // Find user and check if still exists
    const user = await User.findById(userId).populate(
      "subscription.planId"
    );
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Check if subscription is still active
    const now = new Date();
    const endDate = new Date(user.subscription.endDate);
    if (user.subscription.endDate && endDate < now) {
      return res.status(401).json({ error: "Subscription expired" });
    }

    // Add user to request object
    req.user = {
      userId: user._id,
      id: user._id,
      email: user.email,
      name: user.name,
      tokens: user.tokens,
      subscription: user.subscription,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Optional: Admin role check middleware
export const requireAdmin = (req, res, next) => {
  // Add admin check logic here if needed
  // For now, just pass through
  next();
};
