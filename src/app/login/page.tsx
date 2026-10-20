"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OtpInput } from "@/components/ui/otp-input";
import { PixelField } from "@/components/motion/pixel-field";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/today";
  const supabase = createClient();

  const [email, setEmail] = React.useState("");
  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [otpCode, setOtpCode] = React.useState("");
  const [otpLength, setOtpLength] = React.useState<number>(8);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [demoCode, setDemoCode] = React.useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sign in with Google.";
      setErrorMsg(message);
      toast.error(message);
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setDemoCode(null);

      // 1. Call server OTP endpoint that uses Supabase Admin + Resend email delivery
      const res = await fetch("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.devCode) {
          // If Resend is running on testing tier and cannot email external recipients,
          // devCode allows frictionless testing for friends and pilot users
          setDemoCode(data.devCode);
          setOtpCode(data.devCode);
          setOtpLength(data.devCode.length);
          toast.info(`Verification code: ${data.devCode}`);
        } else {
          toast.success("Verification code sent to your email.");
        }
        setStep("otp");
        return;
      }

      // Fallback directly to client Supabase OTP if endpoint had an issue
      const { error: sbError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`,
        },
      });

      if (sbError) {
        throw new Error(data.error || sbError.message || "Failed to send code.");
      }

      toast.success("Verification code sent to your email.");
      setStep("otp");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send code.";
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (tokenToVerify?: string) => {
    const token = (tokenToVerify ?? otpCode).trim();
    if (!token || token.length < 6) {
      setErrorMsg("Please enter the full verification code.");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });

      if (error) {
        // If regular type: email fails, also check magiclink
        const { error: mlError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token,
          type: "magiclink" as any,
        });

        if (mlError) {
          throw error;
        }
      }

      toast.success("Signed in successfully.");

      // Refresh router and perform clean browser navigation to sync all cookies
      router.refresh();
      window.location.href = redirectTarget;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid code. Please try again.";
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-background text-foreground overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <PixelField />
      </div>

      <Card className="relative z-10 w-full max-w-md bg-card/95 border-border shadow-2xl backdrop-blur-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-mono text-xs font-bold">
              L
            </div>
            <span className="font-mono text-sm tracking-widest uppercase text-muted-foreground">
              Learnitt
            </span>
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {step === "email" ? "Welcome to Learnitt" : "Enter verification code"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            {step === "email"
              ? "Sign in with your email to continue your personalized study loop."
              : `We sent a code to ${email}. Enter it below.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMsg && (
            <Alert variant="destructive" className="py-2 text-xs">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {demoCode && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-primary">
                <Sparkles className="size-3.5" />
                <span>Sign-In Code Ready</span>
              </div>
              <p className="text-muted-foreground">
                Code: <span className="font-mono font-bold text-foreground tracking-wider">{demoCode}</span> (auto-filled below)
              </p>
            </div>
          )}

          {step === "email" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 border-border hover:bg-accent flex items-center justify-center gap-2"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.6 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.87 0 3.12.8 3.83 1.48l2.6-2.5A9.4 9.4 0 0 0 12 3.4a9.6 9.6 0 1 0 0 19.2c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.1-.15-1.58Z" />
                </svg>
                <span>Continue with Google</span>
              </Button>

              <div className="relative my-4 flex items-center">
                <div className="w-full border-t border-border" />
                <span className="absolute left-1/2 -translate-x-1/2 bg-card px-2 text-[11px] font-mono uppercase text-muted-foreground">
                  or email code
                </span>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 bg-surface border-border text-foreground"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-primary text-primary-foreground hover:opacity-90 font-medium"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Sending code...
                    </>
                  ) : (
                    "Send sign-in code"
                  )}
                </Button>
              </form>
            </>
          ) : (
            <div className="space-y-5">
              <div className="flex justify-center py-2">
                <OtpInput
                  length={otpLength}
                  value={otpCode}
                  onValueChange={setOtpCode}
                  onComplete={(code) => handleVerifyOtp(code)}
                  separator={otpLength === 8}
                  autoFocus
                  disabled={loading}
                  className="gap-1.5"
                />
              </div>

              <Button
                type="button"
                onClick={() => handleVerifyOtp()}
                className="w-full h-10 bg-primary text-primary-foreground hover:opacity-90 font-medium"
                disabled={loading || otpCode.length < 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify and sign in"
                )}
              </Button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setOtpCode("");
                    setErrorMsg(null);
                    setDemoCode(null);
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="size-3" />
                  Change email
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => handleSendOtp(e)}
                  className="text-xs text-primary hover:underline transition-colors"
                >
                  Resend code
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginContent />
    </React.Suspense>
  );
}
