import express from "express";
import crypto from "crypto";
// import { login, register, requestReset, resetPassword, logout, accessResource, getAccessedResources, getUserProfile } from '../controller/authController.js';
import { authenticateToken } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  changePassword,
  getUserProfile,
  login,
  logout,
  logoutDevice,
  register,
  requestReset,
  resetPassword,
  updateUserProfile,
} from "../controller/UserController.js/authController.js";
import {
  accessResource,
  getAccessedResourceById,
  getAccessedResources,
} from "../controller/UserController.js/resources.controller.js";
// leads
import {
  getLeads,
  accessLead,
  getAccessedLeads,
  getAccessedLeadById,
  bulkAccessLeads,
  exportLeadData,
  bulkExportLeads,
  sendBulkEmail,
  getFilterOptions,
} from "../controller/UserController.js/leads.controller.js";
import { User } from "../models/index.js";

const router = express.Router();

// POST /api/auth/register
router.post("/register", register);

// POST /api/auth/login
router.post("/login", login);

// POST /api/auth/logout
router.post("/logout", logout);

// POST /api/auth/request-reset
router.post("/request-reset", requestReset);

// GET /api/auth/reset/:token - Validate reset token
router.get("/reset/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    // Hash the incoming token to match stored hash
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user by token hash and check expiry
    const user = await User.findOne({
      resetTokenHash: resetTokenHash,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    res.json({
      valid: true,
      email: user.email,
      message: "Token is valid",
    });
  } catch (error) {
    console.error("Token validation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/reset/:token
router.post("/reset/:token", resetPassword);

// POST /api/auth/access/:id - Access resource (reduces tokens)
router.post("/access/:id", authenticateToken, accessResource);

// GET /api/auth/accessed-resources - Get user's accessed resources
router.get("/accessed-resources", authenticateToken, getAccessedResources);

// Get /auth/resources/:id
router.get("/resources/:id", authenticateToken, getAccessedResourceById);

// GET /api/auth/profile - Get user profile data
router.get("/profile", authenticateToken, getUserProfile);

// PUT /api/auth/profile - Update user profile
router.put(
  "/profile",
  authenticateToken,
  upload.single("avatar"),
  updateUserProfile,
);

// GET /api/auth/leads
router.get("/leads", authenticateToken, getLeads);

// POST /api/auth/leads/:id/access
router.post("/leads/:id/access", authenticateToken, accessLead);

// GET /api/auth/leads/accessed
router.get("/get-accesse-leads/accessed", authenticateToken, getAccessedLeads);

router.get("/leads/get-accessed/:id", authenticateToken, getAccessedLeadById);

// bulk lead

router.post("/leads/bulk-access", authenticateToken, bulkAccessLeads);

// POST /api/auth/leads/export
router.post("/leads/export", authenticateToken, exportLeadData);

// POST /api/auth/leads/bulk-export
router.post("/leads/bulk-export", authenticateToken, bulkExportLeads);

// POST /api/auth/leads/send-email
router.post("/leads/send-email", authenticateToken, sendBulkEmail);

// GET /api/auth/leads/filter-options
router.get("/leads/filter-options", authenticateToken, getFilterOptions);

// PUT /api/auth/change-password
router.put("/change-password", authenticateToken, changePassword);

// POST /api/auth/logout-device
router.post("/logout-device", logoutDevice);

export default router;
