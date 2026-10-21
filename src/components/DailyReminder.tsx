import { useId, useState } from "react";
import {
  REMINDER_HOURS, disableReminders, dismissReminderOffer, enableReminders, formatHour, setReminderHour, useReminders,
} from "@/lib/reminders";

function HourSelect({ id, hour, onChange, disabled }: { id: string; hour: number; onChange: (hour: number) => void; disabled: boolean }) {
  const hours = REMINDER_HOURS.includes(hour) ? REMINDER_HOURS : [...REMINDER_HOURS, hour].sort((a, b) => a - b);
  return (
    <select
      id={id}
      value={hour}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      className="reminder-hour"
    >
      {hours.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
    </select>
  );
}

/** Shown on result screens: the moment a player has just played is when a daily nudge makes sense. */
export function ReminderOffer() {
  const reminders = useReminders();
  const [chosen, setChosen] = useState<number | null>(null);
  const [asked, setAsked] = useState(false);
  const hourId = useId();
  const hour = chosen ?? reminders.hour;

  // Keep the outcome visible after the tap, even once the offer no longer applies.
  if (asked && reminders.message) {
    return <p role="status" className="reminder-offer reminder-offer-done" data-testid="reminder-offer">{reminders.message}</p>;
  }
  if (reminders.offerDismissed || reminders.enabled) return null;
  if (reminders.support === "install") {
    return (
      <section className="reminder-offer" data-testid="reminder-offer" aria-label="Daily reminder">
        <p><strong>Want a daily reminder?</strong> Add Kanji Dash to your Home Screen (Share → Add to Home Screen), then turn reminders on from the app.</p>
        <button type="button" className="reminder-quiet" onClick={dismissReminderOffer}>Not now</button>
      </section>
    );
  }
  if (reminders.support !== "ready" || reminders.blocked) return null;
  return (
    <section className="reminder-offer" data-testid="reminder-offer" aria-labelledby={`${hourId}-title`}>
      <p id={`${hourId}-title`}><strong>Never miss a day</strong></p>
      <p className="reminder-copy">Get one gentle reminder, only on days you haven’t played yet.</p>
      <div className="reminder-row">
        <label htmlFor={hourId} className="sr-only">Reminder time</label>
        <HourSelect id={hourId} hour={hour} onChange={setChosen} disabled={reminders.busy} />
        <button
          type="button"
          disabled={reminders.busy}
          onClick={() => { setAsked(true); void enableReminders(hour); }}
          className="reminder-primary"
        >
          {reminders.busy ? "Turning on…" : "Remind me"}
        </button>
      </div>
      <button type="button" className="reminder-quiet" onClick={dismissReminderOffer}>Not now</button>
    </section>
  );
}

/** The switch in camp settings. Renders nothing where push reminders cannot work. */
export function ReminderSetting() {
  const reminders = useReminders();
  const hourId = useId();
  if (reminders.support === "install") {
    return <p className="camp-fine">Daily reminders: add Kanji Dash to your Home Screen, then turn them on here.</p>;
  }
  if (reminders.support !== "ready") return null;
  return (
    <div className="reminder-setting">
      <button
        type="button"
        role="switch"
        aria-checked={reminders.enabled}
        disabled={reminders.busy || (reminders.blocked && !reminders.enabled)}
        onClick={() => void (reminders.enabled ? disableReminders() : enableReminders())}
        className="music-toggle"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />{!reminders.enabled && <path d="m3 3 18 18" />}
        </svg>
        <span>Daily reminder {reminders.enabled ? "on" : "off"}</span>
      </button>
      {reminders.enabled && (
        <>
          <label htmlFor={hourId} className="sr-only">Reminder time</label>
          <HourSelect id={hourId} hour={reminders.hour} onChange={setReminderHour} disabled={reminders.busy} />
        </>
      )}
      {(reminders.message || reminders.blocked) && (
        <p role="status" className="camp-fine">
          {reminders.message || "Notifications are blocked for Kanji Dash. Allow them in your browser or phone settings to turn reminders on."}
        </p>
      )}
    </div>
  );
}
