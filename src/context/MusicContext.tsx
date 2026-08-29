import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";

interface MusicContextType {
  isPlaying: boolean;
  toggleMusic: () => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export function MusicProvider({ children }: { children: ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(() => {
    return localStorage.getItem("bg_music_enabled") === "true";
  });
  
  const playerRef = useRef<any>(null);
  const [youtubeId] = useState("f5uUXWNSDO8"); // User's requested Horror Music

  useEffect(() => {
    // Load YouTube API script
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Define the init function
    window.onYouTubeIframeAPIReady = () => {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player("youtube-player", {
        height: "64",
        width: "64",
        videoId: youtubeId,
        playerVars: {
          autoplay: 1,
          mute: 1, 
          loop: 1,
          playlist: youtubeId,
          controls: 0,
          showinfo: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event: any) => {
            if (isPlaying) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.ENDED && isPlaying) {
              playerRef.current?.playVideo();
            }
          }
        },
      });
    };

    // If API is already loaded, call init directly
    if (window.YT && window.YT.Player) {
      window.onYouTubeIframeAPIReady();
    }

    return () => {
      // Clean up player if needed, although usually handled by component unmount
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []); // Only run once for initialization

  // Separate effect for interaction unlock
  useEffect(() => {
    const handleUnlock = () => {
      if (isPlaying && playerRef.current && typeof playerRef.current.unMute === "function") {
        try {
          playerRef.current.unMute();
          playerRef.current.playVideo();
          playerRef.current.setVolume(50);
        } catch (e) {
          console.warn("Unlock failed:", e);
        }
      }
    };

    window.addEventListener("click", handleUnlock);
    window.addEventListener("touchstart", handleUnlock);

    return () => {
      window.removeEventListener("click", handleUnlock);
      window.removeEventListener("touchstart", handleUnlock);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.playVideo === "function") {
      if (isPlaying) {
        playerRef.current.unMute();
        playerRef.current.playVideo();
        playerRef.current.setVolume(50);
      } else {
        playerRef.current.pauseVideo();
      }
    }
  }, [isPlaying]);

  const toggleMusic = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    localStorage.setItem("bg_music_enabled", String(newState));
  };

  return (
    <MusicContext.Provider value={{ isPlaying, toggleMusic }}>
      {children}
      <div 
        id="youtube-player" 
        className="fixed bottom-[-100px] right-[-100px] pointer-events-none opacity-[0.01] z-[-10]" 
      />
    </MusicContext.Provider>
  );
}

// Global type for YouTube API
declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (context === undefined) {
    throw new Error("useMusic must be used within a MusicProvider");
  }
  return context;
}
