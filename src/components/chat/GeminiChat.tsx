import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, X, Bot, User, Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import Markdown from "react-markdown";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function GeminiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm Gemini, your AI assistant. How can I help you today?" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          history: messages
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${error.message}. Make sure to set GEMINI_API_KEY in your Vercel Dashboard.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-[#00FF00] hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all active:scale-90 flex items-center justify-center gap-2"
        title="Chat with Gemini"
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-[10px] font-mono uppercase tracking-tighter hidden sm:inline">
          Gemini
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:justify-end sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-full sm:w-[400px] h-[75vh] sm:h-auto sm:max-h-[min(700px,calc(100vh-48px))] bg-zinc-950 border border-zinc-800 sm:rounded-3xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00FF00]/10 flex items-center justify-center border border-[#00FF00]/20">
                    <Bot className="w-5 h-5 text-[#00FF00]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-tighter">Gemini AI</h3>
                    <p className="text-[10px] text-[#00FF00] opacity-70 font-mono uppercase">Online</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide"
              >
                {messages.map((msg, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "flex gap-3 max-w-[85%]",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border",
                      msg.role === 'user' 
                        ? "bg-zinc-800 border-zinc-700" 
                        : "bg-[#00FF00]/10 border-[#00FF00]/20"
                    )}>
                      {msg.role === 'user' ? <User className="w-4 h-4 text-zinc-400" /> : <Bot className="w-4 h-4 text-[#00FF00]" />}
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user'
                        ? "bg-zinc-800 text-white rounded-tr-none"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none"
                    )}>
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-code:text-[#00FF00] prose-headings:text-white prose-strong:text-white">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3 max-w-[85%]">
                    <div className="w-8 h-8 rounded-full bg-[#00FF00]/10 border border-[#00FF00]/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-[#00FF00]" />
                    </div>
                    <div className="p-3 bg-zinc-900 border border-zinc-800 text-zinc-500 rounded-2xl rounded-tl-none flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs font-mono uppercase">Gemini is thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex gap-2"
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Gemini anything..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00FF00]/50 transition-colors"
                  />
                  <button
                    disabled={!input.trim() || isLoading}
                    className="p-3 bg-[#00FF00] text-black rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
                <p className="text-[9px] text-center text-zinc-600 mt-3 uppercase tracking-widest font-mono">
                  Gemini may produce inaccurate information.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
