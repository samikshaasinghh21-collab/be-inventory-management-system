import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const timers = new Set();
    const receive = event => {
      const id = crypto.randomUUID();
      setItems(current => [...current.slice(-3), { ...event.detail, id }]);
      const timer = setTimeout(() => { setItems(current => current.filter(item => item.id !== id)); timers.delete(timer); }, 6000);
      timers.add(timer);
    };
    window.addEventListener("app:toast", receive);
    return () => { window.removeEventListener("app:toast", receive); timers.forEach(clearTimeout); };
  }, []);
  return <div className="ui-toasts" aria-live="polite">{items.map(item => <div className={`ui-toast ui-tone-${item.type}`} role={item.type === "error" ? "alert" : "status"} key={item.id}>{item.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{item.message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setItems(current => current.filter(entry => entry.id !== item.id))}><X size={16} /></button></div>)}</div>;
}
