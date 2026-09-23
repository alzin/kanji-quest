import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { PwaRegistration } from "@/components/PwaRegistration";
import { SaveProgressDialog } from "@/components/SaveProgressDialog";
import { InstallAppProvider } from "@/components/InstallApp";
import { boot } from "@/lib/sfx";
import { initializeAccount } from "@/lib/account";

import appCss from "../styles.css?url";

function Fallback({ mark, title, body, children }: { mark: string; title: string; body: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div
          aria-hidden="true"
          className="mx-auto flex h-24 w-24 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-4xl font-bold text-primary opacity-90"
        >
          {mark}
        </div>
        <h1 className="mt-7 font-serif text-3xl font-bold">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-8 flex flex-col gap-2.5">{children}</div>
      </div>
    </div>
  );
}

const fallbackPrimary = "inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover";
const fallbackQuiet = "inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

function NotFoundComponent() {
  return (
    <Fallback
      mark="迷"
      title="This road does not exist"
      body="The page you were looking for has moved or was never here. Your progress is untouched — pick the road back up from home."
    >
      <Link to="/" className={fallbackPrimary}>Back to home</Link>
      <Link to="/map" className={fallbackQuiet}>Open the world map</Link>
    </Fallback>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <Fallback
      mark="止"
      title="This page didn't load"
      body="Something went wrong on our end. Your saved progress is safe on this device — try loading the page again."
    >
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className={fallbackPrimary}
      >
        Try again
      </button>
      <a href={import.meta.env.BASE_URL} className={fallbackQuiet}>Back to home</a>
    </Fallback>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f6f2e6" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Kanji Dash" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "Kanji Dash — Master JLPT Kanji by Running" },
      {
        name: "description",
        content:
          "Kanji Dash turns JLPT N5, N4 and N3 kanji study into a 2D runner game: daily missions, spaced repetition, stroke practice, and checkpoint runs.",
      },
      { property: "og:title", content: "Kanji Dash — Master JLPT Kanji by Running" },
      {
        property: "og:description",
        content:
          "Learn JLPT N5, N4 and N3 kanji through a daily runner game with spaced repetition, vocabulary, and writing practice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "manifest", href: `${import.meta.env.BASE_URL}manifest.webmanifest` },
      { rel: "apple-touch-icon", href: `${import.meta.env.BASE_URL}apple-touch-icon.png`, sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@400;700;800&family=Zen+Kaku+Gothic+New:wght@400;700;900&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: `${import.meta.env.BASE_URL}favicon.ico`, type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => boot(), []);
  useEffect(() => initializeAccount(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <InstallAppProvider>
        <PwaRegistration />
        <SaveProgressDialog />
        <Outlet />
      </InstallAppProvider>
    </QueryClientProvider>
  );
}
