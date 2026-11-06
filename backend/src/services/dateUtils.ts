/**
 * Date locale au format YYYY-MM-DD.
 * `toISOString()` renvoie la date en UTC : dans un fuseau en avance sur UTC
 * (ex. Maroc, UTC+1), minuit local tombe sur la veille. Toute date "métier"
 * (jour du planning, habitude, tâche) doit donc passer par cette fonction.
 */
export function localDateString(d: Date): string {
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

/** Jour de la semaine ISO d'une date YYYY-MM-DD : 1 = lundi ... 7 = dimanche. */
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 ? 7 : dow;
}
