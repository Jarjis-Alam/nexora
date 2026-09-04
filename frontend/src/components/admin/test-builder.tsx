"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RepositoryQuestion {
  id: string;
  question: string;
  difficulty: string;
  marks: number;
  subjectName: string;
  subjectCode: string;
  topicName: string;
}

export function TestBuilder({
  repositoryQuestions,
}: {
  repositoryQuestions: RepositoryQuestion[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState("");
  const [testType, setTestType] = useState<"aptitude" | "cs_fundamentals" | "mixed" | "baseline">("mixed");
  const [selectedQuestions, setSelectedQuestions] = useState<
    { id: string; question: RepositoryQuestion; marks: number }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredRepo = repositoryQuestions.filter(
    (q) =>
      !selectedQuestions.some((sq) => sq.id === q.id) &&
      (q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.topicName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.subjectName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalMarks = selectedQuestions.reduce((sum, q) => sum + q.marks, 0);

  const addQuestion = (q: RepositoryQuestion) => {
    setSelectedQuestions((prev) => {
      if (prev.some((item) => item.id === q.id)) return prev;
      return [...prev, { id: q.id, question: q, marks: q.marks }];
    });
  };

  const removeQuestion = (id: string) => {
    setSelectedQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const moveQuestionUp = (idx: number) => {
    if (idx <= 0) return;
    setSelectedQuestions((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx - 1];
      next[idx - 1] = temp;
      return next;
    });
  };

  const moveQuestionDown = (idx: number) => {
    if (idx >= selectedQuestions.length - 1) return;
    setSelectedQuestions((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx + 1];
      next[idx + 1] = temp;
      return next;
    });
  };

  const updateQuestionMarks = (id: string, newMarks: number) => {
    setSelectedQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, marks: newMarks } : q))
    );
  };

  const handleCreateTest = async () => {
    setErrorMsg(null);
    if (!title.trim()) {
      setErrorMsg("Please enter a valid test title.");
      return;
    }
    if (selectedQuestions.length === 0) {
      setErrorMsg("Please add at least one question to the test.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description,
          duration: Number(duration),
          type: testType,
          totalMarks,
          isPublished: true,
          questions: selectedQuestions.map((q, idx) => ({
            questionId: q.id,
            questionOrder: idx + 1,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to create test");
      }

      router.push("/tests");
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create test.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Configuration Card */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
        <h3 className="text-title-md font-semibold text-text-primary">
          Assessment Parameters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-6">
            <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
              Test Nomenclature *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. SDE Technical Screen — Graph & Dynamic Programming"
              className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
              Duration (Minutes) *
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
              Test Category
            </label>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value as any)}
              className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
            >
              <option value="mixed">Mixed Placement</option>
              <option value="aptitude">Aptitude</option>
              <option value="cs_fundamentals">CS Fundamentals</option>
              <option value="baseline">Baseline Assessment</option>
            </select>
          </div>

          <div className="md:col-span-12">
            <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
              Context / Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe the scope, target hiring tier, and focus areas..."
              className="w-full bg-base border border-border rounded p-4 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Split Builder: Repository (Left) vs Composition (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Repository */}
        <div className="lg:col-span-6 bg-surface border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-title-md font-semibold text-text-primary">
              Repository
            </h3>
            <span className="text-label-xs font-mono text-text-muted">
              {filteredRepo.length} ITEMS AVAILABLE
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by keyword, topic, or subject..."
              className="w-full bg-base border border-border rounded px-4 py-2 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
            />
            <span className="material-symbols-outlined absolute right-3 top-2.5 text-text-muted text-[18px]">
              search
            </span>
          </div>

          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredRepo.map((q) => (
              <div
                key={q.id}
                className="bg-base border border-border rounded-lg p-4 space-y-2 hover:border-border-variant transition-colors"
              >
                <div className="flex items-center justify-between text-label-xs font-mono">
                  <span className="text-text-muted">
                    ID: {q.id.slice(0, 6).toUpperCase()} • {q.subjectCode}
                  </span>
                  <span className="text-primary-text">{q.difficulty}</span>
                </div>
                <p className="text-body-sm text-text-primary line-clamp-2">
                  {q.question}
                </p>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-label-xs text-text-muted font-mono">
                    {q.topicName}
                  </span>
                  <button
                    onClick={() => addQuestion(q)}
                    className="text-label-xs font-mono text-primary-text hover:text-primary transition-colors flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    + Add to Test
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Test Composition */}
        <div className="lg:col-span-6 bg-surface border border-border rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h3 className="text-title-md font-semibold text-text-primary">
                Test Composition
              </h3>
              <div className="flex items-center gap-4 font-mono text-label-xs">
                <span>
                  QUESTIONS:{" "}
                  <strong className="text-text-primary">
                    {selectedQuestions.length}
                  </strong>
                </span>
                <span>
                  TOTAL MARKS:{" "}
                  <strong className="text-primary-text">{totalMarks}</strong>
                </span>
              </div>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {selectedQuestions.length > 0 ? (
                selectedQuestions.map((sq, idx) => (
                  <div
                    key={sq.id}
                    className="bg-base border border-border rounded-lg p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="font-mono text-label-xs text-text-muted">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="truncate">
                        <p className="text-body-sm text-text-primary font-medium truncate">
                          {sq.question.question}
                        </p>
                        <span className="text-label-xs text-text-muted font-mono">
                          {sq.question.subjectCode} • {sq.question.topicName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Move Up / Down Buttons */}
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveQuestionUp(idx)}
                          disabled={idx === 0}
                          aria-label={`Move question ${idx + 1} up`}
                          className="text-text-muted hover:text-text-primary disabled:opacity-20 p-1 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestionDown(idx)}
                          disabled={idx === selectedQuestions.length - 1}
                          aria-label={`Move question ${idx + 1} down`}
                          className="text-text-muted hover:text-text-primary disabled:opacity-20 p-1 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1 font-mono text-label-xs">
                        <input
                          type="number"
                          value={sq.marks}
                          onChange={(e) =>
                            updateQuestionMarks(sq.id, Number(e.target.value))
                          }
                          className="w-12 bg-surface-high border border-border rounded px-2 py-1 text-center text-text-primary"
                        />
                        <span className="text-text-muted">pts</span>
                      </div>

                      <button
                        onClick={() => removeQuestion(sq.id)}
                        aria-label={`Remove question ${idx + 1}`}
                        className="text-text-muted hover:text-error transition-colors p-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          close
                        </span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-16 text-text-muted font-mono text-body-sm border border-dashed border-border rounded-lg">
                  Select questions from repository to build the test payload.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-border flex flex-col gap-3">
            {errorMsg && (
              <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-label-xs font-mono">
                {errorMsg}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCreateTest}
                disabled={loading || selectedQuestions.length === 0}
                className="bg-primary text-text-inverse font-semibold text-body-sm px-6 py-2.5 rounded hover:bg-primary-text transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                {loading ? "Deploying..." : "Create Test Payload"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
