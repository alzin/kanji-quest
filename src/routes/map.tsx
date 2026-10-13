import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

// The checkpoint list lives on the map as its journey log: old links open it there.
// Server: a redirect. Browser and offline shell: a move once the page has hydrated.
export const Route = createFileRoute("/map")({
  beforeLoad: () => {
    if (typeof window === "undefined") throw redirect({ to: "/", search: { panel: "journey" }, replace: true });
  },
  component: () => <Navigate to="/" search={{ panel: "journey" }} replace />,
});
