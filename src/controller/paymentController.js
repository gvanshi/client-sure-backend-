import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Plan, Order, User } from "../models/index.js";
import { createTransporter, sendEmailWithRetry } from "../utils/emailUtils.js";
import {
  generateReferralCode,
  validateReferralCode,
  updateReferralStats,
} from "../utils/referralUtils.js";
import * as phonepeService from "../services/phonepeService.js";

// Setup nodemailer transporter
const transporter = createTransporter();

export const createOrder = async (req, res) => {
  try {
    const { planId, name, email, phone, planPrice, planName, referralCode } =
      req.body;
    console.log("Create order with data:", {
      planId,
      name,
      email,
      phone,
      planPrice,
      planName,
    });

    // Validate required fields
    if (!planId || !name || !email) {
      return res.status(400).json({
        error: "Missing required fields: planId, name, email",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Invalid email format",
      });
    }

    // Validate planId exists
    console.log("Looking up plan with ID:", planId);
    let plan = await Plan.findOne({ providerPlanId: planId });

    if (!plan) {
      if (mongoose.Types.ObjectId.isValid(planId)) {
        plan = await Plan.findById(planId);
      }
    }

    if (!plan) {
      return res.status(400).json({
        error: "Invalid plan",
      });
    }

    console.log("Found plan:", {
      id: plan._id,
      name: plan.name,
      price: plan.price,
      dailyTokens: plan.dailyTokens,
    });

    // Check if user already exists
    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Register new user
      console.log("Registering new user:", email);

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

      // Calculate monthly allocation and dates based on plan
      const monthlyAllocation = plan.durationDays * plan.dailyTokens;
      const startDate = new Date();
      const endDate = new Date(
        startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
      );

      console.log("Plan duration:", plan.durationDays, "days");
      console.log("Subscription dates:", { startDate, endDate });

      // Create new user with proper token allocation
      user = new User({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        passwordHash,
        resetTokenHash,
        resetTokenExpires,
        tokens: plan.dailyTokens,
        tokensUsedTotal: 0,
        monthlyTokensTotal: monthlyAllocation,
        monthlyTokensUsed: 0,
        monthlyTokensRemaining: monthlyAllocation,
        referralCode: newReferralCode,
        referredBy: referrer ? referrer._id : null,
        referralStats: {
          totalReferrals: 0,
          activeReferrals: 0,
          totalEarnings: 0,
        },
        subscription: {
          planId: plan._id,
          startDate: startDate,
          endDate: endDate,
          dailyTokens: plan.dailyTokens,
          monthlyAllocation: monthlyAllocation,
        },
      });

      await user.save();
      console.log("New user registered:", user.email);

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
        console.log(
          `Referral relationship created: ${user.email} -> ${referrer.email}`
        );
      }

      // Send welcome email with password reset link
      const planInfo = { planId, planName: plan.name, planPrice: plan.price };
      await sendWelcomeEmail(user, resetToken, planInfo);
    } else {
      console.log("User already exists:", email);
      // Update existing user's subscription for new plan purchase
      const monthlyAllocation = plan.durationDays * plan.dailyTokens;
      const startDate = new Date();
      const endDate = new Date(
        startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
      );

      user.subscription = {
        planId: plan._id,
        startDate: startDate,
        endDate: endDate,
        isActive: true,
        dailyTokens: plan.dailyTokens,
        monthlyAllocation: monthlyAllocation,
      };
      user.tokens = plan.dailyTokens;
      user.monthlyTokensTotal = monthlyAllocation;
      user.monthlyTokensUsed = 0;
      user.monthlyTokensRemaining = monthlyAllocation;

      await user.save();
      console.log("Updated existing user subscription:", user.email);
    }

    // Create local Order with pending status - use actual plan price
    const clientOrderId = new mongoose.Types.ObjectId().toString();
    console.log("Creating order with amount:", plan.price);
    
    const order = await Order.create({
      clientOrderId: clientOrderId,
      providerOrderId: `pending_${clientOrderId}`, // Placeholder, will be updated by PhonePe
      userEmail: email.toLowerCase().trim(),
      userName: name.trim(),
      planId: plan._id,
      userId: user._id, // Link order to user
      amount: plan.price, // Always use plan price from database
      status: "pending",
      paymentStatus: "pending",
      type: "subscription",
      referralCode: referralCode || null,
    });
    console.log("Order created with amount:", order.amount);

    // Create payment in PhonePe
    try {
      // Generate merchant order ID
      const merchantOrderId = phonepeService.generateMerchantOrderId('SUB');
      
      // Convert amount to paisa
      const amountInPaisa = phonepeService.rupeesToPaisa(plan.price);
      
      // Create payment in PhonePe
      const paymentData = {
        merchantOrderId,
        amount: amountInPaisa,
        redirectUrl: `${process.env.FRONTEND_URL}/payment-success?orderId=${order._id}`,
        metaInfo: {
          udf1: order._id.toString(),
          udf2: 'subscription',
          udf3: referralCode || ''
        },
        expireAfter: 900 // 15 minutes
      };
      
      const paymentResponse = await phonepeService.createPayment(paymentData);
      
      // Update order with PhonePe details
      order.merchantOrderId = merchantOrderId;
      order.phonePeOrderId = paymentResponse.orderId;
      order.providerOrderId = paymentResponse.orderId;
      await order.save();
      
      const paymentPayload = {
        checkoutUrl: paymentResponse.redirectUrl,
        redirectUrl: paymentResponse.redirectUrl,
        orderId: paymentResponse.orderId,
        merchantOrderId: merchantOrderId,
        state: paymentResponse.state,
        orderAmount: plan.price,
        userEmail: email.toLowerCase().trim(),
        userName: name.trim(),
      };
      
      console.log(`Order created with PhonePe: ${order.clientOrderId}, PhonePe Order: ${paymentResponse.orderId}`);
      
      // Return response
      res.json({
        success: true,
        orderId: order.clientOrderId,
        clientOrderId: order.clientOrderId,
        _id: order._id, // MongoDB ID for tracking
        paymentPayload: paymentPayload,
        payload: paymentPayload,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          isNewUser: !(await User.findOne({
            email: email.toLowerCase(),
            createdAt: { $lt: user.createdAt },
          })),
        },
      });
    } catch (phonepeError) {
      console.error('PhonePe payment creation failed:', phonepeError);
      
      // Delete the order if payment creation fails
      await Order.findByIdAndDelete(order._id);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment. Please try again.',
        details: phonepeError.message
      });
    }

  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message
    });
  }
};

