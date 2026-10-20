"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChatPanel, ConversationContext, MessageItem } from "@/components/tutor/chat-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StateCard } from "@/components/ui/state-card";

function AskPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 pt-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function AskPageContent() {
  const searchParams = useSearchParams();

  const conversationIdParam = searchParams.get("conversation_id");
  const skillIdParam = searchParams.get("skill_id");
  const goalIdParam = searchParams.get("goal_id");

  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [conversation, setConversation] = React.useState<ConversationContext | null>(null);
  const [messages, setMessages] = React.useState<MessageItem[]>([]);

  const initTutor = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorStatus(null);
      setError(null);
      let convId = conversationIdParam;

      // 1. If no conversationId, check existing conversations for this skill or goal, or create one
      if (!convId) {
        const listRes = await fetch(
          `/api/v1/conversations?${skillIdParam ? `skill_id=${skillIdParam}` : ""}${goalIdParam ? `&goal_id=${goalIdParam}` : ""}`
        );

        if (listRes.status === 401) {
          setErrorStatus(401);
          return;
        }

        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.conversations && listData.conversations.length > 0) {
            convId = listData.conversations[0].id;
          }
        }

        // If still no conversation, create one
        if (!convId) {
          const createRes = await fetch("/api/v1/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              skill_id: skillIdParam || undefined,
              goal_id: goalIdParam || undefined,
            }),
          });

          if (createRes.status === 401) {
            setErrorStatus(401);
            return;
          }

          if (!createRes.ok) {
            throw new Error("Failed to initialize conversation");
          }
          const createData = await createRes.json();
          convId = createData.conversation.id;
        }
      }

      // 2. Fetch the conversation and its messages
      const res = await fetch(`/api/v1/conversations/${convId}`);
      if (res.status === 401) {
        setErrorStatus(401);
        return;
      }
      if (!res.ok) {
        throw new Error("Unable to load conversation");
      }

      const data = await res.json();
      setConversation(data.conversation);
      setMessages(data.messages || []);
    } catch (err: any) {
      setError(err.message || "Failed to initialize tutor");
    } finally {
      setLoading(false);
    }
  }, [conversationIdParam, skillIdParam, goalIdParam]);

  React.useEffect(() => {
    initTutor();
  }, [initTutor]);

  if (loading) {
    return <AskPageSkeleton />;
  }

  if (errorStatus === 401) {
    return (
      <StateCard
        type="unauthorized"
        title="Sign In for AI Tutor"
        description="The Learnitt AI Tutor is strictly grounded in your syllabus, uploaded documents, and verified skill graph."
        actionText="Sign In"
        actionHref="/login?redirect=/ask"
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  if (error || !conversation) {
    return (
      <StateCard
        type="error"
        title="Tutor Session Unavailable"
        description={error || "Could not start tutor session."}
        actionText="Try Again"
        onRetry={initTutor}
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-4 sm:py-6 px-3 sm:px-4">
      <ChatPanel initialConversation={conversation} initialMessages={messages} />
    </div>
  );
}

export default function AskPage() {
  return (
    <React.Suspense fallback={<AskPageSkeleton />}>
      <AskPageContent />
    </React.Suspense>
  );
}
