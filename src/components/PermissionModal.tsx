import React from "react";
import { motion } from "motion/react";
import { AlertTriangle, KeyRound, Lock, MicOff } from "lucide-react";

export type PermissionIssue = "microphone" | "secure-context" | "api-key" | "live-api" | "browser";

interface Props {
  onClose: () => void;
  issue?: PermissionIssue;
  detail?: string;
}

const issueCopy: Record<PermissionIssue, {
  title: string;
  description: string;
  icon: React.ReactNode;
  steps: string[];
}> = {
  microphone: {
    title: "Microphone Blocked",
    description: "Your browser blocked microphone access for this site. Jennie cannot hear you until you allow it.",
    icon: <MicOff size={32} className="text-red-400" />,
    steps: [
      "Click the lock or tune icon next to the URL bar.",
      "Open Site settings and set Microphone to Allow.",
      "Refresh this page, then start Jennie again.",
    ],
  },
  "secure-context": {
    title: "HTTPS Required",
    description: "Browsers allow microphone access only on HTTPS sites or localhost.",
    icon: <Lock size={32} className="text-amber-300" />,
    steps: [
      "Open the Netlify link with https:// at the start.",
      "Avoid opening the app from a local file path or a plain http:// custom domain.",
      "Refresh the HTTPS page and try the mic again.",
    ],
  },
  "api-key": {
    title: "Gemini Key Missing",
    description: "The app loaded, but the server function does not have a Gemini API key for Jennie's voice.",
    icon: <KeyRound size={32} className="text-sky-300" />,
    steps: [
      "In Netlify, add GEMINI_API_KEY in Site settings > Environment variables.",
      "Redeploy the site after adding the variable so Netlify Functions receive it.",
      "Do not add this key as VITE_GEMINI_API_KEY; it must stay server-side.",
    ],
  },
  "live-api": {
    title: "Voice Service Error",
    description: "Microphone may be allowed, but Jennie's live voice session could not connect.",
    icon: <AlertTriangle size={32} className="text-orange-300" />,
    steps: [
      "Check that GEMINI_API_KEY is valid in Netlify environment variables.",
      "If the API key is restricted, allow server/API usage for the key.",
      "Redeploy and refresh the page.",
    ],
  },
  browser: {
    title: "Microphone Unavailable",
    description: "This browser or device is not exposing a microphone to the app.",
    icon: <MicOff size={32} className="text-red-400" />,
    steps: [
      "Make sure a microphone is connected and working.",
      "Try Chrome or Edge on the HTTPS Netlify link.",
      "Refresh the page after changing browser or device permissions.",
    ],
  },
};

export default function PermissionModal({ onClose, issue = "microphone", detail }: Props) {
  const copy = issueCopy[issue];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-[#111] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500" />

        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          {copy.icon}
        </div>

        <h2 className="text-2xl font-serif font-medium text-white mb-3">{copy.title}</h2>
        <p className="text-white/60 text-sm mb-6 leading-relaxed">
          {copy.description}
        </p>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-left w-full mb-8">
          <p className="text-sm text-white/80 font-medium mb-2">How to fix this:</p>
          <ol className="text-xs text-white/60 list-decimal pl-4 space-y-2">
            {copy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {detail && (
            <p className="mt-4 rounded-lg bg-black/30 px-3 py-2 text-[11px] text-white/40 break-words">
              Error: {detail}
            </p>
          )}
        </div>

        <div className="flex flex-col w-full gap-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 px-4 bg-white text-black font-medium rounded-xl hover:bg-gray-200 transition-colors"
          >
            I've fixed it, Refresh Page
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 px-4 bg-white/5 text-white/70 font-medium rounded-xl hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
