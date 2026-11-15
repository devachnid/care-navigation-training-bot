/** How emails are stored and compared: trimmed and lower-cased. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A light check only: there is no email sending, so this just catches typing mistakes. */
export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Names as typed, tidied. Null if empty or too long. */
export function cleanName(name: string): string | null {
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length >= 1 && n.length <= 80 ? n : null;
}
