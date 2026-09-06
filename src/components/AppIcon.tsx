import type { ReactNode, SVGProps } from "react";

export type AppIconName = "home" | "map" | "brush" | "kanji" | "flame" | "coin" | "arrow" | "lock";

const paths: Record<AppIconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></>,
  brush: <><path d="m14 6 4-4 4 4-10 10-4-4 6-6Z" /><path d="m14 6 4 4M8 12c-5 0-1 7-6 8 6 2 10-1 10-4" /></>,
  kanji: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 8h10M12 6v2M9 8c.5 4 3 7 8 9M15 8c-.5 4-3 7-8 9" /></>,
  flame: <path d="M12 3c1 5 6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 1 4 2 4 2-2 2-5 1-9Z" />,
  coin: <><circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" rx="1" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
};

export function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AppIconName }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
