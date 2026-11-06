import { sqlite } from "./index";

/**
 * Initialisation du schéma SQLite (CREATE TABLE IF NOT EXISTS).
 * Approche simple et robuste pour une app locale : pas de système de
 * migrations complexe. Chaque nouvelle phase ajoute des tables/colonnes ici
 * sans jamais supprimer ce qui existe déjà (les ALTER TABLE ci-dessous
 * assurent la rétrocompatibilité avec une base MVP1 déjà créée).
 */
export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      password_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      semester TEXT,
      semester_id INTEGER REFERENCES semesters(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedule_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      week_label TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
    );

    CREATE TABLE IF NOT EXISTS schedule_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER REFERENCES schedule_imports(id),
      subject_name TEXT NOT NULL,
      teacher TEXT,
      room TEXT,
      type TEXT NOT NULL DEFAULT 'Cours',
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Général',
      priority TEXT NOT NULL DEFAULT 'Medium',
      difficulty TEXT NOT NULL DEFAULT 'Medium',
      task_type TEXT NOT NULL DEFAULT 'Flexible',
      flexibility TEXT NOT NULL DEFAULT 'FullyFlexible',
      estimated_minutes INTEGER NOT NULL DEFAULT 30,
      actual_minutes INTEGER,
      date TEXT,
      start_time TEXT,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      context TEXT,
      subject_id INTEGER REFERENCES subjects(id),
      study_document_id INTEGER,
      goal_id INTEGER,
      mission_id INTEGER,
      tags TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT,
      participants TEXT,
      reminder INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      day_of_week INTEGER,
      date TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      recurring INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'Libre',
      subject_id INTEGER REFERENCES subjects(id),
      task_id INTEGER REFERENCES tasks(id),
      study_document_id INTEGER,
      folder TEXT,
      tags TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Général',
      frequency_type TEXT NOT NULL DEFAULT 'Daily',
      days_of_week TEXT,
      target_minutes INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL REFERENCES habits(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS xp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      category TEXT NOT NULL DEFAULT 'Général',
      amount INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      condition_value INTEGER NOT NULL,
      icon TEXT NOT NULL DEFAULT '🏆'
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      achievement_id INTEGER NOT NULL REFERENCES achievements(id),
      progress_current INTEGER NOT NULL DEFAULT 0,
      unlocked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      term TEXT NOT NULL DEFAULT 'short',
      parent_goal_id INTEGER,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      reward_xp INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS study_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      title TEXT NOT NULL,
      file_path TEXT,
      chapters TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      title TEXT NOT NULL,
      exam_date TEXT,
      exam_type TEXT NOT NULL DEFAULT 'Examen',
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      related_type TEXT,
      related_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      original_title TEXT,
      author TEXT,
      original_language TEXT,
      edition_language TEXT,
      genre TEXT,
      year INTEGER,
      pages INTEGER,
      isbn TEXT,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id),
      status TEXT NOT NULL DEFAULT 'ToRead',
      current_page INTEGER NOT NULL DEFAULT 0,
      personal_rating INTEGER,
      favorite INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_book_id INTEGER NOT NULL REFERENCES user_books(id),
      date TEXT NOT NULL,
      pages_read INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      original_title TEXT,
      year INTEGER,
      genres TEXT,
      language TEXT,
      duration_minutes INTEGER,
      seasons_count INTEGER,
      episodes_count INTEGER,
      director TEXT,
      studio TEXT,
      actors TEXT,
      public_rating REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Général',
      priority TEXT NOT NULL DEFAULT 'Medium',
      difficulty TEXT NOT NULL DEFAULT 'Medium',
      estimated_minutes INTEGER NOT NULL DEFAULT 30,
      start_time TEXT,
      frequency TEXT NOT NULL DEFAULT 'Weekly',
      days_of_week TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      subject_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL REFERENCES recurring_rules(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      moved_to_date TEXT,
      time_override TEXT,
      actual_minutes INTEGER,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (rule_id, date)
    );

    CREATE TABLE IF NOT EXISTS workout_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      days TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER REFERENCES workout_programs(id),
      label TEXT NOT NULL,
      date TEXT NOT NULL,
      duration_minutes INTEGER,
      comment TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES workout_sessions(id),
      exercise_name TEXT NOT NULL,
      sets INTEGER,
      reps INTEGER,
      weight REAL,
      comment TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      column_name TEXT NOT NULL DEFAULT 'TODO',
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inbox_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL REFERENCES media_items(id),
      status TEXT NOT NULL DEFAULT 'Watchlist',
      personal_rating INTEGER,
      favorite INTEGER NOT NULL DEFAULT 0,
      current_season INTEGER,
      current_episode INTEGER,
      review TEXT,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Rétrocompatibilité : ajoute les nouvelles colonnes sur une base déjà créée, sans rien casser.
  addColumnIfMissing("users", "password_hash", "TEXT");
  addColumnIfMissing("tasks", "goal_id", "INTEGER");
  addColumnIfMissing("tasks", "mission_id", "INTEGER");
  addColumnIfMissing("tasks", "completed_at", "TEXT");
  addColumnIfMissing("tasks", "study_document_id", "INTEGER");
  addColumnIfMissing("subjects", "semester_id", "INTEGER");
  addColumnIfMissing("notes", "study_document_id", "INTEGER");
  addColumnIfMissing("notes", "folder", "TEXT");
  addColumnIfMissing("notes", "tags", "TEXT");

  seedDefaults();
  seedAchievements();
}

