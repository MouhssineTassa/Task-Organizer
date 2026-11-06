/**
 * Parseur EDT basé sur les coordonnées PDF.js.
 * Le format UM6SS utilisé ici est un tableau : jours en colonnes, horaires en lignes.
 * On associe chaque fragment de texte à une cellule grâce à sa position, puis on
 * extrait les métadonnées à l'intérieur de la cellule.
 */
export interface ParsedScheduleEntry {
  subjectName: string;
  teacher: string | null;
  room: string | null;
  mainRoom: string | null;
  sessionNumber: string | null;
  sessionLabel: string | null;
  type: "Cours" | "TD" | "TP" | "Examen";
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  rawLine: string;
}

interface PositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
}

const DAYS = [
  { name: "lundi", day: 1 }, { name: "mardi", day: 2 },
  { name: "mercredi", day: 3 }, { name: "jeudi", day: 4 },
  { name: "vendredi", day: 5 }, { name: "samedi", day: 6 },
];
const TIME_RE = /(\d{1,2})\s*[hH:]\s*(\d{2})\s*[-–—]+\s*(\d{1,2})\s*[hH:]?\s*(\d{2})?/i;
const normalizeTime = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

function cleanText(value: string): string {
  return value.replace(/[\u00a0\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractRoom(text: string): string | null {
  const match = text.match(/\b(AMPHI|SALLE|LABO(?:RATOIRE)?)\s*(?:INFORMATIQUE\s*)?[:\-]?\s*([A-Z]?\s*\d{1,4}[A-Z]?)\b/i);
  if (!match) return null;
  const label = match[1].toLowerCase().startsWith("amphi") ? "Amphi" : match[1].toLowerCase().startsWith("labo") ? "Labo" : "Salle";
  return `${label} ${match[2].replace(/\s+/g, "").toUpperCase()}`;
}

function extractTeacher(text: string): string | null {
  const match = text.match(/\b(?:PR|PROF(?:ESSEUR)?|M\.|MME\.?|MLLE\.?)\s+([^\n]+?)(?=\s+(?:COURS|TD|TP|CONTROLE|CONTRÔLE|SALLE|AMPHI|\d{1,2}\/\d{1,2})\b|$)/i);
  if (!match) return null;
  return cleanText(match[1]).replace(/[,:;]+$/, "") || null;
}

function extractSessionLabel(text: string): string | null {
  const match = text.match(/\b(CONTROLE|CONTRÔLE|EXAMEN|PARTIEL)\b/i);
  if (match) return match[1].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === "CONTROLE" ? "Contrôle" : match[1];
  const courseLine = text.match(/\b(COURS(?:\s*&?\s*TD)?(?:\s*&?\s*TP)?|TD(?:\s*&?\s*TP)?|TP)\b/i);
  return courseLine ? cleanText(courseLine[1]).replace(/\s*&\s*/g, " & ") : null;
}

function extractType(text: string): ParsedScheduleEntry["type"] {
  if (/contr[oô]le|examen|partiel/i.test(text)) return "Examen";
  if (/\bTP\b/i.test(text)) return "TP";
  if (/\bTD\b/i.test(text)) return "TD";
  return "Cours";
}

function extractSubject(text: string): string {
  // Dans ces EDT, le nom de matière précède normalement le professeur.
  // On coupe à la première métadonnée pour ne pas avaler le reste de la cellule.
  const subjectPart = text.split(/\b(?:PR|PROF(?:ESSEUR)?|M\.|MME\.?|MLLE\.?)\b/i)[0];
  return cleanText(subjectPart
    .replace(/\b(?:COURS|TD|TP)\b/gi, " ")
    .replace(/\bCONTROLE\b|\bCONTRÔLE\b|\bEXAMEN\b|\bPARTIEL\b/gi, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " ")
    .replace(/\b(?:SALLE|AMPHI|LABO(?:RATOIRE)?)\b[^\n]*/gi, " ")
    .replace(/[|:]+/g, " "));
}

export async function parseScheduleFromPdf(buffer: Buffer): Promise<ParsedScheduleEntry[]> {
  // pdfjs-dist est déjà une dépendance transitive de pdf-parse ; elle est déclarée
  // explicitement dans package.json pour garantir cet import dans les installations futures.
  // Node 22 prend en charge require() des modules ESM sans top-level await.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const positioned: PositionedText[] = [];
  let pageHeight = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pageHeight = viewport.height;
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim() || !item.transform) continue;
      const x = Number(item.transform[4]);
      // PDF.js utilise une origine en bas à gauche ; on repasse en coordonnées haut-gauche.
      const y = pageHeight - Number(item.transform[5]);
      positioned.push({ text: item.str, x, y, width: Number(item.width) || 0 });
    }
  }

  const fullText = positioned.map((p) => p.text).join(" ");
  const mainRoom = extractRoom(fullText.match(/SALLE\s*:\s*[A-Z]?\s*\d{2,4}[A-Z]?/i)?.[0] ?? "")?.replace(/^Salle\s+/i, "")
    ?? (fullText.match(/SALLE\s*:\s*([A-Z]?\s*\d{2,4}[A-Z]?)/i)?.[1].replace(/\s+/g, "").toUpperCase() ?? null);

  // Les intitulés des jours fournissent les centres des colonnes.
  const dayCenters = DAYS.map(({ name, day }) => {
    const item = positioned.find((p) => new RegExp(`\\b${name}\\b`, "i").test(cleanText(p.text)));
    if (!item) return null;
    const normalized = cleanText(item.text);
    const match = new RegExp(`\\b${name}\\b`, "i").exec(normalized);
    if (!match) return null;
    // Si PDF.js regroupe plusieurs mots dans un même fragment, on estime le centre du mot.
    const ratio = (match.index + name.length / 2) / Math.max(normalized.length, 1);
    return { day, center: item.x + item.width * ratio, headerY: item.y };
  }).filter((v): v is { day: number; center: number; headerY: number } => Boolean(v)).sort((a, b) => a.center - b.center);
  if (dayCenters.length < 5) throw new Error("Impossible de repérer les colonnes des jours dans ce PDF.");

  // Les heures imprimées dans la première colonne déterminent les lignes du tableau.
  const timeAnchors = positioned.map((p) => {
    const match = p.text.match(TIME_RE);
    if (!match) return null;
    return { y: p.y, startTime: normalizeTime(match[1], match[2]), endTime: normalizeTime(match[3], match[4] ?? "00") };
  }).filter((v): v is { y: number; startTime: string; endTime: string } => Boolean(v)).sort((a, b) => a.y - b.y);
  if (timeAnchors.length === 0) throw new Error("Aucune plage horaire n'a été détectée dans le PDF.");

  const entries: ParsedScheduleEntry[] = [];
  const firstRowTop = Math.max(...dayCenters.map((day) => day.headerY)) + 8;
  for (let row = 0; row < timeAnchors.length; row += 1) {
    const anchor = timeAnchors[row];
    const upper = row === 0 ? firstRowTop : (timeAnchors[row - 1].y + anchor.y) / 2;
    const lower = row === timeAnchors.length - 1 ? Infinity : (anchor.y + timeAnchors[row + 1].y) / 2;

    for (let col = 0; col < dayCenters.length; col += 1) {
      const center = dayCenters[col].center;
      const previousGap = col > 0 ? center - dayCenters[col - 1].center : dayCenters[1].center - center;
      const nextGap = col < dayCenters.length - 1 ? dayCenters[col + 1].center - center : center - dayCenters[col - 1].center;
      // La première colonne commence après la colonne horaire/groupe, pas au bord gauche de la page.
      const left = col === 0 ? center - previousGap / 2 : (dayCenters[col - 1].center + center) / 2;
      const right = col === dayCenters.length - 1 ? center + nextGap / 2 : (center + dayCenters[col + 1].center) / 2;
      const cellItems = positioned.filter((p) => {
        const itemCenter = p.x + p.width / 2;
        return itemCenter >= left && itemCenter < right && p.y > upper && p.y < lower
          && !TIME_RE.test(p.text) && !DAYS.some((d) => cleanText(p.text).toLowerCase() === d.name);
      }).sort((a, b) => a.y - b.y || a.x - b.x);

      const cellText = cleanText(cellItems.map((p) => p.text).join(" "));
      if (!cellText || /^(?:GR\s*\d+|GROUPE)$/i.test(cellText)) continue;
      const sessionNumber = cellText.match(/\b(\d{1,2}\s*\/\s*\d{1,2})\b/)?.[1].replace(/\s+/g, "") ?? null;
      const room = extractRoom(cellText);
      const teacher = extractTeacher(cellText);
      const sessionLabel = extractSessionLabel(cellText);
      const subjectName = extractSubject(cellText);
      if (!subjectName || /^(?:GR\s*\d+)$/i.test(subjectName)) continue;

      entries.push({
        subjectName,
        teacher,
        room: room ?? mainRoom,
        mainRoom,
        sessionNumber,
        sessionLabel,
        type: extractType(cellText),
        dayOfWeek: dayCenters[col].day,
        startTime: anchor.startTime,
        endTime: anchor.endTime,
        rawLine: cellText,
      });
    }
  }

  return entries.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}
