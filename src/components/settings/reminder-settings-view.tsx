"use client";

import * as React from "react";
import {
  Bell,
  Mail,
  Smartphone,
  Calendar,
  Clock,
  Globe,
  Info,
  Check,
  Save,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface ReminderSettingsData {
  daily_time: string | null;
  weekdays: number[];
  email_enabled: boolean;
  push_enabled: boolean;
  weekly_review_day: number | null;
  timezone: string;
}

const COMMON_TIMEZONES = [
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

const WEEKDAY_OPTIONS = [
  { id: 1, label: "Mon", full: "Monday" },
  { id: 2, label: "Tue", full: "Tuesday" },
  { id: 3, label: "Wed", full: "Wednesday" },
  { id: 4, label: "Thu", full: "Thursday" },
  { id: 5, label: "Fri", full: "Friday" },
  { id: 6, label: "Sat", full: "Saturday" },
  { id: 7, label: "Sun", full: "Sunday" },
];

const REVIEW_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const TIME_OPTIONS = [
  "07:00",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "12:00",
  "14:00",
  "17:00",
  "18:00",
  "18:30",
  "19:00",
  "20:00",
  "21:00",
];

export function ReminderSettingsView({
  initialSettings,
}: {
  initialSettings?: Partial<ReminderSettingsData>;
}) {
  const [settings, setSettings] = React.useState<ReminderSettingsData>({
    daily_time: initialSettings?.daily_time?.slice(0, 5) || "09:00",
    weekdays: initialSettings?.weekdays || [1, 2, 3, 4, 5],
    email_enabled: initialSettings?.email_enabled ?? true,
    push_enabled: initialSettings?.push_enabled ?? false,
    weekly_review_day: initialSettings?.weekly_review_day ?? 0,
    timezone: initialSettings?.timezone || "Europe/London",
  });

  const [saving, setSaving] = React.useState(false);
  const [isIOS, setIsIOS] = React.useState(false);

  React.useEffect(() => {
    // Detect iOS devices
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      const userAgent = navigator.userAgent || "";
      const isAppleMobile =
        /iPad|iPhone|iPod/.test(userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setIsIOS(isAppleMobile);
    }
  }, []);

  const handleToggleWeekday = (dayId: number) => {
    setSettings((prev) => {
      const exists = prev.weekdays.includes(dayId);
      let updated: number[];
      if (exists) {
        if (prev.weekdays.length <= 1) {
          toast.warning("Please keep at least one study weekday selected.");
          return prev;
        }
        updated = prev.weekdays.filter((d) => d !== dayId);
      } else {
        updated = [...prev.weekdays, dayId].sort();
      }
      return { ...prev, weekdays: updated };
    });
  };

  const handlePushToggle = async (checked: boolean) => {
    if (!checked) {
      setSettings((prev) => ({ ...prev, push_enabled: false }));
      return;
    }

    // Attempt browser Notification permission and ServiceWorker registration
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          setSettings((prev) => ({ ...prev, push_enabled: true }));

          // Register dummy/real subscription with backend
          if ("serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.ready.catch(() => null);
            if (reg) {
              const sub = await reg.pushManager.getSubscription();
              if (sub) {
                await fetch("/api/v1/push/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(sub),
                }).catch(() => null);
              }
            }
          }
          toast.success("Push notifications enabled for this device.");
        } else {
          toast.error("Notification permission was not granted by your browser.");
          setSettings((prev) => ({ ...prev, push_enabled: false }));
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to enable notifications");
        setSettings((prev) => ({ ...prev, push_enabled: false }));
      }
    } else {
      toast.info("Web notifications are not supported in this browser. Email is your backup.");
      setSettings((prev) => ({ ...prev, push_enabled: false }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_time: settings.daily_time,
          weekdays: settings.weekdays,
          email_enabled: settings.email_enabled,
          push_enabled: settings.push_enabled,
          weekly_review_day: settings.weekly_review_day,
          timezone: settings.timezone,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update settings");
      }

      toast.success("Reminder settings saved.");
    } catch (err: any) {
      toast.error(err.message || "Error saving reminder settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="reminder-settings-form">
      {/* 1. Daily Study Reminders Card */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">Daily Study Time & Days</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Learnitt sends a calm, specific reminder only when today&apos;s primary session is incomplete.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-1">
          {/* Time Picker & Timezone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="daily-time-select" className="text-xs font-medium text-foreground">Reminder Time</label>
              <select
                id="daily-time-select"
                aria-label="Daily reminder time"
                value={settings.daily_time || "09:00"}
                onChange={(e) => setSettings({ ...settings, daily_time: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="daily-time-select"
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="timezone-select" className="text-xs font-medium text-foreground">Timezone</label>
              <select
                id="timezone-select"
                aria-label="Timezone"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="timezone-select"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Weekdays Toggle Chips */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Active Days</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_OPTIONS.map((day) => {
                const isSelected = settings.weekdays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    aria-label={`Toggle ${day.label}`}
                    onClick={() => handleToggleWeekday(day.id)}
                    className={`h-8 px-3 rounded-md text-xs font-medium transition-colors border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-semibold"
                        : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
                    }`}
                    data-testid={`weekday-btn-${day.id}`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Delivery Channels Card (Email & Push) */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">Delivery Channels</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Configure how you receive your daily study prompt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          {/* Email Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Email Notifications</p>
                <p className="text-[11px] text-muted-foreground">
                  Delivered straight to your account email address.
                </p>
              </div>
            </div>
            <Switch
              id="email-toggle"
              aria-label="Email Notifications"
              checked={settings.email_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, email_enabled: checked })}
              data-testid="email-toggle"
            />
          </div>

          {/* Push Switch */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Web Push Notifications</p>
                <p className="text-[11px] text-muted-foreground">
                  Native prompt from an installed PWA on your phone or desktop.
                </p>
              </div>
            </div>
            <Switch
              id="push-toggle"
              aria-label="Web Push Notifications"
              checked={settings.push_enabled}
              onCheckedChange={handlePushToggle}
              data-testid="push-toggle"
            />
          </div>

          {/* Honest iOS Note (Prompt Requirement 3) */}
          <div
            className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground flex items-start gap-2.5"
            data-testid="ios-note"
          >
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-foreground">iPhone note:</strong> Push works on iPhone only
              when Learnitt is added to your home screen. Email is the backup.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Weekly Check-In Review Day Card */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">Weekly Check-In Day</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            On this day each week, Learnitt prompts a gentle check-in comparing planned vs done study hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="space-y-1.5 max-w-xs">
            <label htmlFor="weekly-review-day-select" className="text-xs font-medium text-foreground">Preferred Check-In Day</label>
            <select
              id="weekly-review-day-select"
              aria-label="Preferred Check-In Day"
              value={settings.weekly_review_day ?? 0}
              onChange={(e) =>
                setSettings({ ...settings, weekly_review_day: parseInt(e.target.value, 10) })
              }
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="weekly-review-day-select"
            >
              {REVIEW_DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-5 text-xs font-medium gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="save-reminders-btn"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving Settings..." : "Save Reminder Settings"}
        </Button>
      </div>
    </div>
  );
}
