import { useState, useEffect, FormEvent } from "react";
import { Send, CheckCircle2, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";

interface PublicInboxViewProps {
  inboxId: string;
}

export default function PublicInboxView({ inboxId }: PublicInboxViewProps) {
  const [inboxOwner, setInboxOwner] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistence for unique sender ID
  const [anonId] = useState(() => {
    let id = localStorage.getItem("fc_anon_id");
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem("fc_anon_id", id);
    }
    return id;
  });

  useEffect(() => {
    const fetchInbox = async () => {
      try {
        const docRef = doc(db, "inboxes", inboxId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setInboxOwner(snap.data().username);
        } else {
          setError("Inbox not found.");
        }
      } catch (err) {
        setError("Error loading inbox.");
      }
    };
    fetchInbox();
  }, [inboxId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      const messagesRef = collection(db, "inboxes", inboxId, "messages");
      await addDoc(messagesRef, {
        text: text.trim(),
        senderId: anonId,
        createdAt: serverTimestamp()
      });
      setSent(true);
      setText("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `inboxes/${inboxId}/messages`);
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
        <div>
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{error}</h1>
          <button onClick={() => window.location.href = "/"} className="text-[#00FF00] text-sm font-mono uppercase underline">Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_50%,_rgba(0,255,0,0.05)_0%,_transparent_100%)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00FF00] to-transparent opacity-20"></div>
        
        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.div 
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 bg-black rounded-2xl border border-zinc-800 flex items-center justify-center mb-4 shadow-xl">
                  <span className="text-4xl">🤫</span>
                </div>
                <h1 className="text-xl font-black text-white italic uppercase tracking-tighter">
                  Send to <span className="text-[#00FF00]">{inboxOwner || "..."}</span>
                </h1>
                <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">Anonymous & Untraceable</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 500))}
                  placeholder="Send me an anonymous message..."
                  className="w-full h-32 bg-black border border-zinc-800 rounded-2xl p-4 text-white placeholder:text-zinc-700 outline-none focus:border-[#00FF00]/50 transition-all resize-none text-sm"
                  autoFocus
                />
                <p className="text-right text-[10px] font-mono text-zinc-600">{text.length}/500</p>
                
                <button
                  disabled={!text.trim() || sending}
                  className="w-full py-4 bg-white hover:bg-[#00FF00] text-black rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sending ? "Transmitting..." : (
                    <>
                      Send Message
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div 
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <div className="w-20 h-20 bg-[#00FF00]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-[#00FF00]" />
              </div>
              <h2 className="text-2xl font-black text-white italic uppercase mb-2">Sent!</h2>
              <p className="text-zinc-500 text-sm mb-8">Your message has been delivered anonymously.</p>
              <button
                onClick={() => setSent(false)}
                className="text-[#00FF00] font-mono text-xs uppercase tracking-widest hover:underline"
              >
                Send another one
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      <p className="mt-8 text-zinc-700 text-[10px] font-mono uppercase tracking-[0.2em]">Powered by BABAVONDO</p>
    </div>
  );
}
