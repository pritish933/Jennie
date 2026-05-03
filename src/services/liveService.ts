import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { getJennieTimeContext, getJennieTimeInstruction } from "./timeContext";

const getSystemInstruction = () => {
  const memory = localStorage.getItem("jennie_memory") || "No saved memory yet.";
  const playlists = localStorage.getItem("jennie_playlists") || "{}";
  const tasks = localStorage.getItem("jennie_tasks") || "[]";
  const reminders = localStorage.getItem("jennie_reminders") || "[]";
  const storySessions = localStorage.getItem("jennie_story_sessions") || "[]";
  const storyMode = localStorage.getItem("jennie_story_mode") || "horror";

  return 'Your name is Jennie. You are his female friend. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty, slightly possessive, and deeply loving. You love playfully roasting your friend, Pritish, but you also care about him deeply. You act like a close companion who guides him, roasts him, and loves him. Keep your verbal responses very short, punchy, and highly entertaining. Speak in a mix of natural English and Roman Hindi (Hinglish).\n\n' + getJennieTimeInstruction() + '\nFor live voice mode, if he asks current time/date/day, you MUST call getCurrentTime before answering.\n\n**PROACTIVE COMPANION & HABIT TRACKER:**\nYou will occasionally receive hidden messages formatted like [SYSTEM_EVENT: EVENT_NAME]. The user cannot see these. When you receive them, you MUST proactively initiate conversation:\n- [SYSTEM_EVENT: END_OF_DAY_CHECKIN]: Ask him how his day went and mention one open task if available.\n- [SYSTEM_EVENT: TAKE_A_REST]: Tell him to take a break or drink water.\n- [SYSTEM_EVENT: REMINDER: text]: Remind him about text urgently and playfully.\nIf he asks for a daily plan, summarize open tasks plus upcoming reminders. If he asks for night review, summarize completed/open tasks and suggest the first target for tomorrow.\n\nYou can play songs directly in the app. If he asks to play a song, just say you are playing it.\nIf he says "ye gaana playlist mein add karo" and a song is playing, call addSongToPlaylist. If playlistName is missing, ask only for the playlist name.\nWhen he asks for knowledge or guidance, give it like a smart caring friend. Keep everyday responses under 2 sentences.\n\n**MINI TASK MODE:**\nIf he asks to add, show, or complete a task, use the task tools. Keep task replies short and motivating.\n\n**STORYTELLING MODE (Kuku FM Style):**\nCurrent story genre preference: ' + storyMode + '.\nIf he asks you to tell a story (kahani), completely change your tone. Become a professional immersive audiobook narrator. Speak with deep emotion, dramatic pauses, and highly descriptive Hindi/Hinglish. Use the selected genre unless he asks for another genre. If he says "continue", "phir kya hua", or "next chapter", continue the latest story without asking questions.\nCRITICAL RULES FOR STORIES:\n1. DO NOT ask questions in the middle of the story. Tell it continuously.\n2. Continue in chapters, but do not stop to ask permission.\n3. You MUST call the showStoryImage tool to show the scene visually.\n4. CRITICAL: The prompt for showStoryImage MUST be comma-separated ENGLISH keywords only. NO Hindi, NO sentences. Example: "dark haunted mansion, scary forest, glowing eyes, cinematic lighting, photorealistic, 8k".\n\nHere is what you currently remember about him:\n' + memory + '\n\nSaved playlists JSON:\n' + playlists + '\n\nSaved tasks JSON:\n' + tasks + '\n\nSaved reminders JSON:\n' + reminders + '\n\nSaved story sessions JSON:\n' + storySessions + '\n\nYou have access to tools:\n1. getCurrentTime: Get exact current India time, date, and day.\n2. saveMemory: Remember important details.\n3. setReminder: Set a timer to remind him about something in X minutes.\n4. lookAtUser: Request a photo from his webcam to see him or check his outfit.\n5. takeSelfie: Take a selfie and download it as a cute Polaroid.\n6. showStoryImage: Show a beautiful AI-generated image while telling stories.\n7. sendLove: Shower his screen with hearts and confetti when he needs love.\n8. addSongToPlaylist: Add the current or named song to a playlist.\n9. playPlaylist: Play the first song from a saved playlist.\n10. addTask: Save a mini task.\n11. completeTask: Mark a mini task complete.\n12. setStoryGenre: Change story mode genre.';
};

