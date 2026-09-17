import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export default function Modal({ isOpen, onClose, title, description, children, footer, size = "md" }) {
  const titleId = useId();
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const handleKey = event => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== "Tab") return;
      const elements = [...(dialog.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || [])].filter(node => node.getClientRects().length);
      const first = elements[0]; const last = elements.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const element = dialog.current;
    element?.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = overflow; element?.removeEventListener("keydown", handleKey); previous?.focus?.(); };
  }, [isOpen]);
  if (!isOpen) return null;
  return createPortal(<div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal-content modal-${size}`}><div className="modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button className="modal-close" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div><div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}</div></div>, document.body);
}
