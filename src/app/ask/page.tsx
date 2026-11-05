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
  const [skillsList, setSkillsList] = React.useState<Array<{ id: string; name: string; goal_id?: string }>>([]);

  const initTutor = React.useCallback(
    async (overrideGoalId?: string, overrideSkillId?: string, forceNew?: boolean) => {
      try {
        setLoading(true);
        setErrorStatus(null);
        setError(null);
        let convId = forceNew ? null : conversationIdParam;
        let targetGoalId = overrideGoalId ?? goalIdParam ?? undefined;
        let targetSkillId = overrideSkillId ?? skillIdParam ?? undefined;

        // Fetch user's active goal & skills so the tutor defaults to the active goal
        try {
          const metaRes = await fetch("/api/v1/quizzes");
          if (metaRes.status === 401) {
            setErrorStatus(401);
            return;
          }
          if (metaRes.ok) {
            const metaJson = await metaRes.json();
            if (!targetGoalId && metaJson.active_goal_id) {
              targetGoalId = metaJson.active_goal_id;
            }
            const allSkills: Array<{ id: string; name: string; goal_id: string }> =
              metaJson.available_skills || [];
            const scoped = targetGoalId
              ? allSkills.filter((s) => s.goal_id === targetGoalId)
              : allSkills;
            setSkillsList(scoped);
            if (!targetSkillId && scoped.length > 0 && overrideGoalId) {
              targetSkillId = scoped[0].id;
            }
          }
        } catch {
          // Ignore metadata fetch errors
        }

        // 1. If no conversationId, check existing conversations for this skill or goal, or create one
        if (!convId) {
          const queryParts: string[] = [];
          if (targetSkillId) queryParts.push(`skill_id=${encodeURIComponent(targetSkillId)}`);
          if (targetGoalId) queryParts.push(`goal_id=${encodeURIComponent(targetGoalId)}`);
          const listRes = await fetch(`/api/v1/conversations?${queryParts.join("&")}`);

          if (listRes.status === 401) {
            setErrorStatus(401);
            return;
          }

          if (listRes.ok && !forceNew) {
            const listData = await listRes.json();
            if (listData.conversations && listData.conversations.length > 0) {
              convId = listData.conversations[0].id;
            }
          }

          // If still no conversation, create one grounded in the active goal & skill
          if (!convId) {
            const createRes = await fetch("/api/v1/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                skill_id: targetSkillId || undefined,
                goal_id: targetGoalId || undefined,
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
    },
    [conversationIdParam, skillIdParam, goalIdParam]
  );

  React.useEffect(() => {
    void initTutor();
  }, [initTutor]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onGoalChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ goalId?: string }>).detail;
      void initTutor(detail?.goalId, undefined, false);
    };
    window.addEventListener("learnitt:goal-changed", onGoalChanged);
    return () => window.removeEventListener("learnitt:goal-changed", onGoalChanged);
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
      <ChatPanel
        key={conversation.id}
        initialConversation={conversation}
        initialMessages={messages}
        skillsList={skillsList}
        onSwitchSkill={(newSkillId) => {
          void initTutor(conversation.goal_id || undefined, newSkillId || undefined, false);
        }}
      />
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
