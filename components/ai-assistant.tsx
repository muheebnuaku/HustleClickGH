"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { 
  X, 
  Send, 
  Bot, 
  User, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX,
  Loader2 
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// TypeScript declarations for Web Speech API
interface ISpeechRecognitionEvent extends Event {
  results: {
    length: number;
    [index: number]: {
      [index: number]: { transcript: string; confidence: number };
      isFinal: boolean;
    };
  };
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): ISpeechRecognition };
    webkitSpeechRecognition: { new (): ISpeechRecognition };
  }
}

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! 👋 I'm HustleBot. Tap the mic to speak, double-tap to open chat!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [streamingText, setStreamingText] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const pendingTranscriptRef = useRef<string>("");
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const isListeningRef = useRef<boolean>(false); // Track listening state for callbacks
  const speechQueueRef = useRef<string[]>([]); // Queue for speech chunks
  const isSpeakingChunkRef = useRef<boolean>(false); // Track if currently speaking a chunk

  // Common misheard words mapping (speech recognition often mishears these)
  const soundAlikeWords: Record<string, string> = {
    // Survey variations
    "savvy": "survey",
    "savvies": "surveys",
    "savi": "survey",
    "savie": "survey",
    "serve": "survey",
    "serves": "surveys",
    "survey's": "surveys",
    "cervey": "survey",
    "servey": "survey",
    "survy": "survey",
    "survay": "survey",
    // Dashboard variations
    "dash board": "dashboard",
    "dashbord": "dashboard",
    "dash bored": "dashboard",
    // Profile variations
    "profil": "profile",
    "pro file": "profile",
    // Referral variations
    "referal": "referral",
    "referel": "referral",
    "refferal": "referral",
    "reffaral": "referral",
    "refer all": "referral",
    // Income variations
    "in come": "income",
    "incom": "income",
    // Withdraw variations
    "with draw": "withdraw",
    "withdrawal": "withdraw",
    "widraw": "withdraw",
    "witdraw": "withdraw",
  };

  // Normalize text by replacing misheard words
  const normalizeText = (text: string): string => {
    let normalized = text.toLowerCase();
    for (const [misheard, correct] of Object.entries(soundAlikeWords)) {
      normalized = normalized.replace(new RegExp(misheard, "gi"), correct);
    }
    return normalized;
  };

  // Quick navigation patterns - detect these for fast response
  const navigationPatterns: { patterns: RegExp[]; path: string; responses: string[] }[] = [
    { patterns: [/open (my )?profile/i, /go to (my )?profile/i, /show (my )?profile/i], path: "/profile", responses: ["Sure!", "On it!", "Opening profile!"] },
    { patterns: [/open dashboard/i, /go to dashboard/i, /show dashboard/i, /take me to dashboard/i], path: "/dashboard", responses: ["Alright!", "Got it!", "Opening dashboard!"] },
    { patterns: [/open (my )?survey(s)?/i, /go to (my )?survey(s)?/i, /show (my )?survey(s)?/i, /my survey(s)?/i], path: "/my-surveys", responses: ["Sure thing!", "Opening your surveys!", "Got it!"] },
    { patterns: [/create (a )?survey/i, /new survey/i, /make (a )?survey/i], path: "/my-surveys/create", responses: ["Let's create one!", "Sure!", "Opening survey creator!"] },
    { patterns: [/open survey(s)?/i, /available survey(s)?/i, /show survey(s)?/i, /go to survey(s)?/i, /the survey(s)?/i], path: "/surveys", responses: ["Sure!", "Opening surveys!", "Let's find surveys!"] },
    { patterns: [/open income/i, /go to income/i, /show income/i, /my earnings/i, /show earnings/i, /my income/i], path: "/income", responses: ["Opening income!", "Let's check your earnings!", "Sure!"] },
    { patterns: [/open referral/i, /go to referral/i, /show referral/i, /my referral/i, /referral code/i], path: "/referral", responses: ["Opening referral!", "Let's see your code!", "Got it!"] },
    { patterns: [/withdraw/i, /cash out/i, /get my money/i, /want.*(to )?withdraw/i], path: "/income", responses: ["Let's withdraw!", "Opening withdrawals!", "Sure!"] },
    { patterns: [/go home/i, /open home/i, /take me home/i, /home ?page/i], path: "/", responses: ["Going home!", "Sure!", "Alright!"] },
    { patterns: [/log ?out/i, /sign ?out/i], path: "/", responses: ["Logging out!", "See you soon!", "Goodbye!"] },
  ];

  // Check if text matches a quick navigation command
  const checkQuickNavigation = (text: string): { path: string; response: string } | null => {
    // First normalize the text to fix common misheard words
    const normalizedText = normalizeText(text);
    
    for (const nav of navigationPatterns) {
      for (const pattern of nav.patterns) {
        if (pattern.test(normalizedText)) {
          const randomResponse = nav.responses[Math.floor(Math.random() * nav.responses.length)];
          return { path: nav.path, response: randomResponse };
        }
      }
    }
    return null;
  };

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        recognitionRef.current = new SpeechRecognitionAPI();
        recognitionRef.current.continuous = true; // Keep listening
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-GH";

        recognitionRef.current.onresult = (event: ISpeechRecognitionEvent) => {
          let transcript = "";
          let isFinal = false;
          
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              isFinal = true;
            }
          }
          
          setInput(transcript);
          pendingTranscriptRef.current = transcript;
          
          // Clear any existing silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          
          // If we got final result, start silence timer (1.5 seconds)
          if (isFinal && transcript.trim()) {
            silenceTimeoutRef.current = setTimeout(() => {
              // Stop recognition and submit - use ref to check current state
              if (recognitionRef.current && isListeningRef.current) {
                try {
                  recognitionRef.current.stop();
                } catch {
                  // Ignore
                }
              }
            }, 1500); // 1.5 seconds of silence before submitting
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          isListeningRef.current = false;
          // Clear silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          // Auto-submit after short delay if there's text
          if (pendingTranscriptRef.current.trim()) {
            autoSubmitTimeoutRef.current = setTimeout(() => {
              if (pendingTranscriptRef.current.trim()) {
                handleVoiceCommand(pendingTranscriptRef.current);
                pendingTranscriptRef.current = "";
                setInput("");
              }
            }, 500); // Quick submit after recognition ends
          }
        };

        recognitionRef.current.onerror = () => {
          setIsListening(false);
          isListeningRef.current = false;
          pendingTranscriptRef.current = "";
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
        };
      }

      synthRef.current = window.speechSynthesis;
    }
    
    return () => {
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore
        }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle floating button tap - single tap = mic, double tap = chat
  const handleFloatingButtonTap = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    lastTapTimeRef.current = now;

    if (timeSinceLastTap < 300) {
      // Double tap - open chat
      setIsOpen(true);
      // Stop listening if active
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore
        }
        setIsListening(false);
        isListeningRef.current = false;
      }
    } else {
      // Single tap - toggle mic (with delay to check for double tap)
      setTimeout(() => {
        if (Date.now() - lastTapTimeRef.current >= 280) {
          toggleMic();
        }
      }, 300);
    }
  };

  // Toggle microphone
  const toggleMic = () => {
    if (!recognitionRef.current) {
      alert("Voice input is not supported in your browser");
      return;
    }

    if (isListening) {
      // Clear silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      setIsListening(false);
      isListeningRef.current = false;
    } else {
      // Clear any pending timeouts
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
        autoSubmitTimeoutRef.current = null;
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      pendingTranscriptRef.current = "";
      setInput("");
      try {
        recognitionRef.current.start();
        setIsListening(true);
        isListeningRef.current = true;
      } catch {
        // Ignore if already started
      }
    }
  };

  // Handle voice command - quick nav or full AI response
  const handleVoiceCommand = useCallback(async (text: string) => {
    const quickNav = checkQuickNavigation(text);
    
    if (quickNav) {
      // Quick navigation - just say the word and navigate
      setIsOpen(true); // Show chat briefly
      
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: quickNav.response,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, userMessage, botMessage]);
      
      // Speak the quick response
      if (voiceEnabled && synthRef.current) {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(quickNav.response);
        utterance.rate = 1.1;
        utterance.pitch = 1;
        utterance.lang = "en-GB";
        synthRef.current.speak(utterance);
      }
      
      // Navigate quickly
      setTimeout(() => {
        router.push(quickNav.path);
        setTimeout(() => setIsOpen(false), 500);
      }, 800);
      
    } else {
      // Full AI query - open chat and send to API
      setIsOpen(true);
      setInput(text);
      
      // Trigger form submission
      setTimeout(() => {
        const form = document.querySelector('form[data-ai-chat-form]') as HTMLFormElement;
        if (form) {
          form.requestSubmit();
        }
      }, 100);
    }
  }, [router, voiceEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get current page context
  const getPageContext = () => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "my-surveys" && parts[1]) {
      return { page: "survey-detail", surveyId: parts[1] };
    }
    return { page: parts[0] || "home" };
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Parse response for navigation commands
  const parseNavigation = (text: string): { cleanText: string; navigateTo: string | null } => {
    const navMatch = text.match(/\[NAVIGATE:(\/[^\]]+)\]/);
    if (navMatch) {
      return {
        cleanText: text.replace(/\s*\[NAVIGATE:\/[^\]]+\]\s*/g, "").trim(),
        navigateTo: navMatch[1],
      };
    }
    return { cleanText: text, navigateTo: null };
  };

  // Handle navigation
  const handleNavigation = useCallback((path: string) => {
    setTimeout(() => {
      router.push(path);
      setIsOpen(false);
    }, 1500); // Delay to let user see the response
  }, [router]);

  // Remove emojis from text for speech
  const removeEmojis = (text: string): string => {
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, "") // Most emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, "")   // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, "")   // Dingbats
      .replace(/[\u{1F000}-\u{1F02F}]/gu, "") // Mahjong
      .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, "") // Playing cards
      .replace(/\s+/g, " ")                    // Clean up extra spaces
      .trim();
  };

  // Process speech queue - speak next chunk when current finishes
  const processSpeechQueue = useCallback(() => {
    if (!synthRef.current || !voiceEnabled || isSpeakingChunkRef.current) return;
    
    const nextChunk = speechQueueRef.current.shift();
    if (!nextChunk) {
      setIsSpeaking(false);
      return;
    }
    
    isSpeakingChunkRef.current = true;
    setIsSpeaking(true);
    
    const cleanText = removeEmojis(nextChunk);
    if (!cleanText.trim()) {
      isSpeakingChunkRef.current = false;
      processSpeechQueue();
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.1; // Slightly faster for streaming
    utterance.pitch = 1;
    utterance.lang = "en-GB";
    
    utterance.onend = () => {
      isSpeakingChunkRef.current = false;
      processSpeechQueue();
    };
    utterance.onerror = () => {
      isSpeakingChunkRef.current = false;
      processSpeechQueue();
    };
    
    synthRef.current.speak(utterance);
  }, [voiceEnabled]);

  // Add text to speech queue and start speaking
  const speakChunk = useCallback((text: string) => {
    if (!synthRef.current || !voiceEnabled) return;
    speechQueueRef.current.push(text);
    processSpeechQueue();
  }, [voiceEnabled, processSpeechQueue]);

  // Clear speech queue
  const clearSpeechQueue = () => {
    speechQueueRef.current = [];
    isSpeakingChunkRef.current = false;
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
  };

  // Stop speaking
  const stopSpeaking = () => {
    clearSpeechQueue();
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    // Clear any pending auto-submit
    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
    pendingTranscriptRef.current = "";

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);
    setStreamingText("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentInput,
          context: getPageContext(),
          history: messages.filter(m => m.id !== "welcome").map(m => ({
            role: m.role,
            content: m.content
          })),
          stream: true,
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let sentenceBuffer = ""; // Buffer for building sentences

      // Clear any existing speech
      if (voiceEnabled) {
        clearSpeechQueue();
      }

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  setStreamingText(fullText);
                  
                  // Speak chunks as they arrive (by sentence/phrase)
                  if (voiceEnabled) {
                    sentenceBuffer += parsed.text;
                    // Check for sentence endings or natural pauses
                    const sentenceMatch = sentenceBuffer.match(/^(.+?[.!?:,])\s*/);
                    if (sentenceMatch) {
                      const sentence = sentenceMatch[1];
                      speakChunk(sentence);
                      sentenceBuffer = sentenceBuffer.slice(sentenceMatch[0].length);
                    }
                  }
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }

      // Speak any remaining text that wasn't spoken
      if (voiceEnabled && sentenceBuffer.trim()) {
        speakChunk(sentenceBuffer);
      }

      // Parse for navigation commands
      const { cleanText, navigateTo } = parseNavigation(fullText);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: cleanText || "Sorry, something went wrong.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingText("");
      
      // Handle navigation if present (voice already spoken during streaming)
      if (navigateTo) {
        handleNavigation(navigateTo);
      }

    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I couldn't connect. Please try again.",
          timestamp: new Date(),
        },
      ]);
      setStreamingText("");
    } finally {
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    "How do I earn?",
    "Create survey",
    "Withdraw",
  ];

  return (
    <>
      {/* Listening indicator - shows when mic is active */}
      {isListening && !isOpen && (
        <div className="fixed bottom-20 right-7 z-50 flex items-center gap-1.5 bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
          <span className="w-2 h-2 bg-white rounded-full" />
          <span>Listening...</span>
        </div>
      )}

      {/* Floating Button - Single tap = mic, Double tap = chat */}
      <button
        onClick={handleFloatingButtonTap}
        className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-lg transition-all duration-300 ${
          isOpen
            ? "bg-zinc-700 hover:bg-zinc-600"
            : isListening
            ? "bg-red-500 hover:bg-red-600 ring-4 ring-red-300 ring-offset-2 animate-pulse"
            : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
        }`}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <div className="relative">
            {isListening ? (
              <Mic className="h-6 w-6 text-white" />
            ) : (
              <Mic className="h-6 w-6 text-white" />
            )}
            {isListening && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-ping" />
            )}
          </div>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full relative">
                  <Bot className="h-5 w-5 text-white" />
                  {(isSpeaking || isListening) && (
                    <span className={`absolute -top-1 -right-1 w-3 h-3 ${isListening ? 'bg-red-500' : 'bg-yellow-400'} rounded-full animate-ping`} />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-white">HustleBot</h3>
                  <p className="text-xs text-green-100">
                    {isListening ? "🎤 Listening..." : isSpeaking ? "🔊 Speaking..." : "AI Assistant"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMic}
                  className={`p-2 rounded-full transition-colors ${isListening ? 'bg-red-500 animate-pulse' : 'hover:bg-white/20'}`}
                  title={isListening ? "Stop listening" : "Start listening"}
                >
                  {isListening ? (
                    <MicOff className="h-5 w-5 text-white" />
                  ) : (
                    <Mic className="h-5 w-5 text-white" />
                  )}
                </button>
                <button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  title={voiceEnabled ? "Mute voice" : "Enable voice"}
                >
                  {voiceEnabled ? (
                    <Volume2 className="h-5 w-5 text-white" />
                  ) : (
                    <VolumeX className="h-5 w-5 text-white/60" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="h-[300px] overflow-y-auto p-4 space-y-4 bg-zinc-50 dark:bg-zinc-950">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === "user"
                      ? "bg-green-500 text-white"
                      : "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-green-500 text-white rounded-tr-none"
                      : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-none shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            
            {/* Streaming message */}
            {streamingText && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="max-w-[80%] p-3 rounded-2xl rounded-tl-none bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-sm text-sm">
                  {streamingText}
                  <span className="inline-block w-1 h-4 bg-green-500 ml-1 animate-pulse" />
                </div>
              </div>
            )}
            
            {/* Loading indicator */}
            {isLoading && !streamingText && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-white dark:bg-zinc-800 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          {messages.length <= 2 && !isLoading && (
            <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 mb-2">Quick questions:</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      setTimeout(() => sendMessage(), 100);
                    }}
                    className="text-xs px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full hover:border-green-500 hover:text-green-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form
            data-ai-chat-form
            onSubmit={sendMessage}
            className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex gap-2">
              {/* Mic button */}
              <button
                type="button"
                onClick={toggleMic}
                className={`p-2 rounded-full transition-all ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? "Listening... speak now" : "Type or tap mic to speak..."}
                className={`flex-1 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-0 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  isListening ? "text-green-600 font-medium" : ""
                }`}
                disabled={isLoading}
              />

              {isSpeaking ? (
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="p-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-colors"
                >
                  <VolumeX className="h-5 w-5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-2 bg-green-500 hover:bg-green-600 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white rounded-full transition-colors"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
