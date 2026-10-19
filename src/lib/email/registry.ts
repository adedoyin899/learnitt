import { EmailProvider } from "./types";
import { MockEmailProvider } from "./mock-provider";
import { ResendEmailAdapter } from "./resend-adapter";

let activeEmailProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (activeEmailProvider) {
    return activeEmailProvider;
  }

  const apiKey =
    process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_KEY;
  const isExplicitMock = process.env.EMAIL_PROVIDER === "mock";
  const providerType =
    process.env.EMAIL_PROVIDER || (apiKey && !isExplicitMock ? "resend" : "mock");

  switch (providerType) {
    case "resend":
      activeEmailProvider = new ResendEmailAdapter();
      break;
    case "mock":
    default:
      activeEmailProvider = new MockEmailProvider();
      break;
  }

  return activeEmailProvider;
}

export function setEmailProvider(provider: EmailProvider | null): void {
  activeEmailProvider = provider;
}
