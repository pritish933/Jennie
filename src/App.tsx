import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, X, ListMusic, CheckSquare, BookOpen, Play, CheckCircle2, Circle, CalendarDays, Moon, RotateCcw, Sparkles } from "lucide-react";
import { getJennieResponse, getJennieAudio, resetJennieSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import { formatJennieTimeReply, getJennieCurrentHour, isTimeQuestion } from "./services/timeContext";
import Visualizer from "./components/Visualizer";
import PermissionModal, { PermissionIssue } from "./components/PermissionModal";
import MusicPlayer from "./components/MusicPlayer";
import { playPCM, speakText, unlockAudio, unlockSpeech } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "jennie";
  text: string;
}

interface PlaylistSong {
  id: string;
  title: string;
  addedAt: number;
}

type Playlists = Record<string, PlaylistSong[]>;

interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  completedAt?: number;
}

interface RoutineReminder {
  id: string;
  message: string;
  dueAt: number;
  createdAt: number;
  done: boolean;
}

interface StoryChapter {
  id: string;
  number: number;
  title: string;
  text: string;
  imageUrl: string;
  createdAt: number;
}

interface StorySession {
  id: string;
  title: string;
  genre: string;
  createdAt: number;
  updatedAt: number;
  chapters: StoryChapter[];
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("jennie_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("jennie_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionIssue, setPermissionIssue] = useState<PermissionIssue>("microphone");
  const [permissionDetail, setPermissionDetail] = useState("");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [youtubeQuery, setYoutubeQuery] = useState<string | null>(null);
  const [storyImageUrl, setStoryImageUrl] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [pendingPlaylistSong, setPendingPlaylistSong] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlists>(() => {
    try {
      return JSON.parse(localStorage.getItem("jennie_playlists") || "{}");
    } catch {
      return {};
    }
  });
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("jennie_tasks") || "[]");
    } catch {
      return [];
    }
  });
  const [storyGenre, setStoryGenre] = useState(() => localStorage.getItem("jennie_story_mode") || "horror");
  const [reminders, setReminders] = useState<RoutineReminder[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("jennie_reminders") || "[]");
    } catch {
      return [];
    }
  });
  const [storySessions, setStorySessions] = useState<StorySession[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("jennie_story_sessions") || "[]");
    } catch {
      return [];
    }
  });
  const [activeStoryId, setActiveStoryId] = useState<string | null>(() => localStorage.getItem("jennie_active_story_id"));

  useEffect(() => {
    localStorage.setItem("jennie_playlists", JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    localStorage.setItem("jennie_tasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("jennie_story_mode", storyGenre);
  }, [storyGenre]);

  useEffect(() => {
    localStorage.setItem("jennie_reminders", JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    localStorage.setItem("jennie_story_sessions", JSON.stringify(storySessions));
  }, [storySessions]);

  useEffect(() => {
    if (activeStoryId) {
      localStorage.setItem("jennie_active_story_id", activeStoryId);
    } else {
      localStorage.removeItem("jennie_active_story_id");
    }
  }, [activeStoryId]);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reminderTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), ms);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const speakJennieResponse = useCallback(async (text: string) => {
    if (isMuted) return;

    setAppState("speaking");
    try {
      const audioBase64 = await withTimeout(getJennieAudio(text), 15000);
      if (audioBase64) {
        await playPCM(audioBase64);
        return;
      }
    } catch (error) {
      console.warn("Gemini voice unavailable, using browser speech fallback:", error);
    }

    try {
      await speakText(text);
    } catch (error) {
      console.error("Browser speech fallback failed:", error);
    }
  }, [isMuted]);

  const addJennieMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "jennie", text }]);
  }, []);

  const replyAsJennie = useCallback(async (text: string) => {
    addJennieMessage(text);
    await speakJennieResponse(text);
  }, [addJennieMessage, speakJennieResponse]);

  const getIndiaDateKey = (timestamp = Date.now()) => (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(timestamp)
  );

  const createStoryImageUrl = useCallback((genre: string, title: string, chapterNumber: number, seedText: string) => {
    const keywords = [
      genre,
      `chapter ${chapterNumber}`,
      title,
      seedText.split(/\s+/).slice(0, 18).join(" "),
      "cinematic story scene",
      "dramatic lighting",
      "photorealistic",
      "highly detailed",
    ].join(", ");
    const safeQuery = encodeURIComponent(keywords);
    return `https://image.pollinations.ai/prompt/${safeQuery}?width=800&height=600&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
  }, []);

  const formatDueTime = (timestamp: number) => (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(timestamp)
  );

  const buildTodayPlan = useCallback(() => {
    const openTasks = tasks.filter((task) => !task.done).slice(0, 5);
    const upcomingReminders = reminders
      .filter((reminder) => !reminder.done)
      .sort((a, b) => a.dueAt - b.dueAt)
      .slice(0, 3);

    if (openTasks.length === 0 && upcomingReminders.length === 0) {
      return "Aaj ka board clean hai. Ek chhota task add kar de, warna main tujhe overconfident declare kar dungi.";
    }

    const taskLines = openTasks.map((task, index) => `${index + 1}. ${task.text}`);
    const reminderLines = upcomingReminders.map((reminder) => `- ${formatDueTime(reminder.dueAt)}: ${reminder.message}`);

    return [
      "Aaj ka mini plan ready:",
      taskLines.length ? taskLines.join("\n") : "No open tasks. Rare responsible moment.",
      reminderLines.length ? `Reminders:\n${reminderLines.join("\n")}` : "No reminders set.",
      "Bas top 2 pe focus kar. Hero banne ki zarurat nahi, consistent reh.",
    ].join("\n");
  }, [reminders, tasks]);

  const buildNightReview = useCallback(() => {
    const todayKey = getIndiaDateKey();
    const completedToday = tasks.filter((task) => task.done && getIndiaDateKey(task.completedAt || task.createdAt) === todayKey);
    const openTasks = tasks.filter((task) => !task.done);
    const firedReminders = reminders.filter((reminder) => reminder.done && getIndiaDateKey(reminder.dueAt) === todayKey);

    return [
      "Night review, boss:",
      `Completed tasks: ${completedToday.length}`,
      `Open tasks: ${openTasks.length}`,
      `Reminders handled: ${firedReminders.length}`,
      openTasks.length ? `Kal ka first target: ${openTasks[0].text}` : "Kal fresh start. Aaj ka backlog clean hai.",
      completedToday.length > 0 ? "Good. Thoda proud feel kar, main permission de rahi hoon." : "Aaj slow tha toh bhi theek. Kal ek task pakad ke khatam karenge.",
    ].join("\n");
  }, [reminders, tasks]);

  const addReminder = useCallback((minutes: number, message: string) => {
    const safeMinutes = Math.max(1, Math.round(minutes));
    const reminder: RoutineReminder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message: message.trim(),
      dueAt: Date.now() + safeMinutes * 60 * 1000,
      createdAt: Date.now(),
      done: false,
    };

    if (!reminder.message) return;
    setReminders((prev) => [reminder, ...prev]);
  }, []);

  useEffect(() => {
    const activeReminderIds = new Set(reminders.filter((reminder) => !reminder.done).map((reminder) => reminder.id));

    Object.keys(reminderTimersRef.current).forEach((id) => {
      if (!activeReminderIds.has(id)) {
        clearTimeout(reminderTimersRef.current[id]);
        delete reminderTimersRef.current[id];
      }
    });

    reminders.forEach((reminder) => {
      if (reminder.done || reminderTimersRef.current[reminder.id]) return;

      const delay = Math.max(0, reminder.dueAt - Date.now());
      reminderTimersRef.current[reminder.id] = setTimeout(() => {
        setReminders((prev) => prev.map((item) => item.id === reminder.id ? { ...item, done: true } : item));
        if (liveSessionRef.current) {
          liveSessionRef.current.sendText(`[SYSTEM_EVENT: REMINDER: ${reminder.message}]`);
        } else {
          replyAsJennie(`Reminder: ${reminder.message}. Haan haan, ab ignore mat karna.`);
        }
      }, delay);
    });

    return () => {
      Object.keys(reminderTimersRef.current).forEach((id) => clearTimeout(reminderTimersRef.current[id]));
      reminderTimersRef.current = {};
    };
  }, [reminders, replyAsJennie]);

  const generateStoryChapter = useCallback(async (mode: "new" | "continue", seedText?: string) => {
    setAppState("processing");

    const existingStory = mode === "continue"
      ? storySessions.find((story) => story.id === activeStoryId) || storySessions[0]
      : null;

    const genre = storyGenre;
    const chapterNumber = existingStory ? existingStory.chapters.length + 1 : 1;
    const title = existingStory?.title || `${genre[0]?.toUpperCase() || "S"}${genre.slice(1)} Kahani`;
    const previousContext = existingStory?.chapters
      .slice(-2)
      .map((chapter) => `Chapter ${chapter.number}: ${chapter.text}`)
      .join("\n\n") || "No previous chapter.";

    const prompt = [
      `Write ${existingStory ? "the next" : "the first"} chapter of Jennie's ${genre} story for Pritish.`,
      `Story title: ${title}.`,
      `Chapter number: ${chapterNumber}.`,
      `User request: ${seedText || "continue the story"}.`,
      `Previous context: ${previousContext}`,
      "Rules: Hinglish/Hindi narration, immersive Kuku FM style, no questions, no bullet points, 160-230 words, end with a hook but continue naturally.",
    ].join("\n");

    const chapterText = await getJennieResponse(prompt, messagesRef.current);
    const imageUrl = createStoryImageUrl(genre, title, chapterNumber, chapterText);
    const chapter: StoryChapter = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      number: chapterNumber,
      title: `Chapter ${chapterNumber}`,
      text: chapterText,
      imageUrl,
      createdAt: Date.now(),
    };

    setStoryImageUrl(imageUrl);
    const nextStoryId = existingStory?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActiveStoryId(nextStoryId);
    setStorySessions((prev) => {
      if (existingStory) {
        return prev.map((story) => story.id === existingStory.id
          ? { ...story, updatedAt: Date.now(), chapters: [...story.chapters, chapter] }
          : story
        );
      }

      const nextStory: StorySession = {
        id: nextStoryId,
        title,
        genre,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        chapters: [chapter],
      };
      return [nextStory, ...prev].slice(0, 6);
    });

    await replyAsJennie(chapterText);
    setAppState("idle");
  }, [activeStoryId, createStoryImageUrl, replyAsJennie, storyGenre, storySessions]);

  const saveSongToPlaylist = useCallback((song: string, rawPlaylistName: string) => {
    const playlistName = rawPlaylistName.trim().replace(/\s+/g, " ");
    if (!playlistName) return false;

    setPlaylists((prev) => {
      const existing = prev[playlistName] || [];
      const normalizedSong = song.trim();
      const alreadySaved = existing.some((item) => item.title.toLowerCase() === normalizedSong.toLowerCase());
      if (alreadySaved) return prev;

      return {
        ...prev,
        [playlistName]: [
          ...existing,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: normalizedSong, addedAt: Date.now() },
        ],
      };
    });

    setPendingPlaylistSong(null);
    return true;
  }, []);

  const requestPlaylistName = useCallback(async (song?: string) => {
    const selectedSong = (song || youtubeQuery || "").trim();
    if (!selectedSong) {
      await replyAsJennie("Pehle koi gaana play karao, phir main usko playlist mein save kar dungi.");
      return;
    }

    setPendingPlaylistSong(selectedSong);
    await replyAsJennie(`"${selectedSong}" ko kis playlist mein add karu? Bas playlist ka naam bol do.`);
  }, [replyAsJennie, youtubeQuery]);

  const playSavedPlaylist = useCallback(async (rawPlaylistName: string) => {
    const playlistName = rawPlaylistName.trim();
    const entry = (Object.entries(playlists) as [string, PlaylistSong[]][]).find(([name]) => name.toLowerCase() === playlistName.toLowerCase());
    if (!entry || entry[1].length === 0) {
      await replyAsJennie(`"${playlistName}" playlist nahi mili. Pehle usme gaane daal, DJ sahab.`);
      return;
    }

    setYoutubeQuery(entry[1][0].title);
    await replyAsJennie(`${entry[0]} playlist chalu. Pehla gaana: ${entry[1][0].title}.`);
  }, [playlists, replyAsJennie]);

  const addTask = useCallback((text: string) => {
    const taskText = text.trim();
    if (!taskText) return;
    setTasks((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: taskText, done: false, createdAt: Date.now() },
      ...prev,
    ]);
  }, []);

  const completeTask = useCallback((query: string) => {
    const needle = query.trim().toLowerCase();
    setTasks((prev) => {
      const index = prev.findIndex((task) => !task.done && task.text.toLowerCase().includes(needle));
      if (index === -1) return prev;
      return prev.map((task, taskIndex) => taskIndex === index ? { ...task, done: true, completedAt: Date.now() } : task);
    });
  }, []);

  const handleLocalAssistantFeature = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (isTimeQuestion(trimmed)) {
      await replyAsJennie(formatJennieTimeReply());
      return true;
    }

    if (pendingPlaylistSong) {
      saveSongToPlaylist(pendingPlaylistSong, trimmed);
      await replyAsJennie(`Done. "${pendingPlaylistSong}" ko "${trimmed}" playlist mein save kar diya.`);
      return true;
    }

    const reminderMatch =
      trimmed.match(/(?:remind me|yaad dila|reminder)\s+(?:in\s+)?(\d+)\s*(?:minute|minutes|min|mins|m)\s*(?:to|ke liye|baad)?\s*(.+)$/i) ||
      trimmed.match(/(\d+)\s*(?:minute|minutes|min|mins|m)\s*(?:baad|mein|me)\s*(.+)$/i);
    if (reminderMatch?.[1] && reminderMatch?.[2]) {
      const minutes = Number(reminderMatch[1]);
      const message = reminderMatch[2].replace(/^(mujhe|me|to)\s+/i, "").trim();
      addReminder(minutes, message);
      await replyAsJennie(`${minutes} minute baad yaad dila dungi: ${message}.`);
      return true;
    }

    const wantsTodayPlan = /(today|aaj|subah|morning|daily).*(plan|routine)|\b(today plan|daily plan|morning plan)\b|aaj ka plan|routine bata/i.test(trimmed);
    if (wantsTodayPlan) {
      await replyAsJennie(buildTodayPlan());
      return true;
    }

    const wantsNightReview = /(night|evening|end of day|raat|shaam|din).*(review|summary|check|kaisa)|aaj ka review|day review/i.test(trimmed);
    if (wantsNightReview) {
      await replyAsJennie(buildNightReview());
      return true;
    }

    const wantsStoryContinue = /(continue|next chapter|aage|phir kya hua|continue karo|kahani continue|story continue)/i.test(trimmed);
    if (wantsStoryContinue && storySessions.length > 0) {
      await generateStoryChapter("continue", trimmed);
      return true;
    }

    const wantsNewStory = /(kahani|story)/i.test(trimmed) && /(sunao|suna|tell|start|new|nayi|batao|bata)/i.test(trimmed) && !/(mode|genre)/i.test(trimmed);
    if (wantsNewStory) {
      await generateStoryChapter("new", trimmed);
      return true;
    }

    const playlistAddIntent = /playlist/.test(lower) && /(add|save|daal|dal|jod|rakh)/.test(lower) && /(song|gaana|gana|track|ye)/.test(lower);
    if (playlistAddIntent) {
      const explicitName =
        trimmed.match(/(?:playlist\s+(?:ka\s+naam|name|named|called)\s+)(.+)$/i)?.[1] ||
        trimmed.match(/(?:to|in|mein|mai|me)\s+(.+?)\s+playlist/i)?.[1];
      const songName =
        trimmed.match(/(?:add|save|daal|dal)\s+(.+?)\s+(?:to|in|mein|mai|me)\s+.+playlist/i)?.[1] ||
        youtubeQuery ||
        undefined;

      if (explicitName && songName) {
        saveSongToPlaylist(songName, explicitName);
        await replyAsJennie(`Saved. "${songName}" ab "${explicitName}" playlist mein hai.`);
      } else {
        await requestPlaylistName(songName);
      }
      return true;
    }

    const playPlaylistMatch =
      trimmed.match(/(?:play|chalao|laga do)\s+(.+?)\s+playlist/i) ||
      trimmed.match(/(.+?)\s+playlist\s+(?:play|chalao|laga do|chalu)/i);
    if (playPlaylistMatch?.[1]) {
      await playSavedPlaylist(playPlaylistMatch[1]);
      return true;
    }

    const addTaskMatch =
      trimmed.match(/(?:add|save|yaad rakh|note)\s+(?:task|kaam)\s+(.+)$/i) ||
      trimmed.match(/(?:task|kaam)\s+(?:add|save|yaad rakh)\s+(.+)$/i);
    if (addTaskMatch?.[1]) {
      addTask(addTaskMatch[1]);
      await replyAsJennie("Task save ho gaya. Ab bas procrastination ko thoda side-eye dena hai.");
      return true;
    }

    const completeTaskMatch =
      trimmed.match(/(?:complete|done|finish|khatam)\s+(?:task|kaam)\s+(.+)$/i) ||
      trimmed.match(/(?:task|kaam)\s+(.+?)\s+(?:complete|done|finish|khatam)/i);
    if (completeTaskMatch?.[1]) {
      completeTask(completeTaskMatch[1]);
      await replyAsJennie("Done mark kar diya. Thoda productive insaan lag raha hai aaj.");
      return true;
    }

    const storyGenreMatch = trimmed.match(/(?:story|kahani)\s+(?:mode|genre)\s+(.+)$/i) || trimmed.match(/(.+?)\s+(?:story|kahani)\s+(?:mode|genre)/i);
    if (storyGenreMatch?.[1]) {
      const nextGenre = storyGenreMatch[1].trim();
      setStoryGenre(nextGenre);
      await replyAsJennie(`${nextGenre} story mode set. Ab kahani bolega toh full cinematic drama milega.`);
      return true;
    }

    return false;
  }, [addReminder, addTask, buildNightReview, buildTodayPlan, completeTask, generateStoryChapter, pendingPlaylistSong, playSavedPlaylist, replyAsJennie, requestPlaylistName, saveSongToPlaylist, storySessions.length, youtubeQuery]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);

    if (await handleLocalAssistantFeature(finalTranscript)) {
      setAppState("idle");
      return;
    }
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "jennie", text: responseText }]);
      
      await speakJennieResponse(responseText);

      setAppState("idle");

      setTimeout(async () => {
        if (commandResult.category === "MEDIA_PLAY" && commandResult.query) {
          setYoutubeQuery(commandResult.query);
        } else if (commandResult.category === "MEDIA_STOP") {
          setYoutubeQuery(null);
        } else if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      // 2. General Chit-Chat via Gemini
      responseText = await getJennieResponse(finalTranscript, messagesRef.current);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "jennie", text: responseText }]);
      
      await speakJennieResponse(responseText);
      setAppState("idle");
    }
  }, [handleLocalAssistantFeature, isSessionActive, speakJennieResponse]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        if ((liveSessionRef.current as any).restTimer) {
          clearTimeout((liveSessionRef.current as any).restTimer);
        }
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetJennieSession();
    } else {
      try {
        setIsSessionActive(true);
      resetJennieSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };

        session.onError = (error) => {
          showSessionStartupIssue(error);
          setIsSessionActive(false);
          setAppState("idle");
        };
        
        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        session.onBrowserCommand = async ({ actionType, args }) => {
          setTimeout(async () => {
             if (actionType === "capture_photo") {
               try {
                 const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                 const video = document.createElement("video");
                 video.srcObject = stream;
                 await video.play();
                 
                 const canvas = document.createElement("canvas");
                 canvas.width = video.videoWidth;
                 canvas.height = video.videoHeight;
                 const ctx = canvas.getContext("2d");
                 ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                 
                 const base64Image = canvas.toDataURL("image/jpeg");
                 
                 // Stop camera
                 stream.getTracks().forEach(track => track.stop());
                 
                 if (liveSessionRef.current) {
                   liveSessionRef.current.sendImage(base64Image);
                 }
               } catch (err) {
                 console.error("Camera error:", err);
               }
             } else if (actionType === "take_selfie") {
               try {
                 // 3..2..1 effect can be done via speech, just flash and snap!
                 setFlash(true);
                 setTimeout(() => setFlash(false), 500);

                 const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                 const video = document.createElement("video");
                 video.srcObject = stream;
                 await video.play();
                 
                 const canvas = document.createElement("canvas");
                 canvas.width = video.videoWidth + 40;
                 canvas.height = video.videoHeight + 120;
                 const ctx = canvas.getContext("2d")!;
                 
                 // Draw Polaroid white background
                 ctx.fillStyle = "#ffffff";
                 ctx.fillRect(0, 0, canvas.width, canvas.height);
                 
                 // Draw image
                 ctx.drawImage(video, 20, 20, video.videoWidth, video.videoHeight);
                 
                 // Draw text
                 ctx.fillStyle = "#000000";
                 ctx.font = "bold 36px 'Comic Sans MS', cursive, sans-serif";
                 ctx.textAlign = "center";
                 ctx.fillText("Captured by Jennie ❤️", canvas.width / 2, canvas.height - 40);

                 const base64Image = canvas.toDataURL("image/jpeg");
                 
                 // Download
                 const link = document.createElement("a");
                 link.href = base64Image;
                 link.download = `Jennie_Selfie_${Date.now()}.jpg`;
                 document.body.appendChild(link);
                 link.click();
                 document.body.removeChild(link);
                 
                 stream.getTracks().forEach(track => track.stop());
               } catch (err) {
                 console.error("Selfie error:", err);
               }
             } else if (actionType === "show_image" && args.query) {
                // Ensure query is safe and append quality keywords
                const enhancedQuery = args.query + `, ${storyGenre} story mood, beautiful, masterpiece, cinematic lighting, 8k resolution, highly detailed`;
                const safeQuery = encodeURIComponent(enhancedQuery);
                setStoryImageUrl(`https://image.pollinations.ai/prompt/${safeQuery}?width=800&height=600&nologo=true&seed=${Math.floor(Math.random() * 10000)}`);
                // Auto hide after 30 seconds
                setTimeout(() => setStoryImageUrl(null), 30000);
             } else if (actionType === "send_love") {
                const duration = 3000;
                const end = Date.now() + duration;

                const frame = () => {
                  confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#ec4899', '#f472b6', '#db2777', '#be185d']
                  });
                  confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#ec4899', '#f472b6', '#db2777', '#be185d']
                  });

                  if (Date.now() < end) {
                    requestAnimationFrame(frame);
                  }
                };
                frame();
             } else if (actionType === "play_song" && args.query) {
               setYoutubeQuery(args.query);
             } else if (actionType === "stop_song") {
               setYoutubeQuery(null);
             } else if (args.query) {
               // Fallback search or open URL
               let url = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
               if (actionType === "open_url" && args.query.includes(".")) {
                 url = args.query.startsWith("http") ? args.query : `https://${args.query}`;
               }
               window.open(url, "_blank");
             }
          }, 1000);
        };

        session.onReminder = (minutes, message) => {
          addReminder(minutes, message);
          addJennieMessage(`${minutes} minute reminder set: ${message}`);
        };

        session.onPlaylistAdd = (song, playlistName) => {
          const selectedSong = (song || youtubeQuery || "").trim();
          if (!playlistName) {
            requestPlaylistName(selectedSong);
            return;
          }
          if (selectedSong && saveSongToPlaylist(selectedSong, playlistName)) {
            addJennieMessage(`"${selectedSong}" ko "${playlistName}" playlist mein save kar diya.`);
          }
        };

        session.onPlayPlaylist = (playlistName) => {
          playSavedPlaylist(playlistName);
        };

        session.onTaskAction = (action, value) => {
          if (action === "add") {
            addTask(value);
            addJennieMessage(`Task saved: ${value}`);
          } else {
            completeTask(value);
            addJennieMessage(`Task done mark kar diya: ${value}`);
          }
        };

        session.onStoryGenre = (genre) => {
          setStoryGenre(genre);
          addJennieMessage(`${genre} story mode set.`);
        };

        await session.start();

        // ---------------- Proactive Companion Logic ----------------
        const hours = getJennieCurrentHour();
        
        // 1. End of Day Checkin (if starting between 8 PM and 4 AM)
        if (hours >= 20 || hours < 4) {
          setTimeout(() => {
            if (liveSessionRef.current) {
              liveSessionRef.current.sendText("[SYSTEM_EVENT: END_OF_DAY_CHECKIN]");
            }
          }, 4000); // Wait 4 seconds for initial connection
        }

        // 2. Long Session Rest Reminder (30 mins)
        (session as any).restTimer = setTimeout(() => {
          if (liveSessionRef.current) {
            liveSessionRef.current.sendText("[SYSTEM_EVENT: TAKE_A_REST]");
          }
        }, 30 * 60 * 1000);

      } catch (e) {
        console.error("Failed to start session", e);
        showSessionStartupIssue(e);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  const unlockVoicePlayback = () => {
    unlockAudio();
    unlockSpeech();
  };

  const getSessionStartupIssue = (error: unknown): PermissionIssue => {
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);

    if (!window.isSecureContext) return "secure-context";
    if (!navigator.mediaDevices?.getUserMedia) return "browser";
    if (/GEMINI_API_KEY|live token|api key|token request|server/i.test(message)) return "api-key";
    if (/NotAllowedError|Permission denied|permission|denied/i.test(message)) return "microphone";
    if (/NotFoundError|DevicesNotFoundError|device not found|requested device not found/i.test(message)) return "browser";
    return "live-api";
  };

  const showSessionStartupIssue = (error: unknown) => {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    setPermissionIssue(getSessionStartupIssue(error));
    setPermissionDetail(detail.slice(0, 240));
    setShowPermissionModal(true);
  };

  const activeStory = storySessions.find((story) => story.id === activeStoryId) || storySessions[0];
  const upcomingReminders = reminders
    .filter((reminder) => !reminder.done)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, 3);

  return (
    <div
      className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0 font-body"
      onPointerDownCapture={unlockVoicePlayback}
    >
      {showPermissionModal && (
        <PermissionModal 
          issue={permissionIssue}
          detail={permissionDetail}
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Dynamic Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-violet-600/20 blur-[120px] rounded-full animate-blob mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-pink-600/20 blur-[120px] rounded-full animate-blob mix-blend-screen" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[20%] w-[40%] h-[40%] bg-sky-600/10 blur-[100px] rounded-full animate-blob mix-blend-screen" style={{ animationDelay: '4s' }} />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
      </div>

      {/* Camera Flash Effect */}
      {flash && (
        <div className="absolute inset-0 z-[100] bg-white animate-flash pointer-events-none" />
      )}

      {/* Storyteller Image Display */}
      <AnimatePresence>
        {storyImageUrl && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 20, scale: 0.95, rotateX: -10 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="absolute z-50 top-28 left-1/2 transform -translate-x-1/2 w-[85%] max-w-3xl rounded-3xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 glass-strong"
            style={{ perspective: "1000px" }}
          >
            <div className="bg-white/5 backdrop-blur-md p-4 flex justify-between items-center border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
                <span className="text-white/90 text-sm font-semibold tracking-widest uppercase font-sans">Vision Mode</span>
              </div>
              <button onClick={() => setStoryImageUrl(null)} className="p-2 rounded-full bg-white/5 hover:bg-white/20 transition-colors text-white/70 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="relative w-full min-h-[400px] flex items-center justify-center bg-black/40">
              <div className="absolute inset-0 flex flex-col items-center justify-center -z-10 gap-4">
                 <Loader2 className="animate-spin text-pink-400" size={40} />
                 <span className="text-white/50 text-xs tracking-widest uppercase animate-pulse">Synthesizing Scene...</span>
              </div>
              <img 
                src={storyImageUrl} 
                alt="Story visual" 
                className="w-full h-full object-cover transition-all duration-1000 ease-out" 
                style={{ opacity: 0 }}
                onLoad={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onError={(e) => {
                  e.currentTarget.src = `https://picsum.photos/seed/${Math.random()}/800/600?blur=2`;
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Internal Music Player */}
      <AnimatePresence>
        {youtubeQuery && (
          <MusicPlayer 
            query={youtubeQuery} 
            onClose={() => setYoutubeQuery(null)} 
          />
        )}
      </AnimatePresence>

      {/* Premium Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-40 shrink-0 px-6 py-5 md:px-12 md:py-8 pointer-events-auto">
        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-pink-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-violet-500/30 overflow-hidden">
            <div className="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
            <span className="relative z-10 text-white drop-shadow-md">J</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-sans font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">Jennie</h1>
            <span className="text-[10px] text-pink-400 font-semibold tracking-widest uppercase">AI Companion</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetJennieSession();
                }
              }}
              className="p-3 rounded-xl glass hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all duration-300 group"
              title="Clear Memory"
            >
              <Trash2 size={18} className="opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all" />
            </button>
          )}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-3 rounded-xl glass hover:bg-white/10 transition-all duration-300 group"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70 group-hover:opacity-100 text-red-400" />
            ) : (
              <Volume2 size={18} className="opacity-70 group-hover:opacity-100" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Chat & Visualizer */}
      <main className="absolute inset-0 flex flex-col md:flex-row w-full h-full z-10 overflow-hidden pt-24 pb-32 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Elegant Chat History */}
        <div className="hidden md:flex w-[35%] h-full flex-col justify-end z-20 pointer-events-auto pb-8">
          <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide h-[70%] px-2 pt-10 pb-4" style={{ maskImage: 'linear-gradient(to bottom, transparent, black 15%, black)' }}>
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: msg.sender === 'user' ? -20 : 20, y: 10 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  className={`flex flex-col max-w-[85%] ${msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-white/40 mb-1 ml-1 font-sans">
                    {msg.sender === 'user' ? 'You' : 'Jennie'}
                  </span>
                  <div className={`px-4 py-3 text-sm leading-relaxed backdrop-blur-md border shadow-lg ${
                    msg.sender === 'user' 
                      ? 'bg-violet-600/20 border-violet-500/20 text-white/90 rounded-2xl rounded-br-sm' 
                      : 'bg-white/5 border-white/10 text-white/80 rounded-2xl rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Center Visualizer */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} />
        </div>

        {/* Right Column: Dynamic Status */}
        <div className="hidden md:flex w-[35%] h-full flex-col justify-center items-end gap-4 z-10 absolute right-12">
            <AnimatePresence mode="wait">
              {appState === "listening" && (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                  className="flex items-center gap-3 px-5 py-3 rounded-full glass border-violet-500/30 text-violet-300 font-medium tracking-wide shadow-[0_0_30px_rgba(139,92,246,0.2)]"
                >
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  Jennie is listening...
                </motion.div>
              )}
              {appState === "processing" && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                  className="flex items-center gap-3 px-5 py-3 rounded-full glass border-sky-500/30 text-sky-300 font-medium tracking-wide shadow-[0_0_30px_rgba(56,189,248,0.2)]"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Thinking...
                </motion.div>
              )}
            </AnimatePresence>

            <div className="w-80 max-h-[58vh] overflow-y-auto scrollbar-hide glass-strong rounded-2xl p-4 border-white/10 space-y-4 pointer-events-auto">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-pink-300 font-semibold">
                    <ListMusic size={14} />
                    Playlists
                  </div>
                  <span className="text-[10px] text-white/35">{Object.keys(playlists).length}</span>
                </div>
                <div className="space-y-2">
                  {(Object.entries(playlists) as [string, PlaylistSong[]][]).slice(0, 3).map(([name, songs]) => (
                    <button
                      key={name}
                      onClick={() => playSavedPlaylist(name)}
                      className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-left transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white/85 truncate">{name}</p>
                        <p className="text-[11px] text-white/40 truncate">{songs.length} song{songs.length === 1 ? "" : "s"}</p>
                      </div>
                      <Play size={14} className="text-pink-300 shrink-0" />
                    </button>
                  ))}
                  {Object.keys(playlists).length === 0 && (
                    <p className="text-xs text-white/40 leading-relaxed">Say: Jennie, ye gaana playlist mein add karo.</p>
                  )}
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300 font-semibold">
                    <CheckSquare size={14} />
                    Daily Routine
                  </div>
                  <span className="text-[10px] text-white/35">{tasks.filter((task) => !task.done).length} open</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => replyAsJennie(buildTodayPlan())}
                    className="flex items-center justify-center gap-2 rounded-lg bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-300/15 px-2 py-2 text-[11px] text-emerald-200 transition-colors"
                  >
                    <CalendarDays size={13} />
                    Today Plan
                  </button>
                  <button
                    onClick={() => replyAsJennie(buildNightReview())}
                    className="flex items-center justify-center gap-2 rounded-lg bg-indigo-400/10 hover:bg-indigo-400/20 border border-indigo-300/15 px-2 py-2 text-[11px] text-indigo-200 transition-colors"
                  >
                    <Moon size={13} />
                    Review
                  </button>
                </div>
                <div className="space-y-2">
                  {tasks.slice(0, 4).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => completeTask(task.text)}
                      className="w-full flex items-start gap-2 rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2 text-left transition-colors"
                    >
                      {task.done ? <CheckCircle2 size={15} className="text-emerald-300 mt-0.5 shrink-0" /> : <Circle size={15} className="text-white/35 mt-0.5 shrink-0" />}
                      <span className={`text-xs leading-relaxed ${task.done ? "text-white/35 line-through" : "text-white/75"}`}>{task.text}</span>
                    </button>
                  ))}
                  {tasks.length === 0 && (
                    <p className="text-xs text-white/40 leading-relaxed">Say: Jennie, task add call Aman tomorrow.</p>
                  )}
                </div>
                {upcomingReminders.length > 0 && (
                  <div className="mt-3 rounded-xl bg-white/5 border border-white/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Upcoming Reminders</p>
                    <div className="space-y-1.5">
                      {upcomingReminders.map((reminder) => (
                        <div key={reminder.id} className="flex justify-between gap-2 text-[11px] text-white/60">
                          <span className="truncate">{reminder.message}</span>
                          <span className="text-white/35 shrink-0">{formatDueTime(reminder.dueAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-sky-300 font-semibold">
                    <BookOpen size={14} />
                    Story Mode
                  </div>
                  <span className="text-[10px] text-white/35">{storySessions.length} saved</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["horror", "romance", "thriller", "motivation", "comedy", "sci-fi"].map((genre) => (
                    <button
                      key={genre}
                      onClick={() => setStoryGenre(genre)}
                      className={`rounded-lg px-2 py-2 text-[11px] capitalize transition-colors ${
                        storyGenre === genre ? "bg-sky-400/20 text-sky-200 border border-sky-300/30" : "bg-white/5 text-white/50 border border-white/5 hover:bg-white/10"
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => generateStoryChapter("new", `${storyGenre} story`)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-sky-400/10 hover:bg-sky-400/20 border border-sky-300/15 px-2 py-2 text-[11px] text-sky-200 transition-colors"
                  >
                    <Sparkles size={13} />
                    New
                  </button>
                  <button
                    onClick={() => generateStoryChapter("continue", "continue story")}
                    disabled={!activeStory}
                    className="flex items-center justify-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 border border-white/5 px-2 py-2 text-[11px] text-white/70 transition-colors"
                  >
                    <RotateCcw size={13} />
                    Continue
                  </button>
                </div>
                {activeStory && (
                  <div className="mt-3 rounded-xl bg-white/5 border border-white/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-xs text-white/80 truncate">{activeStory.title}</p>
                      <span className="text-[10px] text-sky-200/70 capitalize">{activeStory.genre}</span>
                    </div>
                    <div className="space-y-1.5">
                      {activeStory.chapters.slice(-3).map((chapter) => (
                        <button
                          key={chapter.id}
                          onClick={() => setStoryImageUrl(chapter.imageUrl)}
                          className="w-full text-left rounded-lg bg-black/20 hover:bg-black/30 px-2 py-1.5 transition-colors"
                        >
                          <p className="text-[11px] text-white/65">{chapter.title}</p>
                          <p className="text-[10px] text-white/35 truncate">{chapter.text}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>
      </main>

      {/* Controls (Dynamic Island Style) */}
      <footer className="absolute bottom-6 md:bottom-10 left-1/2 transform -translate-x-1/2 flex flex-col items-center justify-center z-40 shrink-0 pointer-events-auto">
        <div className="flex items-center gap-2 p-2 rounded-full glass-strong shadow-2xl backdrop-blur-2xl border-white/20 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
             style={{ width: showTextInput ? '380px' : 'auto' }}
        >
          <AnimatePresence>
            {showTextInput && (
              <motion.form 
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: '100%' }}
                exit={{ opacity: 0, width: 0 }}
                onSubmit={handleTextSubmit}
                className="flex items-center gap-2 px-3 overflow-hidden"
              >
                <input 
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Message Jennie..."
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 text-sm font-medium w-full min-w-[200px]"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={!textInput.trim()}
                  className="p-2.5 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-lg hover:shadow-pink-500/50 disabled:opacity-50 disabled:hover:shadow-none transition-all duration-300 hover:scale-105"
                >
                  <Send size={16} />
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {!showTextInput && (
            <>
              <button
                onClick={toggleListening}
                className={`
                  relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-500 shadow-xl overflow-hidden group
                  ${isSessionActive 
                    ? "bg-red-500 hover:bg-red-600 shadow-red-500/40" 
                    : "bg-gradient-to-tr from-violet-600 to-pink-600 hover:shadow-pink-500/50"
                  }
                `}
              >
                {!isSessionActive && (
                  <div className="absolute inset-0 bg-white/20 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                )}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isSessionActive ? "off" : "on"}
                    initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.2 }}
                    className="relative z-10 text-white"
                  >
                    {isSessionActive ? <MicOff size={24} /> : <Mic size={24} />}
                  </motion.div>
                </AnimatePresence>
              </button>
              
              <button
                onClick={() => setShowTextInput(true)}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/20 text-white/70 hover:text-white transition-all duration-300 mx-1"
                title="Type a message"
              >
                <Keyboard size={20} />
              </button>
            </>
          )}

          {showTextInput && (
            <button
              type="button"
              onClick={() => setShowTextInput(false)}
              className="p-2.5 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-white/50 transition-colors shrink-0 ml-1"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
