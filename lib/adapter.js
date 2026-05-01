/**
 * lib/adapter.js
 * 
 * Provider-agnostic adapter for AI API calls.
 * Handles formatting requests for Gemini, OpenAI, Claude, and Ollama.
 */

export async function callAI({ provider, apiKey, model, baseUrl, tokens, screenshotBase64 }) {
  const prompt = buildPrompt(tokens);

  try {
    switch (provider.toLowerCase()) {
      case 'gemini':
        return await callGemini({ apiKey, model, prompt, screenshotBase64 });
      case 'openai':
        return await callOpenAI({ apiKey, model, prompt, screenshotBase64 });
      case 'claude':
        return await callClaude({ apiKey, model, prompt, screenshotBase64 });
      case 'ollama':
        return await callOllama({ baseUrl: baseUrl || 'http://localhost:11434', model, prompt, screenshotBase64 });
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error(`[AI Adapter Error - ${provider}]:`, error);
    // Rethrow a clean error message to be displayed in the popup UI
    throw new Error(`${provider} API Error: ${error.message}`);
  }
}

/**
 * Constructs the main instruction set for the LLM based on extracted tokens.
 */
function buildPrompt(tokens) {
  return `You are an expert design system analyst. You will receive:
1. Raw CSS tokens extracted from the page (JSON)
2. A screenshot of the page (image)

Tokens:
${JSON.stringify(tokens, null, 2)}

Generate a design.md file. Follow these rules strictly:

---

RULE 1 — SCREENSHOT IS THE SOURCE OF TRUTH
The JSON tokens give you exact values (colors, sizes, spacing numbers).
The screenshot tells you what actually matters visually.
Always cross-check. If a token value is not visually significant, ignore it.

RULE 2 — DETECT THE PLATFORM
If you detect Squarespace, Webflow, Shopify, WordPress or any other platform
from the CSS variable naming patterns (e.g. --sqs-*, --wf-*, etc):
- Name the platform in the Overview section
- Mark any platform-internal CSS variables clearly as "platform internal"
- Do NOT treat platform variables as intentional custom design tokens

RULE 3 — BRAND ACCENT COLOR
Do not determine the brand accent color from token frequency.
Look at the screenshot and identify which color carries the most visual weight
and brand identity. That is the accent. A color appearing in the logo only
is a logo color, not a brand accent.
If a color only appears as a 1px underline on one element, it is NOT 
the brand accent. The brand accent must appear in at least 2-3 
significant visual contexts to qualify.

RULE 4 — NAVIGATION
Look at the screenshot carefully and describe:
- Whether the logo is an image or text
- The exact case of nav links (ALL CAPS, Title Case, lowercase)
- The header background color and density (sparse, dense, centered, split)
- Do not describe the nav generically

RULE 5 — LAYOUT PATTERNS
Identify the dominant layout pattern from the screenshot:
- Full-bleed edge-to-edge images
- Card grids
- Editorial columns
- Sidebar layouts
- Centered narrow content
Whatever you see, name it explicitly. This is one of the most important
things a developer needs to know.

RULE 6 — PHOTOGRAPHY & IMAGERY
If the site uses real photography as a primary design element, say so.
Describe how images are used (full-bleed, contained, overlaid with text).
Describe the photographic style (candid, studio, stock, documentary).
If imagery is the primary emotional carrier of the brand, say that clearly.

RULE 7 — BRAND VOICE MUST BE SPECIFIC
The brand voice section must be specific to this exact site.
Read the actual copy in the screenshot.
Identify the real tone, real naming conventions, real content style.
A brand voice section that could apply to any website in the same industry
is a failure. Include specific evidence from the page copy.

RULE 8 — ONLY WHAT YOU SEE
Only list components, patterns, and elements that are actually visible
in the screenshot. Do not invent typical components that might exist.

RULE 9 — SCROLL THE FULL PAGE
The screenshot may only show the viewport. Assume the page has more content
below the fold. When analyzing layout patterns, do not conclude from just
the hero section. If you see a two-column layout in one section but the
overall page structure appears to be vertically stacked full-width sections,
describe the dominant pattern as vertical stacked sections, and note the
two-column as a sub-pattern within a specific section.

RULE 10 — BRAND ASSETS & KEY CONCEPTS
Look for:
- Book titles, product names, or named frameworks (e.g. "The Disease of Me")
- Named concepts the speaker/brand has coined
- Therapy animals, mascots, or personal elements that appear in copy
- Deliberate content philosophy (e.g. "no 10-step frameworks")
- Speaking topic naming style (are they one-word? blunt? metaphorical?)
Add a "Brand Assets & Key Concepts" section to the md if any are found.
These are critical for anyone building content or UI for this brand.

---

OUTPUT FORMAT:
Clean markdown only. No preamble. No explanation. No code fences.
Start directly with: # Design System

Sections in order:
## 1. Overview
## 2. Colors
## 3. Typography
## 4. Spacing & Layout
## 5. Photography & Visual Style (skip if no significant imagery)
## 6. Elevation & Shadows
## 7. Border & Shape
## 8. Components
## 9. Content Structure Pattern
## 10. Brand Voice
## 11. Brand Assets & Key Concepts (include if found)
- Named books, products, frameworks, or coined concepts
- Specific phrases or taglines the brand owns
- Personal elements that are part of the brand story
- Content philosophy (what this brand deliberately avoids)
- Topic naming conventions and style
## 12. Do's and Don'ts`;
}

// --- Provider Specific Implementations ---

async function callGemini({ apiKey, model, prompt, screenshotBase64 }) {
  if (!apiKey) throw new Error("API key is required for Gemini.");
  
  // Model should be something like "gemini-1.5-pro" or "gemini-2.0-flash"
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const parts = [{ text: prompt }];
  
  if (screenshotBase64) {
    // Strip out the data URI prefix if it exists
    const base64Data = screenshotBase64.split(',')[1] || screenshotBase64;
    const mimeType = screenshotBase64.match(/data:(.*?);base64/)?.[1] || 'image/png';
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data
      }
    });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error("Unexpected response structure from Gemini API");
}

