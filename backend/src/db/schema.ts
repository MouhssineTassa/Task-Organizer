import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * PERSONAL LIFE OS — Schéma de base de données (MVP1)
 * Couvre : profil, emploi du temps universitaire (source prioritaire),
 * tâches, événements, notes, et le stockage de l'historique des EDT importés.
 * D'autres entités (Habit, XP, Streak, Achievement, Book, Movie, etc.)
 * seront ajoutées dans les phases/MVP suivants sans jamais casser celui-ci.
 */

// ---------- PROFIL ----------
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

// ---------- ÉTUDES : SEMESTRES ----------
export const semesters = sqliteTable("semesters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ---------- ÉTUDES : MATIÈRES ----------
export const subjects = sqliteTable("subjects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  semester: text("semester"),
  semesterId: integer("semester_id").references(() => semesters.id),
  createdAt: text("created_at").notNull(),
});

// ---------- ÉTUDES : DOCUMENTS DE COURS ----------
export const studyDocuments = sqliteTable("study_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  title: text("title").notNull(),
  filePath: text("file_path"),
  chapters: text("chapters"), // JSON string des chapitres détectés
  createdAt: text("created_at").notNull(),
});

// ---------- ÉTUDES : EXAMENS ----------
export const exams = sqliteTable("exams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  title: text("title").notNull(),
  examDate: text("exam_date"),
  examType: text("exam_type").notNull().default("Examen"), // Examen|Contrôle|Rattrapage
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// ---------- FICHIERS (métadonnées de storage) ----------
export const files = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  originalName: text("original_name").notNull(),
  storedPath: text("stored_path").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  relatedType: text("related_type"), // Note|StudyDocument|...
  relatedId: integer("related_id"),
  createdAt: text("created_at").notNull(),
});

// ---------- EDT IMPORTS (historique des fichiers PDF importés) ----------
export const scheduleImports = sqliteTable("schedule_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  storedPath: text("stored_path").notNull(),
  importedAt: text("imported_at").notNull(),
  weekLabel: text("week_label"),
  status: text("status").notNull().default("draft"), // draft | confirmed
});

// ---------- EDT — CRÉNEAUX FIXES (source prioritaire du planning) ----------
export const scheduleEntries = sqliteTable("schedule_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").references(() => scheduleImports.id),
  subjectName: text("subject_name").notNull(),
  teacher: text("teacher"),
  room: text("room"),
  mainRoom: text("main_room"),
  sessionNumber: text("session_number"),
  sessionLabel: text("session_label"),
  type: text("type").notNull().default("Cours"), // Cours | TD | TP | Examen
  dayOfWeek: integer("day_of_week").notNull(), // 1 = Lundi ... 7 = Dimanche
  startTime: text("start_time").notNull(), // "08:15"
  endTime: text("end_time").notNull(), // "10:05"
  locked: integer("locked", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ---------- TÂCHES ----------
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("Général"),
  priority: text("priority").notNull().default("Medium"), // Critical|High|Medium|Low|Optional
  difficulty: text("difficulty").notNull().default("Medium"), // Easy|Medium|Hard|VeryHard
  taskType: text("task_type").notNull().default("Flexible"), // Fixed|Flexible|Recurring|Urgent
  flexibility: text("flexibility").notNull().default("FullyFlexible"), // Fixed|Semi|FullyFlexible
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  actualMinutes: integer("actual_minutes"),
  date: text("date"), // "2026-09-28" — peut être null si pas encore planifiée
  startTime: text("start_time"), // "18:00"
  deadline: text("deadline"), // date limite ISO
  status: text("status").notNull().default("Pending"), // Pending|Completed|Rescheduled|Skipped|Cancelled|Failed|Paused
  context: text("context"), // Maison|Université|Extérieur|PC|Téléphone|Internet
  subjectId: integer("subject_id").references(() => subjects.id),
  studyDocumentId: integer("study_document_id"),
  goalId: integer("goal_id"),
  missionId: integer("mission_id"),
  tags: text("tags"), // CSV simple pour MVP1
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ---------- HABITUDES (MVP2) ----------
export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  category: text("category").notNull().default("Général"),
  frequencyType: text("frequency_type").notNull().default("Daily"), // Daily|Weekly (jours précis)
  daysOfWeek: text("days_of_week"), // CSV "1,3,5" utilisé si Weekly
  targetMinutes: integer("target_minutes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const habitLogs = sqliteTable("habit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  habitId: integer("habit_id").notNull().references(() => habits.id),
  date: text("date").notNull(),
  status: text("status").notNull(), // Completed|Skipped|Missed|Protected
  createdAt: text("created_at").notNull(),
});

