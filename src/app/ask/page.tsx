"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChatPanel, ConversationContext, MessageItem } from "@/components/tutor/chat-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

function AskPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function AskPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const conversationIdParam = searchParams.get("conversation_id");
  const skillIdParam = searchParams.get("skill_id");
  const goalIdParam = searchParams.get("goal_id");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [conversation, setConversation] = React.useState<ConversationContext | null>(null);
  const [messages, setMessages] = React.useState<MessageItem[]>([]);

  React.useEffect(() => {
    let mounted = true;

    async function initTutor() {
      try {
        setLoading(true);
        let convId = conversationIdParam;

        // 1. If no conversationId, check existing conversations for this skill or goal, or create one
        if (!convId) {
          const listRes = await fetch(
            `/api/v1/conversations?${skillIdParam ? `skill_id=${skillIdParam}` : ""}${goalIdParam ? `&goal_id=${goalIdParam}` : ""}`
          );

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

            if (!createRes.ok) {
              throw new Error("Failed to initialize conversation");
            }
            const createData = await createRes.json();
            convId = createData.conversation.id;
          }
        }

        // 2. Fetch the conversation and its messages
        const res = await fetch(`/api/v1/conversations/${convId}`);
        if (!res.ok) {
          throw new Error("Unable to load conversation");
        }

        const data = await res.json();
        if (mounted) {
          setConversation(data.conversation);
          setMessages(data.messages || []);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to initialize tutor");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initTutor();
    return () => {
      mounted = false;
    };
  }, [conversationIdParam, skillIdParam, goalIdParam]);

  if (loading) {
    return <AskPageSkeleton />;
  }

  if (error || !conversation) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-20">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Tutor Unavailable</AlertTitle>
          <AlertDescription>{error || "Could not start tutor session."}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push("/today")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Return to Today
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-6 px-4">
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
