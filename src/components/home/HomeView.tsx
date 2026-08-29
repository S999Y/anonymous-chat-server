import { useState, useEffect, FormEvent } from "react";
import { Plus, Hash, ArrowRight, Zap, Github, Facebook, Instagram, Globe, MailQuestion } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, OperationType, handleFirestoreError, initAuth, auth } from "@/src/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { cn } from "@/src/lib/utils";
import InboxManagerView from "../chat/InboxManagerView";
import PublicInboxView from "../chat/PublicInboxView";
import MusicToggle from "../MusicToggle";
import GeminiChat from "../chat/GeminiChat";

interface HomeViewProps {
  onJoinRoom: (code: string) => void;
}

export default function HomeView({ onJoinRoom }: HomeViewProps) {
  const [view, setView] = useState<"options" | "manager" | "public">("options");
  const [inputCode, setInputCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [publicInboxId, setPublicInboxId] = useState<string | null>(null);

  useEffect(() => {
    // Check if URL has ?inbox=ID
    const params = new URLSearchParams(window.location.search);
    const inboxId = params.get("inbox");
    if (inboxId) {
      setPublicInboxId(inboxId);
      setView("public");
    }
    
    if (!auth.currentUser) {
      initAuth();
    }
  }, []);

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars like 0, O, I, 1
    let result = "";
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateRoom = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      // Ensure we have a user session
      if (!auth.currentUser) {
        await initAuth();
        if (!auth.currentUser) throw new Error("Could not establish a secure session. Please check your connection.");
      }

      let code = generateCode();
      let roomSnap = await getDoc(doc(db, "rooms", code));
      
      // Retry if collision
      let retries = 0;
      while (roomSnap.exists() && retries < 3) {
        code = generateCode();
        roomSnap = await getDoc(doc(db, "rooms", code));
        retries++;
      }

      const roomRef = doc(db, "rooms", code);
      await setDoc(roomRef, {
        code,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      });

      onJoinRoom(code);
    } catch (err: any) {
      console.error("Room creation error:", err);
      // Friendly error message
      if (err?.message?.includes("insufficient permissions")) {
        setError("Security error: Check if Firebase is correctly configured.");
      } else {
        setError(err?.message || "Failed to create room. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinByCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = inputCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError("Room code must be 4 characters");
      return;
    }

    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      // Ensure session
      if (!auth.currentUser) await initAuth();

      const roomSnap = await getDoc(doc(db, "rooms", code));
      if (roomSnap.exists()) {
        onJoinRoom(code);
      } else {
        setError("Room not found. Check the code.");
      }
    } catch (err: any) {
      console.error("Join error:", err);
      setError(err?.message || "Could not connect to room.");
    } finally {
      setIsLoading(false);
    }
  };

  if (view === "manager") {
    return <InboxManagerView onBack={() => setView("options")} />;
  }

  if (view === "public" && publicInboxId) {
    return <PublicInboxView inboxId={publicInboxId} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-20 relative overflow-hidden font-mono selection:bg-[#00FF00]/30 selection:text-black">
      {/* Top Bar for Control */}
      <div className="absolute top-6 right-6 z-40 flex items-center gap-3">
        <GeminiChat />
        <MusicToggle />
      </div>

      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00FF00]/5 blur-[120px] rounded-full -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center justify-center p-0 bg-[#00FF00]/10 rounded-full mb-6 ring-2 ring-[#00FF00]/40 overflow-hidden w-32 h-32 shadow-[0_0_30px_rgba(0,255,0,0.2)]">
          <img 
            src="/icon.png" 
            alt="BABAVONDO Icon" 
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback if image not found
              e.currentTarget.src = "https://api.dicebear.com/7.x/avataaars/svg?seed=Babavondo";
            }}
          />
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 italic uppercase">
          BABA<span className="text-[#00FF00]">VONDO</span>
        </h1>
        <p className="text-zinc-500 uppercase tracking-[0.2em] text-xs font-mono">
          Instant anonymous messaging
        </p>
      </motion.div>

      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4">
          <p className="px-4 text-[8px] text-zinc-500 uppercase tracking-[0.25em] font-mono leading-relaxed font-bold text-center opacity-80">
            CREATE A SECURE SPACE TO TALK WITH ANYONE AS ANONYMOUS — JUST LIKE MESSENGER.
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreateRoom}
            disabled={isLoading}
            className="w-full flex items-center justify-between p-6 bg-[#00FF00] text-black rounded-2xl font-black uppercase tracking-tighter text-xl disabled:opacity-50 group border-b-4 border-black/20"
          >
            <span className="flex items-center gap-3">
              <Plus className={cn("w-6 h-6 stroke-[3]", isLoading && "animate-spin")} />
              {isLoading && !inputCode ? "Creating..." : "New Room"}
            </span>
            <Zap className="w-5 h-5 fill-black group-hover:scale-125 transition-transform" />
          </motion.button>
        </div>

        <div className="space-y-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-900" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase bg-black px-4 text-zinc-600 font-mono tracking-[0.3em]">
              OR JOIN BY CODE
            </div>
          </div>

          <motion.form 
            onSubmit={handleJoinByCode}
            className="relative group"
          >
            <div className="absolute inset-0 bg-[#00FF00]/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-2xl" />
            <div className="relative flex items-center">
              <Hash className="absolute left-6 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                maxLength={4}
                className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-[#00FF00] focus:ring-0 rounded-2xl p-6 pl-14 font-mono text-2xl tracking-[0.5em] uppercase placeholder:text-zinc-700 transition-all outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || inputCode.length !== 4}
                className="absolute right-3 p-3 bg-white text-black rounded-xl disabled:opacity-0 transition-all hover:bg-[#00FF00]"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          </motion.form>
        </div>

        <div className="pt-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView("manager")}
            className="w-full flex items-center justify-between p-6 bg-zinc-900 border border-zinc-800 text-white rounded-2xl font-black uppercase tracking-tighter text-xl disabled:opacity-50 group border-b-4 border-black/20 hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all"
          >
            <span className="flex items-center gap-3">
              <MailQuestion className="w-6 h-6 text-[#00FF00]" />
              Anonymous Inbox
            </span>
            <ArrowRight className="w-5 h-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </motion.button>
          <p className="px-4 mt-3 text-[9px] text-zinc-700 uppercase tracking-widest font-mono text-center">
            Share a link to receive private secrets
          </p>
        </div>

        {error && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-red-500 text-center text-sm font-mono uppercase tracking-wider"
          >
            {error}
          </motion.p>
        )}
      </div>

      <div className="mt-20 grid grid-cols-2 gap-8 text-center text-[10px] uppercase tracking-widest text-zinc-600 font-mono">
        <div>
          <p className="border-b border-zinc-800 pb-2 mb-2">No Registration</p>
          <p>Just the code.</p>
        </div>
        <div>
          <p className="border-b border-zinc-800 pb-2 mb-2">Private Rooms</p>
          <p>End-to-end intent.</p>
        </div>
      </div>

      {/* Social Links */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 flex items-center gap-6"
      >
        <a 
          href="https://github.com/joyanddas500" 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-[#00FF00] hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all active:scale-90"
          title="GitHub"
        >
          <Github className="w-5 h-5" />
        </a>
        <a 
          href="https://www.facebook.com/joydas.io" 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-[#00FF00] hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all active:scale-90"
          title="Facebook"
        >
          <Facebook className="w-5 h-5" />
        </a>
        <a 
          href="https://www.instagram.com/joydas.io" 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-[#00FF00] hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all active:scale-90"
          title="Instagram"
        >
          <Instagram className="w-5 h-5" />
        </a>
        <a 
          href="https://babavondotv.vercel.app/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-[#00FF00] hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all active:scale-90"
          title="Website"
          onClick={(e) => {
            if (e.currentTarget.getAttribute('href') === '#') {
              e.preventDefault();
              alert("Website coming soon!");
            }
          }}
        >
          <Globe className="w-5 h-5" />
        </a>
      </motion.div>
    </div>
  );
}
