import webpush from "web-push";
import type { PushResult, PushSender } from "../../application/ports.js";
import type { PushTarget, ReminderMessage } from "../../domain/reminders.js";

export type VapidDetails = { subject: string; publicKey: string; privateKey: string };

/** Web Push (RFC 8030) with VAPID, encrypted per subscription by the web-push library. */
export class WebPushSender implements PushSender {
  constructor(private readonly vapid: VapidDetails) {}

  async send(target: PushTarget, message: ReminderMessage): Promise<PushResult> {
    try {
      await webpush.sendNotification(target, JSON.stringify(message), {
        vapidDetails: this.vapid,
        // A reminder that arrives the next morning is noise; let the push service drop it.
        TTL: 6 * 60 * 60,
        urgency: "normal",
        // A newer reminder replaces one still queued for an offline phone.
        topic: "daily-reminder",
        timeout: 10_000,
      });
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: unknown }).statusCode;
      if (status === 404 || status === 410) return "gone";
      // Refused outright, for example a subscription made with another VAPID key (FCM sends 403).
      if (status === 400 || status === 401 || status === 403 || status === 413) return "rejected";
      return "failed";
    }
  }
}
