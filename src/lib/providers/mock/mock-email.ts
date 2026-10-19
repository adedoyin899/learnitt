import { EmailPayload, EmailProvider } from "../types";

export class MockEmailProvider implements EmailProvider {
  readonly id = "mock-email";
  public sentEmails: EmailPayload[] = [];

  async send(payload: EmailPayload): Promise<{ id: string; success: boolean }> {
    this.sentEmails.push(payload);
    return {
      id: `mock-email-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      success: true,
    };
  }

  clear(): void {
    this.sentEmails = [];
  }
}
