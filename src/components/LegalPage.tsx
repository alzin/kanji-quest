import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { LAST_UPDATED } from "@/lib/legal";

/** Shared reading layout for the privacy policy and terms pages. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        <Link to="/" className="inline-flex min-h-11 items-center text-sm font-bold text-primary">
          &larr; Back to Kanji Dash
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs font-bold text-muted-foreground">Last updated {LAST_UPDATED}</p>
        <p className="mt-4 text-muted-foreground">{intro}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-xl font-bold">{heading}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
