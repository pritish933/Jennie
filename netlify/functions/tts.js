import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, json, options, readJsonBody, toErrorResponse } from "./_jennie.js";

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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{
        parts: [{
          text: `Read aloud exactly this transcript in Jennie's playful, witty, caring Hinglish voice. Do not add, remove, translate, or rewrite any words:\n${text}`,
        }],
      }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    return json(200, {
      audio: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
};
