import jwt from "jsonwebtoken";
import { User, Session } from "../models/index.js";

// JWT Authentication Middleware with Session Validation
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
      console.error("JWT verification error:", jwtError.message);
      if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Invalid token" });
      }
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Token expired",
          sessionRevoked: true, // Flag for frontend to show appropriate message
        });
      }
      return res.status(401).json({ error: "Token verification failed" });
    }

    // Validate decoded token structure - handle different JWT formats
    let userId, sessionId;
    if (decoded.userId) {
      userId = decoded.userId;
      sessionId = decoded.sessionId;
    } else if (decoded.id) {
      userId = decoded.id;
      sessionId = decoded.sessionId;
    } else if (decoded.payload && decoded.payload.userId) {
      userId = decoded.payload.userId;
      sessionId = decoded.payload.sessionId;
    } else if (decoded.payload && decoded.payload.id) {
      userId = decoded.payload.id;
      sessionId = decoded.payload.sessionId;
    } else {
      console.error("Invalid token structure:", decoded);
      return res.status(401).json({ error: "Invalid token structure" });
    }

    // ============================================
    // SESSION VALIDATION (CRITICAL)
    // ============================================

    // Check if sessionId exists in JWT
    if (!sessionId) {
      console.error("No sessionId in token - old token format");
      return res.status(401).json({
        error: "Session invalid. Please login again.",
        sessionRevoked: true,
      });
    }

    // Query MongoDB for matching session
    const session = await Session.findOne({
      userId: userId,
      sessionId: sessionId,
    });

    if (!session) {
      // Session not found = revoked (user logged in from another device)
      console.log(
        `❌ Session revoked for userId: ${userId}, sessionId: ${sessionId}`
      );
      return res.status(401).json({
        error: "Session revoked. Maximum device limit exceeded.",
        sessionRevoked: true, // Flag for frontend to show specific message
      });
    }

    // Update lastActiveAt timestamp for this session
    session.lastActiveAt = new Date();
    await session.save();

    // ============================================
    // USER VALIDATION
    // ============================================

    // Find user and check if still exists
    const user = await User.findById(userId).populate("subscription.planId");
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Check if subscription is still active
    const now = new Date();
    const endDate = new Date(user.subscription.endDate);
    if (user.subscription.endDate && endDate < now) {
      return res.status(401).json({ error: "Subscription expired" });
    }

    // Add user and session info to request object
    req.user = {
      userId: user._id,
      id: user._id,
      email: user.email,
      name: user.name,
      tokens: user.tokens,
      subscription: user.subscription,
      sessionId: sessionId, // Include sessionId for logout
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
