"use client";

import * as React from "react";
import {
  Bold,
  Italic,
  List,
  Heading2,
  Code,
  Quote,
  RotateCcw,
} from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your reflections here...",
  className,
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const isInternalChangeRef = React.useRef(false);

  // Sync external value changes into editor DOM without losing cursor
  React.useEffect(() => {
    if (editorRef.current) {
      if (isInternalChangeRef.current) {
        isInternalChangeRef.current = false;
        return;
      }
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
  }, [value]);

  const executeCommand = (command: string, arg?: string) => {
    if (disabled) return;
    document.execCommand(command, false, arg);
    if (editorRef.current) {
      isInternalChangeRef.current = true;
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      isInternalChangeRef.current = true;
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-input bg-background shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-all",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {/* Editor Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5 rounded-t-lg">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Bold"
          onClick={() => executeCommand("bold")}
          disabled={disabled}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Italic"
          onClick={() => executeCommand("italic")}
          disabled={disabled}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Heading"
          onClick={() => executeCommand("formatBlock", "<h2>")}
          disabled={disabled}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Bullet List"
          onClick={() => executeCommand("insertUnorderedList")}
          disabled={disabled}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Quote"
          onClick={() => executeCommand("formatBlock", "<blockquote>")}
          disabled={disabled}
        >
          <Quote className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Code Block"
          onClick={() => executeCommand("formatBlock", "<pre>")}
          disabled={disabled}
        >
          <Code className="h-3.5 w-3.5" />
        </Button>
        <div className="h-4 w-px bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground"
          title="Clear Format"
          onClick={() => executeCommand("removeFormat")}
          disabled={disabled}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Editable Surface */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        data-placeholder={placeholder}
        className={cn(
          "min-h-[140px] max-h-[400px] overflow-y-auto px-3.5 py-3 text-sm leading-relaxed outline-hidden",
          "prose prose-sm dark:prose-invert max-w-none",
          "[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground [&:empty]:before:pointer-events-none"
        )}
      />
    </div>
  );
}
