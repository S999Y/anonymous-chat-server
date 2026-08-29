import { useState, useEffect } from "react";
import { Copy, Check, ExternalLink, Trash2, ArrowLeft, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import MusicToggle from "../MusicToggle";
import GeminiChat from "./GeminiChat";
import { db, auth, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, onSnapshot, deleteDoc } from "firebase/firestore";
import { format } from "date-fns";

interface InboxMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
}

export default function InboxManagerView({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [inboxExists, setInboxExists] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const userId = auth.currentUser?.uid;
  const inboxLink = `${window.location.origin}/?inbox=${userId}`;

  useEffect(() => {
    if (!userId) return;

    const checkInbox = async () => {
      try {
        const docRef = doc(db, "inboxes", userId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setInboxExists(true);
          setUsername(snap.data().username);
        } else {
          setInboxExists(false);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `inboxes/${userId}`);
      } finally {
        setIsLoading(false);
      }
    };

    checkInbox();
  }, [userId]);

  // Subscribe to messages
  useEffect(() => {
    if (!inboxExists || !userId) return;

    const q = query(
      collection(db, "inboxes", userId, "messages"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as InboxMessage[];
      setMessages(msgs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `inboxes/${userId}/messages`);
    });

    return () => unsubscribe();
  }, [inboxExists, userId]);

  const createInbox = async () => {
    if (!username.trim() || !userId) return;

    try {
      await setDoc(doc(db, "inboxes", userId), {
        ownerId: userId,
        username: username.trim(),
        createdAt: serverTimestamp()
      });
      setInboxExists(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `inboxes/${userId}`);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inboxLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteMessage = async (msgId: string) => {
    if (!userId) return;
    try {
      await deleteDoc(doc(db, "inboxes", userId, "messages", msgId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `inboxes/${userId}/messages/${msgId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00FF00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full border-x border-zinc-900 bg-black min-h-screen">
      <header className="p-4 border-b border-zinc-900 sticky top-0 bg-black z-20 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-mono uppercase tracking-widest">Back</span>
        </button>
        <h1 className="text-white font-black italic uppercase italic tracking-tighter">Anonymous Inbox</h1>
        <div className="flex items-center gap-2">
          <GeminiChat />
          <MusicToggle />
        </div>
      </header>

      <main className="flex-1 p-6">
        {!inboxExists ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-sm mx-auto py-12"
          >
            <div className="w-20 h-20 bg-zinc-900 rounded-3xl border border-zinc-800 flex items-center justify-center mx-auto mb-8 shadow-2xl">
              <span className="text-4xl text-[#00FF00]">🔏</span>
            </div>
            <h2 className="text-2xl font-black text-white italic uppercase mb-4">Setup Your Inbox</h2>
            <p className="text-zinc-500 text-sm mb-8">Receive anonymous messages from anyone using a private link.</p>
            
            <div className="space-y-4">
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value.slice(0, 20))}
                placeholder="Pick a public name..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 focus:ring-[#00FF00]/50 transition-all text-sm"
              />
              <button 
                onClick={createInbox}
                disabled={!username.trim()}
                className="w-full bg-white hover:bg-[#00FF00] text-black font-black uppercase tracking-widest py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
              >
                Launch My Inbox
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Share Card */}
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl">
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Your Share Link:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-black border border-zinc-800 px-4 py-3 rounded-xl text-xs font-mono text-zinc-400 truncate">
                  {inboxLink}
                </div>
                <button 
                  onClick={copyLink}
                  className="p-3 bg-white hover:bg-[#00FF00] text-black rounded-xl transition-all"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <a 
                  href={inboxLink} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Messages List */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black italic uppercase tracking-widest text-[#00FF00]">Inbox ({messages.length})</h3>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-zinc-800"></div>
                  <div className="w-1 h-1 rounded-full bg-zinc-800"></div>
                  <div className="w-1 h-1 rounded-full bg-zinc-800"></div>
                </div>
              </div>

              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {messages.map((msg) => (
                    <motion.div 
                      key={msg.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group bg-zinc-900 border border-zinc-800 p-6 rounded-3xl relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => deleteMessage(msg.id)}
                          className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="text-lg font-black text-white italic leading-tight mb-4 break-words">
                        {msg.text}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-tighter">
                          From: ID-{msg.senderId.slice(0, 4)}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-tighter">
                          {msg.createdAt ? format(msg.createdAt.toDate(), "MMM dd, HH:mm") : "..."}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {messages.length === 0 && (
                  <div className="text-center py-20 opacity-20 filter grayscale">
                    <Send className="w-12 h-12 mx-auto mb-4 text-zinc-500" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em]">No secrets shared yet...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