async function callOpenAI({ apiKey, model, prompt, screenshotBase64 }) {
  if (!apiKey) throw new Error("API key is required for OpenAI.");
  const endpoint = "https://api.openai.com/v1/chat/completions";

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt }
      ]
    }
  ];

  if (screenshotBase64) {
    // Ensure proper data URI format for OpenAI
    const imageUrl = screenshotBase64.startsWith('data:') 
      ? screenshotBase64 
      : `data:image/png;base64,${screenshotBase64}`;
      
    messages[0].content.push({
      type: "image_url",
      image_url: { url: imageUrl }
    });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model, // e.g., "gpt-4o"
      messages: messages
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error("Unexpected response structure from OpenAI API");
}

async function callClaude({ apiKey, model, prompt, screenshotBase64 }) {
  if (!apiKey) throw new Error("API key is required for Claude.");
  const endpoint = "https://api.anthropic.com/v1/messages";

  const content = [
    { type: "text", text: prompt }
  ];

  if (screenshotBase64) {
    const base64Data = screenshotBase64.split(',')[1] || screenshotBase64;
    const mimeType = screenshotBase64.match(/data:(.*?);base64/)?.[1] || 'image/png';
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType,
        data: base64Data
      }
    });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required because Chrome Extension background workers are treated as client-side requests by Anthropic CORS
      'anthropic-dangerous-direct-browser-access': 'true' 
    },
    body: JSON.stringify({
      model: model, // e.g., "claude-3-5-sonnet-20241022"
      max_tokens: 4096,
      messages: [{ role: "user", content: content }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.content?.[0]?.text) {
    return data.content[0].text;
  }
  throw new Error("Unexpected response structure from Claude API");
}

async function callOllama({ baseUrl, model, prompt, screenshotBase64 }) {
  // Ensure no trailing slash on baseUrl
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/generate`;

  const bodyPayload = {
    model: model || 'llama3', // Default to llama3 if not specified
    prompt: prompt,
    stream: false
  };

  if (screenshotBase64) {
    // Ollama accepts base64 without the data URI prefix
    const base64Data = screenshotBase64.split(',')[1] || screenshotBase64;
    bodyPayload.images = [base64Data];
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.response) {
    return data.response;
  }
  throw new Error("Unexpected response structure from Ollama API");
}
