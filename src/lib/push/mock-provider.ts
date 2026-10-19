import { PushProvider, SendPushOptions, SendPushResult } from "./types";

export class MockPushProvider implements PushProvider {
  readonly id = "mock-push";
  public recordedPushes: SendPushOptions[] = [];
  public shouldFail: boolean = false;
  public failureMessage: string = "Simulated web push delivery failure";

  async sendPush(options: SendPushOptions): Promise<SendPushResult> {
    if (this.shouldFail) {
      return {
        success: false,
        error: this.failureMessage,
      };
    }

    this.recordedPushes.push({ ...options });

    return {
      success: true,
      statusCode: 201,
    };
  }

  clear(): void {
    this.recordedPushes = [];
    this.shouldFail = false;
  }
}
