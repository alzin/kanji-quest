import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Section, List } from "@/components/LegalPage";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${SITE_NAME}` },
      { name: "description", content: `How ${SITE_NAME} handles your data: what is stored, why, where, and how to have it deleted.` },
      { name: "robots", content: "index" },
    ],
  }),
  component: PrivacyPage,
});

function Mail() {
  return <a className="font-bold text-primary" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`${SITE_NAME} is a free kanji study game. It collects as little about you as it can while still saving your progress across devices. There is no advertising, no analytics, and no tracking of any kind.`}
    >
      <Section heading="Playing without an account">
        <p>
          You can use the whole game without signing in. Your progress is then kept only in your
          browser's session storage, on your own device. It never reaches our servers, and your
          browser discards it when you close the tab.
        </p>
        <p>
          Your sound and voice preferences are stored in your browser's local storage so they
          survive a reload. They also stay on your device.
        </p>
      </Section>

      <Section heading="Signing in with Google">
        <p>
          If you choose to save your progress to an account, we ask Google only for the
          <strong> openid</strong>, <strong>email</strong> and <strong>profile</strong> scopes. We
          never receive your Google password, and we cannot read your Gmail, contacts, files, or
          any other Google service.
        </p>
        <p>From your Google profile we store:</p>
        <List
          items={[
            "your Google account identifier, which is how we recognise you when you return",
            "your email address, used to identify your account and to contact you about it",
            "your display name and the web address of your profile picture, shown in the app",
          ]}
        />
      </Section>

      <Section heading="Your learning progress">
        <p>
          When you are signed in we store your save data: which kanji you have studied, your review
          schedule, mastery levels, streaks, points, and the regions you have unlocked. A copy is
          also cached in your browser so the game keeps working offline.
        </p>
        <p>This is study data only. We do not collect anything you write beyond your answers in the game.</p>
      </Section>

      <Section heading="Cookies">
        <p>
          We use two cookies, and only after you sign in. One holds your session so you stay signed
          in; it cannot be read by JavaScript. The other protects against cross-site request
          forgery. Both expire after 30 days, or when you sign out.
        </p>
        <p>We set no advertising, analytics, or third-party tracking cookies.</p>
      </Section>

      <Section heading="Information collected automatically">
        <p>
          Our hosting provider records standard server logs for each request — IP address, browser
          user agent, the page requested, and the time. These are used to keep the service running
          and secure, and are kept for 30 days.
        </p>
        <p>
          The app loads its typefaces from Google Fonts, so your browser contacts Google's servers
          and your IP address is visible to Google when it does.
        </p>
      </Section>

      <Section heading="What we never do">
        <List
          items={[
            "sell or rent your personal information to anyone",
            "share it with advertisers or data brokers",
            "use it to build an advertising or behavioural profile",
            "run analytics, heatmap, or session-recording tools",
          ]}
        />
      </Section>

      <Section heading="Who else processes your data">
        <p>We rely on three providers, each acting only on our instructions:</p>
        <List
          items={[
            "Google Cloud Run hosts the application and the API, in Singapore",
            "Neon hosts the PostgreSQL database, in Singapore",
            "Google provides the sign-in service, if you choose to use it",
          ]}
        />
      </Section>

      <Section heading="How long we keep it">
        <p>
          Account information and progress are kept until you ask us to delete them. Sign-in
          sessions expire after 30 days. Guest progress lives only as long as your browser tab.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask us for a copy of your data, to correct it, or to delete it entirely. Email{" "}
          <Mail /> from the address on your account and we will action it within 30 days. Deleting
          your account removes your profile, sessions, and saved progress permanently.
        </p>
        <p>
          You can also revoke our access at any time from your{" "}
          <a className="font-bold text-primary" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            Google account permissions
          </a>
          , though that alone does not delete data already saved here.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          {SITE_NAME} is suitable for all ages, but accounts require a Google account, and Google
          sets its own minimum age for your country. We do not knowingly collect information from
          children below that age. If you believe a child has created an account, contact <Mail />{" "}
          and we will remove it.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          If this policy changes materially we will update the date at the top of this page and,
          where the change affects data we already hold, notify signed-in users by email.
        </p>
      </Section>

      <Section heading="Contact">
        <p>Questions about this policy or your data: <Mail />.</p>
      </Section>
    </LegalPage>
  );
}
