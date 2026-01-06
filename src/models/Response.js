import mongoose from "mongoose";

const responseSchema = new mongoose.Schema({
  channel: String,
  prompt: String,
  aiText: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Response", responseSchema);