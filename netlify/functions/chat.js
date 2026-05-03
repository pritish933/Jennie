import { GoogleGenAI } from "@google/genai";
import {
  formatHistory,
  getGeminiApiKey,
  getSystemInstruction,
  isRetryableGeminiError,
  json,
  options,
  readJsonBody,
  toErrorResponse,
  withJennieTimeContext,
} from "./_jennie.js";

const PRIMARY_TEXT_MODEL = "gemini-3.1-flash-lite-preview";
const FALLBACK_TEXT_MODEL = "gemini-2.5-flash";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return options();
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const { prompt, history, context } = readJsonBody(event);
    if (typeof prompt !== "string" || !prompt.trim()) {
      return json(400, { error: "Prompt is required." });
    }

    const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    const formattedHistory = formatHistory(history);
    const models = [PRIMARY_TEXT_MODEL, FALLBACK_TEXT_MODEL];
    let lastError;

    for (const model of models) {
      try {
        const chat = ai.chats.create({
          model,
          config: {
            systemInstruction: getSystemInstruction(context),
          },
          history: formattedHistory,
        });

        const response = await chat.sendMessage({
          message: withJennieTimeContext(prompt),
        });

        return json(200, {
          text: response.text || "Ugh, fine. I have nothing to say.",
          model,
        });
      } catch (error) {
        lastError = error;
        if (!isRetryableGeminiError(error) || model === FALLBACK_TEXT_MODEL) {
          throw error;
        }
      }
    }

    throw lastError;
  } catch (error) {
    return toErrorResponse(error);
  }
};
