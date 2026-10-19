import { describe, expect, it, beforeEach } from "vitest";
import {
  getUserLocalTime,
  isTimeDue,
  getTodaySessionCopy,
} from "@/lib/reminders/service";
import { MockEmailProvider } from "@/lib/email/mock-provider";
import { MockPushProvider } from "@/lib/push/mock-provider";
import { ResendEmailAdapter } from "@/lib/email/resend-adapter";
import { EmailLimitReachedError } from "@/lib/email/types";

describe("L11 Unit Suite · Reminders, Copy, Timezones & DST (PRD 11 & Epic H)", () => {
  let mockEmail: MockEmailProvider;
  let mockPush: MockPushProvider;

  beforeEach(() => {
    mockEmail = new MockEmailProvider();
    mockPush = new MockPushProvider();
  });

  describe("1. Timezone & Daylight Saving Time (DST) Handling", () => {
    it("correctly calculates local time and ISO weekday for London", () => {
      // 2026-10-19 09:30:00 UTC is Monday in London (BST is UTC+1 until late October)
      const dateUtc = new Date("2026-10-19T09:30:00Z");
      const local = getUserLocalTime("Europe/London", dateUtc);

      expect(local.localDate).toBe("2026-10-19");
      expect(local.localHour).toBe(10); // London is in BST (UTC+1)
      expect(local.localMinute).toBe(30);
      expect(local.isoWeekday).toBe(1); // Monday = 1
    });

    it("respects Daylight Saving Time (DST) shift in London (BST to GMT)", () => {
      // In 2026, UK clocks turn back on Sunday, October 25, 2026 at 02:00 BST -> 01:00 GMT
      // Summer (BST, UTC+1): 2026-07-15 12:00 UTC -> 13:00 local
      const summerUtc = new Date("2026-07-15T12:00:00Z");
      const summerLocal = getUserLocalTime("Europe/London", summerUtc);
      expect(summerLocal.localHour).toBe(13);

      // Winter (GMT, UTC+0): 2026-12-15 12:00 UTC -> 12:00 local
      const winterUtc = new Date("2026-12-15T12:00:00Z");
      const winterLocal = getUserLocalTime("Europe/London", winterUtc);
      expect(winterLocal.localHour).toBe(12);
    });

    it("correctly computes across US and Asian timezones", () => {
      const dateUtc = new Date("2026-10-19T14:00:00Z");

      // New York (EDT, UTC-4 in October)
      const nyLocal = getUserLocalTime("America/New_York", dateUtc);
      expect(nyLocal.localHour).toBe(10);
      expect(nyLocal.isoWeekday).toBe(1);

      // Tokyo (JST, UTC+9, no DST)
      const tokyoLocal = getUserLocalTime("Asia/Tokyo", dateUtc);
      expect(tokyoLocal.localHour).toBe(23);
      expect(tokyoLocal.isoWeekday).toBe(1);
    });

    it("gracefully falls back to UTC for invalid timezone strings", () => {
      const dateUtc = new Date("2026-10-19T15:45:00Z");
      const local = getUserLocalTime("Invalid/Timezone_Name", dateUtc);

      expect(local.localDate).toBe("2026-10-19");
      expect(local.localHour).toBe(15);
      expect(local.localMinute).toBe(45);
    });
  });

  describe("2. isTimeDue Evaluation", () => {
    it("returns true when current time is at or within tolerance of target daily time", () => {
      // Target: 09:00, Current: 09:15 -> due (diff: 15 min <= 60 min tolerance)
      expect(isTimeDue("09:00", 9, 15, 60)).toBe(true);

      // Target: 09:00:00, Current: 09:00 -> due
      expect(isTimeDue("09:00:00", 9, 0, 60)).toBe(true);

      // Target: 09:00, Current: 09:59 -> due
      expect(isTimeDue("09:00", 9, 59, 60)).toBe(true);
    });

    it("returns false when current time is before the target time", () => {
      // Target: 09:00, Current: 08:55 -> not due yet
      expect(isTimeDue("09:00", 8, 55, 60)).toBe(false);
    });

    it("returns false when current time is past the tolerance window", () => {
      // Target: 09:00, Current: 10:15 -> past tolerance of 60 min (diff: 75 min)
      expect(isTimeDue("09:00", 10, 15, 60)).toBe(false);
    });

    it("returns false if dailyTime is null or undefined", () => {
      expect(isTimeDue(null, 9, 0)).toBe(false);
      expect(isTimeDue(undefined, 9, 0)).toBe(false);
    });
  });

  describe("3. Calm Copy Formatting (PRD Section 11 & Requirement 4)", () => {
    it("formats specific and calm copy with planned minutes and minimum version (MVD)", async () => {
      const mockDb: any = {
        from: (table: string) => {
          if (table === "plan_items") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: async () => ({
                        data: [
                          {
                            id: "item-1",
                            skill_id: "skill-1",
                            planned_minutes: 45,
                            mvd_minutes: 15,
                            position: 1,
                          },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "skills") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { name: "Dimensional modelling" },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const copy = await getTodaySessionCopy("user-1", "2026-10-19", mockDb);
      expect(copy.title).toBe("Dimensional modelling");
      expect(copy.plannedMinutes).toBe(45);
      expect(copy.mvdMinutes).toBe(15);
      expect(copy.formattedText).toBe(
        "Today: Dimensional modelling, 45 min. Minimum version: 15 min."
      );
    });
  });

  describe("4. Provider Recording & Resend Free Tier Limit Invariant", () => {
    it("MockEmailProvider records exact sent email payloads for test assertions", async () => {
      await mockEmail.sendEmail({
        to: "maz@learnitt.app",
        subject: "Today: Dimensional modelling, 45 min",
        text: "Today: Dimensional modelling, 45 min. Minimum version: 15 min.",
      });

      expect(mockEmail.recordedEmails).toHaveLength(1);
      expect(mockEmail.recordedEmails[0].to).toBe("maz@learnitt.app");
      expect(mockEmail.recordedEmails[0].subject).toBe("Today: Dimensional modelling, 45 min");
      expect(mockEmail.recordedEmails[0].text).toContain("Minimum version: 15 min.");
    });

    it("MockPushProvider records exact sent push payloads for test assertions", async () => {
      await mockPush.sendPush({
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/device123",
          keys: { p256dh: "key_p256dh", auth: "auth_token" },
        },
        title: "Learnitt Daily Focus",
        body: "Today: Dimensional modelling, 45 min. Minimum version: 15 min.",
        url: "/today",
      });

      expect(mockPush.recordedPushes).toHaveLength(1);
      expect(mockPush.recordedPushes[0].title).toBe("Learnitt Daily Focus");
      expect(mockPush.recordedPushes[0].body).toContain("Dimensional modelling");
      expect(mockPush.recordedPushes[0].url).toBe("/today");
    });

    it("ResendEmailAdapter enforces daily quota and throws EmailLimitReachedError when cap is reached", async () => {
      const adapter = new ResendEmailAdapter({
        apiKey: "re_mock_key_123",
        dailyCap: 2, // test cap of 2
      });

      // Mock fetch
      const originalFetch = global.fetch;
      global.fetch = async () =>
        new Response(JSON.stringify({ id: "email_123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });

      try {
        // Send 1 & 2
        await adapter.sendEmail({ to: "u1@test.com", subject: "S1", text: "T1" });
        await adapter.sendEmail({ to: "u2@test.com", subject: "S2", text: "T2" });

        // 3rd attempt exceeds free quota cap
        await expect(
          adapter.sendEmail({ to: "u3@test.com", subject: "S3", text: "T3" })
        ).rejects.toThrow(EmailLimitReachedError);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
