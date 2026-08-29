import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { Send, LogOut, Copy, Check, User, Paperclip, X, Loader2, Download, FileText, FileCode, ImageIcon, Bell, ShieldAlert, AlertTriangle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import MusicToggle from "../MusicToggle";
import GeminiChat from "./GeminiChat";
import { db, auth, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
  setDoc,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { format } from "date-fns";
import { cn } from "@/src/lib/utils";
import { splitFile, reassembleFile, FilePart, MAX_FILE_SIZE } from "@/src/lib/fileShard";

interface ChatViewProps {
  roomCode: string;
  onLeave: () => void;
}

interface MessageFile {
  name: string;
  type: string;
  size: number;
  fileId: string;
  totalParts: number;
  partSize: number;
  masterHash: string;
}

interface Message {
  id: string;
  text?: string;
  file?: MessageFile;
  senderId: string;
  senderName: string;
  senderColor: string;
  createdAt: any;
  readBy?: string[];
}

const COLORS = [
  "#00FF00",
  "#FF00FF",
  "#00FFFF",
  "#FFFF00",
  "#FF3300",
  "#9D00FF",
];

const ADJECTIVES = ["Flash", "Ghost", "Neon", "Cyber", "Electric", "Silent", "Fast"];
const NOUNS = ["User", "Runner", "Proxy", "Nexus", "Shadow", "Volt", "Wave"];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ChatView({ roomCode, onLeave }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [transfer, setTransfer] = useState<{ active: boolean; percent?: number; label?: string }>({ active: false });
  const [downloading, setDownloading] = useState<{ id: string; percent: number; failed?: boolean } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialLoad = useRef(true);
  const hasInitialScrolled = useRef(false);

  // Random Identity
  const [identity] = useState(() => {
    const stored = localStorage.getItem("fc_id");
    if (stored) return JSON.parse(stored);

    const newId = {
      name: `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    localStorage.setItem("fc_id", JSON.stringify(newId));
    return newId;
  });

  // Initialize sound
  useEffect(() => {
    audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
    audioRef.current.volume = 0.5;

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        setNotificationsEnabled(true);
      }
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, "rooms", roomCode, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Message[];

      if (!isInitialLoad.current && snapshot.docChanges().length > 0) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data() as Message;
            if (data.senderId !== auth.currentUser?.uid) {
              audioRef.current?.play().catch(console.error);

              if (document.visibilityState === "hidden" && Notification.permission === "granted") {
                new Notification(`BABAVONDO: ${data.senderName}`, {
                  body: data.text || (data.file ? `Sent a file: ${data.file.name}` : "New message"),
                  icon: "/icon.png",
                });
              }
            }
          }
        });
      }

      setMessages(msgs);
      isInitialLoad.current = false;
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `rooms/${roomCode}/messages`);
    });

    return () => unsubscribe();
  }, [roomCode]);

  // Scroll behavior: start at the bottom (latest messages) on entry, then only
  // auto-scroll when the user is already near the bottom (WhatsApp-style).
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;

    if (!hasInitialScrolled.current) {
      el.scrollTop = el.scrollHeight;
      hasInitialScrolled.current = true;
      return;
    }

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Mark messages as read
  useEffect(() => {
    if (!messages.length || !auth.currentUser) return;

    const unreadMessages = messages.filter((msg) =>
      msg.senderId !== auth.currentUser?.uid &&
      (!msg.readBy || !msg.readBy.includes(auth.currentUser!.uid))
    );

    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async (msg) => {
        try {
          const msgRef = doc(db, "rooms", roomCode, "messages", msg.id);
          await updateDoc(msgRef, {
            readBy: arrayUnion(auth.currentUser!.uid),
          });
        } catch (err) {
          console.debug("Read receipt update failed:", err);
        }
      });
    }
  }, [messages, roomCode]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File too large. Max size is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB.`);
      e.target.value = "";
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    const text = inputText.trim();
    const file = selectedFile;

    setInputText("");
    setSelectedFile(null);
    setUploadError(null);
    setIsProcessing(true);

    try {
      if (file) {
        setTransfer({ active: true, percent: 0, label: "Uploading..." });
      }

      const msgRef = doc(collection(db, "rooms", roomCode, "messages"));

      const messageData: any = {
        senderId: auth.currentUser?.uid,
        senderName: identity.name,
        senderColor: identity.color,
        createdAt: serverTimestamp(),
      };

      if (text) messageData.text = text;

      let splitResult: Awaited<ReturnType<typeof splitFile>> | null = null;

      if (file) {
        setTransfer({ active: true, percent: 0, label: "Uploading..." });
        splitResult = await splitFile(file, (p) => {
          setTransfer({ active: true, percent: Math.round(p * 0.4), label: "Uploading..." });
        });

        const fileMeta: MessageFile = {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          fileId: splitResult.fileId,
          totalParts: splitResult.totalParts,
          partSize: splitResult.partSize,
          masterHash: splitResult.masterHash,
        };
        messageData.file = fileMeta;
      }

      await setDoc(msgRef, messageData);

      if (file && splitResult) {
        const partsRef = collection(db, "rooms", roomCode, "messages", msgRef.id, "parts");
        // Write parts in chunks so large files don't send tens of MB in one commit.
        const BATCH_SIZE = 20;
        const total = splitResult.parts.length;
        for (let start = 0; start < total; start += BATCH_SIZE) {
          const batch = writeBatch(db);
          const chunk = splitResult.parts.slice(start, start + BATCH_SIZE);
          chunk.forEach((part: FilePart) => {
            batch.set(doc(partsRef, String(part.index)), { index: part.index, data: part.data });
          });
          await batch.commit();
          const done = Math.min(start + BATCH_SIZE, total);
          setTransfer({ active: true, percent: 45 + Math.round((done / total) * 55), label: "Uploading..." });
        }
      }

      setTransfer({ active: true, percent: 100, label: "Done" });

      await updateDoc(doc(db, "rooms", roomCode), {
        lastActivity: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("Send error:", err);
      const msg = err?.message || String(err);
      let friendly = "Failed to send. Please try again.";
      if (msg.includes("permission-denied") || msg.includes("Missing or insufficient permissions")) {
        friendly = "Permission denied: the Firestore rules need to be updated to allow file uploads. Deploy the updated firestore.rules file.";
      } else if (msg.includes("too large")) {
        friendly = msg;
      }
      setUploadError(friendly);
    } finally {
      setIsProcessing(false);
      setTransfer({ active: false });
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async (msg: Message) => {
    const file = msg.file;
    if (!file || downloading) return;

    try {
      setDownloading({ id: msg.id, percent: 0 });

      const partsRef = collection(db, "rooms", roomCode, "messages", msg.id, "parts");
      const q = query(partsRef, orderBy("index", "asc"));
      const snap = await getDocs(q);

      if (snap.size !== file.totalParts) {
        throw new Error(`Expected ${file.totalParts} parts but found ${snap.size}. The file may be incomplete.`);
      }

      const parts: FilePart[] = snap.docs.map((d) => d.data() as FilePart);

      const { file: blob, checksumMatched } = await reassembleFile(parts, file.masterHash, (p) => {
        setDownloading({ id: msg.id, percent: p });
      });

      if (!checksumMatched || !blob) {
        throw new Error("Checksum mismatch: the reconstructed file does not match the original.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setDownloading(null);
    } catch (err: any) {
      console.error("Download error:", err);
      setDownloading({ id: msg.id, percent: 0, failed: true });
      alert(err?.message || "Download failed.");
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (type.includes("code") || type.includes("script") || type.includes("javascript") || type.includes("cpp")) return <FileCode className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto border-x border-zinc-900 bg-black selection:bg-[#00FF00]/30 selection:text-black">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-zinc-900 bg-black/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800 flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono text-zinc-500">ROOM:</span>
            <span className="font-mono font-bold text-[#00FF00] tracking-widest">{roomCode}</span>
            <button
              onClick={copyCode}
              className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-400 hover:text-white"
            >
              {copied ? <Check className="w-3 h-3 text-[#00FF00]" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <GeminiChat />
          <MusicToggle />

          {(!notificationsEnabled || Notification.permission === "default") && (
            <button
              onClick={requestNotificationPermission}
              className="p-2 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800 active:scale-95 text-zinc-500 hover:text-[#00FF00]"
              title="Enable Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={onLeave}
            className="p-2 hover:bg-zinc-900 rounded-xl transition-all border border-transparent hover:border-zinc-800 active:scale-95 group"
          >
            <LogOut className="w-5 h-5 text-zinc-500 group-hover:text-red-500" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 filter grayscale">
            <div className="w-16 h-16 border-2 border-dashed border-zinc-500 rounded-2xl flex items-center justify-center mb-4">
              <User className="w-8 h-8 text-zinc-500" />
            </div>
            <p className="font-mono text-xs uppercase tracking-widest">Waiting for data sync...</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === auth.currentUser?.uid;
            const showName = index === 0 || messages[index - 1].senderId !== msg.senderId;
            const isDownloading = downloading?.id === msg.id;

            return (
              <motion.div
                layout
                initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[85%]",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {showName && (
                  <span className="text-[10px] font-mono uppercase tracking-widest mb-1 opacity-50 flex items-center gap-1.5" style={{ color: msg.senderColor }}>
                    {!isMe && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: msg.senderColor }} />}
                    {msg.senderName}
                    {isMe && <span className="text-zinc-600">(YOU)</span>}
                  </span>
                )}
                <div
                  className={cn(
                    "p-3 rounded-2xl text-sm leading-relaxed border overflow-hidden",
                    isMe
                      ? "bg-zinc-900 border-zinc-800 rounded-tr-none text-white shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                      : "bg-black border-zinc-800 rounded-tl-none text-zinc-300"
                  )}
                >
                  {msg.file && (
                    <div className={cn(
                      "rounded-xl relative overflow-hidden",
                      isMe ? "bg-black/40" : "bg-zinc-900/40"
                    )}>
                      <div className="flex items-center gap-3 p-3">
                        <div className="p-2.5 bg-[#00FF00]/10 rounded-lg text-[#00FF00] flex-shrink-0">
                          {getFileIcon(msg.file.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate text-zinc-100">{msg.file.name}</p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-tighter flex items-center gap-1">
                            {formatBytes(msg.file.size)}
                            <span className="opacity-60">•</span>
                            {msg.file.type.split("/")[1] || "Unknown"}
                          </p>
                        </div>

                        {isDownloading ? (
                          <div className="w-16 flex-shrink-0 -mx-1">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-[#00FF00] animate-pulse" />
                              <span className="text-[10px] font-mono text-[#00FF00]">
                                {downloading.percent}%
                              </span>
                            </div>
                            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-[#00FF00] transition-all duration-150"
                                style={{ width: `${downloading.percent}%` }}
                              />
                            </div>
                            <p className="text-[7px] font-mono uppercase text-zinc-500 mt-0.5">
                              {downloading.failed ? "Failed" : "Syncing"}
                            </p>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownload(msg)}
                            className="flex-shrink-0 p-2 bg-[#00FF00]/10 border border-[#00FF00]/30 text-[#00FF00] rounded-lg hover:bg-[#00FF00] hover:text-black transition-all active:scale-95"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {msg.file.totalParts > 1 && (
                        <p className="text-[8px] text-zinc-600 uppercase tracking-tighter font-mono px-3 pb-2 flex items-center gap-1">
                          <ShieldAlert className="w-2.5 h-2.5 text-[#00FF00]" />
                          Split into {msg.file.totalParts} parts • verified
                        </p>
                      )}
                    </div>
                  )}
                  {msg.text && (
                    <div className="whitespace-pre-wrap break-words">
                      {msg.text}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] font-mono opacity-30 uppercase">
                    {msg.createdAt ? format(msg.createdAt.toDate(), "HH:mm") : "..."}
                  </span>
                  {isMe && msg.readBy && msg.readBy.length > 0 && (
                    <span className="text-[8px] font-mono text-[#00FF00] uppercase opacity-70 flex items-center gap-1">
                      <Check className="w-2 h-2" />
                      READ
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </main>

      {/* Input */}
      <footer className="p-4 bg-black/80 backdrop-blur-xl border-t border-zinc-900">
        <AnimatePresence>
          {selectedFile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 relative"
            >
              <div className="relative flex items-center gap-3 p-3 bg-zinc-900 border border-[#00FF00]/20 rounded-xl max-w-sm">
                <div className="p-2 bg-[#00FF00]/10 rounded-lg text-[#00FF00]">
                  {getFileIcon(selectedFile.type || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black truncate">{selectedFile.name}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-none mt-1">
                    {formatBytes(selectedFile.size)} • Ready to send
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug text-red-300 break-words">{uploadError}</p>
            <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-white flex-shrink-0 p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

        {/* WhatsApp-style upload progress */}
        <AnimatePresence>
          {transfer.active && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-3 rounded-xl border border-[#00FF00]/20 bg-zinc-900 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#00FF00]">
                    {transfer.percent !== undefined && transfer.percent < 100 ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {transfer.percent !== undefined && transfer.percent >= 100 ? "Sent" : "Uploading"}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {transfer.percent !== undefined ? `${Math.round(transfer.percent)}%` : ""}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00FF00] transition-all duration-200"
                    style={{ width: `${transfer.percent ?? 0}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={handleSendMessage}
          className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-2xl border border-zinc-800 ring-1 ring-white/5"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-3 text-zinc-500 hover:text-[#00FF00] hover:bg-zinc-800 rounded-xl transition-all active:scale-95 disabled:opacity-50"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <textarea
            autoFocus
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e as any);
              }
            }}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent px-2 py-3 outline-none text-sm placeholder:text-zinc-700 resize-none max-h-32 min-h-[44px]"
          />
          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedFile) || isProcessing}
            className="p-3 bg-white hover:bg-[#00FF00] text-black rounded-xl transition-all disabled:opacity-0 active:scale-95 group"
          >
            <Send className="w-4 h-4 group-hover:rotate-12 transition-transform" />
          </button>
        </form>
        <p className="text-[8px] text-zinc-700 mt-2 text-center uppercase tracking-widest font-mono">
          Files are split & verified (SHA-256) • Shift+Enter for newline • Max 20MB
        </p>
      </footer>
    </div>
  );
}
