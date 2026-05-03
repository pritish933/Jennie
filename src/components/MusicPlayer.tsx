import React, { useEffect, useState, useRef } from "react";
import { Music, X, Disc, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MusicPlayerProps {
  query: string;
  onClose: () => void;
}

export default function MusicPlayer({ query, onClose }: MusicPlayerProps) {
  const [track, setTrack] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(false);

    // Fetch from iTunes API (Free, No Auth Required)
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.results && data.results.length > 0) {
          setTrack(data.results[0]);
          // Autoplay handled by audio element's onCanPlay or autoPlay prop
        } else {
          setError(true);
        }
      })
      .catch((err) => {
        console.error("iTunes search error:", err);
        if (isMounted) setError(true);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [query]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className="fixed top-24 right-4 z-50 w-72 rounded-2xl overflow-hidden shadow-[0_10px_40px_-10px_rgba(236,72,153,0.3)] border border-white/10 bg-black/60 backdrop-blur-xl"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center bg-white/5">
        <div className="flex items-center gap-2 text-pink-300/90 text-xs font-semibold tracking-wider uppercase">
          <Music size={14} className={isPlaying ? "animate-bounce" : ""} />
          <span>Jennie's Playlist</span>
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-red-400 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <Loader2 className="animate-spin text-pink-400" size={24} />
            <p className="text-white/60 text-sm">Searching track...</p>
          </div>
        ) : error || !track ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
            <p className="text-red-400/90 text-sm font-medium">Song not found</p>
            <p className="text-white/40 text-xs">Try asking for another song.</p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Album Art / Vinyl */}
            <div className="relative w-16 h-16 shrink-0">
              <div className={`absolute inset-0 rounded-full border-2 border-black overflow-hidden ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''} shadow-lg shadow-pink-500/20`}>
                <img 
                  src={track.artworkUrl100} 
                  alt="Album Art" 
                  className="w-full h-full object-cover"
                />
                {/* Vinyl center hole */}
                <div className="absolute inset-0 m-auto w-3 h-3 bg-black rounded-full border border-white/20"></div>
              </div>
            </div>

            {/* Track Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium text-sm truncate" title={track.trackName}>
                {track.trackName}
              </h3>
              <p className="text-white/50 text-xs truncate mt-1" title={track.artistName}>
                {track.artistName}
              </p>
            </div>

            {/* Hidden Audio Player */}
            <audio
              ref={audioRef}
              src={track.previewUrl}
              autoPlay
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                onClose();
              }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
