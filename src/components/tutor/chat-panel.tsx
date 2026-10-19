"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Sparkles,
  BookOpen,
  BookmarkPlus,
  Edit3,
  HelpCircle,
  Lightbulb,
  Code2,
  FileText,
  AlertCircle,
  ExternalLink,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export interface CitationItem {
  id: string;
  material_id: string;
  material_title?: string;
  content: string;
  ordinal: number;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  cited_chunk_ids: string[];
  general_knowledge: boolean;
  citations?: CitationItem[];
  created_at: string;
  explanation?: {
    style: string;
    text: string;
  } | null;
}

export interface ConversationContext {
  id: string;
  skill_id?: string | null;
  goal_id?: string | null;
  skills?: { id: string; name: string } | null;
  goals?: { id: string; title: string; health_flag: boolean } | null;
}

interface ChatPanelProps {
  initialConversation: ConversationContext;
  initialMessages: MessageItem[];
  skillsList?: Array<{ id: string; name: string }>;
}

export function ChatPanel({
  initialConversation,
  initialMessages,
  skillsList: _skillsList = [],
}: ChatPanelProps) {
  const router = useRouter();
  const [conversation] = React.useState(initialConversation);
  const [messages, setMessages] = React.useState<MessageItem[]>(initialMessages);
  const [inputQuestion, setInputQuestion] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [explainingMessageId, setExplainingMessageId] = React.useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = React.useState<CitationItem | null>(null);
  const [savedCardSuccessIds, setSavedCardSuccessIds] = React.useState<Record<string, boolean>>({});

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle Question Submission (PRD Section 7.5 & L8 Requirement 1)
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputQuestion.trim();
    if (!query || isSubmitting) return;

    setInputQuestion("");
    setIsSubmitting(true);

    // Optimistically add user message
    const tempUserMsg: MessageItem = {
      id: `temp-${Date.now()}`,
      conversation_id: conversation.id,
      role: "user",
      content: query,
      cited_chunk_ids: [],
      general_knowledge: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/v1/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: query }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to send message");
      }

      const data = await res.json();
      const asstMsg: MessageItem = {
        ...data.assistantMessage,
        citations: data.citedChunks || [],
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === tempUserMsg.id ? data.userMessage : m)).concat(asstMsg)
      );
    } catch (err: any) {
      // Show error assistant bubble
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          conversation_id: conversation.id,
          role: "assistant",
          content: `Unable to get answer: ${err.message}`,
          cited_chunk_ids: [],
          general_knowledge: false,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Explain Styles (PRD Section 7.5 & L8 Requirement 3: simpler, more technical, with an example)
  const handleExplain = async (messageId: string, style: "simpler" | "more_technical" | "with_example") => {
    setExplainingMessageId(messageId);
    try {
      const res = await fetch(`/api/v1/messages/${messageId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate explanation");
      }

      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, explanation: { style, text: data.explanation } }
            : m
        )
      );
    } catch (err: any) {
      alert(`Could not adapt explanation: ${err.message}`);
    } finally {
      setExplainingMessageId(null);
    }
  };

  // Handle "Make this a flashcard" (L8 Requirement 4)
  const handleMakeFlashcard = async (msg: MessageItem) => {
    // Locate the preceding user question
    const msgIndex = messages.findIndex((m) => m.id === msg.id);
    const questionText =
      msgIndex > 0 && messages[msgIndex - 1].role === "user"
        ? messages[msgIndex - 1].content
        : "Core Concept";

    try {
      const res = await fetch("/api/v1/saved-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_id: conversation.skill_id,
          question: questionText,
          answer: msg.content,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save flashcard");
      }

      setSavedCardSuccessIds((prev) => ({ ...prev, [msg.id]: true }));
    } catch (err: any) {
      alert(`Could not save flashcard: ${err.message}`);
    }
  };

  // Handle "Add to journal" (L8 Requirement 4)
  const handleAddToJournal = (msg: MessageItem) => {
    const encoded = encodeURIComponent(msg.content);
    const skillParam = conversation.skill_id ? `&skill_id=${conversation.skill_id}` : "";
    router.push(`/journal?prefill=${encoded}${skillParam}`);
  };

  const isHealthGoal = Boolean(conversation.goals?.health_flag);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-4xl mx-auto border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Top Header & Health Standing Note */}
      <div className="border-b bg-muted/30 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">
                {conversation.skills?.name
                  ? `Tutor: ${conversation.skills.name}`
                  : "Personal Grounded Tutor"}
              </h1>
              <p className="text-xs text-muted-foreground">
                Grounded strictly in your uploaded materials and confirmed skill chunks.
              </p>
            </div>
          </div>

          {conversation.skills?.name && (
            <Badge variant="outline" className="text-xs gap-1 py-1">
              <Layers className="h-3 w-3 text-primary" />
              <span>Skill: {conversation.skills.name}</span>
            </Badge>
          )}
        </div>

        {/* PRD S12 & L8 Requirement 7: Health-flagged goals standing note */}
        {isHealthGoal && (
          <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 py-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-xs font-semibold">Health & Medical Content Notice</AlertTitle>
            <AlertDescription className="text-xs font-medium">
              This is for learning. It is not medical advice.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <BookOpen className="h-10 w-10 mb-3 opacity-40 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Ask anything about your study materials</h2>
            <p className="text-xs max-w-md mt-1">
              Ask questions to understand difficult passages, explore edge cases, or get clear explanations
              grounded directly in your uploaded notes and textbooks.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-xs"
                      : "bg-muted/60 text-foreground border border-border/60 rounded-bl-xs space-y-3"
                  }`}
                >
                  {/* General Knowledge Badge (L8 Requirement 1) */}
                  {!isUser && msg.general_knowledge && (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[11px] font-medium gap-1"
                    >
                      <HelpCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                      <span>General knowledge, not from your materials</span>
                    </Badge>
                  )}

                  {/* Message Content */}
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Citations List (L8 Requirement 1) */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-border/50">
                      <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                        Cited Sources:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((c, idx) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCitation(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-card border hover:border-primary/50 text-foreground transition-colors cursor-pointer shadow-2xs"
                          >
                            <FileText className="h-3 w-3 text-primary" />
                            <span className="font-medium">
                              Passage {idx + 1} ({c.material_title || "Material"})
                            </span>
                            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-60" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Explanation Style Output (L8 Requirement 3) */}
                  {!isUser && msg.explanation && (
                    <div className="mt-3 rounded-lg border bg-background/80 p-3 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-semibold text-primary">
                        <span className="capitalize">
                          {msg.explanation.style.replace("_", " ")} Explanation
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {msg.explanation.text}
                      </p>
                    </div>
                  )}

                  {/* Assistant Actions Bar (L8 Requirements 3 & 4) */}
                  {!isUser && (
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 text-xs">
                      {/* Explain styles buttons */}
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground mr-1">Explain:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                          disabled={explainingMessageId === msg.id}
                          onClick={() => handleExplain(msg.id, "simpler")}
                        >
                          <Lightbulb className="mr-1 h-3 w-3 text-amber-500" /> Simpler
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                          disabled={explainingMessageId === msg.id}
                          onClick={() => handleExplain(msg.id, "more_technical")}
                        >
                          <Code2 className="mr-1 h-3 w-3 text-blue-500" /> More Technical
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                          disabled={explainingMessageId === msg.id}
                          onClick={() => handleExplain(msg.id, "with_example")}
                        >
                          <FileText className="mr-1 h-3 w-3 text-emerald-500" /> With Example
                        </Button>
                      </div>

                      {/* Journal & Flashcard Actions */}
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                          onClick={() => handleAddToJournal(msg)}
                          title="Copy this answer into your study journal"
                        >
                          <Edit3 className="mr-1 h-3 w-3 text-purple-500" /> Add to journal
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 text-[11px] px-1.5 ${
                            savedCardSuccessIds[msg.id]
                              ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => handleMakeFlashcard(msg)}
                          title="Save as a self-rated flashcard for spaced review"
                        >
                          {savedCardSuccessIds[msg.id] ? (
                            <>
                              <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> Saved!
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="mr-1 h-3 w-3 text-indigo-500" /> Make this a flashcard
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="p-3 border-t bg-muted/20 flex gap-2 items-end">
        <Textarea
          placeholder="Ask a question about your study materials..."
          value={inputQuestion}
          onChange={(e) => setInputQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          className="resize-none text-sm"
          disabled={isSubmitting}
        />
        <Button
          type="submit"
          disabled={!inputQuestion.trim() || isSubmitting}
          className="h-10 px-4 gap-1.5"
        >
          {isSubmitting ? (
            <span className="text-xs">Thinking...</span>
          ) : (
            <>
              <span>Ask</span>
              <Send className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </form>

      {/* Citation Passage Modal */}
      <Dialog open={!!selectedCitation} onOpenChange={() => setSelectedCitation(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              <span>Cited Material Passage</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Source: {selectedCitation?.material_title || "Verified Chunk"} (Chunk {selectedCitation?.ordinal})
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 rounded-lg border bg-muted/30 text-sm font-serif leading-relaxed text-foreground max-h-80 overflow-y-auto whitespace-pre-wrap">
            {selectedCitation?.content}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
