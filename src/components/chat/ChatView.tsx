import { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { Send, LogOut, Copy, Check, User, Paperclip, X, Download, FileText, FileCode, ImageIcon, Bell, ShieldAlert, AlertTriangle, ArrowDown } from "lucide-react";
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
  deleteDoc,
  startAfter,
  limit,
} from "firebase/firestore";
import { format } from "date-fns";
import { cn } from "@/src/lib/utils";
import { splitFile, reassembleFile, MAX_FILE_SIZE } from "@/src/lib/fileShard";
import type { SplitResult } from "@/src/lib/fileShard";

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
  uploadComplete?: boolean;
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

function ProgressRing({ percent, size = 40, failed = false }: { percent: number; size?: number; failed?: boolean }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = c * (1 - clamped / 100);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className={cn("-rotate-90", failed ? "text-red-500" : "text-[#00FF00]")}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-current opacity-20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {failed ? (
          <AlertTriangle className="w-4 h-4 text-red-500" />
        ) : clamped >= 100 ? (
          <Check className="w-4 h-4 text-[#00FF00]" strokeWidth={3} />
        ) : (
          <span className="text-[9px] font-mono tabular-nums text-[#00FF00] leading-none">{Math.round(clamped)}</span>
        )}
      </div>
    </div>
  );
}

