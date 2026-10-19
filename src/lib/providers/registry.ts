import { FallbackAIProvider } from "../ai/adapters/fallback-adapter";
import { MockAIProvider } from "../ai/adapters/mock-adapter";
import { RealAIProvider } from "../ai/adapters/real-adapter";
import { env } from "../env";
import { MockEmailProvider } from "./mock/mock-email";
import { MockPushProvider } from "./mock/mock-push";
import { MockSearchProvider } from "./mock/mock-search";
import {
  AIProvider,
  EmailProvider,
  PushProvider,
  SearchProvider,
} from "./types";
import { ResendEmailAdapter } from "../email/resend-adapter";

let aiProviderInstance: AIProvider | null = null;
let searchProviderInstance: SearchProvider | null = null;
let emailProviderInstance: EmailProvider | null = null;
let pushProviderInstance: PushProvider | null = null;

export function buildAIProviderFromEnv(): AIProvider {
  let primary: AIProvider;

  if (env.MOCK_MODE || env.AI_PROVIDER === "mock") {
    primary = new MockAIProvider({ model: env.AI_MODEL });
  } else {
    primary = new RealAIProvider({
      provider: env.AI_PROVIDER,
      model: env.AI_MODEL,
      apiKey: env.AI_API_KEY,
    });
  }

  let fallback: AIProvider | null = null;
  if (env.AI_FALLBACK_PROVIDER) {
    if (env.AI_FALLBACK_PROVIDER === "mock") {
      fallback = new MockAIProvider({
        id: "mock-fallback",
        model: env.AI_FALLBACK_MODEL || env.AI_MODEL,
      });
    } else {
      fallback = new RealAIProvider({
        id: "real-fallback",
        provider: env.AI_FALLBACK_PROVIDER,
        model: env.AI_FALLBACK_MODEL || env.AI_MODEL,
        apiKey: env.AI_FALLBACK_API_KEY || env.AI_API_KEY,
      });
    }
  }

  if (fallback) {
    return new FallbackAIProvider({ primary, fallback });
  }

  return primary;
}

export function getAIProvider(): AIProvider {
  if (!aiProviderInstance) {
    aiProviderInstance = buildAIProviderFromEnv();
  }
  return aiProviderInstance;
}

export function setAIProvider(provider: AIProvider | null): void {
  aiProviderInstance = provider;
}

export function resetProviderInstances(): void {
  aiProviderInstance = null;
  searchProviderInstance = null;
  emailProviderInstance = null;
  pushProviderInstance = null;
}

export function getSearchProvider(): SearchProvider {
  if (!searchProviderInstance) {
    searchProviderInstance = new MockSearchProvider();
  }
  return searchProviderInstance;
}

export function getEmailProvider(): EmailProvider {
  if (!emailProviderInstance) {
    const hasResend =
      !env.MOCK_MODE &&
      (process.env.EMAIL_PROVIDER === "resend" ||
        Boolean(process.env.RESEND_API_KEY) ||
        Boolean(process.env.EMAIL_PROVIDER_KEY));
    if (hasResend) {
      emailProviderInstance = new ResendEmailAdapter() as unknown as EmailProvider;
    } else {
      emailProviderInstance = new MockEmailProvider();
    }
  }
  return emailProviderInstance;
}

export function getPushProvider(): PushProvider {
  if (!pushProviderInstance) {
    pushProviderInstance = new MockPushProvider();
  }
  return pushProviderInstance;
}
