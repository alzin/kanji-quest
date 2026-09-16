import { Link } from "@tanstack/react-router";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/legal";

/**
 * Google requires the privacy policy to be reachable from the home page before an
 * OAuth consent screen can be published, so this stays on the landing page.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border px-4 py-6">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>&copy; {new Date().getFullYear()} {SITE_NAME}</span>
        <Link to="/privacy" className="font-bold hover:text-foreground">Privacy</Link>
        <Link to="/terms" className="font-bold hover:text-foreground">Terms</Link>
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold hover:text-foreground">Contact</a>
      </div>
    </footer>
  );
}