function addColumnIfMissing(table: string, column: string, type: string) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as any[];
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function seedDefaults() {
  const userCount = sqlite.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number };
  if (userCount.c === 0) {
    sqlite
      .prepare(`INSERT INTO users (name, created_at) VALUES (?, ?)`)
      .run("Étudiant", new Date().toISOString());
  }

  const recoveryCount = sqlite.prepare(`SELECT COUNT(*) as c FROM recovery_blocks`).get() as { c: number };
  if (recoveryCount.c === 0) {
    const now = new Date().toISOString();
    const defaults: Array<[string, string, number, string, string]> = [
      ["Sleep", "😴 Sommeil", 1, "23:00", "07:00"],
      ["Sleep", "😴 Sommeil", 2, "23:00", "07:00"],
      ["Sleep", "😴 Sommeil", 3, "23:00", "07:00"],
      ["Sleep", "😴 Sommeil", 4, "23:00", "07:00"],
      ["Sleep", "😴 Sommeil", 5, "23:00", "07:00"],
      ["Meal", "🍽️ Déjeuner", 1, "12:30", "13:30"],
      ["Meal", "🍽️ Déjeuner", 2, "12:30", "13:30"],
      ["Meal", "🍽️ Déjeuner", 3, "12:30", "13:30"],
      ["Meal", "🍽️ Déjeuner", 4, "12:30", "13:30"],
      ["Meal", "🍽️ Déjeuner", 5, "12:30", "13:30"],
      ["Meal", "🍽️ Dîner", 1, "20:00", "20:45"],
      ["Meal", "🍽️ Dîner", 2, "20:00", "20:45"],
      ["Meal", "🍽️ Dîner", 3, "20:00", "20:45"],
      ["Meal", "🍽️ Dîner", 4, "20:00", "20:45"],
      ["Meal", "🍽️ Dîner", 5, "20:00", "20:45"],
    ];
    const stmt = sqlite.prepare(
      `INSERT INTO recovery_blocks (kind, label, day_of_week, start_time, end_time, recurring, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`
    );
    for (const [kind, label, day, start, end] of defaults) {
      stmt.run(kind, label, day, start, end, now);
    }
  }
}