// Helper function to send welcome email with password reset link
const sendWelcomeEmail = async (user, resetToken, planInfo = null) => {
  try {
    // Create reset link
    const resetLink = `${
      process.env.BASE_URL
    }/reset-password?token=${resetToken}&email=${encodeURIComponent(
      user.email
    )}`;

    // Plan information section
    const planSection = planInfo
      ? `
      <div style="background: #e8f5e8; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #28a745;">Selected Plan:</h3>
        <p><strong>Plan:</strong> ${planInfo.planName}</p>
        <p><strong>Price:</strong> ₹${planInfo.planPrice}</p>
        <p style="color: #666; font-size: 14px; margin-bottom: 0;">Complete your payment to activate your subscription.</p>
      </div>
    `
      : "";

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: "Welcome to ClientSure - Set Your Password",
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
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">Welcome! 🎉</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #007cba;">Hello ${user.name},</h2>
            
            <p>Welcome to ClientSure! Your account has been created successfully.</p>
            
            <p>To get started and secure your account, please set your password by clicking the button below:</p>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${resetLink}" 
                 style="background: #007cba; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                Set Your Password
              </a>
            </p>
            
            ${planSection}
            
            <div style="background: #f8f9fa; padding: 20px; border-left: 4px solid #007cba; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #007cba;">Your Account Details:</h3>
              <p><strong>Name:</strong> ${user.name}</p>
              <p><strong>Email:</strong> ${user.email}</p>
              ${
                user.phone ? `<p><strong>Phone:</strong> ${user.phone}</p>` : ""
              }
              <p><strong>Temporary Password:</strong> ${user.email}</p>
              <p style="color: #666; font-size: 14px; margin-bottom: 0;">You can use your email as password to login temporarily, but we recommend setting a secure password.</p>
            </div>
            
            <p style="margin: 30px 0; color: #666; font-size: 14px;">
              <strong>This link will expire in 24 hours.</strong> If you didn't create this account, you can safely ignore this email.
            </p>
            
            <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all; color: #007cba;">${resetLink}</span>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${
                user.email
              } for your new ClientSure account.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Send email with retry mechanism
    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Welcome email sent to ${user.email}`);

    return true;
  } catch (error) {
    console.error("Send welcome email error:", error);
    return false;
  }
};
