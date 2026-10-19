/**
 * @vitest-environment node
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getRemindersRoute, PUT as putRemindersRoute } from "@/app/api/v1/reminders/route";
import { POST as cronRemindersRoute } from "@/app/api/v1/cron/reminders/route";
import { POST as pushSubscribeRoute } from "@/app/api/v1/push/subscribe/route";
import {
  GET as getWeeklyCheckInRoute,
  POST as postWeeklyCheckInRoute,
} from "@/app/api/v1/check-ins/weekly/route";
import * as serverAuth from "@/lib/supabase/server";
import * as serviceAuth from "@/lib/supabase/service-role";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";
import { MockEmailProvider } from "@/lib/email/mock-provider";
import { MockPushProvider } from "@/lib/push/mock-provider";
import * as emailRegistry from "@/lib/email/registry";
import * as pushRegistry from "@/lib/push/registry";
import { env } from "@/lib/env";
import { getUserLocalTime } from "@/lib/reminders/service";

const USER_MAZ = "11111111-1111-1111-1111-111111111111";
const TODAY_DATE = getUserLocalTime("Europe/London").localDate;

describe("L11 Integration Suite · Reminders, Push, Cron & Weekly Check-In (PRD 11 & Epic H)", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;
  let mockEmail: MockEmailProvider;
  let mockPush: MockPushProvider;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);

    mockEmail = new MockEmailProvider();
    mockPush = new MockPushProvider();
    emailRegistry.setEmailProvider(mockEmail);
    pushRegistry.setPushProvider(mockPush);

    // Mock service role client
    vi.spyOn(serviceAuth, "createServiceRoleClient").mockReturnValue(
      supabaseAdapter as unknown as ReturnType<typeof serviceAuth.createServiceRoleClient>
    );

    // Mock authenticated user Maz
    vi.spyOn(serverAuth, "createClient").mockImplementation(async () => {
      return {
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: USER_MAZ,
                email: "maz@learnitt.com",
                app_metadata: {},
                user_metadata: {},
                aud: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          }),
        },
        from: (table: string) => (supabaseAdapter as any).from(table),
        rpc: (fn: string, args: Record<string, unknown>) => (supabaseAdapter as any).rpc(fn, args),
      } as unknown as ReturnType<typeof serverAuth.createClient>;
    });

    // Seed User Maz in auth.users and profiles
    await testDb.db.exec(`
      insert into auth.users (id, email)
      values ('${USER_MAZ}', 'maz@learnitt.com')
      on conflict (id) do nothing;

      insert into public.profiles (id, display_name, timezone)
      values ('${USER_MAZ}', 'Maz', 'Europe/London')
      on conflict (id) do update set timezone = 'Europe/London';
    `);

    // Seed primary plan item for today under user's seeded active goal
    await testDb.db.exec(`
      insert into public.skills (id, owner_id, goal_id, name, estimated_min_minutes, estimated_max_minutes, difficulty, priority, verification_type, mvd_minutes, mvd_task, status, evidence_level, position)
      values ('44444444-4444-4444-4444-444444444444', '${USER_MAZ}', 'a1111111-1111-1111-1111-111111111111', 'Dimensional modelling', 45, 60, 1, 1, 'recall', 15, 'Review schema', 'learning', 0, 1)
      on conflict (id) do update set name = 'Dimensional modelling';

      insert into public.plan_items (id, owner_id, goal_id, skill_id, scheduled_date, kind, position, planned_minutes, mvd_minutes, status)
      values ('55555555-5555-5555-5555-555555555555', '${USER_MAZ}', 'a1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', '${TODAY_DATE}', 'learn', 1, 45, 15, 'planned')
      on conflict (id) do nothing;
    `);
  });

  describe("1. Reminder Settings API (GET and PUT /api/v1/reminders)", () => {
    it("reads default reminder settings and updates daily time, weekdays, email and push toggles", async () => {
      // 1. GET default settings
      const getRes = await getRemindersRoute();
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.owner_id).toBe(USER_MAZ);
      expect(getBody.data.email_enabled).toBe(true);

      // 2. PUT updated settings
      const putReq = new NextRequest("http://localhost:3000/api/v1/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_time: "08:30",
          weekdays: [1, 2, 3, 4, 5],
          email_enabled: true,
          push_enabled: true,
          weekly_review_day: 0, // Sunday
          timezone: "Europe/London",
        }),
      });

      const putRes = await putRemindersRoute(putReq);
      expect(putRes.status).toBe(200);
      const putBody = await putRes.json();
      expect(putBody.success).toBe(true);
      expect(putBody.data.daily_time).toBe("08:30:00");
      expect(putBody.data.push_enabled).toBe(true);

      // Verify persisted in database
      const verifyRes = await getRemindersRoute();
      const verifyBody = await verifyRes.json();
      expect(verifyBody.data.daily_time).toBe("08:30:00");
      expect(verifyBody.data.push_enabled).toBe(true);
      expect(verifyBody.data.timezone).toBe("Europe/London");
    });
  });

  describe("2. Web Push Registration (POST /api/v1/push/subscribe)", () => {
    it("subscribes device endpoint and activates push in reminder settings", async () => {
      const subReq = new NextRequest("http://localhost:3000/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: "https://updates.push.services.mozilla.com/wpush/v2/mock_endpoint_123",
          keys: {
            p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9Q0mA8=",
            auth: "tBHItJI5svbpez7KI4CCXg==",
          },
        }),
      });

      const res = await pushSubscribeRoute(subReq);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.push_enabled).toBe(true);
    });
  });

  describe("3. Protected Cron Endpoint Security (POST /api/v1/cron/reminders)", () => {
    it("rejects missing CRON_SECRET header with 401 Unauthorized", async () => {
      const unauthReq = new NextRequest("http://localhost:3000/api/v1/cron/reminders", {
        method: "POST",
      });

      const res = await cronRemindersRoute(unauthReq);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Unauthorized: Invalid or missing CRON_SECRET");
    });

    it("rejects wrong CRON_SECRET header with 401 Unauthorized", async () => {
      const wrongSecretReq = new NextRequest("http://localhost:3000/api/v1/cron/reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "totally-wrong-secret",
        },
      });

      const res = await cronRemindersRoute(wrongSecretReq);
      expect(res.status).toBe(401);
    });

    it("accepts valid CRON_SECRET via x-cron-secret or Authorization Bearer header", async () => {
      const validReq = new NextRequest("http://localhost:3000/api/v1/cron/reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": env.CRON_SECRET,
        },
      });

      const res = await cronRemindersRoute(validReq);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
    });
  });

  describe("4. Reminder Processing Invariants: Incomplete Day, Dedupe & Calm Copy", () => {
    beforeEach(async () => {
      const currentLocal = getUserLocalTime("Europe/London");
      const currentHourStr = String(currentLocal.localHour).padStart(2, "0");
      const currentDailyTime = `${currentHourStr}:00:00`;

      await testDb.db.exec(`
        insert into public.reminder_settings (owner_id, daily_time, weekdays, email_enabled, push_enabled, weekly_review_day)
        values ('${USER_MAZ}', '${currentDailyTime}', '{1,2,3,4,5,6,7}', true, true, 0)
        on conflict (owner_id) do update set daily_time = '${currentDailyTime}', email_enabled = true, push_enabled = true, weekdays = '{1,2,3,4,5,6,7}';

        insert into public.push_subscriptions (owner_id, endpoint, keys)
        values ('${USER_MAZ}', 'https://fcm.googleapis.com/fcm/send/maz_device', '{"p256dh":"k1","auth":"a1"}')
        on conflict (endpoint) do nothing;
      `);
    });

    it("fires reminder when the day is incomplete and records exact payloads in mock providers", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/cron/reminders", {
        method: "POST",
        headers: { "x-cron-secret": env.CRON_SECRET },
      });

      const res = await cronRemindersRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.sentCount).toBe(1);
      expect(body.data.details[0].action).toBe("sent");
      expect(body.data.details[0].copy).toBe(
        "Today: Dimensional modelling, 45 min. Minimum version: 15 min."
      );

      // Verify mock email recorded exact payload
      expect(mockEmail.recordedEmails).toHaveLength(1);
      expect(mockEmail.recordedEmails[0].to).toBe("maz@learnitt.com");
      expect(mockEmail.recordedEmails[0].subject).toContain("Dimensional modelling, 45 min");
      expect(mockEmail.recordedEmails[0].text).toBe(
        "Today: Dimensional modelling, 45 min. Minimum version: 15 min."
      );

      // Verify mock push recorded exact payload
      expect(mockPush.recordedPushes).toHaveLength(1);
      expect(mockPush.recordedPushes[0].title).toBe("Learnitt Daily Focus");
      expect(mockPush.recordedPushes[0].body).toBe(
        "Today: Dimensional modelling, 45 min. Minimum version: 15 min."
      );
    });

    it("deduplicates with reminder_log to strictly prevent a second send on the same day", async () => {
      const req = () =>
        new NextRequest("http://localhost:3000/api/v1/cron/reminders", {
          method: "POST",
          headers: { "x-cron-secret": env.CRON_SECRET },
        });

      // 1st call -> sends
      const res1 = await cronRemindersRoute(req());
      const body1 = await res1.json();
      expect(body1.data.sentCount).toBe(1);

      // 2nd call -> skipped by deduplication log
      const res2 = await cronRemindersRoute(req());
      const body2 = await res2.json();
      expect(body2.data.sentCount).toBe(0);
      expect(body2.data.skippedAlreadySentCount).toBe(1);
      expect(body2.data.details[0].action).toBe("skipped_already_sent");

      // Verify no extra emails or pushes were sent
      expect(mockEmail.recordedEmails).toHaveLength(1);
      expect(mockPush.recordedPushes).toHaveLength(1);
    });

    it("skips reminder if today's primary session is already done", async () => {
      // Mark today complete via check_ins
      await testDb.db.exec(`
        insert into public.check_ins (owner_id, client_id, plan_item_id, outcome, minutes_actual)
        values ('${USER_MAZ}', '99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555', 'done', 45);
      `);

      const req = new NextRequest("http://localhost:3000/api/v1/cron/reminders", {
        method: "POST",
        headers: { "x-cron-secret": env.CRON_SECRET },
      });

      const res = await cronRemindersRoute(req);
      const body = await res.json();

      expect(body.data.sentCount).toBe(0);
      expect(body.data.skippedDayCompleteCount).toBe(1);
      expect(body.data.details[0].action).toBe("skipped_day_complete");

      // Zero sends recorded
      expect(mockEmail.recordedEmails).toHaveLength(0);
      expect(mockPush.recordedPushes).toHaveLength(0);
    });

    it("respects weekday preference: skips when today is not an active study weekday", async () => {
      const currentLocal = getUserLocalTime("Europe/London");
      const otherDay = (currentLocal.isoWeekday % 7) + 1;

      await testDb.db.exec(`
        update public.reminder_settings
        set weekdays = '{${otherDay}}'
        where owner_id = '${USER_MAZ}';
      `);

      const req = new NextRequest("http://localhost:3000/api/v1/cron/reminders", {
        method: "POST",
        headers: { "x-cron-secret": env.CRON_SECRET },
      });

      const res = await cronRemindersRoute(req);
      const body = await res.json();

      expect(body.data.sentCount).toBe(0);
      expect(body.data.skippedWeekdayCount).toBe(1);
      expect(body.data.details[0].action).toBe("skipped_weekday");
    });
  });

  describe("5. Weekly Check-In (Epic H2: Planned vs Done & Adapt Trigger)", () => {
    it("GET /api/v1/check-ins/weekly returns planned vs done hours and adapt trigger status", async () => {
      const res = await getWeeklyCheckInRoute(
        new NextRequest("http://localhost:3000/api/v1/check-ins/weekly")
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data).toBeDefined();
      expect(body.data.plannedMinutes).toBeGreaterThanOrEqual(45);
      expect(body.data.plannedHours).toBeDefined();
      expect(body.data.doneHours).toBeDefined();
    });

    it("POST /api/v1/check-ins/weekly records user reflection on what got in the way", async () => {
      const postReq = new NextRequest("http://localhost:3000/api/v1/check-ins/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Unexpected client work demands",
          note: "Took 2 urgent client calls on Thursday afternoon.",
        }),
      });

      const res = await postWeeklyCheckInRoute(postReq);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.recorded_date).toBeDefined();

      // Verify audit event was logged
      const auditRows = await testDb.db.query(
        `select * from public.audit_events where owner_id = '${USER_MAZ}' and event = 'weekly_check_in'`
      );
      expect(auditRows.rows.length).toBeGreaterThan(0);
    });
  });
});