/** Catalogue de trophées (MVP2). Insertion idempotente par code unique. */
function seedAchievements() {
  const achievements: Array<{
    code: string;
    title: string;
    description: string;
    category: string;
    conditionType: string;
    conditionValue: number;
    icon: string;
  }> = [
    // Séries (streak sur une habitude)
    { code: "streak_3", title: "Premier élan", description: "Atteindre une série de 3 jours sur une habitude.", category: "Streak", conditionType: "best_streak", conditionValue: 3, icon: "🔥" },
    { code: "streak_7", title: "Une semaine solide", description: "Atteindre une série de 7 jours sur une habitude.", category: "Streak", conditionType: "best_streak", conditionValue: 7, icon: "🔥" },
    { code: "streak_14", title: "Deux semaines", description: "Atteindre une série de 14 jours sur une habitude.", category: "Streak", conditionType: "best_streak", conditionValue: 14, icon: "🔥" },
    { code: "streak_30", title: "Un mois de régularité", description: "Atteindre une série de 30 jours sur une habitude.", category: "Streak", conditionType: "best_streak", conditionValue: 30, icon: "🔥" },
    { code: "streak_60", title: "Deux mois", description: "Atteindre une série de 60 jours sur une habitude.", category: "Streak", conditionType: "best_streak", conditionValue: 60, icon: "🔥" },
    { code: "streak_100", title: "Centurion", description: "Atteindre une série de 100 jours sur une habitude.", category: "Streak", conditionType: "best_streak", conditionValue: 100, icon: "🔥" },
    { code: "streak_365", title: "Une année entière", description: "Atteindre une série de 365 jours sur une habitude.", category: "Streak", conditionType: "best_streak", conditionValue: 365, icon: "🔥" },
    // Quantité (tâches terminées au total)
    { code: "tasks_10", title: "Premiers pas", description: "Terminer 10 tâches.", category: "Quantity", conditionType: "tasks_completed", conditionValue: 10, icon: "✅" },
    { code: "tasks_50", title: "Sur sa lancée", description: "Terminer 50 tâches.", category: "Quantity", conditionType: "tasks_completed", conditionValue: 50, icon: "✅" },
    { code: "tasks_100", title: "Centurion des tâches", description: "Terminer 100 tâches.", category: "Quantity", conditionType: "tasks_completed", conditionValue: 100, icon: "✅" },
    { code: "tasks_500", title: "Machine à tâches", description: "Terminer 500 tâches.", category: "Quantity", conditionType: "tasks_completed", conditionValue: 500, icon: "✅" },
    { code: "tasks_1000", title: "Légende de la productivité", description: "Terminer 1000 tâches.", category: "Quantity", conditionType: "tasks_completed", conditionValue: 1000, icon: "✅" },
    // Spéciaux
    { code: "early_bird", title: "Early Bird", description: "Terminer une tâche avant 8h du matin.", category: "Special", conditionType: "early_bird", conditionValue: 1, icon: "🌅" },
    { code: "night_owl", title: "Night Owl", description: "Terminer une tâche après 22h.", category: "Special", conditionType: "night_owl", conditionValue: 1, icon: "🦉" },
    { code: "study_sessions_50", title: "Bibliothèque vivante", description: "Terminer 50 tâches liées aux Études.", category: "Domain", conditionType: "study_tasks_completed", conditionValue: 50, icon: "📚" },
  ];

  const existing = sqlite.prepare(`SELECT code FROM achievements`).all() as { code: string }[];
  const existingCodes = new Set(existing.map((e) => e.code));

  const insertAchievement = sqlite.prepare(
    `INSERT INTO achievements (code, title, description, category, condition_type, condition_value, icon) VALUES (@code, @title, @description, @category, @conditionType, @conditionValue, @icon)`
  );
  const insertUserAchievement = sqlite.prepare(
    `INSERT INTO user_achievements (achievement_id, progress_current, unlocked_at) VALUES (?, 0, NULL)`
  );

  for (const a of achievements) {
    if (!existingCodes.has(a.code)) {
      const info = insertAchievement.run(a);
      insertUserAchievement.run(info.lastInsertRowid);
    }
  }
}
