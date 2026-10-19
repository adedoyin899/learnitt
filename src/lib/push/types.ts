/**
 * Web Push Provider Seam Types (PRD Section 11 & Epic H)
 */

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface SendPushOptions {
  subscription: PushSubscriptionData;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SendPushResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export interface PushProvider {
  readonly id: string;
  sendPush(options: SendPushOptions): Promise<SendPushResult>;
}
