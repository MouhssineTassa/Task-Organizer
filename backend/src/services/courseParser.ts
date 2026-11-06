import { PDFParse } from "pdf-parse";

/**
 * COURSE PDF PARSER (MVP3)
 * Détecte heuristiquement les chapitres d'un cours PDF à partir de son texte
 * linéaire, puis propose des tâches d'étude (lecture + révision) pour
 * chacun. Rien n'est automatiquement ajouté : le résultat est un brouillon
 * que l'utilisateur doit valider, modifier ou compléter (section 24).
 */

export interface ProposedTask {
  title: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
  estimatedMinutes: number;
  kind: "Lecture" | "Révision" | "Exercices";
}

export interface ParsedCourse {
  chapters: string[];
  proposedTasks: ProposedTask[];
}

// Repère les lignes qui ressemblent à un titre de chapitre :
// "Chapitre 3 : Les boucles", "1. Introduction", "I. Les variables", etc.
const CHAPTER_PATTERNS = [
  /^chapitre\s+\d+\s*[:\-.]?\s*(.+)$/i,
  /^chapter\s+\d+\s*[:\-.]?\s*(.+)$/i,
  /^partie\s+\d+\s*[:\-.]?\s*(.+)$/i,
  /^\d+[.)]\s+([A-ZÀ-Ý].{2,60})$/,
  /^[IVXLC]+[.)]\s+([A-ZÀ-Ý].{2,60})$/,
];

export async function parseCoursePdf(buffer: Buffer): Promise<ParsedCourse> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const lines = result.text
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const chapters: string[] = [];
  for (const line of lines) {
    if (line.length > 90) continue; // un titre de chapitre est court
    for (const pattern of CHAPTER_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const title = (match[1] ?? line).trim();
        if (title.length >= 2 && !chapters.includes(title)) chapters.push(title);
        break;
      }
    }
  }

  const proposedTasks: ProposedTask[] = [];
  for (const chapter of chapters) {
    proposedTasks.push({
      title: `Lire : ${chapter}`,
      description: `Lecture du chapitre « ${chapter} ».`,
      difficulty: "Easy",
      estimatedMinutes: 30,
      kind: "Lecture",
    });
    proposedTasks.push({
      title: `Réviser : ${chapter}`,
      description: `Relecture et fiche de révision pour « ${chapter} ».`,
      difficulty: "Medium",
      estimatedMinutes: 45,
      kind: "Révision",
    });
  }

  return { chapters, proposedTasks };
}
