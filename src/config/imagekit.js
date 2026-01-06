import ImageKit from "imagekit";
import dotenv from "dotenv";

dotenv.config();

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

/**
 * Upload file to ImageKit
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} fileName - Name of the file
 * @param {string} folder - Folder path in ImageKit
 * @param {Object} options - Additional upload options
 * @returns {Promise<Object>} Upload result with url, fileId, etc.
 */
export const uploadToImageKit = async (
  fileBuffer,
  fileName,
  folder = "/",
  options = {}
) => {
  try {
    const result = await imagekit.upload({
      file: fileBuffer,
      fileName: fileName,
      folder: folder,
      useUniqueFileName: false, // Changed to false to preserve our filename with extension
      ...options,
    });

    return result;
  } catch (error) {
    console.error("ImageKit upload error:", error);
    throw new Error(`ImageKit upload failed: ${error.message}`);
  }
};

/**
 * Delete file from ImageKit
 * @param {string} fileId - ImageKit file ID
 * @returns {Promise<void>}
 */
export const deleteFromImageKit = async (fileId) => {
  try {
    await imagekit.deleteFile(fileId);
  } catch (error) {
    console.error("ImageKit delete error:", error);
    throw new Error(`ImageKit delete failed: ${error.message}`);
  }
};

/**
 * Get ImageKit URL with transformations
 * @param {string} filePath - File path in ImageKit
 * @param {Array} transformations - Array of transformation objects
 * @returns {string} Transformed URL
 */
export const getImageKitUrl = (filePath, transformations = []) => {
  return imagekit.url({
    path: filePath,
    transformation: transformations,
  });
};

export default imagekit;
