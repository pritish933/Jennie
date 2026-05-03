import { motion } from "motion/react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking";

interface VisualizerProps {
  state: VisualizerState;
}

export default function Visualizer({ state }: VisualizerProps) {
  const getTheme = () => {
    switch (state) {
      case "listening": return { primary: "#a855f7", secondary: "#c084fc", shadow: "rgba(168, 85, 247, 0.6)" }; // Violet
      case "processing": return { primary: "#38bdf8", secondary: "#7dd3fc", shadow: "rgba(56, 189, 248, 0.6)" }; // Sky
      case "speaking": return { primary: "#ec4899", secondary: "#f472b6", shadow: "rgba(236, 72, 153, 0.6)" }; // Pink
      default: return { primary: "#ffffff", secondary: "#e2e8f0", shadow: "rgba(255, 255, 255, 0.2)" }; // White/Idle
    }
  };

  const theme = getTheme();

  const orbAnimation = {
    listening: { scale: [1, 1.1, 1], borderRadius: ["50%", "45%", "50%"], transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } },
    processing: { scale: [0.9, 1.05, 0.9], rotate: [0, 90, 180], transition: { duration: 1, repeat: Infinity, ease: "easeInOut" } },
    speaking: { scale: [1, 1.2, 0.95, 1.1, 1], transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" } },
    idle: { scale: [1, 1.02, 1], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } }
  };

  const ringAnimation = {
    listening: { scale: [1.2, 1.5], opacity: [0.5, 0], transition: { duration: 1.5, repeat: Infinity, ease: "easeOut" } },
    processing: { scale: [1.1, 1.3, 1.1], opacity: [0.2, 0.5, 0.2], transition: { duration: 2, repeat: Infinity, ease: "linear" } },
    speaking: { scale: [1.1, 1.4, 1.1], opacity: [0.3, 0.6, 0.3], transition: { duration: 0.8, repeat: Infinity, ease: "easeOut" } },
    idle: { scale: [1.1, 1.2, 1.1], opacity: [0.1, 0.2, 0.1], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } }
  };

  return (
    <div className="relative flex items-center justify-center w-64 h-64 pointer-events-none">
      {/* Outer Glow Ring */}
      <motion.div
        animate={ringAnimation[state]}
        className="absolute inset-0 rounded-full blur-md border-2"
        style={{ borderColor: theme.primary }}
      />
      
      {/* Secondary Ambient Glow */}
      <motion.div
        animate={orbAnimation[state]}
        className="absolute w-48 h-48 rounded-full blur-[40px]"
        style={{ backgroundColor: theme.shadow }}
      />

      {/* Core Orb */}
      <motion.div
        animate={orbAnimation[state]}
        className="relative w-32 h-32 rounded-full shadow-2xl flex items-center justify-center overflow-hidden"
        style={{ 
          background: `radial-gradient(circle at 30% 30%, ${theme.secondary}, ${theme.primary} 70%)`,
          boxShadow: `0 0 40px ${theme.shadow}, inset 0 0 20px rgba(255,255,255,0.5)`
        }}
      >
        {/* Inner Highlight for 3D effect */}
        <div className="absolute top-2 left-4 w-12 h-6 bg-white/40 rounded-full blur-[4px] transform -rotate-45" />
      </motion.div>
    </div>
  );
}
