import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Fast lookup by userId
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true, // Fast lookup by sessionId
    },
    deviceInfo: {
      type: String,
      required: true,
      trim: true,
    },
    ipAddress: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true, // For sorting and TTL
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We're managing createdAt manually
  }
);

// TTL Index: Auto-delete sessions after 30 days of inactivity
sessionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

// Compound index for efficient session validation
sessionSchema.index({ userId: 1, sessionId: 1 });

// Update lastActiveAt before saving
sessionSchema.pre("save", function (next) {
  if (this.isNew) {
    this.lastActiveAt = this.createdAt;
  }
  next();
});

export default mongoose.model("Session", sessionSchema);
