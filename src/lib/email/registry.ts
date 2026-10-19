import { EmailProvider } from "./types";
import { MockEmailProvider } from "./mock-provider";
import { ResendEmailAdapter } from "./resend-adapter";

let activeEmailProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (activeEmailProvider) {
    return activeEmailProvider;
  }

  const providerType = process.env.EMAIL_PROVIDER || "mock";

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
