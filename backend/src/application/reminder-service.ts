import { reminderDay, reminderMessage } from "../domain/reminders.js";
import type { PushSender, ReminderRepository } from "./ports.js";
import { parseEndpoint, parseReminderRegistration } from "./reminder-validation.js";

export type DispatchSummary = { checked: number; sent: number; removed: number; failed: number };

/** Parallel deliveries per dispatch; push services answer quickly, Cloud Run requests are bounded. */
const CONCURRENCY = 16;

export class ReminderService {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly sender: PushSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  save(input: unknown): Promise<void> {
    return this.repository.save(parseReminderRegistration(input));
  }

  remove(endpoint: unknown): Promise<void> {
    return this.repository.remove(parseEndpoint(endpoint));
  }

  /** Run hourly. Each player hears from us at most once per local day, only if they haven't played. */
  async dispatch(): Promise<DispatchSummary> {
    const now = this.now();
    const due = (await this.repository.candidates()).flatMap((sub) => {
      const day = reminderDay(sub, now);
      return day ? [{ sub, day }] : [];
    });
    const summary: DispatchSummary = { checked: 0, sent: 0, removed: 0, failed: 0 };
    summary.checked = due.length;
    let next = 0;
    const worker = async () => {
      while (next < due.length) {
        const { sub, day } = due[next++]!;
        if (!(await this.repository.claim(sub.endpoint, day))) continue;
        const result = await this.sender.send(sub, reminderMessage(sub, day));
        if (result === "sent") summary.sent += 1;
        else if (result === "gone") { await this.repository.remove(sub.endpoint); summary.removed += 1; }
        else { await this.repository.release(sub.endpoint, day, sub.lastSentOn); summary.failed += 1; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));
    return summary;
  }
}
