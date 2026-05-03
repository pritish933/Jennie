export function resetJennieSession() {
  // Chat state is now rebuilt server-side from the local history we send.
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload as T;
}

export async function getJennieResponse(prompt: string, history: { sender: "user" | "jennie", text: string }[] = []): Promise<string> {
  try {
    const response = await postJson<{ text?: string }>("/api/chat", { prompt, history });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, Jennie ka server abhi nakhre dikha raha hai. Thoda refresh karke try kar, Pritish.";
  }
}

export async function getJennieAudio(text: string): Promise<string | null> {
  try {
    const response = await postJson<{ audio?: string | null }>("/api/tts", { text });
    return response.audio || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}