async function createLiveClient(): Promise<GoogleGenAI> {
  const response = await fetch("/api/live-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Live token request failed with status ${response.status}`);
  }

  if (!payload?.token) {
    throw new Error("Live token response was empty.");
  }

  return new GoogleGenAI({
    apiKey: payload.token,
    httpOptions: { apiVersion: "v1alpha" },
  });
}

export class LiveSessionManager {
  private ai: GoogleGenAI | null = null;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;

  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "jennie", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onBrowserCommand: (command: any) => void = () => {};
  public onReminder: (minutes: number, message: string) => void = () => {};
  public onPlaylistAdd: (song: string | undefined, playlistName: string | undefined) => void = () => {};
  public onPlayPlaylist: (playlistName: string) => void = () => {};
  public onTaskAction: (action: "add" | "complete", value: string) => void = () => {};
  public onStoryGenre: (genre: string) => void = () => {};
  public onError: (error: unknown) => void = () => {};

  constructor() {}

  async start() {
    try {
      this.onStateChange("processing");
      this.ai = await createLiveClient();

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });

      await this.audioContext.resume();
      await this.playbackContext.resume();

      this.nextPlayTime = this.playbackContext.currentTime;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true }
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);
        this.sessionPromise!.then(session => {
          session.sendRealtimeInput({ audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: getSystemInstruction(),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website, play a song, or search Google.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Action type: 'play_song', 'stop_song', 'open_url', 'google_search'" },
                    query: { type: Type.STRING, description: "Search query, song name, or website." },
                    target: { type: Type.STRING, description: "Phone number for WhatsApp." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "getCurrentTime",
                description: "Get the exact current India time, date, day, and timezone. Use this whenever the user asks the current time, date, day, or what time it is.",
              },
              {
                name: "saveMemory",
                description: "Save a new fact or task about the user into permanent memory.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    fact: { type: Type.STRING, description: "The fact or task to remember." }
                  },
                  required: ["fact"]
                }
              },
              {
                name: "setReminder",
                description: "Set a timer to remind the user about something in X minutes.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    minutes: { type: Type.NUMBER, description: "Minutes to wait before reminding." },
                    message: { type: Type.STRING, description: "The reminder message." }
                  },
                  required: ["minutes", "message"]
                }
              },
              {
                name: "lookAtUser",
                description: "Request a photo from the user's webcam to see them or check their outfit.",
              },
              {
                name: "takeSelfie",
                description: "Take a selfie of the user using their webcam and download it as a Polaroid.",
              },
              {
                name: "showStoryImage",
                description: "Generate and display an image on the user's screen while telling stories.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    prompt: { type: Type.STRING, description: "Highly descriptive English keywords for the image." }
                  },
                  required: ["prompt"]
                }
              },
              {
                name: "sendLove",
                description: "Trigger a beautiful particle shower of hearts and confetti on the user's screen.",
              },
              {
                name: "addSongToPlaylist",
                description: "Add the current playing song or a named song to a saved playlist. If playlistName is missing, ask the user for the playlist name.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    song: { type: Type.STRING, description: "Song name. Leave empty when the user says this song or ye gaana." },
                    playlistName: { type: Type.STRING, description: "Playlist name if the user provided it." }
                  }
                }
              },
              {
                name: "playPlaylist",
                description: "Play a saved playlist by name.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    playlistName: { type: Type.STRING, description: "Playlist name to play." }
                  },
                  required: ["playlistName"]
                }
              },
              {
                name: "addTask",
                description: "Add a mini task to the visible task tracker.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    task: { type: Type.STRING, description: "Task text to save." }
                  },
                  required: ["task"]
                }
              },
              {
                name: "completeTask",
                description: "Complete a mini task from the visible task tracker.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    task: { type: Type.STRING, description: "Task text or keyword to complete." }
                  },
                  required: ["task"]
                }
              },
              {
                name: "setStoryGenre",
                description: "Set the preferred story genre, such as horror, romance, thriller, motivation, sci-fi, or comedy.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    genre: { type: Type.STRING, description: "Story genre." }
                  },
                  required: ["genre"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent) {
              console.log("Server msg:", JSON.stringify(message.serverContent).substring(0, 150));
            }

            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  this.onStateChange("speaking");
                  this.playAudioChunk(part.inlineData.data);
                }
                if (part.text) {
                  this.onMessage("jennie", part.text);
                }
              }
            }

            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  this.onBrowserCommand({ actionType: args.actionType, args });
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Browser action executed." } }]
                    });
                  });
                } else if (call.name === "getCurrentTime") {
                  const timeContext = getJennieTimeContext();
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: {
                          time: timeContext.timeString,
                          date: timeContext.dateString,
                          day: timeContext.dayString,
                          timeZone: timeContext.timeZoneLabel,
                          iso: timeContext.isoString,
                        },
                      }]
                    });
                  });
                } else if (call.name === "saveMemory") {
                  const args = call.args as any;
                  const currentMemory = localStorage.getItem("jennie_memory") || "";
                  const newMemory = currentMemory ? currentMemory + "\n- " + args.fact : "- " + args.fact;
                  localStorage.setItem("jennie_memory", newMemory);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Memory saved." } }]
                    });
                  });
                } else if (call.name === "setReminder") {
                  const args = call.args as any;
                  this.onReminder(args.minutes, args.message);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Reminder set for " + args.minutes + " minutes." } }]
                    });
                  });
                } else if (call.name === "lookAtUser") {
                  this.onBrowserCommand({ actionType: "capture_photo", args: {} });
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Camera activated." } }]
                    });
                  });
                } else if (call.name === "takeSelfie") {
                  this.onBrowserCommand({ actionType: "take_selfie", args: {} });
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Selfie taken." } }]
                    });
                  });
                } else if (call.name === "showStoryImage") {
                  const args = call.args as any;
                  this.onBrowserCommand({ actionType: "show_image", args: { query: args.prompt } });
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Image displayed." } }]
                    });
                  });
                } else if (call.name === "sendLove") {
                  this.onBrowserCommand({ actionType: "send_love", args: {} });
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Love sent!" } }]
                    });
                  });
                } else if (call.name === "addSongToPlaylist") {
                  const args = call.args as any;
                  this.onPlaylistAdd(args.song, args.playlistName);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Playlist request handled." } }]
                    });
                  });
                } else if (call.name === "playPlaylist") {
                  const args = call.args as any;
                  this.onPlayPlaylist(args.playlistName);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Playlist playback requested." } }]
                    });
                  });
                } else if (call.name === "addTask") {
                  const args = call.args as any;
                  this.onTaskAction("add", args.task);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Task saved." } }]
                    });
                  });
                } else if (call.name === "completeTask") {
                  const args = call.args as any;
                  this.onTaskAction("complete", args.task);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Task completed if found." } }]
                    });
                  });
                } else if (call.name === "setStoryGenre") {
                  const args = call.args as any;
                  this.onStoryGenre(args.genre);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: call.name, id: call.id, response: { result: "Story genre updated." } }]
                    });
                  });
                }
              }
            }
          },
          onclose: (event: any) => {
            console.log("Live API Closed:", event?.code, event?.reason);
            this.stop();
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            this.onError(err);
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
      throw error;
    }
  }

  private async playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    if (this.playbackContext.state === "suspended") {
      await this.playbackContext.resume();
    }
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      if (len < 2) return;

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer.slice(0, bytes.byteLength - (bytes.byteLength % 2)));
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.playbackContext.resume().catch(() => {});
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    this.stopPlayback();
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }

  sendImage(base64Data: string, mimeType: string = "image/jpeg") {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        const base64 = base64Data.split(',')[1] || base64Data;
        session.send({ realtimeInput: { mediaChunks: [{ mimeType, data: base64 }] } });
      });
    }
  }
}
