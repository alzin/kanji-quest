import { useState } from "react";
import { buyCosmetic, useSave } from "@/lib/srs";
import { COSMETICS, stackOf } from "@/lib/stack-progress";

export function StampShop() {
  const save = useSave(), cosmetics = stackOf(save).cosmetics;
  const [message, setMessage] = useState("");
  return <details className="mt-8 rounded-2xl border border-border bg-card p-4" data-testid="stamp-shop">
    <summary className="min-h-11 cursor-pointer font-serif text-lg font-bold">Stamp & ink shop · {save.coins} mon</summary>
    <p className="mt-2 text-sm text-muted-foreground">A little colour for your daily sheets. Every learning road stays free.</p>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{COSMETICS.map((item) => {
      const owned = cosmetics.owned.includes(item.id), selected = cosmetics[item.kind] === item.id;
      return <button key={item.id} type="button" aria-pressed={selected} disabled={!owned && save.coins < item.cost} className="min-h-28 rounded-xl border border-border bg-paper p-3 text-center disabled:opacity-45 aria-pressed:border-primary" onClick={() => { if (buyCosmetic(item.id)) setMessage(`${item.name} selected`); }}>
        <span aria-hidden="true" className="block font-serif text-3xl text-primary">{item.mark}</span><b className="mt-2 block text-xs">{item.name}</b><span className="mt-1 block text-xs text-muted-foreground">{selected ? "Selected" : owned ? "Use" : `${item.cost} mon`}</span>
      </button>;
    })}</div><p role="status" className="mt-3 min-h-5 text-xs text-muted-foreground">{message}</p>
  </details>;
}
