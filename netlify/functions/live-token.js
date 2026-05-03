import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, json, options, toErrorResponse } from "./_jennie.js";

const LIVE_MODEL = "gemini-3.1-flash-live-preview";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options();
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        expireTime: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
        liveConnectConstraints: {
          model: LIVE_MODEL,
        },
      },
    });

    if (!token.name) {
      throw new Error("Gemini did not return a live auth token.");
    }

    return json(200, { token: token.name });
  } catch (error) {
    return toErrorResponse(error);
  }
};
