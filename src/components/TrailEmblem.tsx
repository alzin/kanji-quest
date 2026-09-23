export function TrailEmblem({ kind = "lantern", className = "" }: { kind?: "lantern" | "leaf" | "spark" | "gate"; className?: string }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {kind === "lantern" && <><path d="M19 9V6h10v3M14 12h20M14 36h20M24 39v5" /><path d="M16 13c-8 8-8 14 0 22h16c8-8 8-14 0-22Z" fill="currentColor" fillOpacity=".1" /><path d="M21 14c-3 8-3 13 0 20m6-20c3 8 3 13 0 20M12 23h24" /></>}
    {kind === "leaf" && <><path d="M37 8C12 4 3 22 14 34S41 32 37 8Z" fill="currentColor" fillOpacity=".1" /><path d="m10 41 22-26M18 31l-1-10m7 3 10-1" /></>}
    {kind === "spark" && <><path d="m24 5 5 14 14 5-14 5-5 14-5-14-14-5 14-5Z" fill="currentColor" fillOpacity=".12" /><path d="m37 4 1.5 4.5L43 10l-4.5 1.5L37 16l-1.5-4.5L31 10l4.5-1.5Z" /></>}
    {kind === "gate" && <><path d="M4 8q20 7 40 0l-2 6H6ZM9 22h30M14 15v28m20-28v28M24 16v6" strokeWidth="3" /></>}
  </svg>;
}
