"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionItemProps {
  value: string;
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Accordion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("divide-y divide-border rounded-lg border", className)}>{children}</div>;
}

export function AccordionItem({
  value,
  title,
  children,
  defaultOpen = false,
  className,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-medium transition-all hover:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180 text-foreground"
          )}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 text-sm animate-in fade-in-50 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
