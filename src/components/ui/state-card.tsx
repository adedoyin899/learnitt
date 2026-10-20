"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, AlertCircle, ArrowLeft, RotateCcw, Sparkles } from "lucide-react";

interface StateCardProps {
  type: "unauthorized" | "error" | "empty";
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onRetry?: () => void;
  secondaryText?: string;
  secondaryHref?: string;
}

export function StateCard({
  type,
  title,
  description,
  actionText,
  actionHref,
  onRetry,
  secondaryText = "Return to Today",
  secondaryHref = "/today",
}: StateCardProps) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 sm:py-24 text-center">
      <Card className="border-border/80 bg-card/90 backdrop-blur-md shadow-xl p-6 sm:p-8">
        <CardContent className="space-y-5 p-0">
          <div
            className={`size-14 rounded-2xl flex items-center justify-center mx-auto ${
              type === "unauthorized"
                ? "bg-primary/10 text-primary border border-primary/20"
                : type === "error"
                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {type === "unauthorized" ? (
              <Lock className="size-6" />
            ) : type === "error" ? (
              <AlertCircle className="size-6" />
            ) : (
              <Sparkles className="size-6" />
            )}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            {onRetry && (
              <Button
                variant="default"
                size="sm"
                onClick={onRetry}
                className="w-full text-xs font-semibold h-9 gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                <span>{actionText || "Try Again"}</span>
              </Button>
            )}

            {!onRetry && actionHref && (
              <Link href={actionHref} className="w-full">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full text-xs font-semibold h-9"
                >
                  {actionText || (type === "unauthorized" ? "Sign In" : "Continue")}
                </Button>
              </Link>
            )}

            {secondaryHref && (
              <Link href={secondaryHref} className="w-full">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-9 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>{secondaryText}</span>
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
