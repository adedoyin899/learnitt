import { PushProvider } from "./types";
import { MockPushProvider } from "./mock-provider";
import { WebPushAdapter } from "./web-push-adapter";

let activePushProvider: PushProvider | null = null;

export function getPushProvider(): PushProvider {
  if (activePushProvider) {
    return activePushProvider;
  }

  const providerType = process.env.PUSH_PROVIDER || "mock";

  switch (providerType) {
    case "live":
    case "web-push":
      activePushProvider = new WebPushAdapter();
      break;
    case "mock":
    default:
      activePushProvider = new MockPushProvider();
      break;
  }

  return activePushProvider;
}

export function setPushProvider(provider: PushProvider | null): void {
  activePushProvider = provider;
}
