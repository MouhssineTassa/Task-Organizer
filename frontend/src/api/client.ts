import axios from "axios";
import type {
  Task,
  TaskInput,
  TaskActionResult,
  EventItem,
  Note,
  ScheduleEntry,
  DashboardData,
  DraftScheduleEntry,
  Subject,
  PlanningBlock,
  Habit,
  Goal,
  Mission,
  ProgressionData,
  Semester,
  Exam,
  StudyDocument,
  CourseUploadResult,
  Book,
  BookInput,
  UserBook,
  MediaItem,
  MediaItemInput,
  UserMedia,
} from "../types";

// Par défaut on suit le nom d'hôte de la page (localhost ou 127.0.0.1) : les cookies de session sont liés au nom d'hôte,
// donc une page sur 127.0.0.1 qui appellerait localhost:4000 perdrait sa session.
export const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000/api`;

// withCredentials : envoie le cookie de session. X-PLOS : en-tête de sécurité exigé par le serveur (protection CSRF).
export const api = axios.create({ baseURL: API_BASE, withCredentials: true, headers: { "X-PLOS": "1" } });

// Signale à l'interface quand le serveur local ne répond pas (backend non lancé) et quand il revient.
api.interceptors.response.use(
  (res) => {
    window.dispatchEvent(new CustomEvent("backend-status", { detail: { online: true } }));
    return res;
  },
  (err) => {
    if (!err.response) window.dispatchEvent(new CustomEvent("backend-status", { detail: { online: false } }));
    // Session expirée ou absente (hors écrans d'authentification eux-mêmes) : retour à l'écran de connexion.
    if (err.response?.status === 401 && !String(err.config?.url ?? "").startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("auth-expired"));
    }
    return Promise.reject(err);
  }
);

// ---------- Dashboard ----------
export const getDashboardToday = () => api.get<DashboardData>("/dashboard/today").then((r) => r.data);
export const getSubjects = () => api.get<Subject[]>("/dashboard/subjects").then((r) => r.data);
export const createSubject = (payload: Partial<Subject>) =>
  api.post<Subject>("/dashboard/subjects", payload).then((r) => r.data);

// ---------- Tasks ----------
export const getTasks = (params?: { date?: string; status?: string }) =>
  api.get<Task[]>("/tasks", { params }).then((r) => r.data);
export const createTask = (payload: TaskInput) =>
  api.post<Task>("/tasks", payload).then((r) => r.data);
export const updateTask = (id: number, payload: Partial<TaskInput>) =>
  api.put<Task>(`/tasks/${id}`, payload).then((r) => r.data);
export const taskAction = (
  id: number,
  action: "complete" | "reschedule" | "skip" | "cancel" | "pause" | "resume",
  extra?: { newDate?: string; actualMinutes?: number }
) => api.post<TaskActionResult>(`/tasks/${id}/action`, { action, ...extra }).then((r) => r.data);
export const deleteTask = (id: number) => api.delete(`/tasks/${id}`);

// ---------- Events ----------
export const getEvents = (params?: { date?: string; from?: string; to?: string }) =>
  api.get<EventItem[]>("/events", { params }).then((r) => r.data);
export const createEvent = (payload: Partial<EventItem> & { title: string }) =>
  api.post<EventItem>("/events", payload).then((r) => r.data);
export const deleteEvent = (id: number) => api.delete(`/events/${id}`);

// ---------- Notes ----------
export const getNotes = () => api.get<Note[]>("/notes").then((r) => r.data);
export const createNote = (payload: Partial<Note> & { title: string }) =>
  api.post<Note>("/notes", payload).then((r) => r.data);
export const updateNote = (id: number, payload: Partial<Note>) =>
  api.put<Note>(`/notes/${id}`, payload).then((r) => r.data);
export const deleteNote = (id: number) => api.delete(`/notes/${id}`);

// ---------- Schedule import (EDT PDF) ----------
export const uploadScheduleFile = (file: File, weekLabel?: string) => {
  const form = new FormData();
  form.append("file", file);
  if (weekLabel) form.append("weekLabel", weekLabel);
  return api
    .post<{ importId: number; fileName: string; extractedCount: number; entries: DraftScheduleEntry[] }>(
      "/schedule-import/upload",
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => r.data);
};
export const getScheduleDiff = (importId: number) =>
  api.get(`/schedule-import/${importId}/diff`).then((r) => r.data);
export const confirmScheduleImport = (importId: number) =>
  api.post(`/schedule-import/${importId}/confirm`).then((r) => r.data);
export const getCurrentSchedule = () =>
  api.get<ScheduleEntry[]>("/schedule-import/current").then((r) => r.data);
export const getScheduleHistory = () => api.get("/schedule-import/history").then((r) => r.data);
export const deleteScheduleEntry = (id: number) => api.delete(`/schedule-import/entries/${id}`);

// ---------- Planning ----------
export const getPlanningDay = (date: string) =>
  api
    .get<{ date: string; blocks: PlanningBlock[]; freeSlots: { start: string; end: string; durationMinutes: number }[] }>(
      `/planning/day/${date}`
    )
    .then((r) => r.data);
export const getPlanningWeek = (startDate: string) =>
  api.get<{ days: { date: string; blocks: PlanningBlock[] }[] }>(`/planning/week/${startDate}`).then((r) => r.data);
export const getPlanningProposals = () =>
  api
    .get<{
      proposals: { taskId: number; title: string; proposedDate: string; proposedStart: string; proposedEnd: string }[];
      failures: { taskId: number; title: string; reason: string }[];
    }>("/planning/proposals")
    .then((r) => r.data);
export const applyProposal = (taskId: number, date: string, startTime: string) =>
  api.post("/planning/proposals/apply", { taskId, date, startTime }).then((r) => r.data);
export const checkConflicts = (date: string, startTime: string, endTime: string) =>
  api.post("/planning/conflicts", { date, startTime, endTime }).then((r) => r.data);

// ---------- Habitudes (MVP2) ----------
export const getHabits = () => api.get<Habit[]>("/habits").then((r) => r.data);
export const createHabit = (payload: {
  title: string;
  category?: string;
  frequencyType?: "Daily" | "Weekly";
  daysOfWeek?: string | null;
  targetMinutes?: number | null;
}) => api.post<Habit>("/habits", payload).then((r) => r.data);
export const deleteHabit = (id: number) => api.delete(`/habits/${id}`);
export const logHabit = (id: number, date: string, status: "Completed" | "Skipped" | "Missed") =>
  api
    .post<{ habit: Habit; xpAwarded: number; newlyUnlocked: Array<{ code: string; title: string; icon: string }> }>(
      `/habits/${id}/log`,
      { date, status }
    )
    .then((r) => r.data);
export const freezeHabit = (id: number, date: string) =>
  api.post<Habit>(`/habits/${id}/freeze`, { date }).then((r) => r.data);

// ---------- Objectifs (MVP2) ----------
export const getGoals = () => api.get<Goal[]>("/goals").then((r) => r.data);
export const createGoal = (payload: {
  title: string;
  description?: string | null;
  term?: "short" | "medium" | "long";
  parentGoalId?: number | null;
  targetDate?: string | null;
}) => api.post<Goal>("/goals", payload).then((r) => r.data);
export const updateGoal = (id: number, payload: Partial<{ status: "Active" | "Completed" | "Abandoned" }>) =>
  api.put<Goal>(`/goals/${id}`, payload).then((r) => r.data);
export const deleteGoal = (id: number) => api.delete(`/goals/${id}`);

// ---------- Missions (MVP2) ----------
export const getMissions = () => api.get<Mission[]>("/missions").then((r) => r.data);
export const createMission = (payload: { title: string; description?: string | null; rewardXp?: number }) =>
  api.post<Mission>("/missions", payload).then((r) => r.data);
export const deleteMission = (id: number) => api.delete(`/missions/${id}`);

// ---------- Progression (MVP2) ----------
export const getProgression = () => api.get<ProgressionData>("/progression").then((r) => r.data);

// ---------- Études (MVP3) ----------
export const getSemesters = () => api.get<Semester[]>("/study/semesters").then((r) => r.data);
export const createSemester = (payload: { name: string; startDate?: string; endDate?: string }) =>
  api.post<Semester>("/study/semesters", payload).then((r) => r.data);

export const getStudySubjects = (semesterId?: number) =>
  api.get<Subject[]>("/study/subjects", { params: semesterId ? { semesterId } : undefined }).then((r) => r.data);
export const createStudySubject = (payload: { name: string; color?: string; semesterId?: number | null }) =>
  api.post<Subject>("/study/subjects", payload).then((r) => r.data);

export const getExams = (subjectId?: number) =>
  api.get<Exam[]>("/study/exams", { params: subjectId ? { subjectId } : undefined }).then((r) => r.data);
export const createExam = (payload: {
  subjectId: number;
  title: string;
  examDate?: string | null;
  examType?: "Examen" | "Contrôle" | "Rattrapage";
  notes?: string | null;
}) => api.post<Exam>("/study/exams", payload).then((r) => r.data);
export const deleteExam = (id: number) => api.delete(`/study/exams/${id}`);

export const getStudyDocuments = (subjectId?: number) =>
  api.get<StudyDocument[]>("/study/documents", { params: subjectId ? { subjectId } : undefined }).then((r) => r.data);
export const uploadCoursePdf = (file: File, subjectId: number, title?: string) => {
  const form = new FormData();
  form.append("file", file);
  form.append("subjectId", String(subjectId));
  if (title) form.append("title", title);
  return api
    .post<CourseUploadResult>("/study/documents/upload", form, { headers: { "Content-Type": "multipart/form-data" } })
    .then((r) => r.data);
};
export const deleteCourseDraftTask = (draftId: string, index: number) =>
  api.delete(`/study/documents/${draftId}/draft/${index}`);
export const confirmCourseImport = (draftId: string) =>
  api.post<StudyDocument & { tasksCreated: number }>(`/study/documents/${draftId}/confirm`).then((r) => r.data);

// ---------- Export PDF des notes ----------
export const exportNoteToPdf = (id: number) =>
  api.post<{ fileId: number; fileName: string; downloadUrl: string }>(`/notes/${id}/export-pdf`).then((r) => r.data);

// ---------- Bibliothèque (MVP4) ----------
export const getBookCatalog = (params?: { language?: string; genre?: string; search?: string }) =>
  api.get<Book[]>("/books", { params }).then((r) => r.data);
export const createBook = (payload: BookInput) =>
  api.post<Book>("/books", payload).then((r) => r.data);
export const getMyBooks = (status?: string) =>
  api.get<UserBook[]>("/books/my", { params: status ? { status } : undefined }).then((r) => r.data);
export const addBookToLibrary = (bookId: number, status?: string) =>
  api.post<UserBook>("/books/my", { bookId, status }).then((r) => r.data);
export const updateUserBook = (
  id: number,
  payload: Partial<{ status: string; currentPage: number; personalRating: number; favorite: boolean }>
) => api.put<UserBook & { xpAwarded: number }>(`/books/my/${id}`, payload).then((r) => r.data);
export const removeUserBook = (id: number) => api.delete(`/books/my/${id}`);
export const logReadingSession = (userBookId: number, date: string, pagesRead: number, durationMinutes?: number) =>
  api.post<UserBook>(`/books/my/${userBookId}/sessions`, { date, pagesRead, durationMinutes }).then((r) => r.data);

// ---------- Media (MVP4) ----------
export const getMediaCatalog = (params?: { type?: string; genre?: string; search?: string }) =>
  api.get<MediaItem[]>("/media", { params }).then((r) => r.data);
export const createMediaItem = (payload: MediaItemInput) =>
  api.post<MediaItem>("/media", payload).then((r) => r.data);
export const getMyMedia = (params?: { status?: string; type?: string }) =>
  api.get<UserMedia[]>("/media/my", { params }).then((r) => r.data);
export const addMediaToLibrary = (mediaItemId: number, status?: string) =>
  api.post<UserMedia>("/media/my", { mediaItemId, status }).then((r) => r.data);
export const updateUserMedia = (
  id: number,
  payload: Partial<{
    status: string;
    currentSeason: number;
    currentEpisode: number;
    personalRating: number;
    favorite: boolean;
    review: string;
  }>
) => api.put<UserMedia & { xpAwarded: number }>(`/media/my/${id}`, payload).then((r) => r.data);
export const removeUserMedia = (id: number) => api.delete(`/media/my/${id}`);

// ---------- Sport (MVP5) ----------
export interface WorkoutProgram {
  id: number;
  name: string;
  days: Array<{ dayOfWeek: number; label: string }>;
}
export interface WorkoutSession {
  id: number;
  label: string;
  date: string;
  duration_minutes: number | null;
  comment: string | null;
  exercises: Array<{ id: number; exercise_name: string; sets: number | null; reps: number | null; weight: number | null }>;
}
export const getPrograms = () => api.get<WorkoutProgram[]>("/sport/programs").then((r) => r.data);
export const createProgram = (name: string, days: Array<{ dayOfWeek: number; label: string }>) =>
  api.post<WorkoutProgram>("/sport/programs", { name, days }).then((r) => r.data);
export const deleteProgram = (id: number) => api.delete(`/sport/programs/${id}`);
export const getSessions = () => api.get<WorkoutSession[]>("/sport/sessions").then((r) => r.data);
export const createSession = (payload: {
  programId?: number | null;
  label: string;
  date: string;
  durationMinutes?: number;
  comment?: string;
  exercises?: Array<{ exerciseName: string; sets?: number; reps?: number; weight?: number }>;
}) => api.post<{ id: number; xpAwarded: number }>("/sport/sessions", payload).then((r) => r.data);
export const deleteSession = (id: number) => api.delete(`/sport/sessions/${id}`);
export const getSportProgress = () =>
  api
    .get<{
      best: Array<{ exercise_name: string; maxWeight: number; logs: number }>;
      perWeek: Array<{ week: string; sessions: number }>;
    }>("/sport/progress")
    .then((r) => r.data);

// ---------- Projets (MVP5) ----------
export interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  column_name: "TODO" | "DOING" | "DONE";
}
export interface Project {
  id: number;
  title: string;
  description: string | null;
  deadline: string | null;
  tasks: ProjectTask[];
  tasksTotal: number;
  tasksDone: number;
  progress: number;
}
export const getProjects = () => api.get<Project[]>("/projects").then((r) => r.data);
export const createProject = (title: string, deadline?: string) =>
  api.post<Project>("/projects", { title, deadline }).then((r) => r.data);
export const deleteProject = (id: number) => api.delete(`/projects/${id}`);
export const addProjectTask = (projectId: number, title: string) =>
  api.post<Project>(`/projects/${projectId}/tasks`, { title }).then((r) => r.data);
export const moveProjectTask = (taskId: number, column: "TODO" | "DOING" | "DONE") =>
  api.put<{ project: Project; xpAwarded: number }>(`/projects/tasks/${taskId}`, { column }).then((r) => r.data);

// ---------- Inbox / Recherche / Analytics / Recommandations (MVP5) ----------
export interface InboxItem {
  id: number;
  content: string;
  created_at: string;
}
export interface SearchResult {
  type: string;
  id: number;
  title: string;
  extra?: string;
}
export interface AnalyticsData {
  perDay: Array<{ day: string; tasks: number; minutes: number }>;
  byStatus: Array<{ status: string; count: number }>;
  studyMinutes: number;
  pagesRead: number;
  workouts: number;
  mediaDone: number;
  booksDone: number;
  xpByCategory: Array<{ category: string; xp: number }>;
  estimateVsActual: { estimated: number; actual: number };
}
export const getInbox = () => api.get<InboxItem[]>("/hub/inbox").then((r) => r.data);
export const addToInbox = (content: string) => api.post<InboxItem>("/hub/inbox", { content }).then((r) => r.data);
export const convertInboxItem = (id: number, target: "task" | "note") =>
  api.post(`/hub/inbox/${id}/convert`, { target }).then((r) => r.data);
export const dismissInboxItem = (id: number) => api.delete(`/hub/inbox/${id}`);
export const globalSearch = (q: string) =>
  api.get<SearchResult[]>("/hub/search", { params: { q } }).then((r) => r.data);
export const getAnalytics = () => api.get<AnalyticsData>("/hub/analytics").then((r) => r.data);
export const getMediaRecommendations = (type?: string) =>
  api
    .get<{ source: string; recommendations: Array<MediaItem & { reason: string }> }>("/hub/recommendations/media", {
      params: type ? { type } : undefined,
    })
    .then((r) => r.data);

// ---------- Planning : urgences et blocs de récupération ----------
export interface UrgentInput {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}
export interface ProposedMove {
  taskId: number | null;
  /** Renseigné quand le déplacement concerne UNE occurrence d'une routine. */
  occurrence?: { ruleId: number; date: string };
  title: string;
  from: { date: string; startTime: string };
  to: { date: string; startTime: string; endTime: string } | null;
  reason?: string;
}
export interface UrgentProposal {
  feasible: boolean;
  blockedBy: Array<{ label: string; startTime: string; endTime: string }>;
  message: string;
  urgent: UrgentInput;
  moves: ProposedMove[];
}
export const proposeUrgent = (input: UrgentInput) =>
  api.post<UrgentProposal>("/planning/urgent/propose", input).then((r) => r.data);
export const applyUrgent = (proposal: UrgentProposal) =>
  api
    .post<{ urgentTaskId: number }>("/planning/urgent/apply", {
      urgent: proposal.urgent,
      moves: proposal.moves.map((m) => ({
        taskId: m.taskId,
        occurrence: m.occurrence,
        to: m.to ? { date: m.to.date, startTime: m.to.startTime } : null,
      })),
    })
    .then((r) => r.data);

export interface RecoveryBlock {
  id: number;
  kind: "Sleep" | "Meal" | "ShortBreak" | "LongBreak" | "FreeTime" | "Commute";
  label: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}
export const getRecoveryBlocks = () => api.get<RecoveryBlock[]>("/planning/recovery").then((r) => r.data);
export const createRecoveryBlock = (payload: {
  kind: RecoveryBlock["kind"];
  label: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}) => api.post<{ ids: number[] }>("/planning/recovery", payload).then((r) => r.data);
export const deleteRecoveryBlock = (id: number) => api.delete(`/planning/recovery/${id}`);

// ---------- Sauvegarde / restauration ----------
export interface RestoreSummary {
  tables: Record<string, number>;
  filesRestored: number;
  safetyBackup: string;
  foreignKeyIssues: number;
}
export const restoreBackup = (file: File) => {
  const form = new FormData();
  form.append("confirm", "REMPLACER");
  form.append("file", file);
  return api
    .post<RestoreSummary>("/backup/restore", form, { headers: { "Content-Type": "multipart/form-data" } })
    .then((r) => r.data);
};

// ---------- Authentification ----------
export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
  name: string | null;
}
export const getAuthStatus = () => api.get<AuthStatus>("/auth/status").then((r) => r.data);
export const setupPassword = (password: string, name?: string) =>
  api.post<{ name: string }>("/auth/setup", { password, name }).then((r) => r.data);
export const loginRequest = (password: string) => api.post<{ name: string }>("/auth/login", { password }).then((r) => r.data);
export const logoutRequest = () => api.post("/auth/logout");
export const logoutAllRequest = () => api.post("/auth/logout-all");
export const changePasswordRequest = (currentPassword: string, newPassword: string) =>
  api.post("/auth/change-password", { currentPassword, newPassword }).then((r) => r.data);

// ---------- Routines (tâches récurrentes) ----------
export interface Occurrence {
  ruleId: number;
  title: string;
  category: string;
  priority: string;
  difficulty: string;
  estimatedMinutes: number;
  subjectId: number | null;
  originalDate: string;
  date: string;
  time: string | null;
  status: "Pending" | "Completed";
  rescheduled: boolean;
}
export interface RoutineRule {
  id: number;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  difficulty: string;
  estimated_minutes: number;
  start_time: string | null;
  frequency: "Daily" | "Weekly";
  days_of_week: string | null;
  start_date: string;
  end_date: string | null;
  active: number;
  daysList: number[];
  upcoming: Occurrence[];
}
export interface HiddenOccurrence {
  ruleId: number;
  title: string;
  date: string;
  status: "Skipped" | "Cancelled";
}
export const getRoutines = () => api.get<RoutineRule[]>("/recurring/rules").then((r) => r.data);
export const createRoutine = (payload: {
  title: string;
  category?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  startTime?: string | null;
  frequency: "Daily" | "Weekly";
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string | null;
}) => api.post<RoutineRule>("/recurring/rules", payload).then((r) => r.data);
export const deleteRoutine = (id: number) => api.delete(`/recurring/rules/${id}`);
export const getOccurrences = (from: string, to: string) =>
  api.get<Occurrence[]>("/recurring/occurrences", { params: { from, to } }).then((r) => r.data);
export const getHiddenOccurrences = (from: string, to: string) =>
  api.get<HiddenOccurrence[]>("/recurring/occurrences/hidden", { params: { from, to } }).then((r) => r.data);
export const occurrenceAction = (
  ruleId: number,
  date: string,
  action: "complete" | "skip" | "cancel" | "reschedule" | "reset",
  extra?: { newDate?: string; newTime?: string | null }
) =>
  api
    .post<{ xpAwarded: number; newlyUnlocked: Array<{ code: string; title: string; icon: string }> }>("/recurring/occurrences/action", {
      ruleId,
      date,
      action,
      ...extra,
    })
    .then((r) => r.data);
