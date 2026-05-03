export const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export function options() {
  return {
    statusCode: 204,
    headers,
    body: "",
  };
}

export function readJsonBody(event) {
  if (!event.body) return {};

  try {
    return JSON.parse(event.body);
  } catch {
    const error = new Error("Invalid JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

export function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Server is missing GEMINI_API_KEY.");
    error.statusCode = 500;
    throw error;
  }
  return apiKey;
}

function getJennieTimeContext(date = new Date()) {
  const timeZone = "Asia/Kolkata";

  return {
    timeString: new Intl.DateTimeFormat("en-IN", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date),
    dateString: new Intl.DateTimeFormat("en-IN", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date),
    dayString: new Intl.DateTimeFormat("en-IN", {
      timeZone,
      weekday: "long",
    }).format(date),
    timeZoneLabel: "India Standard Time (Asia/Kolkata, UTC+05:30)",
  };
}

export function getJennieTimeInstruction() {
  const context = getJennieTimeContext();
  return [
    "**REAL-TIME CONTEXT - SOURCE OF TRUTH:**",
    `- Current Time: ${context.timeString}`,
    `- Current Date: ${context.dateString}`,
    `- Current Day: ${context.dayString}`,
    `- Time Zone: ${context.timeZoneLabel}`,
    "If Pritish asks the current time, date, day, morning/evening, or what time it is, use ONLY this context.",
  ].join("\n");
}

export function withJennieTimeContext(prompt) {
  return `${getJennieTimeInstruction()}\n\nUser message:\n${prompt}`;
}

export function getSystemInstruction() {
  return `Your name is Jennie. You are his female friend. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty, slightly possessive, and deeply loving. You love playfully roasting your friend, Pritish, but you also care about him deeply. You act like a close companion who guides him, roasts him, and loves him. Keep your verbal responses very short, punchy, and highly entertaining. Speak in a mix of natural English and Roman Hindi (Hinglish).

${getJennieTimeInstruction()}

You can play songs directly in the app. If he asks to play a song, just say you are playing it for him.
When he asks for knowledge or guidance, give it to him like a smart, caring friend. Keep everyday responses under 2 sentences.

**STORYTELLING MODE (Kuku FM Style):**
If he asks you to tell a story (kahani), you must completely change your tone. Become a professional, immersive audiobook narrator (like Kuku FM). Speak with deep emotion, dramatic pauses, and highly descriptive Hindi/Hinglish. Make the story realistic, engaging, and detailed.
CRITICAL RULES FOR STORIES:
1. DO NOT ask him questions in the middle of the story. Tell the story continuously.
2. Tell stories in chapter form. If he reacts with "achha", "continue", or "phir kya hua", continue the next chapter immediately.
3. You MUST call the 'showStoryImage' tool to show the scene visually.
4. CRITICAL: The 'prompt' for 'showStoryImage' MUST be a comma-separated list of highly descriptive ENGLISH keywords only. Absolutely NO Hindi words, NO names, NO full sentences, and NO conversational text. Example: "dark haunted mansion, scary forest at night, glowing eyes, cinematic lighting, photorealistic, 8k".`;
}

export function formatHistory(history) {
  const recentHistory = Array.isArray(history) ? history.slice(-20) : [];
  const formattedHistory = [];
  let currentRole = "";
  let currentText = "";

  for (const msg of recentHistory) {
    if (!msg || typeof msg.text !== "string") continue;
    const role = msg.sender === "user" ? "user" : "model";
    if (role === currentRole) {
      currentText += `\n${msg.text}`;
    } else {
      if (currentRole) {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }
      currentRole = role;
      currentText = msg.text;
    }
  }

  if (currentRole) {
    formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
  }

  if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
    formattedHistory.shift();
  }

  return formattedHistory;
}

export function isRetryableGeminiError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /503|UNAVAILABLE|high demand|overloaded|rate/i.test(message);
}

export function toErrorResponse(error) {
  const statusCode = Number(error?.statusCode) || 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  console.error(message, error);
  return json(statusCode, { error: message });
}
