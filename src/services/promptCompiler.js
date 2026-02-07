/**
 * Prompt Compiler Service
 * Converts structured token-optimized input into natural language prompts for LLM
 * Implements 30-50% token reduction through compact schema and enum mappings
 */

// Language code to full name mapping
const LANGUAGE_MAP = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  de: "German",
  bn: "Bengali",
  ur: "Urdu",
  ar: "Arabic",
};

// Reading level to instruction mapping
const READING_LEVEL_MAP = {
  simple:
    "Use short, conversational sentences with common words. Keep it friendly and easy to understand.",
  intermediate:
    "Use clear, professional language suitable for business audiences. Balance clarity with professionalism.",
  advanced:
    "Use formal, polished language with precise wording and detailed expressions.",
};

// Tool-specific generation rules
const TOOL_RULES = {
  emails: {
    format: `CRITICAL: Return ONLY valid JSON. No other text before or after.
For single variant: {"subject": "...", "preview": "...", "body": "..."}
For multiple variants: [{"subject": "...", "preview": "...", "body": "..."}, {"subject": "...", "preview": "...", "body": "..."}]
Do NOT include markdown code blocks, explanations, or any text outside the JSON.`,
    structure: [
      "- Start with a compelling subject line (5-10 words)",
      "- Include a preview text (40-60 characters)",
      "- Open with a personalized greeting",
      "- State one specific benefit in the first line",
      "- Keep paragraphs short (2-3 sentences max)",
      "- Include the exact CTA provided",
      "- End with a professional closing",
    ],
    constraints:
      "Ensure the email is scannable, benefit-focused, and conversion-oriented.",
  },
  whatsapp: {
    format: "Return plain text only. No JSON, no markdown.",
    structure: [
      "- Write 1-3 short lines maximum",
      "- Start with a friendly greeting or hook",
      "- Mention one clear benefit or reason to respond",
      "- Include the exact CTA provided",
      "- Use conversational, casual tone",
    ],
    constraints:
      "Keep it brief, direct, and action-oriented. Sound human and approachable.",
  },
  linkedin: {
    format: "Return plain text only. No JSON, no markdown.",
    structure: [
      "- Write 1-2 professional sentences",
      "- Mention a relevant connection or mutual interest",
      "- State the value proposition clearly",
      "- Include the exact CTA provided",
      "- Maintain professional but friendly tone",
    ],
    constraints: "Be concise, professional, and respectful of their time.",
  },
  contracts: {
    format: "Return plain text formatted as a professional contract draft.",
    structure: [
      "- Title: Statement of Work / Service Agreement",
      "- Section 1: Scope of Work (detailed deliverables)",
      "- Section 2: Timeline & Milestones",
      "- Section 3: Payment Terms",
      "- Section 4: Change Request Process",
      "- Section 5: Intellectual Property & Ownership",
      "- Section 6: Sign-off with CTA",
    ],
    constraints:
      "Use clear legal-adjacent language. Be specific about deliverables and terms. Include all standard contract elements.",
  },
};

/**
 * Validates structured input data
 * @param {Object} data - Structured input data
 * @returns {Array} Array of validation errors (empty if valid)
 */
export function validateStructuredInput(data) {
  const errors = [];

  // Required fields
  if (
    !data.tool ||
    !["emails", "whatsapp", "linkedin", "contracts"].includes(data.tool)
  ) {
    errors.push("Invalid or missing tool");
  }

  if (!data.lang || !LANGUAGE_MAP[data.lang]) {
    errors.push("Invalid or missing language code");
  }

  if (!data.lvl || !READING_LEVEL_MAP[data.lvl]) {
    errors.push("Invalid or missing reading level");
  }

  // Word limit validation
  if (data.wl !== undefined && data.wl !== null && data.wl !== "") {
    const wl = Number(data.wl);
    if (isNaN(wl) || wl < 1 || wl > 1000) {
      errors.push("Word limit must be between 1 and 1000");
    }
  }

  // Tool-specific required fields
  if (data.tool === "contracts" && !data.projectScope) {
    errors.push("Project scope is required for contracts");
  }

  if (!data.niche || !data.niche.trim()) {
    errors.push("Niche is required");
  }

  if (data.tool !== "contracts" && (!data.target || !data.target.trim())) {
    errors.push("Target audience is required");
  }

  if (!data.cta || !data.cta.trim()) {
    errors.push("CTA is required");
  }

  return errors;
}

/**
 * Compiles structured data into optimized natural language prompt
 * @param {Object} data - Structured input data
 * @param {number} variants - Number of variants to generate
 * @returns {string} Compiled prompt
 */
