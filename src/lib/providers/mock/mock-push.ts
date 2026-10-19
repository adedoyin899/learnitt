import { PushPayload, PushProvider, PushSubscriptionData } from "../types";

export class MockPushProvider implements PushProvider {
  readonly id = "mock-push";
  public sentNotifications: Array<{
    subscription: PushSubscriptionData;
    payload: PushPayload;
  }> = [];

  async send(
    subscription: PushSubscriptionData,
    payload: PushPayload
  ): Promise<{ success: boolean; error?: string }> {
    this.sentNotifications.push({ subscription, payload });
    return { success: true };
  }

  clear(): void {
    this.sentNotifications = [];
  }
}
