import mongoose from "mongoose";

const tokenTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TokenPackage",
      required: true,
    },
    transactionId: {
      type: String,
      required: false, // Made optional for PhonePe integration
      sparse: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["purchase", "bonus", "refund", "expiry"],
      default: "purchase",
    },
    tokens: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    paymentDetails: {
      orderId: String,
      paymentId: String,
      paymentMethod: String,
      gateway: {
        type: String,
        default: "razorpay",
      },
    },
    // Razorpay specific fields
    razorpayOrderId: {
      type: String,
      required: false,
      sparse: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      required: false,
    },
    razorpaySignature: {
      type: String,
      required: false,
    },
    // Generic payment fields
    currency: {
      type: String,
      default: "INR",
    },
    paymentMethod: {
      type: String, // card, netbanking, upi, etc.
      required: false,
    },
    errorReason: {
      type: String,
      required: false,
    },

    completedAt: {
      type: Date,
      required: false,
    },
    metadata: {
      userAgent: String,
      ipAddress: String,
      purchaseReason: String,
      expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    },
    balanceBefore: {
      type: Number,
      required: false, // Made optional
    },
    balanceAfter: {
      type: Number,
      required: false, // Made optional
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
tokenTransactionSchema.index({ userId: 1, createdAt: -1 });
tokenTransactionSchema.index({ status: 1, createdAt: -1 });

// Auto-expire tokens after 24 hours (TTL index)
tokenTransactionSchema.index(
  { "metadata.expiresAt": 1 },
  { expireAfterSeconds: 0 },
);

export default mongoose.model("TokenTransaction", tokenTransactionSchema);
