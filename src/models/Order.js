import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    providerOrderId: {
      type: String,
      required: true,
      unique: true, // Payment gateway order ID
    },
    clientOrderId: {
      type: String,
      required: true,
      // Removed unique constraint as it's a string representation
    },
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userPhone: {
      type: String,
      required: false,
      trim: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
    type: {
      type: String,
      enum: ["subscription", "token"],
      default: "subscription",
    },
    referralCode: {
      type: String,
      required: false,
      trim: true,
    },
    // PhonePe specific fields
    merchantOrderId: {
      type: String,
      required: false,
      sparse: true,
      index: true,
    },
    phonePeOrderId: {
      type: String,
      required: false,
    },
    phonePeTransactionId: {
      type: String,
      required: false,
    },
    paymentMode: {
      type: String,
      required: false, // UPI_QR, UPI_INTENT, CARD, etc.
    },
    paymentRail: {
      type: mongoose.Schema.Types.Mixed,
      required: false, // UPI details, card details, etc.
    },
    failureReason: {
      type: String,
      required: false,
    },
    completedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for Analytics Optimization
orderSchema.index({ createdAt: -1 });

orderSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Order", orderSchema);
