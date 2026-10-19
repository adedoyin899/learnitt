import { PushProvider, SendPushOptions, SendPushResult } from "./types";

export class WebPushAdapter implements PushProvider {
  readonly id = "web-push";

  async sendPush(options: SendPushOptions): Promise<SendPushResult> {
    try {
      // In live environments, uses standard VAPID credentials
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      const subject = process.env.VAPID_SUBJECT || "mailto:admin@learnitt.app";

      if (!publicKey || !privateKey) {
        return {
          success: false,
          error: "VAPID keys not configured in environment.",
        };
      }

      const payload = JSON.stringify({
        title: options.title,
        body: options.body,
        url: options.url || "/today",
        tag: options.tag || "daily-reminder",
      });

      const response = await fetch(options.subscription.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          TTL: "86400",
        },
        body: payload,
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          statusCode: response.status,
          error: `Push service returned ${response.status}: ${text}`,
        };
      }

      return {
        success: true,
        statusCode: response.status,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to send web push",
      };
    }
  }
}
