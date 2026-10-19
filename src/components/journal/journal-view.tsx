"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  BookMarked,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Layers,
  PenTool,
  Plus,
  Send,
  Sparkles,
  WifiOff,
  Smile,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { queueOfflineAction } from "@/lib/offline/outbox";
import { syncOutbox } from "@/lib/offline/sync";

// Lazy-load RichTextEditor per PRD S13 & Phase L8 Requirement 5
const LazyRichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((mod) => mod.RichTextEditor),
  {
    loading: () => <Skeleton className="h-44 w-full rounded-lg" />,
    ssr: false,
  }
);

export interface JournalEntryItem {
  id: string;
  entry_id: string;
  version: number;
  client_id?: string | null;
  body: string;
  mood?: number | null;
  linked_check_in_id?: string | null;
  linked_skill_id?: string | null;
  created_at: string;
  total_versions?: number;
  history?: JournalEntryItem[];
  skills?: {
    id: string;
    name: string;
  } | null;
}

const MOODS = [
  { value: 1, emoji: "😫", label: "Exhausted" },
  { value: 2, emoji: "😕", label: "Struggling" },
  { value: 3, emoji: "😐", label: "Neutral" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "🚀", label: "Energized" },
];

interface JournalViewProps {
  initialEntries: JournalEntryItem[];
  skills?: Array<{ id: string; name: string }>;
}

