import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

// The world map is the home screen now.
// Server: a redirect. Browser and offline shell: a move once the page has hydrated.
export const Route = createFileRoute("/world")({
  beforeLoad: () => {
    if (typeof window === "undefined") throw redirect({ to: "/", replace: true });
  },
  component: () => <Navigate to="/" replace />,
});
