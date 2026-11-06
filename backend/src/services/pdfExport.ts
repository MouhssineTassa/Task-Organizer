import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

/**
 * Export d'une note en PDF (section 28). Rendu simple d'un sous-ensemble de
 * Markdown (titres #/##/###, listes -/*, cases à cocher - [ ]/- [x],
 * citations >, texte normal) — suffisant pour un export lisible sans
 * dépendance native (pdfkit est 100% JavaScript, contrairement à des
 * librairies nécessitant une compilation, pour rester simple à installer).
 */
export function exportNoteToPdf(title: string, content: string, outputDir: string): Promise<string> {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const safeName = title.replace(/[^a-zA-Z0-9À-ÿ_\-]+/g, "_").slice(0, 60) || "note";
  const fileName = `${Date.now()}-${safeName}.pdf`;
  const filePath = path.join(outputDir, fileName);

  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(20).font("Helvetica-Bold").text(title, { align: "left" });
  doc.moveDown();

  // Retire les marqueurs Markdown inline (**gras**, *italique*) que ce rendu
  // simple ne stylise pas caractère par caractère, pour éviter d'afficher
  // les astérisques bruts dans le PDF final.
  const stripInlineMarkdown = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      doc.moveDown(0.5);
      continue;
    }
    if (line.startsWith("### ")) {
      doc.fontSize(13).font("Helvetica-Bold").text(stripInlineMarkdown(line.slice(4)));
    } else if (line.startsWith("## ")) {
      doc.fontSize(15).font("Helvetica-Bold").text(stripInlineMarkdown(line.slice(3)));
    } else if (line.startsWith("# ")) {
      doc.fontSize(17).font("Helvetica-Bold").text(stripInlineMarkdown(line.slice(2)));
    } else if (/^- \[[ xX]\]/.test(line)) {
      // Les glyphes ☑/☐ ne sont pas disponibles dans les polices standard
      // PDF (Helvetica) : on utilise une notation texte simple et fiable.
      const checked = /^- \[[xX]\]/.test(line);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`${checked ? "[X]" : "[ ]"} ${stripInlineMarkdown(line.replace(/^- \[[ xX]\]\s*/, ""))}`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      doc.fontSize(11).font("Helvetica").text(`•  ${stripInlineMarkdown(line.slice(2))}`, { indent: 10 });
    } else if (line.startsWith("> ")) {
      doc
        .fontSize(11)
        .font("Helvetica-Oblique")
        .fillColor("#555")
        .text(stripInlineMarkdown(line.slice(2)))
        .fillColor("#000");
    } else {
      doc.fontSize(11).font("Helvetica").text(stripInlineMarkdown(line));
    }
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}
