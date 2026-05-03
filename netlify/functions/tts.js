import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, json, options, readJsonBody, toErrorResponse } from "./_jennie.js";

async function synthesizeJennieAudio(ai, text) {
  const attempts = [
    text,
    `Say this in Jennie's witty, sassy, dramatic Hinglish female voice. Keep the exact words and do not add anything:\n${text}`,
  ];

  let lastError;
  for (const prompt of attempts) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      });

      const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
      if (audio) return audio;
    } catch (error) {
      lastError = error;
      if (!/only be used for TTS|generate text|INVALID_ARGUMENT/i.test(String(error?.message || error))) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options();
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const { text } = readJsonBody(event);
    if (typeof text !== "string" || !text.trim()) {
      return json(400, { error: "Text is required." });
    }

    const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    return json(200, {
      audio: await synthesizeJennieAudio(ai, text),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
};
