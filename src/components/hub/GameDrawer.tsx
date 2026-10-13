import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal sheet over the overworld: a side drawer on wide screens, a bottom sheet on phones.
 * Escape and the close button both hand control back to the map.
 */
export function GameDrawer({ label, eyebrow, title, onClose, className = "", children }: {
  label: string;
  eyebrow: string;
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`forest-dialog game-drawer ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the backdrop (the dialog box itself, outside its content) closes the sheet.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="game-drawer-inner">
        <div className="forest-dialog-top game-drawer-top">
          <span className="forest-eyebrow">{eyebrow}</span>
          <button type="button" className="forest-close" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`}>×</button>
        </div>
        <h2 className="game-drawer-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
