import { PDFParse } from "pdf-parse";

export interface ParsedScheduleEntry {
  subjectName: string;
  teacher: string | null;
  room: string | null;
  type: "Cours" | "TD" | "TP" | "Examen";
  dayOfWeek: number; // 1 = Lundi ... 7 = Dimanche
  startTime: string;
  endTime: string;
  rawLine: string;
}

const DAY_MAP: Record<string, number> = {
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  dimanche: 7,
};

const TYPE_KEYWORDS: Array<{ re: RegExp; type: ParsedScheduleEntry["type"] }> = [
  { re: /\bTD\b/i, type: "TD" },
  { re: /\bTP\b/i, type: "TP" },
  { re: /examen|contr[oô]le|partiel/i, type: "Examen" },
  { re: /\bCM\b|cours/i, type: "Cours" },
];

// Détecte des plages horaires du type "08H15-10H05", "08:15 - 10:05", "8h15/10h05"
const TIME_RANGE_RE = /(\d{1,2})[hH:](\d{2})\s*[-–—àa\/]+\s*(\d{1,2})[hH:](\d{2})/;

function normalizeTime(h: string, m: string): string {
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function detectType(line: string): ParsedScheduleEntry["type"] {
  for (const { re, type } of TYPE_KEYWORDS) {
    if (re.test(line)) return type;
  }
  return "Cours";
}

function detectRoom(line: string): string | null {
  const roomMatch = line.match(/(salle|amphi|labo)\s*[:\-]?\s*([A-Za-z0-9\-\.]+)/i);
  return roomMatch ? `${roomMatch[1]} ${roomMatch[2]}` : null;
}

function detectTeacher(line: string): string | null {
  const teacherMatch = line.match(
    /(?:Pr|Prof|M\.|Mme)\.?\s+([A-ZÀ-Ý][\wÀ-ÿ\-]+(?:\s+(?!Amphi\b|Salle\b|Labo\b)[A-ZÀ-Ý][\wÀ-ÿ\-]+)?)/
  );
  return teacherMatch ? teacherMatch[1] : null;
}

/**
 * Extraction heuristique d'un EDT PDF.
 * IMPORTANT : ceci est une extraction basée sur le texte linéaire (pdf-parse).
 * Une reconstruction visuelle avancée par coordonnées (colonnes/lignes exactes
 * d'un tableau) est prévue en amélioration ultérieure (phase 11 avancée) via
 * une librairie de positionnement de texte (ex. pdfjs-dist) si le PDF est trop
 * complexe pour être résolu de manière fiable en texte brut.
 */
export async function parseScheduleFromPdf(buffer: Buffer): Promise<ParsedScheduleEntry[]> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const lines = result.text
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const entries: ParsedScheduleEntry[] = [];
  let currentDay: number | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Une ligne peut être uniquement un nom de jour (en-tête de colonne)
    const dayHeaderOnly = Object.keys(DAY_MAP).find(
      (d) => lower === d || lower.startsWith(d + " ") || lower.startsWith(d + ":")
    );
    if (dayHeaderOnly && line.length < 20) {
      currentDay = DAY_MAP[dayHeaderOnly];
      continue;
    }

    // Une ligne peut contenir le jour ET les infos du cours sur la même ligne
    const dayInline = Object.keys(DAY_MAP).find((d) => lower.includes(d));
    if (dayInline) currentDay = DAY_MAP[dayInline];

    const timeMatch = line.match(TIME_RANGE_RE);
    if (!timeMatch || currentDay === null) continue;

    const [, h1, m1, h2, m2] = timeMatch;
    const startTime = normalizeTime(h1, m1);
    const endTime = normalizeTime(h2, m2);

    // Le nom de la matière = ce qui reste après avoir retiré horaires/jour/salle/prof/type
    let subject = line
      .replace(TIME_RANGE_RE, "")
      .replace(new RegExp(dayInline ?? "", "i"), "")
      .replace(/(salle|amphi|labo)\s*[:\-]?\s*[A-Za-z0-9\-\.]+/i, "")
      .replace(/(?:Pr|Prof|M\.|Mme)\.?\s+[A-ZÀ-Ý][\wÀ-ÿ\-]+(?:\s+(?!Amphi\b|Salle\b|Labo\b)[A-ZÀ-Ý][\wÀ-ÿ\-]+)?/, "")
      .replace(/\bTD\b|\bTP\b|\bCM\b|\bCours\b/gi, "")
      .replace(/[-–—:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!subject) subject = "Cours (nom non détecté)";

    entries.push({
      subjectName: subject,
      teacher: detectTeacher(line),
      room: detectRoom(line),
      type: detectType(line),
      dayOfWeek: currentDay,
      startTime,
      endTime,
      rawLine: line,
    });
  }

  return entries;
}
