import express from "express";
import Response from "../models/Response.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authenticateToken } from "../middleware/auth.js";
import { User } from "../models/index.js";

const router = express.Router();

const languageMap = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
};

router.post("/", authenticateToken, async (req, res) => {
  const {
    channel,
    industry,
    tone,
    goal,
    details,
    language,
    prompt: rawPrompt,
    variants = 3,
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

    // Handle raw prompt from chatbot (Multi-variant generation)
    if (rawPrompt) {
      console.log(`Generating ${variants} variants for user ${userId}`);

      const systemPrompt = `You are a helpful AI assistant.
      Generate ${variants} distinct variations of the following content.
      Return the response ONLY as a JSON array of strings, like: ["Variant 1 text...", "Variant 2 text...", "Variant 3 text..."].
      Do not include any other text or markdown formatting outside the JSON array.
      
      Prompt: ${rawPrompt}`;

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
        console.error(
          "Failed to parse JSON variants, falling back to split:",
          e
        );
        parsedVariants = [aiText]; // Fallback if parsing fails
      }

      // Ensure we have an array
      if (!Array.isArray(parsedVariants)) {
        parsedVariants = [String(parsedVariants)];
      }

      // Save usage stats (Optional: log full prompt)
      await Response.create({
        channel: "chatbot",
        prompt: rawPrompt,
        aiText: aiText, // Store raw response
        userId: userId, // If schema supports it
      });

      // Deduct Token
      user.tokens -= 1;
      // Update usage stats if exists
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
    const prompt = `
आप एक विशेषज्ञ ${channel} संदेश कॉपीराइटर हैं।

महत्वपूर्ण: केवल ${
      languageMap[language] || "English"
    } भाषा में उत्तर दें। कोई अन्य भाषा का उपयोग न करें।

उद्योग: ${industry}
टोन स्टाइल: ${tone}
प्राथमिक लक्ष्य: ${goal}

संदर्भ विवरण (वैकल्पिक, यदि सहायक हो):
${JSON.stringify(details || {}, null, 2)}

आपका कार्य:
- एक अत्यधिक प्रभावी, मानव-ध्वनि वाला ${channel} संदेश लिखें।
- इसे संक्षिप्त रखें (अधिकतम 3-4 पंक्तियाँ)।
- इसे स्पष्ट, आकर्षक और लक्ष्य-उन्मुख बनाएं।
- पूरे संदेश में चयनित टोन बनाए रखें।
- मेटाडेटा (उद्योग, टोन, लक्ष्य, आदि) को आउटपुट में दोहराएं नहीं।
- केवल अंतिम संदेश प्रदान करें, कोई स्पष्टीकरण नहीं।
- सुनिश्चित करें कि पूरा उत्तर केवल ${
      languageMap[language] || "English"
    } भाषा में हो।
`;

    console.log("Generating content with prompt:", prompt);

    const result = await generateWithFallback(prompt);
    const aiText = result.response.text();

    console.log("Gemini response:", aiText);

    // Save in DB
    await Response.create({
      channel,
      prompt,
      aiText,
    });

    // Deduct Token for Compose tool as well (Assuming intended behavior)
    user.tokens -= 1;
    if (typeof user.tokensUsedToday === "number") {
      user.tokensUsedToday += 1;
    }
    await user.save();

    res.json({ ok: true, text: aiText, tokens: user.tokens });
  } catch (error) {
    console.error("Gemini error:", error);
    res.status(500).json({ ok: false, error: "AI request failed" });
  }
});

export default router;
