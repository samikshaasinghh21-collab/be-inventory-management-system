export function toast(message, type = "success") {
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message: String(message), type } }));
}
