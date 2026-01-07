import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { uploadToImageKit } from "../../config/imagekit.js";
import { User, Session } from "../../models/index.js";
import Resource from "../../models/Resource.js";
import {
  createTransporter,
  sendEmailWithRetry,
  sendPasswordResetConfirmationEmail,
  sendWelcomeEmail,
} from "../../utils/emailUtils.js";
import {
  generateReferralCode,
  validateReferralCode,
  updateReferralStats,
} from "../../utils/referralUtils.js";
import {
  calculateEffectiveTokens,
  cleanExpiredTokens,
} from "../../utils/tokenUtils.js";

// Setup nodemailer transporter
const transporter = createTransporter();

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, phone, planId, planName, planPrice, referralCode } =
      req.body;
    console.log("Registration form data:", {
      name,
      email,
      phone,
      planId,
      planName,
      planPrice,
    });

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User with this email already exists" });
    }

    // Use email as initial password and hash it
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(email, saltRounds);

    // Validate referral code if provided
    let referrer = null;
    if (referralCode) {
      referrer = await validateReferralCode(referralCode);
      if (!referrer) {
        return res.status(400).json({ error: "Invalid referral code" });
      }
    }

    // Generate reset token for welcome email
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate unique referral code for new user
    let newReferralCode;
    let isUnique = false;
    while (!isUnique) {
      newReferralCode = generateReferralCode();
      const existingUser = await User.findOne({
        referralCode: newReferralCode,
      });
      if (!existingUser) isUnique = true;
    }

    // Create new user with plan information
    const user = new User({
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      passwordHash,
      resetTokenHash,
      resetTokenExpires,
      tokens: 0,
      tokensUsedTotal: 0,
      referralCode: newReferralCode,
      referredBy: referrer ? referrer._id : null,
      referralStats: {
        totalReferrals: 0,
        activeReferrals: 0,
        totalEarnings: 0,
      },
      subscription: {
        planId: planId || null,
        dailyTokens: 0,
        endDate: null,
      },
    });

    await user.save();

    // Add referral relationship if referrer exists
    if (referrer) {
      referrer.referrals.push({
        userId: user._id,
        joinedAt: new Date(),
        isActive: false,
        subscriptionStatus: "pending",
      });
      await referrer.save();
      await updateReferralStats(referrer._id);
    }

    // Send welcome email with password reset link
    const planInfo =
      planId && planName && planPrice ? { planId, planName, planPrice } : null;
    await sendWelcomeEmail(user, resetToken, planInfo);

    // Generate JWT token with nested payload structure
    const token = jwt.sign(
      {
        payload: {
          userId: user._id,
          email: user.email,
        },
        userId: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`New user registered: ${user.email}`);

    // Return token and user info
    res.status(201).json({
      message:
        "User registered successfully. Please check your email to set your password.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        tokens: user.tokens,
        tokensUsedTotal: user.tokensUsedTotal,
        subscription: {
          planId: planId || null,
          planName: planName || null,
          planPrice: planPrice || null,
          dailyTokens: 0,
          endDate: null,
          isActive: false,
        },
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() }).populate(
      "subscription.planId"
    );
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if user has set password
    if (!user.passwordHash) {
      return res
        .status(401)
        .json({ error: "Please set your password first using the email link" });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if subscription is active
    const now = new Date();
    if (user.subscription.endDate && user.subscription.endDate < now) {
      return res
        .status(401)
        .json({ error: "Subscription expired. Please renew your plan." });
    }

    // ============================================
    // TWO-DEVICE SESSION MANAGEMENT (FIFO)
    // ============================================

    // 1. Fetch all active sessions for this user (sorted by creation time, oldest first)
    const existingSessions = await Session.find({ userId: user._id })
      .sort({ createdAt: 1 }) // Oldest first (FIFO)
      .exec();

    console.log(
      `User ${user.email} has ${existingSessions.length} active session(s)`
    );

    // 2. If user already has 2 or more sessions, delete the oldest one
    if (existingSessions.length >= 2) {
      const oldestSession = existingSessions[0];
      await Session.findByIdAndDelete(oldestSession._id);
      console.log(
        `🔄 Revoked oldest session for ${user.email} (sessionId: ${oldestSession.sessionId})`
      );
    }

    // 3. Generate new sessionId using UUID
    const sessionId = uuidv4();

    // 4. Extract device info and IP address
    const deviceInfo = req.headers["user-agent"] || "Unknown Device";
    const ipAddress = req.ip || req.connection.remoteAddress || "Unknown IP";

    // 5. Create new session in MongoDB
    const newSession = new Session({
      userId: user._id,
      sessionId: sessionId,
      deviceInfo: deviceInfo,
      ipAddress: ipAddress,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    });

    await newSession.save();
    console.log(
      `✅ New session created for ${user.email} (sessionId: ${sessionId})`
    );

    // ============================================
    // GENERATE JWT WITH SESSION ID
    // ============================================

    // Generate JWT token with sessionId embedded (15 minutes expiry)
    const token = jwt.sign(
      {
        payload: {
          userId: user._id,
          email: user.email,
          planId: user.subscription.planId?._id,
          sessionId: sessionId, // CRITICAL: Session ID for validation
        },
        userId: user._id,
        email: user.email,
        planId: user.subscription.planId?._id,
        sessionId: sessionId, // CRITICAL: Session ID for validation
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // Short-lived token for security
    );

    console.log(`User logged in: ${user.email}`);

    // Set HTTP-only cookie
    res.cookie("userToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes to match JWT expiry
    });

    // Return user info with session details
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        tokens: user.tokens,
        tokensUsedTotal: user.tokensUsedTotal,
        subscription: {
          planName: user.subscription.planId?.name,
          dailyTokens: user.subscription.dailyTokens,
          endDate: user.subscription.endDate,
          isActive: user.subscription.endDate > now,
        },
      },
      userToken: token,
      sessionInfo: {
        deviceInfo: deviceInfo,
        activeSessions: Math.min(existingSessions.length + 1, 2), // Max 2
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/auth/request-reset
export const requestReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Security: Don't reveal if user exists or not
      return res.json({
        message:
          "If your email is registered, you will receive a password reset link shortly.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save hashed token to user
    user.resetTokenHash = resetTokenHash;
    user.resetTokenExpires = resetTokenExpires;
    await user.save();

    // Create reset link
    const resetLink = `${
      process.env.BASE_URL
    }/reset-password?token=${resetToken}&email=${encodeURIComponent(
      user.email
    )}`;

    // Enhanced email template with better styling
    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: "Reset Your ClientSure Password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #007cba 0%, #005a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">Password Reset Request</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #007cba;">Hello ${user.name},</h2>
            
            <p>We received a request to reset your password for your ClientSure account.</p>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${resetLink}" 
                 style="background: #007cba; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </p>
            
            <p style="margin: 30px 0; color: #666; font-size: 14px;">
              <strong>This link will expire in 24 hours.</strong> If you didn't request this, you can safely ignore this email.
            </p>
            
            <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all; color: #007cba;">${resetLink}</span>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${
                user.email
              } because someone requested a password reset for a ClientSure account.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Send email with retry mechanism
    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Password reset email sent to ${user.email}`);

    res.json({
      message:
        "If your email is registered, you will receive a password reset link shortly.",
    });
  } catch (error) {
    console.error("Request reset error:", error);
    // Even if email fails, we still return success for security reasons
    res.json({
      message:
        "If your email is registered, you will receive a password reset link shortly.",
    });
  }
};

// POST /api/auth/reset/:token
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    console.log("🔑 Reset password attempt:", {
      token: token?.substring(0, 10) + "...",
      hasPassword: !!password,
      tokenLength: token?.length,
    });

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    // Hash the incoming token to match stored hash
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    console.log(
      "🔍 Looking for token hash:",
      resetTokenHash.substring(0, 10) + "..."
    );

    // Find user by token hash and check expiry
    const user = await User.findOne({
      resetTokenHash: resetTokenHash,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      console.log("❌ No user found with valid token");
      // Check if token exists but expired
      const expiredUser = await User.findOne({
        resetTokenHash: resetTokenHash,
      });
      if (expiredUser) {
        console.log("⏰ Token found but expired for user:", expiredUser.email);
        return res.status(400).json({
          error:
            "Reset token has expired. Please request a new password reset.",
        });
      }
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    console.log("✅ Valid token found for user:", user.email);

    // Hash new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update user password and clear reset token
    user.passwordHash = passwordHash;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    // Send confirmation email
    await sendPasswordResetConfirmationEmail(user);

    console.log(`Password reset successful for ${user.email}`);

    res.json({
      message: "Password reset successful",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Helper function to send password setup email (used by webhook)
export const sendPasswordSetupEmail = async (user, isNewUser = true) => {
  try {
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save token to user
    user.resetTokenHash = resetTokenHash;
    user.resetTokenExpires = resetTokenExpires;
    await user.save();

    // Create setup link
    const setupLink = `${
      process.env.BASE_URL
    }/reset-password?token=${resetToken}&email=${encodeURIComponent(
      user.email
    )}`;

    const subject = isNewUser
      ? "Welcome to ClientSure - Set Your Password"
      : "Reset Your ClientSure Password";
    const greeting = isNewUser
      ? "Welcome to ClientSure! 🎉"
      : "Password Reset Request";
    const message = isNewUser
      ? "Your subscription has been activated successfully! To access your dashboard, please set up your password:"
      : "You requested to reset your password. Click the button below to set your new password:";

    // Enhanced email template
    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #007cba 0%, #005a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">${greeting}</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #007cba;">Hello ${user.name},</h2>
            
            <p>${message}</p>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${setupLink}" 
                 style="background: #007cba; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                ${isNewUser ? "Set Your Password" : "Reset Password"}
              </a>
            </p>
            
            <p style="margin: 30px 0; color: #666; font-size: 14px;">
              <strong>This link will expire in 24 hours.</strong> If you didn't request this, you can safely ignore this email.
            </p>
            
            <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all; color: #007cba;">${setupLink}</span>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${
                user.email
              } for your ClientSure account.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Send email with retry mechanism
    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Password setup email sent to ${user.email}`);

    return true;
  } catch (error) {
    console.error("Send password setup email error:", error);
    return false;
  }
};

// POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    // Extract sessionId from authenticated user (set by auth middleware)
    const sessionId = req.user?.sessionId;

    if (sessionId) {
      // Delete the session from MongoDB
      const deletedSession = await Session.findOneAndDelete({ sessionId });

      if (deletedSession) {
        console.log(
          `🔓 Session deleted for user ${req.user.email} (sessionId: ${sessionId})`
        );
      } else {
        console.log(`⚠️ Session not found for sessionId: ${sessionId}`);
      }
    }

    // Clear the HTTP-only cookie
    res.clearCookie("userToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PUT /api/auth/profile
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, phone } = req.body;
    const file = req.file;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.name = name.trim();
    if (phone !== undefined) {
      user.phone = phone ? phone.trim() : null;
    }

    // Upload avatar if provided
    if (file) {
      const fileName = `avatar_${userId}_${Date.now()}`;
      const result = await uploadToImageKit(file.buffer, fileName, "/avatars", {
        transformation: [
          {
            width: "200",
            height: "200",
            cropMode: "fo-face",
          },
        ],
        tags: ["avatar", "user"],
      });
      user.avatar = result.url;
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/auth/profile
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).populate("subscription.planId");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Clean expired tokens first
    await cleanExpiredTokens(user);

    // Calculate effective tokens (daily + prize)
    const effectiveTokens = calculateEffectiveTokens(user);

    // Calculate time remaining for prize tokens
    let prizeTokenTimeRemaining = 0;
    if (user.temporaryTokens && user.temporaryTokens.expiresAt) {
      prizeTokenTimeRemaining = Math.max(
        0,
        new Date(user.temporaryTokens.expiresAt) - new Date()
      );
    }

    res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
      },
      tokens: {
        daily: user.tokens,
        dailyUsed: user.tokensUsedToday || 0,
        dailyLimit: user.subscription.dailyTokens || 100,
        monthlyTotal: user.monthlyTokensTotal,
        monthlyUsed: user.monthlyTokensUsed,
        monthlyRemaining: user.monthlyTokensRemaining,
        totalUsed: user.tokensUsedTotal,
        // Prize token information
        prizeTokens: user.temporaryTokens?.amount || 0,
        prizeTokenType: user.temporaryTokens?.prizeType || null,
        prizeTokenExpiresAt: user.temporaryTokens?.expiresAt || null,
        prizeTokenTimeRemaining: prizeTokenTimeRemaining,
        // Effective total tokens
        effectiveTokens: effectiveTokens,
      },
      subscription: {
        plan: user.subscription.planId
          ? {
              id: user.subscription.planId._id,
              name: user.subscription.planId.name,
              price: user.subscription.planId.price,
            }
          : null,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
        isActive: user.subscription.endDate
          ? new Date() < user.subscription.endDate
          : false,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
