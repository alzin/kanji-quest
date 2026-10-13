import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

// Camp is a place on the map now: old links and installed shortcuts open its panel there.
// The server answers with a redirect; in the browser (including the offline shell, which must
// hydrate before it may change route) the move happens once rendered.
export const Route = createFileRoute("/camp")({
  beforeLoad: () => {
    if (typeof window === "undefined") throw redirect({ to: "/", search: { panel: "camp" }, replace: true });
  },
  component: () => <Navigate to="/" search={{ panel: "camp" }} replace />,
});
