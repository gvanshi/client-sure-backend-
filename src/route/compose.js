import express from "express";
import Response from "../models/Response.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authenticateToken } from "../middleware/auth.js";
import { User } from "../models/index.js";
import {
  validateStructuredInput,
  compilePrompt,
  estimateTokens,
  detectSpamIndicators,
} from "../services/promptCompiler.js";

const router = express.Router();

/**
 * POST /api/compose
 * Production-grade AI content generation endpoint
 * Accepts structured token-optimized input
 */
router.post("/", authenticateToken, async (req, res) => {
  const {
    data,
    variants = 1,
    expectJson = false,
    // Legacy support for old format
    prompt: legacyPrompt,
    tool: legacyTool,
  } = req.body;

  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    if (user.tokens <= 0) {
      return res.status(403).json({ ok: false, error: "Insufficient tokens" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Fallback strategy: try multiple models
    const generateWithFallback = async (inputPrompt) => {
      const models = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-flash-latest",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-1.0-pro",
        "gemini-pro",
      ];

      for (const modelName of models) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          return await model.generateContent(inputPrompt);
        } catch (e) {
          console.warn(`Model ${modelName} failed: ${e.message}`);
        }
      }
      throw new Error("All AI models failed");
    };

    // ============================================
    // NEW: Structured Input (Production Format)
    // ============================================
    if (data) {
      console.log(
        `[Compose] Structured request for tool: ${data.tool}, variants: ${variants}`
      );

      // Validate structured input
      const validationErrors = validateStructuredInput(data);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          ok: false,
          error: "Validation failed",
          details: validationErrors,
        });
      }

      // Compile optimized prompt
      const compiledPrompt = compilePrompt(data, variants);
      const tokenEstimate = estimateTokens(compiledPrompt);

      console.log(`[Compile] Generated prompt (${tokenEstimate} tokens)`);
      console.log(`[Compile] Preview:\n${compiledPrompt.substring(0, 200)}...`);

      // Generate with LLM
      const result = await generateWithFallback(compiledPrompt);
      const aiText = result.response.text();

      console.log(`[LLM] Response received (${aiText.length} chars)`);

      // Parse response based on expectJson flag
      let parsedVariants = [];

      if (expectJson || data.tool === "emails") {
        try {
          let cleanedText = aiText.trim();

          // Remove markdown code blocks
          cleanedText = cleanedText
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();

          // Remove any leading/trailing text before/after JSON
          const jsonStart = cleanedText.search(/[\[{]/);
          const jsonEnd = cleanedText.search(/[\]}]\s*$/);

          if (jsonStart !== -1 && jsonEnd !== -1) {
            cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
          }

          // Try to parse
          parsedVariants = JSON.parse(cleanedText);

          // Ensure array format
          if (!Array.isArray(parsedVariants)) {
            parsedVariants = [parsedVariants];
          }

          // Validate structure for emails
          if (data.tool === "emails") {
            parsedVariants = parsedVariants.map((v) => ({
              subject: String(v.subject || ""),
              preview: String(v.preview || ""),
              body: String(v.body || ""),
            }));
          }

          console.log(
            `[Parse] Successfully parsed ${parsedVariants.length} JSON variants`
          );
        } catch (parseError) {
          console.error("[Parse] JSON parsing failed:", parseError.message);
          console.error("[Parse] Raw AI response:", aiText.substring(0, 500));

          // Fallback: Try to extract JSON objects manually
          try {
            const jsonMatches = aiText.match(
              /\{[^{}]*"subject"[^{}]*"body"[^{}]*\}/g
            );
            if (jsonMatches && jsonMatches.length > 0) {
              parsedVariants = jsonMatches
                .map((match) => {
                  try {
                    return JSON.parse(match);
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean);

              if (parsedVariants.length > 0) {
                console.log(
                  `[Parse] Recovered ${parsedVariants.length} variants using regex`
                );
              } else {
                throw new Error("No valid JSON found");
              }
            } else {
              throw new Error("No JSON pattern found");
            }
          } catch (fallbackError) {
            console.error("[Parse] Fallback parsing also failed");
            // Final fallback: return raw text as single variant
            parsedVariants = [aiText];
          }
        }
      } else {
        // Plain text variants
        // Try to split by common delimiters if multiple variants requested
        if (variants > 1) {
          const splits = aiText.split(/\n\n---\n\n|\n\nVariant \d+:?\n\n/i);
          parsedVariants = splits.filter((s) => s.trim().length > 0);
        } else {
          parsedVariants = [aiText];
        }
      }

      // Enforce exact variant count
      if (parsedVariants.length > variants) {
        // Too many variants - trim to requested count
        console.log(
          `[Parse] Trimming ${parsedVariants.length} variants to ${variants}`
        );
        parsedVariants = parsedVariants.slice(0, variants);
      } else if (
        parsedVariants.length < variants &&
        parsedVariants.length > 0
      ) {
        // Too few variants - duplicate existing ones to reach requested count
        console.log(
          `[Parse] Padding ${parsedVariants.length} variants to ${variants}`
        );
        const original = [...parsedVariants];
        while (parsedVariants.length < variants) {
          const index = parsedVariants.length % original.length;
          parsedVariants.push(original[index]);
        }
      }

      // Save to database
      await Response.create({
        channel: data.tool,
        prompt: compiledPrompt,
        aiText: aiText,
        userId: userId,
      });

      // Deduct token
      user.tokens -= 1;
      if (typeof user.tokensUsedToday === "number") {
        user.tokensUsedToday += 1;
      }
      if (typeof user.tokensUsedTotal === "number") {
        user.tokensUsedTotal += 1;
      }
      await user.save();

      return res.json({
        ok: true,
        variants: parsedVariants,
        tokens: user.tokens,
        meta: {
          tool: data.tool,
          promptTokens: tokenEstimate,
          variantsGenerated: parsedVariants.length,
        },
      });
    }

    // ============================================
    // LEGACY: Raw Prompt Support (Backward Compatibility)
    // ============================================
    if (legacyPrompt) {
      console.log(
        `[Legacy] Generating ${variants} variants for user ${userId}`
      );

      const systemPrompt = `You are a helpful AI assistant.
Generate ${variants} distinct variations of the following content.
Return the response ONLY as a JSON array of strings, like: ["Variant 1 text...", "Variant 2 text...", "Variant 3 text..."].
Do not include any other text or markdown formatting outside the JSON array.

Prompt: ${legacyPrompt}`;

      const result = await generateWithFallback(systemPrompt);
      const aiText = result.response.text();

      let parsedVariants = [];
      try {
        const cleanedText = aiText
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        parsedVariants = JSON.parse(cleanedText);
      } catch (e) {
        console.error("Failed to parse JSON variants:", e);
        parsedVariants = [aiText];
      }

      if (!Array.isArray(parsedVariants)) {
        parsedVariants = [String(parsedVariants)];
      }

      // Enforce exact variant count
      if (parsedVariants.length > variants) {
        console.log(
          `[Legacy] Trimming ${parsedVariants.length} variants to ${variants}`
        );
        parsedVariants = parsedVariants.slice(0, variants);
      } else if (
        parsedVariants.length < variants &&
        parsedVariants.length > 0
      ) {
        console.log(
          `[Legacy] Padding ${parsedVariants.length} variants to ${variants}`
        );
        const original = [...parsedVariants];
        while (parsedVariants.length < variants) {
          const index = parsedVariants.length % original.length;
          parsedVariants.push(original[index]);
        }
      }

      await Response.create({
        channel: legacyTool || "chatbot",
        prompt: legacyPrompt,
        aiText: aiText,
        userId: userId,
      });

      user.tokens -= 1;
      if (typeof user.tokensUsedToday === "number") {
        user.tokensUsedToday += 1;
      }
      await user.save();

      return res.json({
        ok: true,
        variants: parsedVariants,
        tokens: user.tokens,
      });
    }

    // No valid input provided
    return res.status(400).json({
      ok: false,
      error:
        "Invalid request format. Provide either 'data' (structured) or 'prompt' (legacy).",
    });
  } catch (error) {
    console.error("[Compose] Error:", error);
    res
      .status(500)
      .json({ ok: false, error: "AI request failed", details: error.message });
  }
});

export default router;
