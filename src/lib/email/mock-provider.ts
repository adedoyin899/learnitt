import { EmailProvider, SendEmailOptions, SendEmailResult } from "./types";

export class MockEmailProvider implements EmailProvider {
  readonly id = "mock-email";
  public recordedEmails: SendEmailOptions[] = [];
  public shouldFail: boolean = false;
  public failureMessage: string = "Simulated email provider failure";

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (this.shouldFail) {
      return {
        id: `err_${Date.now()}`,
        success: false,
        error: this.failureMessage,
      };
    }

    this.recordedEmails.push({ ...options });
    const id = `mock_email_${this.recordedEmails.length}_${Date.now()}`;

    return {
      id,
      success: true,
    };
  }

  clear(): void {
    this.recordedEmails = [];
    this.shouldFail = false;
  }
}
