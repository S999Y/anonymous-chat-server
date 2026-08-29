/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { initAuth } from "@/src/lib/firebase";
import HomeView from "./components/home/HomeView";
import ChatView from "./components/chat/ChatView";

import { MusicProvider } from "./context/MusicContext";

export default function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    initAuth()
      .then(() => setIsAuthReady(true))
      .catch((err) => {
        setAuthError(err.message);
        setIsAuthReady(true);
      });
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-t-[#00FF00] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          <p className="text-[#00FF00] uppercase tracking-widest text-sm">Initializing BABAVONDO...</p>
        </div>
      </div>
    );
  }

  if (authError === "ANONYMOUS_AUTH_DISABLED") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white font-mono">
        <div className="max-w-md w-full bg-zinc-900 border border-[#00FF00]/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,255,0,0.1)]">
          <h2 className="text-[#00FF00] text-xl font-black uppercase mb-4 tracking-tighter">Action Required</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            To allow users to chat without a login, you must enable <span className="text-white font-bold">Anonymous Authentication</span> in your Firebase Console.
          </p>
          <div className="space-y-3 text-xs text-zinc-500 mb-8">
            <p>1. Open <a href="https://console.firebase.google.com/" target="_blank" className="text-[#00FF00] underline">Firebase Console</a></p>
            <p>2. Build → Authentication → Sign-in method</p>
            <p>3. Add "Anonymous" and click Enable</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-[#00FF00] text-black font-bold rounded-xl uppercase tracking-widest hover:scale-105 transition-transform"
          >
            I've enabled it. Refresh.
          </button>
        </div>
      </div>
    );
  }

  return (
    <MusicProvider>
      <div className="min-h-screen bg-black text-white font-sans selection:bg-[#00FF00] selection:text-black">
        {!roomCode ? (
          <HomeView onJoinRoom={setRoomCode} />
        ) : (
          <ChatView roomCode={roomCode} onLeave={() => setRoomCode(null)} />
        )}
      </div>
    </MusicProvider>
  );
}