// ---------- XP (MVP2) ----------
export const xpEvents = sqliteTable("xp_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceType: text("source_type").notNull(), // Task|Habit|Mission
  sourceId: integer("source_id"),
  category: text("category").notNull().default("Général"), // pour le niveau par domaine
  amount: integer("amount").notNull(),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
});

// ---------- TROPHÉES (MVP2) ----------
export const achievements = sqliteTable("achievements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // Streak|Quantity|Domain|Special
  conditionType: text("condition_type").notNull(), // best_streak|tasks_completed|habit_completions|early_bird|night_owl
  conditionValue: integer("condition_value").notNull(),
  icon: text("icon").notNull().default("🏆"),
});

export const userAchievements = sqliteTable("user_achievements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  achievementId: integer("achievement_id").notNull().references(() => achievements.id),
  progressCurrent: integer("progress_current").notNull().default(0),
  unlockedAt: text("unlocked_at"),
});

// ---------- OBJECTIFS (MVP2) ----------
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  term: text("term").notNull().default("short"), // short|medium|long
  parentGoalId: integer("parent_goal_id"),
  targetDate: text("target_date"),
  status: text("status").notNull().default("Active"), // Active|Completed|Abandoned
  createdAt: text("created_at").notNull(),
});

// ---------- MISSIONS (MVP2) ----------
export const missions = sqliteTable("missions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  rewardXp: integer("reward_xp").notNull().default(50),
  status: text("status").notNull().default("Active"), // Active|Completed
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

// ---------- ÉVÉNEMENTS ----------
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  location: text("location"),
  participants: text("participants"),
  reminder: integer("reminder", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// ---------- BLOCS DE RÉCUPÉRATION (pauses, repas, sommeil, temps libre) ----------
export const recoveryBlocks = sqliteTable("recovery_blocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // ShortBreak|LongBreak|Meal|Sleep|FreeTime|Commute
  label: text("label").notNull(),
  dayOfWeek: integer("day_of_week"), // récurrent hebdo si renseigné
  date: text("date"), // ou ponctuel si renseigné
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  recurring: integer("recurring", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ---------- BIBLIOTHÈQUE : CATALOGUE GÉNÉRAL ----------
export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  author: text("author"),
  originalLanguage: text("original_language"),
  editionLanguage: text("edition_language"),
  genre: text("genre"),
  year: integer("year"),
  pages: integer("pages"),
  isbn: text("isbn"),
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

// ---------- BIBLIOTHÈQUE : MA BIBLIOTHÈQUE (personnelle) ----------
export const userBooks = sqliteTable("user_books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull().references(() => books.id),
  status: text("status").notNull().default("ToRead"), // ToRead|Reading|Completed|Abandoned
  currentPage: integer("current_page").notNull().default(0),
  personalRating: integer("personal_rating"), // 1-5
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const readingSessions = sqliteTable("reading_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userBookId: integer("user_book_id").notNull().references(() => userBooks.id),
  date: text("date").notNull(),
  pagesRead: integer("pages_read").notNull().default(0),
  durationMinutes: integer("duration_minutes"),
  createdAt: text("created_at").notNull(),
});

// ---------- MEDIA : CATALOGUE GÉNÉRAL (Films/Séries/Anime unifiés) ----------
export const mediaItems = sqliteTable("media_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // Movie|Series|Anime
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  year: integer("year"),
  genres: text("genres"), // CSV
  language: text("language"),
  durationMinutes: integer("duration_minutes"), // pour Movie
  seasonsCount: integer("seasons_count"), // pour Series/Anime
  episodesCount: integer("episodes_count"),
  director: text("director"),
  studio: text("studio"), // pour Anime
  actors: text("actors"),
  publicRating: real("public_rating"),
  createdAt: text("created_at").notNull(),
});

// ---------- MEDIA : MA WATCHLIST / HISTORIQUE (personnel) ----------
export const userMedia = sqliteTable("user_media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mediaItemId: integer("media_item_id").notNull().references(() => mediaItems.id),
  status: text("status").notNull().default("Watchlist"), // Watchlist|Watching|Completed|Dropped
  personalRating: integer("personal_rating"),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  currentSeason: integer("current_season"),
  currentEpisode: integer("current_episode"),
  review: text("review"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ---------- NOTES (Notebook basique) ----------
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  type: text("type").notNull().default("Libre"), // Libre|Résumé|Recherche|Idée|Checklist|FicheRévision|Journal|Document
  subjectId: integer("subject_id").references(() => subjects.id),
  taskId: integer("task_id").references(() => tasks.id),
  studyDocumentId: integer("study_document_id"),
  folder: text("folder"),
  tags: text("tags"), // CSV simple
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
