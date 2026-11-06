export type TaskPriority = "Critical" | "High" | "Medium" | "Low" | "Optional";
export type TaskDifficulty = "Easy" | "Medium" | "Hard" | "VeryHard";
export type TaskType = "Fixed" | "Flexible" | "Recurring" | "Urgent";
export type TaskStatus =
  | "Pending"
  | "Completed"
  | "Rescheduled"
  | "Skipped"
  | "Cancelled"
  | "Failed"
  | "Paused";

export interface TaskInput {
  title: string;
  description?: string | null;
  category?: string;
  priority?: TaskPriority;
  difficulty?: TaskDifficulty;
  taskType?: TaskType;
  flexibility?: string;
  estimatedMinutes?: number;
  date?: string | null;
  startTime?: string | null;
  deadline?: string | null;
  context?: string | null;
  subjectId?: number | null;
  goalId?: number | null;
  missionId?: number | null;
  tags?: string | null;
}

export interface TaskActionResult extends Task {
  xpAwarded: number;
  newlyUnlocked: Array<{ code: string; title: string; icon: string }>;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  category: string;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  task_type: TaskType;
  flexibility: string;
  estimated_minutes: number;
  actual_minutes: number | null;
  date: string | null;
  start_time: string | null;
  deadline: string | null;
  status: TaskStatus;
  context: string | null;
  subject_id: number | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventItem {
  id: number;
  title: string;
  description: string | null;
  date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  participants: string | null;
  reminder: number;
  created_at: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  type: string;
  subject_id: number | null;
  task_id: number | null;
  folder: string | null;
  tags: string | null;
  pinned: number;
  favorite: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleEntry {
  id: number;
  import_id: number | null;
  subject_name: string;
  teacher: string | null;
  room: string | null;
  main_room: string | null;
  session_number: string | null;
  session_label: string | null;
  type: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  locked: number;
  created_at: string;
}

export interface PlanningBlock {
  id: string;
  kind: "University" | "Event" | "Recovery" | "TaskProposal" | "Task";
  label: string;
  startTime: string;
  endTime: string;
  locked: boolean;
  meta?: Record<string, unknown>;
}

export interface DashboardData {
  date: string;
  blocks: PlanningBlock[];
  next: PlanningBlock | null;
  nextCourse: PlanningBlock | null;
  tasksTotal: number;
  tasksCompleted: number;
  tasksPending: number;
  studyMinutes: number;
  progression: {
    available: boolean;
    totalXp?: number;
    level?: number;
    xpIntoLevel?: number;
    xpForNextLevel?: number;
    division?: string;
    bestStreak?: number;
    message?: string;
  };
}

export interface DraftScheduleEntry {
  subjectName: string;
  teacher: string | null;
  room: string | null;
  mainRoom: string | null;
  sessionNumber: string | null;
  sessionLabel: string | null;
  type: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  rawLine: string;
}

export interface Subject {
  id: number;
  name: string;
  color: string;
  semester: string | null;
  semester_id: number | null;
  created_at: string;
}

export interface Semester {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  active: number;
  created_at: string;
}

export interface Exam {
  id: number;
  subject_id: number;
  title: string;
  exam_date: string | null;
  exam_type: "Examen" | "Contrôle" | "Rattrapage";
  notes: string | null;
  created_at: string;
}

export interface ProposedStudyTask {
  title: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
  estimatedMinutes: number;
  kind: "Lecture" | "Révision" | "Exercices";
}

export interface CourseUploadResult {
  draftId: string;
  title: string;
  chapters: string[];
  proposedTasks: ProposedStudyTask[];
}

export interface Book {
  id: number;
  title: string;
  original_title: string | null;
  author: string | null;
  original_language: string | null;
  edition_language: string | null;
  genre: string | null;
  year: number | null;
  pages: number | null;
  isbn: string | null;
  description: string | null;
  created_at: string;
}

export interface BookInput {
  title: string;
  originalTitle?: string | null;
  author?: string | null;
  originalLanguage?: string | null;
  editionLanguage?: string | null;
  genre?: string | null;
  year?: number | null;
  pages?: number | null;
  isbn?: string | null;
  description?: string | null;
}

export interface MediaItemInput {
  type: "Movie" | "Series" | "Anime";
  title: string;
  originalTitle?: string | null;
  year?: number | null;
  genres?: string | null;
  language?: string | null;
  durationMinutes?: number | null;
  seasonsCount?: number | null;
  episodesCount?: number | null;
  director?: string | null;
  studio?: string | null;
  actors?: string | null;
  publicRating?: number | null;
}

export interface UserBook {
  id: number;
  book_id: number;
  status: "ToRead" | "Reading" | "Completed" | "Abandoned";
  current_page: number;
  personal_rating: number | null;
  favorite: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  book: Book;
  progress: number;
}

export interface MediaItem {
  id: number;
  type: "Movie" | "Series" | "Anime";
  title: string;
  original_title: string | null;
  year: number | null;
  genres: string | null;
  language: string | null;
  duration_minutes: number | null;
  seasons_count: number | null;
  episodes_count: number | null;
  director: string | null;
  studio: string | null;
  actors: string | null;
  public_rating: number | null;
  created_at: string;
}

export interface UserMedia {
  id: number;
  media_item_id: number;
  status: "Watchlist" | "Watching" | "Completed" | "Dropped";
  personal_rating: number | null;
  favorite: number;
  current_season: number | null;
  current_episode: number | null;
  review: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  item: MediaItem;
  progress: number;
  nextEpisodeLabel: string | null;
}

export interface StudyDocument {
  id: number;
  subject_id: number;
  title: string;
  file_path: string | null;
  chapters: string[];
  created_at: string;
  tasksTotal: number;
  tasksCompleted: number;
  readingProgress: number;
  masteryProgress: number;
}

export interface HabitStreak {
  current: number;
  best: number;
}

export interface Habit {
  id: number;
  title: string;
  category: string;
  frequency_type: "Daily" | "Weekly";
  days_of_week: string | null;
  target_minutes: number | null;
  active: number;
  created_at: string;
  streak: HabitStreak;
}

export interface Goal {
  id: number;
  title: string;
  description: string | null;
  term: "short" | "medium" | "long";
  parent_goal_id: number | null;
  target_date: string | null;
  status: "Active" | "Completed" | "Abandoned";
  created_at: string;
  tasksTotal: number;
  tasksCompleted: number;
  progress: number;
}

export interface Mission {
  id: number;
  title: string;
  description: string | null;
  reward_xp: number;
  status: "Active" | "Completed";
  created_at: string;
  completed_at: string | null;
  tasks: Array<{ id: number; title: string; status: string }>;
  tasksTotal: number;
  tasksCompleted: number;
  progress: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  category: string;
  condition_type: string;
  condition_value: number;
  icon: string;
  progress_current: number;
  unlocked_at: string | null;
}

export interface ProgressionData {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  division: string;
  bestStreak: number;
  skills: Array<{ category: string; totalXp: number; level: number }>;
  achievements: Achievement[];
  recentUnlocked: Achievement[];
}
