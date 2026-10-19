"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, FileText, ShieldCheck } from "lucide-react";

export interface ConsentPreviewItem {
  id: string;
  title: string;
  chunkCount: number;
  byteSize: number | null;
}

export interface ConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: ConsentPreviewItem[];
  totalChunks: number;
  onConsentResponse: (granted: boolean) => Promise<void>;
}

export function ConsentDialog({
  open,
  onOpenChange,
  materials,
  totalChunks,
  onConsentResponse,
}: ConsentDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);

  const handleDecision = async (granted: boolean) => {
    try {
      setSubmitting(true);
      await onConsentResponse(granted);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5 text-brand" />
            <DialogTitle>AI Materials Processing Consent</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Before Learnitt analyzes your study materials to link skills and build quizzes, we ask
            for your explicit consent. Here is what will be sent to the AI engine:
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 max-h-56 overflow-y-auto rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
          {materials.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
              <AlertCircle className="size-4" />
              <span>No materials currently loaded.</span>
            </div>
          ) : (
            materials.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/20 last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{m.title}</span>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {m.chunkCount} {m.chunkCount === 1 ? "chunk" : "chunks"}
                </Badge>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{materials.length} total documents</span>
          <span className="font-semibold">{totalChunks} total chunks</span>
        </div>

        <DialogFooter className="mt-4 flex sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleDecision(false)}
          >
            Decline
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={submitting}
            onClick={() => handleDecision(true)}
          >
            Allow AI Processing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
