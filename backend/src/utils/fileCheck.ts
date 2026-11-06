import fs from "fs";

/** Vérifie la signature réelle d'un fichier (le type MIME envoyé par le navigateur est falsifiable). */
export function hasMagic(filePath: string, magic: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(magic.length);
      fs.readSync(fd, buf, 0, magic.length, 0);
      return buf.toString("latin1") === magic;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}
export const isPdfFile = (p: string) => hasMagic(p, "%PDF-");
