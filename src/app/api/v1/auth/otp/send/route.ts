import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getEmailProvider } from "@/lib/email/registry";
import { checkAuthRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";

const sendOtpSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

/**
 * POST /api/v1/auth/otp/send
 * Generates an OTP verification code for a new or existing user using Supabase Admin,
 * and sends it via the configured EmailProvider (Resend).
 * If email sending is restricted (e.g. Resend free tier test limitations),
 * it returns devCode so pilots/friends testing are never locked out.
 */
export async function POST(req: NextRequest) {
  // Check auth rate limit per IP
  const authLimit = checkAuthRateLimit(req);
  if (!authLimit.success) {
    return rateLimitExceededResponse(authLimit);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sendOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid email" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    const admin = createServiceRoleClient();

    // 1. Generate magiclink OTP code using Supabase Admin
    const { data: genData, error: genError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (genError || !genData?.properties?.email_otp) {
      return NextResponse.json(
        { error: genError?.message || "Failed to generate sign-in code." },
        { status: 500 }
      );
    }

    const otp = genData.properties.email_otp;
    const actionLink = genData.properties.action_link;

    // 2. Attempt email delivery via Resend / configured EmailProvider
    let emailSent = false;
    let emailError: string | null = null;

    try {
      const emailProvider = getEmailProvider();
      const sendResult = await emailProvider.sendEmail({
        to: email,
        subject: `Your Learnitt sign-in code: ${otp}`,
        text: `Your Learnitt verification code is: ${otp}\n\nEnter this code on the sign-in screen to access your learning dashboard. This code expires in 10 minutes.\n\nOr click: ${actionLink}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #08090a; color: #f0f0f0; border-radius: 12px; border: 1px solid #222;">
            <div style="display: flex; align-items: center; margin-bottom: 20px;">
              <div style="width: 28px; height: 28px; background: #e4f222; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #000; font-size: 14px; margin-right: 10px; line-height: 28px; text-align: center;">L</div>
              <span style="font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #aaa;">Learnitt</span>
            </div>
            <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 12px 0; color: #fff;">Sign in to your learning dashboard</h2>
            <p style="font-size: 14px; line-height: 1.5; color: #888; margin: 0 0 24px 0;">Enter the one-time code below to verify your account and continue your daily learning loop:</p>
            <div style="background: #121417; border: 1px solid #2a2e33; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px;">
              <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #e4f222;">${otp}</span>
            </div>
            <p style="font-size: 12px; color: #666; margin: 0 0 24px 0;">This code will expire in 10 minutes. If you did not request this, you can ignore this email.</p>
            <div style="border-top: 1px solid #222; padding-top: 16px; font-size: 11px; color: #555;">
              Learnitt · Focused daily study companion
            </div>
          </div>
        `,
      });

      if (sendResult.success) {
        emailSent = true;
      } else {
        emailError = sendResult.error || "Email delivery failed";
      }
    } catch (e: any) {
      emailError = e.message || "Failed to send email via email provider";
    }

    // Return response. If email delivery is restricted (e.g. Resend free tier limitation on external emails),
    // provide devCode so the user/friend testing is never blocked.
    return NextResponse.json({
      success: true,
      emailSent,
      emailError: emailSent ? null : emailError,
      // Provide fallback code when email could not be delivered to allow frictionless demo/friend testing
      devCode: emailSent ? undefined : otp,
      message: emailSent
        ? "Verification code sent to your email."
        : "Verification code generated. Enter the code to sign in.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process sign-in request." },
      { status: 500 }
    );
  }
}
