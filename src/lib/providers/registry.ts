import { env } from "../env";
import { MockAIProvider } from "./mock/mock-ai";
import { MockEmailProvider } from "./mock/mock-email";
import { MockPushProvider } from "./mock/mock-push";
import { MockSearchProvider } from "./mock/mock-search";
import {
  AIProvider,
  EmailProvider,
  PushProvider,
  SearchProvider,
} from "./types";

let aiProviderInstance: AIProvider | null = null;
let searchProviderInstance: SearchProvider | null = null;
let emailProviderInstance: EmailProvider | null = null;
let pushProviderInstance: PushProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!aiProviderInstance) {
    if (env.MOCK_MODE) {
      aiProviderInstance = new MockAIProvider();
    } else {
      // In L0, real provider will be plugged in L2/L3. Fallback to mock with warning if not yet bound.
      aiProviderInstance = new MockAIProvider();
    }
  }
  return aiProviderInstance;
}

export function getSearchProvider(): SearchProvider {
  if (!searchProviderInstance) {
    if (env.MOCK_MODE) {
      searchProviderInstance = new MockSearchProvider();
    } else {
      searchProviderInstance = new MockSearchProvider();
    }
  }
  return searchProviderInstance;
}

export function getEmailProvider(): EmailProvider {
  if (!emailProviderInstance) {
    if (env.MOCK_MODE) {
      emailProviderInstance = new MockEmailProvider();
    } else {
      emailProviderInstance = new MockEmailProvider();
    }
  }
  return emailProviderInstance;
}

export function getPushProvider(): PushProvider {
  if (!pushProviderInstance) {
    if (env.MOCK_MODE) {
      pushProviderInstance = new MockPushProvider();
    } else {
      pushProviderInstance = new MockPushProvider();
    }
  }
  return pushProviderInstance;
}

export function resetProviderInstances(): void {
  aiProviderInstance = null;
  searchProviderInstance = null;
  emailProviderInstance = null;
  pushProviderInstance = null;
}
