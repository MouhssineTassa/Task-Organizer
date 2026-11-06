/** Date locale YYYY-MM-DD (évite le décalage UTC de toISOString). */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ajoute n jours à une date YYYY-MM-DD en calendrier local (jamais via UTC). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return localDateString(new Date(y, m - 1, d + n));
}
