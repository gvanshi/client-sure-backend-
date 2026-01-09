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
    // PhonePe specific fields
    merchantOrderId: {
      type: String,
      required: false,
      sparse: true,
      index: true
    },
    phonePeOrderId: {
      type: String,
      required: false
    },
    phonePeTransactionId: {
      type: String,
      required: false
    },
    paymentMode: {
      type: String,
      required: false // UPI_QR, UPI_INTENT, CARD, etc.
    },
    paymentRail: {
      type: mongoose.Schema.Types.Mixed,
      required: false // UPI details, card details, etc.
    },
    failureReason: {
      type: String,
      required: false
    },
    completedAt: {
      type: Date,
      required: false
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
  }
);

// Compound indexes for efficient queries
tokenTransactionSchema.index({ userId: 1, createdAt: -1 });
tokenTransactionSchema.index({ status: 1, createdAt: -1 });
tokenTransactionSchema.index({ merchantOrderId: 1 });

// Auto-expire tokens after 24 hours (TTL index)
tokenTransactionSchema.index(
  { "metadata.expiresAt": 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.model("TokenTransaction", tokenTransactionSchema);
