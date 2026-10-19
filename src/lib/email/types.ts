/**
 * Email Provider Seam Types (PRD Section 11 & Epic H)
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export interface SendEmailResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface EmailProvider {
  readonly id: string;
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
}

export class EmailLimitReachedError extends Error {
  readonly isLimitReached = true;
  constructor(message: string = "Daily email provider quota reached.") {
    super(message);
    this.name = "EmailLimitReachedError";
  }
}
