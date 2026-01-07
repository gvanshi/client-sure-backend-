import { Lead, User } from "../../models/index.js";
import EmailFeedback from "../../models/EmailFeedback.js";
import * as XLSX from "xlsx";
import {
  calculateEffectiveTokens,
  deductTokensWithPriority,
  cleanExpiredTokens,
} from "../../utils/tokenUtils.js";
import {
  createTransporter,
  sendEmailWithRetry,
} from "../../utils/emailUtils.js";

// GET /api/auth/leads
export const getLeads = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      page = 1,
      limit = 20,
      category,
      city,
      country,
      startDate,
      endDate,
    } = req.query;
    const skip = (page - 1) * limit;

    // Get user's accessed leads first
    const user = await User.findById(userId).select("accessedLeads");
    const accessedLeadIds =
      user?.accessedLeads?.map((item) => item.leadId.toString()) || [];

    // Build query - only active leads that user hasn't accessed
    let query = {
      isActive: true,
      _id: { $nin: accessedLeadIds }, // Exclude accessed leads
    };

    // Apply filters
    if (category) {
      query.category = category;
    }
    if (city) {
      query.city = city;
    }
    if (country) {
      query.country = country;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const leads = await Lead.find(query)
      .sort({ uploadSequence: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(query);

    res.json({
      leads: leads.map((lead) => ({
        id: lead._id,
        leadId: lead.leadId,
        name: lead.name,
        email: lead.email,
        linkedin: lead.linkedin,
        lastVerifiedAt: lead.lastVerifiedAt,
        phone: lead.phone,
        facebookLink: lead.facebookLink,
        websiteLink: lead.websiteLink,
        googleMapLink: lead.googleMapLink,
        instagram: lead.instagram,
        addressStreet: lead.addressStreet,
        city: lead.city,
        country: lead.country,
        category: lead.category,
        isActive: lead.isActive,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        isAccessedByUser: false, // All leads here are locked
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + leads.length < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/leads/:id/access
export const accessLead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const lead = await Lead.findById(id);
    if (!lead || !lead.isActive) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const user = await User.findById(userId).populate("subscription.planId");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if subscription is active
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      return res.status(403).json({
        error: "Subscription expired",
        needsRenewal: true,
      });
    }

    // Clean expired tokens first
    await cleanExpiredTokens(user);

    // Check if user has enough effective tokens (daily + prize)
    const effectiveTokens = calculateEffectiveTokens(user);
    if (effectiveTokens < 1) {
      return res.status(403).json({
        error: "Insufficient tokens",
        message: "You need 1 token to access this lead",
        availableTokens: effectiveTokens,
      });
    }

    // Deduct 1 token using priority system (daily first, then prize)
    const deductionResult = await deductTokensWithPriority(user._id, 1);
    if (!deductionResult.success) {
      return res.status(500).json({
        error: "Token deduction failed",
        message: "Error processing token deduction",
      });
    }

    // Add to accessed leads history
    if (!user.accessedLeads) {
      user.accessedLeads = [];
    }
    user.accessedLeads.unshift({
      leadId: lead._id,
      accessedAt: new Date(),
    });

    // Keep only last 100 accessed leads
    if (user.accessedLeads.length > 100) {
      user.accessedLeads = user.accessedLeads.slice(0, 100);
    }

    // Add user to lead's accessedBy array
    if (!lead.accessedBy.includes(userId)) {
      lead.accessedBy.push(userId);
      await lead.save();
    }

    await user.save();

    res.json({
      message: "Lead access granted",
      lead: {
        id: lead._id,
        leadId: lead.leadId,
        name: lead.name,
        email: lead.email,
        linkedin: lead.linkedin,
        lastVerifiedAt: lead.lastVerifiedAt,
        phone: lead.phone,
        facebookLink: lead.facebookLink,
        websiteLink: lead.websiteLink,
        googleMapLink: lead.googleMapLink,
        instagram: lead.instagram,
        addressStreet: lead.addressStreet,
        city: lead.city,
        country: lead.country,
        category: lead.category,
      },
      tokensRemaining: deductionResult.totalRemaining,
      tokenBreakdown: {
        dailyTokens: deductionResult.remainingDaily,
        prizeTokens: deductionResult.remainingTemporary,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/leads/get-accessed/:id
export const getAccessedLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const lead = await Lead.findById(id);
    if (!lead || !lead.isActive) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // Check if user has accessed this lead
    const user = await User.findById(userId).select("accessedLeads");
    const accessedLead = user?.accessedLeads?.find(
      (item) => item.leadId.toString() === id
    );

    if (!accessedLead) {
      return res.status(403).json({
        error: "Lead not accessed",
        message: "You need to access this lead first to view details",
      });
    }

    res.json({
      id: lead._id,
      leadId: lead.leadId,
      name: lead.name,
      email: lead.email,
      linkedin: lead.linkedin,
      lastVerifiedAt: lead.lastVerifiedAt,
      phone: lead.phone,
      facebookLink: lead.facebookLink,
      websiteLink: lead.websiteLink,
      googleMapLink: lead.googleMapLink,
      instagram: lead.instagram,
      addressStreet: lead.addressStreet,
      city: lead.city,
      country: lead.country,
      category: lead.category,
      isActive: lead.isActive,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      accessedAt: accessedLead.accessedAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /auth/leads/bulk-access
export const bulkAccessLeads = async (req, res) => {
  try {
    const { leadIds } = req.body;
    const userId = req.user.userId;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: "Lead IDs array is required" });
    }

    // Limit to maximum 100 leads per request
    if (leadIds.length > 100) {
      return res.status(400).json({
        error: "Maximum 100 leads allowed per request",
        requested: leadIds.length,
        maximum: 100,
      });
    }

    const user = await User.findById(userId).populate("subscription.planId");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if subscription is active
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      return res.status(403).json({
        error: "Subscription expired",
        needsRenewal: true,
      });
    }

    // Find all requested leads
    const leads = await Lead.find({
      _id: { $in: leadIds },
      isActive: true,
    });

    if (leads.length !== leadIds.length) {
      return res.status(404).json({
        error: "Some leads not found or inactive",
        found: leads.length,
        requested: leadIds.length,
      });
    }

    // Filter out already accessed leads
    const accessedLeadIds =
      user.accessedLeads?.map((item) => item.leadId.toString()) || [];
    const newLeads = leads.filter(
      (lead) => !accessedLeadIds.includes(lead._id.toString())
    );
    const tokensRequired = newLeads.length;

    if (tokensRequired === 0) {
      return res.status(400).json({
        error: "All requested leads already accessed",
        alreadyAccessed: leads.length,
      });
    }

    // Clean expired tokens first
    await cleanExpiredTokens(user);

    // Check if user has enough effective tokens (daily + prize)
    const effectiveTokens = calculateEffectiveTokens(user);
    if (effectiveTokens < tokensRequired) {
      return res.status(403).json({
        error: "Insufficient tokens",
        required: tokensRequired,
        available: effectiveTokens,
        message: `You need ${tokensRequired} tokens to access these leads`,
      });
    }

    // Deduct tokens using priority system (daily first, then prize)
    const deductionResult = await deductTokensWithPriority(
      user._id,
      tokensRequired
    );
    if (!deductionResult.success) {
      return res.status(500).json({
        error: "Token deduction failed",
        message: "Error processing token deduction",
      });
    }

    // Add to accessed leads history
    if (!user.accessedLeads) {
      user.accessedLeads = [];
    }

    const accessTime = new Date();
    const newAccessEntries = newLeads.map((lead) => ({
      leadId: lead._id,
      accessedAt: accessTime,
    }));

    user.accessedLeads.unshift(...newAccessEntries);

    // Keep only last 100 accessed leads
    if (user.accessedLeads.length > 100) {
      user.accessedLeads = user.accessedLeads.slice(0, 100);
    }

    // Batch update leads' accessedBy arrays for better performance
    const leadsToUpdate = newLeads.filter(
      (lead) => !lead.accessedBy.includes(userId)
    );

    if (leadsToUpdate.length > 0) {
      await Lead.bulkWrite(
        leadsToUpdate.map((lead) => ({
          updateOne: {
            filter: { _id: lead._id },
            update: { $addToSet: { accessedBy: userId } },
          },
        }))
      );
    }

    await user.save();

    res.json({
      message: `Successfully accessed ${tokensRequired} leads`,
      accessedLeads: newLeads.map((lead) => ({
        id: lead._id,
        leadId: lead.leadId,
        name: lead.name,
        email: lead.email,
        linkedin: lead.linkedin,
        lastVerifiedAt: lead.lastVerifiedAt,
        phone: lead.phone,
        facebookLink: lead.facebookLink,
        websiteLink: lead.websiteLink,
        googleMapLink: lead.googleMapLink,
        instagram: lead.instagram,
        addressStreet: lead.addressStreet,
        city: lead.city,
        country: lead.country,
        category: lead.category,
      })),
      tokensUsed: tokensRequired,
      tokensRemaining: deductionResult.totalRemaining,
      tokenBreakdown: {
        dailyTokens: deductionResult.remainingDaily,
        prizeTokens: deductionResult.remainingTemporary,
      },
      alreadyAccessed: leads.length - newLeads.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/leads/accessed
export const getAccessedLeads = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      page = 1,
      limit = 10,
      date,
      category,
      city,
      country,
      search,
      startDate,
      endDate,
    } = req.query;

    const user = await User.findById(userId).select("accessedLeads");
    if (!user || !user.accessedLeads) {
      return res.json({
        leads: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // 1. Filter accessedLeads by Access Date if provided
    let filteredAccessList = user.accessedLeads;
    if (date) {
      const filterDate = new Date(date);
      const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));

      filteredAccessList = filteredAccessList.filter((item) => {
        const accessedDate = new Date(item.accessedAt);
        return accessedDate >= startOfDay && accessedDate <= endOfDay;
      });
    }

    // 2. Get all lead IDs from the (potentially date-filtered) list
    const accessedLeadIds = filteredAccessList.map((item) => item.leadId);

    // 3. Build query for Leads (Search + Property Filters)
    let leadQuery = { _id: { $in: accessedLeadIds } };

    if (search) {
      const searchRegex = new RegExp(search, "i");
      leadQuery.$or = [
        { name: searchRegex },
        { leadId: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { city: searchRegex },
        { category: searchRegex },
      ];
    }

    if (category) leadQuery.category = category;
    if (city) leadQuery.city = city;
    if (country) leadQuery.country = country;

    // Filter by createdAt date range if provided
    if (startDate || endDate) {
      leadQuery.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        leadQuery.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        leadQuery.createdAt.$lte = end;
      }
    }

    // 4. Fetch matching leads
    const matchingLeads = await Lead.find(leadQuery);

    // 5. Combine Access Info with Lead Details & Maintain Access Order
    // We iterate through 'filteredAccessList' (which is ordered by access time)
    // and keep only those present in 'matchingLeads'.
    const combinedLeads = filteredAccessList
      .map((accessItem) => {
        const leadDetails = matchingLeads.find(
          (l) => l._id.toString() === accessItem.leadId.toString()
        );
        if (!leadDetails) return null; // Filtered out by search/category/etc

        return {
          id: leadDetails._id,
          leadId: leadDetails.leadId,
          name: leadDetails.name,
          email: leadDetails.email,
          city: leadDetails.city,
          country: leadDetails.country,
          category: leadDetails.category,
          accessedAt: accessItem.accessedAt,
          phone: leadDetails.phone,
          websiteLink: leadDetails.websiteLink,
          linkedin: leadDetails.linkedin,
          facebookLink: leadDetails.facebookLink,
          googleMapLink: leadDetails.googleMapLink,
          instagram: leadDetails.instagram,
          addressStreet: leadDetails.addressStreet,
          lastVerifiedAt: leadDetails.lastVerifiedAt,
          createdAt: leadDetails.createdAt,
          updatedAt: leadDetails.updatedAt,
          isAccessedByUser: true,
        };
      })
      .filter((item) => item !== null);

    // 6. Pagination on the memory list
    const totalItems = combinedLeads.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedResults = combinedLeads.slice(startIndex, endIndex);

    res.json({
      leads: paginatedResults,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalItems / limit),
        totalItems: totalItems,
        hasNext: endIndex < totalItems,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/leads/export
export const exportLeadData = async (req, res) => {
  try {
    const { leadId } = req.body;
    const userId = req.user.userId;

    const lead = await Lead.findById(leadId);
    if (!lead || !lead.isActive) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const user = await User.findById(userId).select("accessedLeads");
    const accessedLead = user?.accessedLeads?.find(
      (item) => item.leadId.toString() === leadId
    );

    if (!accessedLead) {
      return res.status(403).json({
        error: "Lead not accessed",
        message: "You need to access this lead first to export data",
      });
    }

    // Format date as DD/MM/YYYY
    const formatDate = (dateString) => {
      if (!dateString) return "N/A";
      const date = new Date(dateString);
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const leadData = {
      "Lead ID": lead.leadId,
      Name: lead.name,
      Email: lead.email,
      Phone: lead.phone || "N/A",
      Category: lead.category || "N/A",
      City: lead.city || "N/A",
      Country: lead.country || "N/A",
      Address: lead.addressStreet || "N/A",
      Website: lead.websiteLink || "N/A",
      LinkedIn: lead.linkedin || "N/A",
      Facebook: lead.facebookLink || "N/A",
      Instagram: lead.instagram || "N/A",
      "Google Maps": lead.googleMapLink || "N/A",
      "Last Verified": formatDate(lead.lastVerifiedAt),
      "Accessed Date": formatDate(accessedLead.accessedAt),
    };

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([leadData]);
    XLSX.utils.book_append_sheet(wb, ws, "Lead Data");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `lead_${lead.leadId}_${Date.now()}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/leads/bulk-export
export const bulkExportLeads = async (req, res) => {
  try {
    const { leadIds } = req.body;
    const userId = req.user.userId;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: "Lead IDs array is required" });
    }

    const user = await User.findById(userId).select("accessedLeads");
    const accessedLeadIds =
      user?.accessedLeads?.map((item) => item.leadId.toString()) || [];

    const validLeadIds = leadIds.filter((id) => accessedLeadIds.includes(id));

    if (validLeadIds.length === 0) {
      return res.status(403).json({
        error: "No accessible leads found",
        message: "You need to access leads first to export data",
      });
    }

    const leads = await Lead.find({
      _id: { $in: validLeadIds },
      isActive: true,
    });

    // Format date as DD/MM/YYYY
    const formatDate = (dateString) => {
      if (!dateString) return "N/A";
      const date = new Date(dateString);
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const leadsData = leads.map((lead) => {
      const accessedLead = user.accessedLeads.find(
        (item) => item.leadId.toString() === lead._id.toString()
      );

      return {
        "Lead ID": lead.leadId,
        Name: lead.name,
        Email: lead.email,
        Phone: lead.phone || "N/A",
        Category: lead.category || "N/A",
        City: lead.city || "N/A",
        Country: lead.country || "N/A",
        Address: lead.addressStreet || "N/A",
        Website: lead.websiteLink || "N/A",
        LinkedIn: lead.linkedin || "N/A",
        Facebook: lead.facebookLink || "N/A",
        Instagram: lead.instagram || "N/A",
        "Google Maps": lead.googleMapLink || "N/A",
        "Last Verified": formatDate(lead.lastVerifiedAt),
        "Accessed Date": formatDate(accessedLead?.accessedAt),
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(leadsData);
    XLSX.utils.book_append_sheet(wb, ws, "Leads Data");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `leads_export_${Date.now()}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/leads/send-email
export const sendBulkEmail = async (req, res) => {
  try {
    console.log("📧 Email sending request received:", {
      subject: req.body.subject,
      type: req.body.type,
      userId: req.user?.userId,
    });

    const {
      subject,
      message,
      type,
      category,
      city,
      country,
      leadIds,
      cc,
      bcc,
    } = req.body;
    const userId = req.user?.userId;

    // Validation
    if (!userId) {
      console.log("❌ User not authenticated");
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!subject || !message || !type) {
      console.log("❌ Validation failed: Missing required fields");
      return res
        .status(400)
        .json({ error: "Subject, message, and type are required" });
    }

    const user = await User.findById(userId).select("accessedLeads name email");
    if (!user) {
      console.log("❌ User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }

    console.log("👤 User found:", { name: user.name, email: user.email });

    const accessedLeadIds =
      user.accessedLeads?.map((item) => item.leadId.toString()) || [];
    console.log("📋 Accessed leads count:", accessedLeadIds.length);

    if (accessedLeadIds.length === 0) {
      console.log("❌ No accessed leads found");
      return res.status(400).json({ error: "No accessed leads found" });
    }

    // Build query based on type
    let query = { _id: { $in: accessedLeadIds }, isActive: true };
    let filterCriteria = {};

    if (type === "category" && category) {
      query.category = category;
      filterCriteria.category = category;
    } else if (type === "city" && city) {
      query.city = city;
      filterCriteria.city = city;
    } else if (type === "country" && country) {
      query.country = country;
      filterCriteria.country = country;
    } else if (type === "selected" && leadIds && leadIds.length > 0) {
      const validLeadIds = leadIds.filter((id) => accessedLeadIds.includes(id));
      query._id = { $in: validLeadIds };
      console.log("🎯 Selected leads:", validLeadIds.length);
    }

    console.log("🔍 Query:", query);
    const leads = await Lead.find(query);
    console.log("📊 Leads found:", leads.length);

    if (leads.length === 0) {
      console.log("❌ No leads found matching criteria");
      return res
        .status(400)
        .json({ error: "No leads found matching criteria" });
    }

    // Create transporter
    console.log("📮 Creating email transporter...");
    let transporter;
    try {
      transporter = createTransporter();
      if (!transporter) {
        console.log("❌ Email transporter creation failed");
        return res
          .status(500)
          .json({ error: "Email service configuration error" });
      }
      console.log("✅ Email transporter created successfully");
    } catch (transporterError) {
      console.error("❌ Transporter creation error:", transporterError);
      return res
        .status(500)
        .json({ error: "Email service initialization failed" });
    }

    const recipients = [];
    let successCount = 0;
    let failedCount = 0;

    // Send emails
    console.log("📤 Starting to send emails...");
    for (const lead of leads) {
      try {
        console.log(`📧 Sending email to: ${lead.email}`);

        const mailOptions = {
          from: `"${user.name}" <${process.env.SMTP_USER}>`,
          to: lead.email,
          subject: subject,
          cc: cc || undefined,
          bcc: bcc || undefined,
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <meta http-equiv="X-UA-Compatible" content="IE=edge">
              <title>${subject}</title>
              <style>
                @media only screen and (max-width: 600px) {
                  .container { width: 100% !important; padding: 10px !important; }
                  .content { padding: 20px !important; }
                }
              </style>
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8fafc;">
              <div class="container" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div class="content" style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #1e293b; font-size: 24px; font-weight: 600; margin: 0; padding: 0;">ClientSure</h1>
                    <div style="width: 50px; height: 3px; background: linear-gradient(90deg, #3b82f6, #1d4ed8); margin: 10px auto; border-radius: 2px;"></div>
                  </div>
                  
                  <div style="margin-bottom: 25px;">
                    <h2 style="color: #1e293b; font-size: 20px; font-weight: 500; margin: 0 0 15px 0;">Hello ${
                      lead.name
                    },</h2>
                  </div>
                  
                  <div style="margin: 25px 0; font-size: 16px; line-height: 1.7; color: #374151;">
                    ${message}
                  </div>
                  
                  <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #f1f5f9;">
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
                        <strong style="color: #1e293b;">Best regards,</strong><br>
                        ${user.name}<br>
                        <span style="color: #3b82f6;">via ClientSure Platform</span>
                      </p>
                    </div>
                  </div>
                  
                  <div style="margin-top: 30px; text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.4;">
                      This email was sent via <strong>ClientSure</strong> - Professional Lead Management Platform<br>
                      © ${new Date().getFullYear()} ClientSure. All rights reserved.
                    </p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `,
        };

        await sendEmailWithRetry(transporter, mailOptions, 2);
        console.log(`✅ Email sent successfully to: ${lead.email}`);

        recipients.push({
          leadId: lead._id,
          email: lead.email,
          name: lead.name,
          status: "sent",
        });
        successCount++;
      } catch (error) {
        console.error(
          `❌ Failed to send email to ${lead.email}:`,
          error.message
        );
        recipients.push({
          leadId: lead._id,
          email: lead.email,
          name: lead.name,
          status: "failed",
          error: error.message,
        });
        failedCount++;
      }
    }

    console.log(
      `📊 Email sending completed: ${successCount} success, ${failedCount} failed`
    );

    // Save email feedback
    const emailFeedback = new EmailFeedback({
      userId,
      subject,
      message,
      emailType: type,
      filterCriteria,
      recipients,
      totalRecipients: leads.length,
      successCount,
      failedCount,
    });

    await emailFeedback.save();
    console.log("💾 Email feedback saved");

    res.json({
      success: true,
      message: `Emails sent successfully to ${successCount} out of ${leads.length} leads`,
      totalRecipients: leads.length,
      successCount,
      failedCount,
      emailFeedbackId: emailFeedback._id,
      recipients: recipients,
    });
  } catch (error) {
    console.error("💥 Email sending error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    // Handle specific error types
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.message,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        error: "Invalid data format",
        details: "Invalid ID format",
      });
    }

    res.status(500).json({
      success: false,
      error: "Email sending failed",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

// GET /api/leads/email-feedback
export const getEmailFeedback = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;
    const total = await EmailFeedback.countDocuments({ userId });

    const emailFeedbacks = await EmailFeedback.find({ userId })
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-recipients");

    res.json({
      emailFeedbacks,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + emailFeedbacks.length < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/auth/leads/filter-options
export const getFilterOptions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select("accessedLeads");
    const accessedLeadIds =
      user?.accessedLeads?.map((item) => item.leadId.toString()) || [];

    const query = { isActive: true, _id: { $nin: accessedLeadIds } };
    const categories = await Lead.distinct("category", query);
    const cities = await Lead.distinct("city", query);
    const countries = await Lead.distinct("country", query);

    res.json({
      categories: categories.filter(Boolean).sort(),
      cities: cities.filter(Boolean).sort(),
      countries: countries.filter(Boolean).sort(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
