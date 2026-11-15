const KEY = "pal_desktop_alerts";

export const desktopSupported = () => typeof window !== "undefined" && "Notification" in window;
export const desktopEnabled = () => desktopSupported() && Notification.permission === "granted" && localStorage.getItem(KEY) !== "0";

/** Must be called from a click handler (browsers require a user gesture). */
export async function enableDesktop(): Promise<boolean> {
  if (!desktopSupported()) return false;
  const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (p === "granted") localStorage.setItem(KEY, "1");
  return p === "granted";
}
export const disableDesktop = () => localStorage.setItem(KEY, "0");

/** Shows an OS notification, only while the tab is in the background (the in-app toast covers the foreground). */
export function desktopNotify(title: string, body: string, href: string) {
  if (!desktopEnabled() || document.visibilityState === "visible") return;
  const n = new Notification(title, { body, tag: href + title });
  n.onclick = () => { window.focus(); window.location.href = href; n.close(); };
}
