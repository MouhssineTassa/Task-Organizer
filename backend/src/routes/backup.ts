import { Router } from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { writeBackupZip, buildJsonExport, restoreFromZip, RestoreError } from "../services/backupService";
import { localDateString } from "../services/dateUtils";

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), "plos-uploads"),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/\.zip$/i.test(file.originalname)) return cb(new Error("Seuls les fichiers .zip sont acceptés"));
    cb(null, true);
  },
});

/** Sauvegarde complète (base + fichiers) à télécharger. */
router.get("/export", async (_req, res) => {
  const name = `personal-life-os-sauvegarde-${localDateString(new Date())}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  try {
    await writeBackupZip(res);
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: `Échec de la sauvegarde : ${e.message}` });
    else res.destroy();
  }
});

/** Export lisible de toutes les données (JSON), sans les fichiers. */
router.get("/export-json", (_req, res) => {
  const name = `personal-life-os-donnees-${localDateString(new Date())}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(JSON.stringify(buildJsonExport(), null, 2));
});

/**
 * Restauration : REMPLACE toutes les données actuelles. Exige un champ
 * confirm=REMPLACER (garde-fou côté serveur) et crée d'abord une copie de
 * sécurité des données actuelles dans storage/exports/.
 */
router.post("/restore", upload.single("file"), async (req, res) => {
  const file = req.file;
  try {
    if (!file) return res.status(400).json({ error: "Aucun fichier reçu" });
    if (req.body?.confirm !== "REMPLACER") {
      return res.status(400).json({ error: "Confirmation manquante : la restauration remplace toutes les données actuelles." });
    }
    const summary = await restoreFromZip(file.path);
    res.json(summary);
  } catch (e: any) {
    if (e instanceof RestoreError) return res.status(422).json({ error: e.message });
    res.status(500).json({ error: `Échec de la restauration : ${e.message}` });
  } finally {
    if (file) fs.rmSync(file.path, { force: true });
  }
});

export default router;
