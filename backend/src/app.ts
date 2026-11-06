import express from "express";
import cors from "cors";
import tasksRouter from "./routes/tasks";
import eventsRouter from "./routes/events";
import notesRouter from "./routes/notes";
import scheduleImportRouter from "./routes/scheduleImport";
import planningRouter from "./routes/planning";
import dashboardRouter from "./routes/dashboard";
import habitsRouter from "./routes/habits";
import goalsRouter from "./routes/goals";
import missionsRouter from "./routes/missions";
import progressionRouter from "./routes/progression";
import studyRouter from "./routes/study";
import filesRouter from "./routes/files";
import booksRouter from "./routes/books";
import mediaRouter from "./routes/media";
import sportRouter from "./routes/sport";
import projectsRouter from "./routes/projects";
import backupRouter from "./routes/backup";
import hubRouter from "./routes/hub";
import authRouter from "./routes/auth";
import recurringRouter from "./routes/recurring";
import { ALLOWED_ORIGINS, csrfGuard, requireAuth, securityHeaders } from "./middleware/security";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(
    cors({
      // Seules les origines de l'interface peuvent lire l'API depuis un navigateur ; les cookies de session sont acceptés.
      origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "5mb" }));

  // Public : état du serveur.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "Personal Life OS", version: "MVP5" });
  });

  app.use("/api", csrfGuard);
  app.use("/api/auth", authRouter);

  // Tout le reste exige une session valide.
  app.use("/api", requireAuth);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/recurring", recurringRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/notes", notesRouter);
  app.use("/api/schedule-import", scheduleImportRouter);
  app.use("/api/planning", planningRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/habits", habitsRouter);
  app.use("/api/goals", goalsRouter);
  app.use("/api/missions", missionsRouter);
  app.use("/api/progression", progressionRouter);
  app.use("/api/study", studyRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/books", booksRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/sport", sportRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/hub", hubRouter);
  app.use("/api/backup", backupRouter);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.name === "MulterError" || /^Seuls les fichiers/.test(err?.message ?? "")) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Erreur serveur interne" });
  });

  return app;
}