export function compilePrompt(data, variants = 1) {
  const {
    tool,
    lang,
    lvl,
    wl,
    variantType,
    niche,
    target,
    cta,
    senderRole,
    senderName,
    senderEmail,
    prospect = {},
    projectScope,
    spamFree = true,
  } = data;

  const languageName = LANGUAGE_MAP[lang];
  const readingInstruction = READING_LEVEL_MAP[lvl];
  const toolConfig = TOOL_RULES[tool];

  // Language enforcement (MANDATORY for non-English)
  const languageEnforcement =
    lang !== "en"
      ? `🔴 CRITICAL REQUIREMENT: You MUST respond ONLY in ${languageName} language. 
Write the ENTIRE ${
          tool === "emails" ? "email (subject, preview, and body)" : "message"
        } completely in ${languageName}.
Do NOT use ANY English words or phrases.
Use proper ${languageName} grammar, vocabulary, and sentence structure.
This is a STRICT requirement - NO EXCEPTIONS ALLOWED.

`
      : "";

  // Spam-free rules
  const spamRules = spamFree
    ? `Spam Prevention Rules:
- Avoid ALL-CAPS text (more than 5 consecutive capital letters)
- Use maximum 1 link (if any)
- Avoid spam trigger words: "guarantee", "buy now", "free!!!", "act now", "risk-free"
- Sound natural, helpful, and human
- No excessive punctuation (!!!, ???)

`
    : "";

  // Word limit constraint
  const wordLimitRule =
    wl && Number(wl) > 0
      ? `Word Limit: Maximum ${wl} words. Stay under this limit strictly.\n\n`
      : "";

  // Sender information with explicit instructions
  const senderInfo = [];
  if (senderRole) senderInfo.push(`Sender role: ${senderRole}`);
  if (senderName) senderInfo.push(`Sender name: ${senderName}`);
  if (senderEmail) senderInfo.push(`Sender email: ${senderEmail}`);

  const senderSection =
    senderInfo.length > 0
      ? `Sender Information:\n${senderInfo.join(
          "\n",
        )}\n\n⚠️ IMPORTANT: Use the ACTUAL sender name "${
          senderName || senderRole
        }" in the ${
          tool === "emails" ? "email" : "message"
        }. DO NOT use placeholders like [Name] or [Sender Name].\n\n`
      : "";

  // Prospect personalization with explicit instructions
  const prospectInfo = [];
  if (prospect.name) prospectInfo.push(`Prospect name: ${prospect.name}`);
  if (prospect.company) prospectInfo.push(`Company: ${prospect.company}`);
  if (prospect.email) prospectInfo.push(`Email: ${prospect.email}`);

  const prospectSection =
    prospectInfo.length > 0
      ? `Prospect Details:\n${prospectInfo.join("\n")}\n\n⚠️ IMPORTANT: ${
          prospect.name
            ? `Address the prospect as "${prospect.name}"`
            : 'Use a generic greeting like "Hello" or "Hi there"'
        }. DO NOT use placeholders like [Name] or [Prospect Name].\n\n`
      : `⚠️ IMPORTANT: Since no prospect name was provided, use a generic greeting like "Hello" or "Hi there". DO NOT use placeholders like [Name].\n\n`;

  // Build the prompt
  const promptParts = [
    languageEnforcement,
    `You are a professional ${tool} copywriter writing from the sender's perspective.`,
    "",
    `Language: ${languageName}`,
    `Reading Level: ${readingInstruction}`,
    "",
    senderSection,
    `Industry/Niche: ${niche}`,
    target ? `Target Audience: ${target}` : "",
    variantType ? `Tone/Style: ${variantType.replace(/_/g, " ")}` : "",
    projectScope ? `Project Scope: ${projectScope}` : "",
    "",
    prospectSection,
    `Call-to-Action (use exactly): "${cta}"`,
    "",
    wordLimitRule,
    spamRules,
    `Output Format:`,
    toolConfig.format,
    "",
    `Content Structure:`,
    ...toolConfig.structure,
    "",
    `Additional Guidelines:`,
    toolConfig.constraints,
    "",
    variants > 1 ? `Generate ${variants} distinct variations.` : "",
    variants > 1 && tool === "emails"
      ? 'Return as JSON array: [{"subject":"...","preview":"...","body":"..."},...]'
      : "",
    variants > 1 && tool !== "emails"
      ? 'Separate each variation with a line containing only "---". Example:\nVariation 1 content...\n\n---\n\nVariation 2 content...'
      : "",
  ];

  return promptParts.filter(Boolean).join("\n");
}

/**
 * Estimates token count for a prompt
 * @param {string} prompt - The prompt text
 * @returns {number} Estimated token count
 */
export function estimateTokens(prompt) {
  return Math.ceil(prompt.length / 4);
}

/**
 * Extracts spam indicators from text
 * @param {string} text - Text to analyze
 * @returns {Array} Array of spam warnings
 */
export function detectSpamIndicators(text) {
  const warnings = [];

  const linkCount = (text.match(/https?:\/\//g) || []).length;
  if (linkCount > 1) warnings.push("Multiple links detected (≤1 recommended)");

  if (/[A-Z]{6,}/.test(text)) warnings.push("ALL-CAPS text detected");

  if (/\b(guarantee|buy now|free!!!|act now|risk[- ]?free)\b/i.test(text)) {
    warnings.push("Spam trigger words detected");
  }

  if (/[!?]{3,}/.test(text)) warnings.push("Excessive punctuation detected");

  return warnings;
}
