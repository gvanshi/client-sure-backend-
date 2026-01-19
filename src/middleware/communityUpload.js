import multer from "multer";
import { uploadToImageKit } from "../config/imagekit.js";
import dotenv from "dotenv";

dotenv.config();

// Custom storage engine for ImageKit
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// Upload middleware
export const communityUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// ImageKit upload function for community posts
export const uploadToImageKitCommunity = async (file) => {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const fileName = `post-${timestamp}-${random}`;

  return await uploadToImageKit(
    file.buffer,
    fileName,
    "/clientsure/community-posts",
    {
      tags: ["community", "post"],
    },
  );
};
