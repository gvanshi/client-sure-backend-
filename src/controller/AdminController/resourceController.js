import { uploadToImageKit } from "../../config/imagekit.js";
import Resource from "../../models/Resource.js";
import User from "../../models/User.js";
import { sendNewResourceNotification } from "../../utils/emailUtils.js";

// POST /api/admin/resources
export const createResource = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      url: videoUrl,
      thumbnailUrl: providedThumbnailUrl,
    } = req.body;
    const file = req.file;

    // For videos, allow URL input instead of file upload
    if (type === "video" && videoUrl) {
      const resource = new Resource({
        title,
        description,
        type,
        url: videoUrl,
        thumbnailUrl: providedThumbnailUrl || videoUrl, // Use provided thumbnail or video URL as fallback
        previewUrl: videoUrl,
        cloudinaryPublicId: null, // No Cloudinary for URL-based videos
        isActive: true, // Explicitly set to true
      });

      await resource.save();
      console.log("✅ Video resource saved successfully:", {
        id: resource._id,
        title: resource.title,
        isActive: resource.isActive,
        type: resource.type,
      });
      return res.status(201).json(resource);
    }

    // For other types or if no URL provided for video, require file upload
    if (!file) {
      return res
        .status(400)
        .json({ error: "File is required for this resource type" });
    }

    console.log("Uploading file:", {
      type,
      mimetype: file.mimetype,
      size: file.size,
    });

    // Upload to ImageKit from buffer
    let result;

    try {
      // Generate filename with proper extension for PDFs
      const randomStr = Math.random().toString(36).substring(7);
      const fileName =
        type === "pdf"
          ? `${type}_${Date.now()}_${randomStr}.pdf`
          : `${type}_${Date.now()}_${randomStr}`;

      result = await uploadToImageKit(
        file.buffer,
        fileName,
        "/clientsure-resources",
        {
          tags: [type, "resource"],
        },
      );

      console.log("ImageKit upload success:", result.url);
    } catch (uploadError) {
      console.error("ImageKit upload failed:", uploadError);
      return res.status(500).json({
        error: "File upload failed",
        details: uploadError.message,
        suggestion: "Please check ImageKit configuration or try a smaller file",
      });
    }

    // Generate proper URLs for different file types
    let thumbnailUrl = result.url;

    if (type === "pdf") {
      // Generate PDF thumbnail using ImageKit transformation
      // Page 1, small, fast - perfect for cards/lists
      thumbnailUrl = `${result.url}?tr=pg-1,f-jpg,w-300,h-400,c-at_max,q-auto`;
    }

    const resource = new Resource({
      title,
      description,
      type,
      url: result.url,
      thumbnailUrl: thumbnailUrl,
      previewUrl: result.url,
      imagekitFileId: result.fileId,
      isActive: true, // Explicitly set to true
    });

    await resource.save();
    console.log("✅ Resource saved successfully:", {
      id: resource._id,
      title: resource.title,
      isActive: resource.isActive,
      type: resource.type,
    });

    // Notify all users about new resource (Async)
    const notifyUsers = async () => {
      try {
        const users = await User.find({}, "email name");
        console.log(
          `📧 Sending resource notification to ${users.length} users...`,
        );
        for (const user of users) {
          sendNewResourceNotification(user.email, user.name, resource).catch(
            (err) =>
              console.error(
                `Failed to notify ${user.email} about resource:`,
                err,
              ),
          );
        }
      } catch (err) {
        console.error("Error fetching users for notification:", err);
      }
    };
    notifyUsers();

    res.status(201).json(resource);
  } catch (error) {
    console.error("Create resource error:", error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/resources
export const getResources = async (req, res) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/resources/:id
export const getResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }
    res.json(resource);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/admin/resources/:id
export const updateResource = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      isActive,
      url: videoUrl,
      thumbnailUrl: providedThumbnailUrl,
    } = req.body;
    const file = req.file;

    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    // Update fields
    if (title) resource.title = title;
    if (description) resource.description = description;
    if (type) resource.type = type;
    if (isActive !== undefined) resource.isActive = isActive;

    // For videos, allow URL update
    if (type === "video" && videoUrl) {
      resource.url = videoUrl;
      resource.previewUrl = videoUrl;
      if (providedThumbnailUrl) resource.thumbnailUrl = providedThumbnailUrl;
      resource.imagekitFileId = null; // Clear ImageKit ID for URL-based videos
    } else if (file) {
      // Upload new file if provided
      const fileName =
        resource.type === "pdf"
          ? `${resource.type}_${Date.now()}.pdf`
          : `${resource.type}_${Date.now()}`;
      const result = await uploadToImageKit(
        file.buffer,
        fileName,
        "/clientsure-resources",
        {
          tags: [resource.type, "resource"],
        },
      );

      resource.url = result.url;
      resource.imagekitFileId = result.fileId;

      if (resource.type === "pdf") {
        resource.thumbnailUrl = `${result.url}?tr=pg-1,f-jpg,w-300,h-400,c-at_max,q-auto`;
      } else {
        resource.thumbnailUrl = result.url;
      }
      resource.previewUrl = result.url;
    }

    await resource.save();
    res.json(resource);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/admin/resources/:id
export const deleteResource = async (req, res) => {
  try {
    console.log("Deleting resource with ID:", req.params.id);
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: "Resource not found" });
    }

    await Resource.findByIdAndDelete(req.params.id);
    res.json({ message: "Resource deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
