import { EmailProvider, SendEmailOptions, SendEmailResult, EmailLimitReachedError } from "./types";

export interface ResendAdapterOptions {
  apiKey?: string;
  fromAddress?: string;
  dailyCap?: number;
}

export class ResendEmailAdapter implements EmailProvider {
  readonly id = "resend";
  private apiKey: string | undefined;
  private fromAddress: string;
  private dailyCap: number;
  private sentCountToday: number = 0;

  constructor(options?: ResendAdapterOptions) {
    this.apiKey =
      options?.apiKey ||
      process.env.RESEND_API_KEY ||
      process.env.EMAIL_PROVIDER_KEY;
    this.fromAddress =
      options?.fromAddress ||
      process.env.EMAIL_FROM ||
      "Learnitt <onboarding@resend.dev>";
    // Resend free tier has a hard limit of 100 emails per day (3,000/month)
    this.dailyCap = options?.dailyCap ?? 100;
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (this.sentCountToday >= this.dailyCap) {
      throw new EmailLimitReachedError(
        `Resend daily quota reached (${this.dailyCap} emails/day limit on free tier).`
      );
    }

    if (!this.apiKey) {
      throw new Error(
        "RESEND_API_KEY or EMAIL_PROVIDER_KEY environment variable is not configured."
      );
    }

    const payload = {
      from: options.from || this.fromAddress,
      to: [options.to],
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        id: "",
        success: false,
        error: `Resend API error (${response.status}): ${errText}`,
      };
    }

    const data = (await response.json()) as { id?: string };
    this.sentCountToday++;

    return {
      id: data.id || `resend_${Date.now()}`,
      success: true,
    };
  }

  async send(payload: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    from?: string;
  }): Promise<{ id: string; success: boolean; error?: string }> {
    return this.sendEmail({
      to: payload.to,
      subject: payload.subject,
      text: payload.text || "",
      html: payload.html,
      from: payload.from,
    });
  }
}
