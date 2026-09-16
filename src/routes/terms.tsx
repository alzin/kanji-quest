import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Section, List } from "@/components/LegalPage";
import { CONTACT_EMAIL, GOVERNING_LAW, SITE_NAME } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms of Service — ${SITE_NAME}` },
      { name: "description", content: `The terms you agree to when using ${SITE_NAME}.` },
      { name: "robots", content: "index" },
    ],
  }),
  component: TermsPage,
});

function Mail() {
  return <a className="font-bold text-primary" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms cover your use of ${SITE_NAME}. They are meant to be readable; if anything is unclear, ask us rather than guess.`}
    >
      <Section heading="Agreeing to these terms">
        <p>
          By using {SITE_NAME} you agree to these terms. If you do not agree, please do not use the
          service. If you use it on behalf of someone under the age at which they can agree
          themselves, you accept these terms for them.
        </p>
      </Section>

      <Section heading="What the service is">
        <p>
          {SITE_NAME} is a free game for studying JLPT kanji. It is a study aid, not a certified
          course, and we make no promise about exam results. Content may be corrected or
          reorganised as the curriculum improves.
        </p>
      </Section>

      <Section heading="Accounts">
        <p>
          You can play without an account. Creating one means signing in with Google, and you are
          responsible for keeping that Google account secure. One person, one account. Tell us at{" "}
          <Mail /> if you think someone else has used your account.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>Please do not:</p>
        <List
          items={[
            "attempt to break, overload, or probe the service or its infrastructure",
            "access other users' accounts or data",
            "use automated tools to scrape the app or hammer the API",
            "resell or redistribute the app's content as your own product",
          ]}
        />
      </Section>

      <Section heading="Your progress data">
        <p>
          Your saved progress is yours. We store it so we can show it back to you across your
          devices, and we will delete it on request, as described in the{" "}
          <Link to="/privacy" className="font-bold text-primary">Privacy Policy</Link>.
        </p>
        <p>
          The game itself — its code, artwork, curriculum, mnemonics, and text — remains ours. You
          may use it for your own study, but not republish it.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          {SITE_NAME} is provided as it is, free of charge, with no guarantee of uptime. We may
          change, suspend, or discontinue any part of it, and we may have to take it down for
          maintenance without notice.
        </p>
        <p>
          Keep your own record of anything you cannot afford to lose. While we take reasonable care
          with backups, we cannot promise that saved progress will never be lost.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential loss arising
          from your use of the service, including lost progress, lost study time, or exam outcomes.
          Nothing here limits liability that cannot legally be limited.
        </p>
      </Section>

      <Section heading="Ending your use">
        <p>
          You may stop using {SITE_NAME} at any time and ask us to delete your account. We may
          suspend or close an account that breaches these terms, and will tell you why where we
          reasonably can.
        </p>
      </Section>

      <Section heading="Changes to these terms">
        <p>
          We will update the date at the top of this page when these terms change. Continuing to use
          the service after a change means you accept the revised terms.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>These terms are governed by the laws of {GOVERNING_LAW}.</p>
      </Section>

      <Section heading="Contact">
        <p>Questions about these terms: <Mail />.</p>
      </Section>
    </LegalPage>
  );
}
