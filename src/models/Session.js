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
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ["web", "android", "ios", "unknown"],
      default: "web",
    },
    token: {
      type: String,
      // required: true, // Optional if you only want to track sessions without storing full JWT
    },
    ipAddress: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // index: true removed to avoid duplicate with explicit index below
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We're managing createdAt manually
  },
);

// TTL Index: Auto-delete sessions after 30 days of inactivity
sessionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
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