export function JournalView({ initialEntries, skills = [] }: JournalViewProps) {
  const searchParams = useSearchParams();
  const prefillParam = searchParams.get("prefill");
  const prefillSkillId = searchParams.get("skill_id");

  const [entries, setEntries] = React.useState<JournalEntryItem[]>(initialEntries);
  const [editorContent, setEditorContent] = React.useState(prefillParam ? decodeURIComponent(prefillParam) : "");
  const [selectedMood, setSelectedMood] = React.useState<number | null>(null);
  const [selectedSkillId, setSelectedSkillId] = React.useState<string>(prefillSkillId || "");
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<{ text: string; offline?: boolean } | null>(null);

  // Weekly Summary states
  const [includeJournalInSummary, setIncludeJournalInSummary] = React.useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = React.useState(false);
  const [weeklySummary, setWeeklySummary] = React.useState<{
    summary: string;
    stats: any;
    includedJournal: boolean;
  } | null>(null);

  // Expanded history accordion map
  const [expandedHistory, setExpandedHistory] = React.useState<Record<string, boolean>>({});

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanBody = editorContent.trim();
    if (!cleanBody || isSaving) return;

    setIsSaving(true);
    setSaveMessage(null);
    const clientId = `jnl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (isOffline) {
      // Save offline through Outbox (PRD Section 10 & L8 Requirement 6)
      await queueOfflineAction({
        client_id: clientId,
        operation: "journal",
        payload: {
          entry_id: editingEntryId || undefined,
          body: cleanBody,
          mood: selectedMood,
          linked_skill_id: selectedSkillId || null,
        },
      });

      // Add optimistic local entry
      const optimisticEntry: JournalEntryItem = {
        id: clientId,
        entry_id: editingEntryId || clientId,
        version: editingEntryId ? 2 : 1,
        client_id: clientId,
        body: cleanBody,
        mood: selectedMood,
        linked_skill_id: selectedSkillId || null,
        created_at: new Date().toISOString(),
      };

      setEntries((prev) => [optimisticEntry, ...prev]);
      setSaveMessage({ text: "Saved offline. Will sync automatically upon reconnect.", offline: true });
      resetForm();
      setIsSaving(false);
      return;
    }

    try {
      const url = editingEntryId ? `/api/v1/journal/${editingEntryId}` : "/api/v1/journal";
      const method = editingEntryId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_id: editingEntryId || undefined,
          body: cleanBody,
          mood: selectedMood,
          linked_skill_id: selectedSkillId || null,
          client_id: clientId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save journal entry");
      }

      const data = await res.json();
      setSaveMessage({ text: editingEntryId ? "Created new entry version." : "Journal entry saved." });

      // Refresh entries
      const listRes = await fetch("/api/v1/journal");
      if (listRes.ok) {
        const listData = await listRes.json();
        setEntries(listData.entries || []);
      }

      resetForm();
    } catch (err: any) {
      // Network drop: fallback to outbox
      await queueOfflineAction({
        client_id: clientId,
        operation: "journal",
        payload: {
          entry_id: editingEntryId || undefined,
          body: cleanBody,
          mood: selectedMood,
          linked_skill_id: selectedSkillId || null,
        },
      });
      setSaveMessage({ text: "Connection interrupted: saved to offline outbox.", offline: true });
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setEditorContent("");
    setSelectedMood(null);
    setEditingEntryId(null);
  };

  const handleStartEdit = (entry: JournalEntryItem) => {
    setEditingEntryId(entry.id);
    setEditorContent(entry.body);
    setSelectedMood(entry.mood ?? null);
    setSelectedSkillId(entry.linked_skill_id || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Weekly Summary generation (L8 Requirement 5)
  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const res = await fetch("/api/v1/journal/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          include_journal: includeJournalInSummary,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate weekly summary");
      }

      const data = await res.json();
      setWeeklySummary(data);
    } catch (err: any) {
      alert(`Could not generate summary: ${err.message}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const toggleHistory = (key: string) => {
    setExpandedHistory((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookMarked className="h-6 w-6 text-primary" />
            <span>Learning Journal</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture takeaways, notes, and study reflections. Edits create immutable version histories.
          </p>
        </div>

        {/* Weekly Summary Action Trigger */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            className="gap-2 border-primary/30 hover:border-primary"
          >
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span>{isGeneratingSummary ? "Summarising..." : "Summarise my week"}</span>
          </Button>
        </div>
      </div>

      {/* Weekly Summary Card (if generated) */}
      {weeklySummary && (
        <Card className="border-purple-500/30 bg-purple-500/5 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-purple-950 dark:text-purple-200">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <span>Weekly Momentum Summary</span>
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {weeklySummary.includedJournal ? "Includes Journal" : "Structured Stats Only"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Generated adaptively with positive reinforcement based on your study momentum.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {weeklySummary.summary}
            </p>
            {weeklySummary.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-purple-500/20 text-xs">
                <div>
                  <span className="text-muted-foreground block">Weekly Hours</span>
                  <span className="font-semibold text-foreground">{weeklySummary.stats.weekly_hours}h</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Sessions Completed</span>
                  <span className="font-semibold text-foreground">{weeklySummary.stats.completed_sessions}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Quizzes Passed</span>
                  <span className="font-semibold text-foreground">{weeklySummary.stats.passed_quizzes}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Period</span>
                  <span className="font-semibold text-foreground">{weeklySummary.stats.period}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Entry Editor Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <PenTool className="h-4 w-4 text-primary" />
              <span>{editingEntryId ? "Edit Journal Entry (Creates New Version)" : "New Reflection"}</span>
            </CardTitle>
            {editingEntryId && (
              <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 text-xs">
                Cancel Edit
              </Button>
            )}
          </div>
          <CardDescription className="text-xs">
            Reflect on what clicked, where you stumbled, or key formulas. Private and never sent to AI by default.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSave}>
          <CardContent className="space-y-4">
            {/* Lazy-Loaded Rich Text Editor */}
            <LazyRichTextEditor
              value={editorContent}
              onChange={setEditorContent}
              placeholder="What did you learn today? What surprised you or remains unclear?"
            />

            {/* Mood selector (1 to 5) */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Session Mood (Optional):
              </span>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => {
                  const isSelected = selectedMood === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setSelectedMood(isSelected ? null : m.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? "bg-primary/10 border-primary text-primary shadow-xs"
                          : "bg-muted/30 border-border hover:bg-muted text-foreground"
                      }`}
                    >
                      <span className="text-base leading-none">{m.emoji}</span>
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Link to Skill (optional) */}
            {skills.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Link to Skill (Optional):
                </span>
                <select
                  value={selectedSkillId}
                  onChange={(e) => setSelectedSkillId(e.target.value)}
                  className="w-full sm:w-72 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-2xs outline-hidden focus:ring-2 focus:ring-ring"
                >
                  <option value="">No linked skill</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Strict Privacy Gate: Include in weekly summary option */}
            <div className="flex items-center space-x-2 pt-2 border-t border-border/50">
              <Checkbox
                id="include-journal"
                checked={includeJournalInSummary}
                onCheckedChange={(checked) => setIncludeJournalInSummary(Boolean(checked))}
              />
              <label
                htmlFor="include-journal"
                className="text-xs text-muted-foreground leading-normal cursor-pointer select-none"
              >
                Include my journal in AI weekly summaries (never sent to AI otherwise)
              </label>
            </div>

            {saveMessage && (
              <Alert className={saveMessage.offline ? "bg-amber-500/10 border-amber-500/30 text-xs py-2" : "bg-emerald-500/10 border-emerald-500/30 text-xs py-2"}>
                {saveMessage.offline ? <WifiOff className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                <AlertDescription className="text-xs font-medium">{saveMessage.text}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t pt-3">
            <span className="text-[11px] text-muted-foreground">
              Offline outbox syncs automatically when signal is restored.
            </span>
            <Button type="submit" disabled={!editorContent.trim() || isSaving} className="gap-2">
              <Send className="h-3.5 w-3.5" />
              <span>{isSaving ? "Saving..." : editingEntryId ? "Save New Version" : "Save Entry"}</span>
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Timeline Section */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span>Timeline</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            <BookMarked className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No journal entries yet</p>
            <p className="text-xs mt-1">Start writing your reflections above or copy answers from the Tutor.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const entryKey = entry.entry_id || entry.id;
              const hasHistory = entry.history && entry.history.length > 0;
              const isHistoryExpanded = expandedHistory[entryKey];
              const moodMeta = MOODS.find((m) => m.value === entry.mood);

              return (
                <Card key={entry.id} className="shadow-2xs overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {moodMeta && (
                          <Badge variant="outline" className="text-xs gap-1 py-0.5">
                            <span>{moodMeta.emoji}</span>
                            <span>{moodMeta.label}</span>
                          </Badge>
                        )}
                        {entry.version > 1 && (
                          <Badge variant="secondary" className="text-[11px] font-mono">
                            v{entry.version}
                          </Badge>
                        )}
                        {entry.skills?.name && (
                          <Badge variant="outline" className="text-xs gap-1 py-0.5">
                            <Layers className="h-3 w-3 text-primary" />
                            <span>{entry.skills.name}</span>
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{new Date(entry.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}</span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div
                      className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: entry.body }}
                    />

                    {/* Version History Accordion */}
                    {hasHistory && (
                      <div className="pt-2 border-t">
                        <button
                          type="button"
                          onClick={() => toggleHistory(entryKey)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          <History className="h-3.5 w-3.5 text-primary" />
                          <span>
                            {isHistoryExpanded ? "Hide version history" : `View ${entry.history!.length} earlier version(s)`}
                          </span>
                          {isHistoryExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {isHistoryExpanded && (
                          <div className="mt-3 space-y-2.5 pl-3 border-l-2 border-muted">
                            {entry.history!.map((hist) => (
                              <div key={hist.id} className="text-xs space-y-1 bg-muted/20 p-2.5 rounded-md">
                                <div className="flex items-center justify-between text-muted-foreground">
                                  <span className="font-mono font-medium">Version {hist.version}</span>
                                  <span>{new Date(hist.created_at).toLocaleDateString()}</span>
                                </div>
                                <div
                                  className="text-muted-foreground leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: hist.body }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="flex justify-end border-t pt-2.5 pb-2.5 bg-muted/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(entry)}
                      className="h-7 text-xs gap-1.5"
                    >
                      <PenTool className="h-3.5 w-3.5" />
                      <span>Edit (new version)</span>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
