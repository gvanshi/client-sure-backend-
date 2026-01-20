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
import * as razorpayService from "../services/razorpayService.js";

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

    if (user) {
      // User exists - update subscription logic will happen after payment
      console.log("User exists:", email);
    } else {
      console.log("New user will be created after payment:", email);
    }

    // Create local Order with pending status
    const clientOrderId = new mongoose.Types.ObjectId().toString();
    console.log("Creating order with amount:", plan.price);

    const order = await Order.create({
      clientOrderId: clientOrderId,
      providerOrderId: `pending_${clientOrderId}`,
      userEmail: email.toLowerCase().trim(),
      userName: name.trim(),
      userPhone: phone?.trim() || null, // Store phone temporarily
      planId: plan._id,
      userId: user ? user._id : null, // Link if user exists, else null
      amount: plan.price,
      status: "pending",
      paymentStatus: "pending",
      type: "subscription",
      referralCode: referralCode || null, // Store referral code for later processing
    });
    console.log("Order created with amount:", order.amount);

    // Create payment in Razorpay
    try {
      const amountInPaisa = Math.round(plan.price * 100);
      const razorpayOrder = await razorpayService.createOrder({
        amount: amountInPaisa,
        receipt: `rcpt_sub_${order._id}`,
        notes: {
          orderId: order._id.toString(),
          type: "subscription",
          referralCode: referralCode || "",
        },
      });

      // Update order with Razorpay details
      order.providerOrderId = razorpayOrder.id;
      order.merchantOrderId = razorpayOrder.id;
      await order.save();

      const paymentPayload = {
        key: process.env.RAZORPAY_KEY_ID,
        orderId: razorpayOrder.id,
        amount: amountInPaisa,
        currency: razorpayOrder.currency,
        redirectUrl: `${process.env.FRONTEND_URL}/payment-success`,
        userEmail: email.toLowerCase().trim(),
        userName: name.trim(),
        userPhone: phone?.trim() || "",
      };

      console.log(
        `Order created with Razorpay: ${order.clientOrderId}, RP Order: ${razorpayOrder.id}`,
      );
      console.log("Sending payment payload:", {
        ...paymentPayload,
        key: paymentPayload.key ? "***" : "MISSING",
      });

      // Return response
      res.json({
        success: true,
        orderId: order.clientOrderId,
        clientOrderId: order.clientOrderId,
        _id: order._id,
        paymentPayload: paymentPayload,
        payload: paymentPayload,
        user: {
          id: user?._id || null,
          name: name,
          email: email,
          phone: phone,
          isNewUser: !user,
        },
      });
    } catch (paymentError) {
      console.error("Payment creation failed:", paymentError);
      await Order.findByIdAndDelete(order._id);
      return res.status(500).json({
        success: false,
        error: "Failed to create payment. Please try again.",
        details: paymentError.message,
      });
    }
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

// sendWelcomeEmail function moved to utils/emailUtils.js
