import { useEffect, useRef, useState } from "react";
import {
  getSemesters,
  createSemester,
  getStudySubjects,
  createStudySubject,
  getExams,
  createExam,
  deleteExam,
  getStudyDocuments,
  uploadCoursePdf,
  deleteCourseDraftTask,
  confirmCourseImport,
} from "../api/client";
import type { Semester, Subject, Exam, StudyDocument, CourseUploadResult } from "../types";
import { Card, PageHeader, Badge, Button } from "../components/ui";
import { Plus, Upload, CheckCircle, Trash2, BookOpen } from "lucide-react";

export default function Etudes() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);

  const [showSemesterForm, setShowSemesterForm] = useState(false);
  const [semesterName, setSemesterName] = useState("");
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectSemesterId, setSubjectSemesterId] = useState<number | "">("");

  const [showExamForm, setShowExamForm] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examType, setExamType] = useState<"Examen" | "Contrôle" | "Rattrapage">("Examen");

  const [courseDraft, setCourseDraft] = useState<CourseUploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadSemesters = async () => setSemesters(await getSemesters());
  const loadSubjects = async () => setSubjects(await getStudySubjects());

  useEffect(() => {
    loadSemesters();
    loadSubjects();
  }, []);

  useEffect(() => {
    if (!selectedSubject) return;
    getExams(selectedSubject.id).then(setExams);
    getStudyDocuments(selectedSubject.id).then(setDocuments);
  }, [selectedSubject]);

  const submitSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!semesterName.trim()) return;
    await createSemester({ name: semesterName });
    setSemesterName("");
    setShowSemesterForm(false);
    loadSemesters();
  };

  const submitSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    await createStudySubject({ name: subjectName, semesterId: subjectSemesterId || null });
    setSubjectName("");
    setShowSubjectForm(false);
    loadSubjects();
  };

  const submitExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim() || !selectedSubject) return;
    await createExam({ subjectId: selectedSubject.id, title: examTitle, examDate: examDate || null, examType });
    setExamTitle("");
    setExamDate("");
    setShowExamForm(false);
    getExams(selectedSubject.id).then(setExams);
  };

  const handleUpload = async (file: File) => {
    if (!selectedSubject) return;
    setUploading(true);
    try {
      const result = await uploadCoursePdf(file, selectedSubject.id);
      setCourseDraft(result);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? "Échec de l'analyse du cours PDF.");
    } finally {
      setUploading(false);
    }
  };

  const removeDraftTask = async (index: number) => {
    if (!courseDraft) return;
    await deleteCourseDraftTask(courseDraft.draftId, index);
    setCourseDraft({ ...courseDraft, proposedTasks: courseDraft.proposedTasks.filter((_, i) => i !== index) });
  };

  const confirmCourse = async () => {
    if (!courseDraft || !selectedSubject) return;
    await confirmCourseImport(courseDraft.draftId);
    setCourseDraft(null);
    getStudyDocuments(selectedSubject.id).then(setDocuments);
  };

  return (
    <div>
      <PageHeader title="🎓 Études" subtitle="Semestres, matières, cours, examens, révisions et progression." />

      <div className="grid md:grid-cols-3 gap-4">
        {/* Colonne gauche : semestres + matières */}
        <Card>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-slate-800">Semestres</h2>
            <button onClick={() => setShowSemesterForm((s) => !s)} className="text-brand-600">
              <Plus size={16} />
            </button>
          </div>
          {showSemesterForm && (
            <form onSubmit={submitSemester} className="flex gap-2 mb-3">
              <input
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm flex-1"
                placeholder="Ex: Semestre 3"
                value={semesterName}
                onChange={(e) => setSemesterName(e.target.value)}
              />
              <Button type="submit">OK</Button>
            </form>
          )}
          <ul className="text-sm space-y-1 mb-4">
            {semesters.map((s) => (
              <li key={s.id} className="text-slate-600">
                {s.name}
              </li>
            ))}
            {semesters.length === 0 && <p className="text-xs text-slate-400">Aucun semestre créé.</p>}
          </ul>

          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-slate-800">Matières</h2>
            <button onClick={() => setShowSubjectForm((s) => !s)} className="text-brand-600">
              <Plus size={16} />
            </button>
          </div>
          {showSubjectForm && (
            <form onSubmit={submitSubject} className="space-y-2 mb-3">
              <input
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full"
                placeholder="Ex: Programmation Python"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
              <select
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full"
                value={subjectSemesterId}
                onChange={(e) => setSubjectSemesterId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Sans semestre</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button type="submit" className="w-full">
                Créer la matière
              </Button>
            </form>
          )}
          <ul className="space-y-1">
            {subjects.map((subj) => (
              <li key={subj.id}>
                <button
                  onClick={() => setSelectedSubject(subj)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg ${
                    selectedSubject?.id === subj.id ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-slate-50"
                  }`}
                >
                  {subj.name}
                </button>
              </li>
            ))}
            {subjects.length === 0 && <p className="text-xs text-slate-400">Aucune matière créée.</p>}
          </ul>
        </Card>

        {/* Colonne droite : détail matière sélectionnée */}
        <div className="md:col-span-2 space-y-4">
          {!selectedSubject ? (
            <Card className="text-center py-16 text-slate-400 text-sm">
              Sélectionne ou crée une matière pour voir ses cours, examens et progression.
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold text-slate-800">Importer un cours PDF — {selectedSubject.name}</h2>
                </div>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-300"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="mx-auto mb-2 text-brand-500" size={22} />
                  <p className="text-sm text-slate-600">Dépose le PDF du cours, ou clique pour choisir un fichier</p>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                  />
                </div>
                {uploading && <p className="text-sm text-slate-400 mt-2">Analyse en cours…</p>}

                {courseDraft && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">
                      {courseDraft.chapters.length} chapitre(s) détecté(s) · {courseDraft.proposedTasks.length} tâches
                      proposées
                    </p>
                    <ul className="space-y-1.5 max-h-64 overflow-y-auto mb-3">
                      {courseDraft.proposedTasks.map((t, i) => (
                        <li key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                          <div>
                            <span className="font-medium">{t.title}</span>
                            <span className="text-xs text-slate-400 ml-2">{t.estimatedMinutes} min · {t.difficulty}</span>
                          </div>
                          <button onClick={() => removeDraftTask(i)} className="text-red-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Button onClick={confirmCourse}>
                      <CheckCircle size={16} /> Valider et créer les tâches d'étude
                    </Button>
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold text-slate-800">Documents de cours</h2>
                </div>
                {documents.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucun cours importé pour cette matière.</p>
                ) : (
                  <div className="space-y-3">
                    {documents.map((d) => (
                      <div key={d.id} className="border border-slate-100 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen size={15} className="text-brand-500" />
                          <p className="font-medium text-sm">{d.title}</p>
                          <Badge>{d.chapters.length} chapitres</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span>Lecture</span>
                              <span>{Math.round(d.readingProgress * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400" style={{ width: `${d.readingProgress * 100}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span>Maîtrise</span>
                              <span>{Math.round(d.masteryProgress * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400" style={{ width: `${d.masteryProgress * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold text-slate-800">Examens</h2>
                  <button onClick={() => setShowExamForm((s) => !s)} className="text-brand-600">
                    <Plus size={16} />
                  </button>
                </div>
                {showExamForm && (
                  <form onSubmit={submitExam} className="grid md:grid-cols-3 gap-2 mb-3">
                    <input
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm md:col-span-2"
                      placeholder="Intitulé de l'examen"
                      value={examTitle}
                      onChange={(e) => setExamTitle(e.target.value)}
                    />
                    <select
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                      value={examType}
                      onChange={(e) => setExamType(e.target.value as any)}
                    >
                      <option>Examen</option>
                      <option>Contrôle</option>
                      <option>Rattrapage</option>
                    </select>
                    <input
                      type="date"
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm md:col-span-2"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                    />
                    <Button type="submit">Ajouter</Button>
                  </form>
                )}
                {exams.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucun examen programmé.</p>
                ) : (
                  <ul className="space-y-2">
                    {exams.map((ex) => (
                      <li key={ex.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{ex.title}</span>{" "}
                          <Badge>{ex.exam_type}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{ex.exam_date ?? "Date non définie"}</span>
                          <button
                            onClick={async () => {
                              await deleteExam(ex.id);
                              getExams(selectedSubject.id).then(setExams);
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