export default function ChatView({ roomCode, onLeave }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
const [isLoading, setIsLoading] = useState(true);
  const [currentUpload, setCurrentUpload] = useState<{ id: string; percent: number } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [downloading, setDownloading] = useState<{ id: string; percent: number; failed?: boolean } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialLoad = useRef(true);
  const hasInitialScrolled = useRef(false);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const pendingMsgRef = useRef<string | null>(null);

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

const notifyFor = (data: Message) => {
    if (data.senderId === auth.currentUser?.uid) return;
    if (data.file && data.uploadComplete !== true) return;

    audioRef.current?.play().catch(console.error);

    if (document.visibilityState === "hidden" && Notification.permission === "granted") {
      new Notification(`BABAVONDO: ${data.senderName}`, {
        body: data.text || (data.file ? `Sent a file: ${data.file.name}` : "New message"),
        icon: "/icon.png",
      });
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, "rooms", roomCode, "messages"),
      orderBy("createdAt", "asc")
    );
    const seenComplete = new Set<string>();

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Message[];
      const me = auth.currentUser?.uid;
      const visible = all.filter(
        (m) => !(m.file && m.uploadComplete !== true && m.senderId !== me)
      );

      if (!isInitialLoad.current && snapshot.docChanges().length > 0) {
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data() as Message;
          if (change.type === "added") {
            if (data.file && data.uploadComplete === true) seenComplete.add(data.id);
            notifyFor(data);
          } else if (change.type === "modified") {
            if (data.file && data.uploadComplete === true && !seenComplete.has(data.id)) {
              seenComplete.add(data.id);
              notifyFor(data);
            }
          }
        });
      }

      setMessages(visible);
      setIsLoading(false);
      isInitialLoad.current = false;
    }, (err) => {
      setIsLoading(false);
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
      atBottomRef.current = true;
      setShowJump(false);
      hasInitialScrolled.current = true;
      return;
    }

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = isNearBottom;
    setShowJump(!isNearBottom);
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
      setNewCount(0);
    }
  }, [messages]);

  // Count messages that arrive while the user is scrolled up.
  useEffect(() => {
    if (messages.length === 0) {
      prevLenRef.current = 0;
      return;
    }
    if (!atBottomRef.current && messages.length > prevLenRef.current) {
      setNewCount((c) => c + (messages.length - prevLenRef.current));
    }
    prevLenRef.current = messages.length;
  }, [messages]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    atBottomRef.current = true;
    setNewCount(0);
    setShowJump(false);
  };

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

    let createdId: string | null = null;

    try {
      const msgRef = doc(collection(db, "rooms", roomCode, "messages"));
      createdId = msgRef.id;
      pendingMsgRef.current = msgRef.id;

      const messageData: any = {
        senderId: auth.currentUser?.uid,
        senderName: identity.name,
        senderColor: identity.color,
        createdAt: serverTimestamp(),
      };

      if (text) messageData.text = text;

      const apply = (pct: number) => {
        setCurrentUpload({ id: msgRef.id, percent: pct });
      };

      let split: SplitResult | undefined;
      if (file) {
        messageData.uploadComplete = false;
        apply(0);
        split = await splitFile(file, (frac) => apply(Math.round(frac * 45)));

        messageData.file = {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          fileId: split.fileId,
          totalParts: split.totalParts,
          partSize: split.partSize,
          masterHash: split.masterHash,
        };
      }

      await setDoc(msgRef, messageData);

      if (split) {
        const partsRef = collection(db, "rooms", roomCode, "messages", msgRef.id, "parts");
        const BYTES_PER_COMMIT = 8 * 1024 * 1024; // stay under Firestore's 10 MiB request cap
        let written = 0;
        let payload = 0;
        let batch = writeBatch(db);
        let batchCount = 0;
        for (let i = 0; i < split.totalParts; i++) {
          const part = split.parts[i];
          batch.set(doc(partsRef, String(part.index)), {
            index: part.index,
            data: part.data,
            createdAt: serverTimestamp(),
          });
          batchCount++;
          payload += part.data.length;
          written++;
          if (batchCount === 400 || payload >= BYTES_PER_COMMIT) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
            payload = 0;
            apply(Math.round(45 + (written / split.totalParts) * 50));
          }
        }
        if (batchCount > 0) {
          await batch.commit();
          apply(Math.round(45 + (written / split.totalParts) * 50));
        }

        await updateDoc(msgRef, { uploadComplete: true });
      }

      apply(100);

      await updateDoc(doc(db, "rooms", roomCode), {
        lastActivity: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("Send error:", err);
      if (createdId) {
        try {
          const partsRef = collection(db, "rooms", roomCode, "messages", createdId, "parts");
          const snap = await getDocs(query(partsRef));
          for (const part of snap.docs) await deleteDoc(part.ref);
          await deleteDoc(doc(db, "rooms", roomCode, "messages", createdId));
        } catch {
          // best-effort cleanup
        }
      }
      const msg = err?.message || String(err);
      let friendly = "Failed to send. Please try again.";
      if (msg.includes("permission-denied") || msg.includes("Missing or insufficient permissions")) {
        friendly = "Permission denied: the Firestore rules need to be updated to allow file uploads. Deploy the updated rules files.";
      } else if (msg.includes("too large")) {
        friendly = msg;
      }
      setUploadError(friendly);
    } finally {
      setIsProcessing(false);
      setCurrentUpload(null);
      pendingMsgRef.current = null;
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
      const apply = (pct: number) => setDownloading({ id: msg.id, percent: pct });
      apply(0);

      const partsRef = collection(db, "rooms", roomCode, "messages", msg.id, "parts");
      const parts: { index: number; data: string }[] = [];
      let cursor = -1;

      while (parts.length < file.totalParts) {
        const q = query(partsRef, orderBy("index", "asc"), startAfter(cursor), limit(50));
        const snap = await getDocs(q);
        if (snap.empty) break;

        for (const d of snap.docs) {
          parts.push({ index: d.data().index as number, data: d.data().data as string });
        }
        cursor = snap.docs[snap.docs.length - 1].get("index") as number;
        apply(Math.round(Math.min(1, parts.length / file.totalParts) * 30));
      }

      if (parts.length === 0) throw new Error("No file parts found. The message may be incomplete.");
      if (parts.length !== file.totalParts) {
        throw new Error(`File is incomplete (${parts.length}/${file.totalParts} parts).`);
      }

      const { blob, checksumMatched } = await reassembleFile(parts, file.masterHash, (frac) => {
        apply(Math.round(30 + frac * 70));
      });

      if (!checksumMatched) {
        setDownloading({ id: msg.id, percent: 0, failed: true });
        throw new Error("File integrity check failed. The stored data is corrupted.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      apply(100);
      window.setTimeout(() => setDownloading(null), 400);
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
<header className="p-3 sm:p-4 flex items-center justify-between gap-2 border-b border-zinc-900 bg-black/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-800 flex items-center gap-2 min-w-0">
            <span className="text-[10px] uppercase font-mono text-zinc-500 hidden sm:inline">ROOM:</span>
            <span className="font-mono font-bold text-[#00FF00] tracking-widest truncate">{roomCode}</span>
            <button
              onClick={copyCode}
              className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-400 hover:text-white flex-shrink-0"
            >
              {copied ? <Check className="w-3 h-3 text-[#00FF00]" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
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
      <div className="relative flex-1 min-h-0">
        <main
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            atBottomRef.current = nearBottom;
            setShowJump(!nearBottom);
          }}
          className="h-full overflow-y-auto px-3 sm:px-4 py-4 space-y-6 scroll-smooth custom-scrollbar"
        >
          {messages.length === 0 ? (
            isLoading ? (
              <div className="flex h-full flex-col justify-end gap-6 pb-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={cn("flex", i % 2 === 0 ? "ml-auto" : "mr-auto", "max-w-[70%]")}>
                    <div className="skeleton-bubble w-32 sm:w-48 h-12" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-20 filter grayscale">
                <div className="w-16 h-16 border-2 border-dashed border-zinc-500 rounded-2xl flex items-center justify-center mb-4">
                  <User className="w-8 h-8 text-zinc-500" />
                </div>
                <p className="font-mono text-xs uppercase tracking-widest">Waiting for the first message...</p>
              </div>
            )
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
                      <div className="flex items-start gap-3 p-3">
                        <div className="p-2.5 bg-[#00FF00]/10 rounded-lg text-[#00FF00] flex-shrink-0">
                          {getFileIcon(msg.file.type)}
                        </div>
                        <div className="flex-1 min-w-0 mr-1">
                          <p className="text-xs font-bold break-all whitespace-normal leading-snug text-zinc-100">{msg.file.name}</p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-tighter mt-1 break-all">
                            {formatBytes(msg.file.size)}
                            <span className="opacity-60">{" "}•{" "}</span>
                            {msg.file.type.split("/")[1] || "Unknown"}
                          </p>
                        </div>

                        {currentUpload?.id === msg.id ? (
                          <ProgressRing percent={currentUpload.percent} />
                        ) : (
                          <button
                            onClick={() => handleDownload(msg)}
                            disabled={!!downloading && !downloading.failed}
                            className="flex-shrink-0 rounded-full w-10 h-10 flex items-center justify-center border-2 border-[#00FF00]/40 text-[#00FF00] hover:bg-[#00FF00] hover:text-black transition-all active:scale-95 disabled:cursor-not-allowed"
                            title="Download"
                            aria-label="Download"
                          >
                            {isDownloading ? (
                              <ProgressRing percent={downloading.percent} size={36} failed={downloading.failed} />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                      <p className="text-[8px] text-zinc-600 uppercase tracking-tighter font-mono px-3 pb-2 flex items-center gap-1">
                        <ShieldAlert className="w-2.5 h-2.5 text-[#00FF00]" />
                        Stored in Firestore
                      </p>
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

        {showJump && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-[#00FF00] text-black shadow-[0_4px_20px_rgba(0,255,0,0.4)] pl-3 pr-4 py-2 font-mono uppercase tracking-widest text-xs transition-all hover:scale-105 active:scale-95"
          >
            <ArrowDown className="w-4 h-4" strokeWidth={3} />
            {newCount > 0 && <span className="tabular-nums">{newCount > 99 ? "99+" : newCount}</span>}
          </button>
        )}
      </div>

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
<div className="relative flex items-start gap-3 p-3 bg-zinc-900 border border-[#00FF00]/20 rounded-xl max-w-full sm:max-w-sm">
                <div className="p-2 bg-[#00FF00]/10 rounded-lg text-[#00FF00] flex-shrink-0">
                  {getFileIcon(selectedFile.type || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black break-all whitespace-normal leading-snug">{selectedFile.name}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-none mt-1 break-all">
                    {formatBytes(selectedFile.size)} • Ready to send
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
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
            className="p-3 text-zinc-500 hover:text-[#00FF00] hover:bg-zinc-800 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex-shrink-0"
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
            className="flex-1 min-w-0 bg-transparent px-2 py-3 outline-none text-sm placeholder:text-zinc-700 resize-none max-h-32 min-h-[44px]"
          />
          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedFile) || isProcessing}
            className="p-3 bg-white hover:bg-[#00FF00] text-black rounded-xl transition-all disabled:opacity-0 active:scale-95 group flex-shrink-0"
          >
            <Send className="w-4 h-4 group-hover:rotate-12 transition-transform" />
          </button>
        </form>
        <p className="text-[8px] text-zinc-700 mt-2 text-center uppercase tracking-widest font-mono">
          Files stored in Firestore (passwordless) • Shift+Enter for newline • Max {Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB
        </p>
      </footer>
    </div>
  );
}
