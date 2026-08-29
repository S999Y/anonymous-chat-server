import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useMusic } from "../context/MusicContext";

export default function MusicToggle() {
  const { isPlaying, toggleMusic } = useMusic();

  return (
    <button 
      onClick={toggleMusic}
      className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-[#00FF00] hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all active:scale-90 flex items-center justify-center gap-2"
      title={isPlaying ? "Mute Music" : "Play Music"}
    >
      {isPlaying ? (
        <Volume2 className="w-5 h-5 animate-pulse text-[#00FF00]" />
      ) : (
        <VolumeX className="w-5 h-5" />
      )}
      <span className="text-[10px] font-mono uppercase tracking-tighter hidden sm:inline">
        {isPlaying ? "Live" : "Mute"}
      </span>
    </button>
  );
}
