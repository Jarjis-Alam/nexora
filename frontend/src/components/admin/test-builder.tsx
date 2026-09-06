"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PreviewDraft, PreviewQuestion } from "@/components/admin/admin-test-preview";

interface RepositoryQuestion {
  id: string;
  question: string;
  questionType: "single_choice" | "multiple_choice";
  options: string[] | unknown;
  difficulty: string;
  marks: number;
  expectedTime: number | null;
  subjectName: string;
  subjectCode: string;
  topicName: string;
}

interface BuilderQuestionItem {
  id: string;
  question: RepositoryQuestion;
  marks: number;
}

interface BuilderPool {
  id: string;
  title: string;
  description: string;
  selectionCount: number;
  poolOrder: number;
  questions: BuilderQuestionItem[];
}

interface BuilderSection {
  id: string;
  title: string;
  description: string;
  sectionOrder: number;
  questions: BuilderQuestionItem[];
  pools: BuilderPool[];
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
  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState(false);
  const [negativeMarkRate, setNegativeMarkRate] = useState(0.25);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeOptions, setRandomizeOptions] = useState(false);
  const [attemptLimit, setAttemptLimit] = useState<string>(""); // empty = unlimited
  const [instructions, setInstructions] = useState<string>(""); // empty = no instructions
  const [lifecycleStatus, setLifecycleStatus] = useState<"draft" | "published">("published");
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledStartAt, setScheduledStartAt] = useState<string>("");
  const [scheduledEndAt, setScheduledEndAt] = useState<string>("");
  const [scheduleTimezone, setScheduleTimezone] = useState<string>(
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"
      : "Asia/Kolkata"
  );

  const [sections, setSections] = useState<BuilderSection[]>([
    {
      id: "sec-init-1",
      title: "General",
      description: "",
      sectionOrder: 1,
      questions: [],
      pools: [],
    },
  ]);
  const [activeSectionId, setActiveSectionId] = useState<string>("sec-init-1");
  const [activePoolId, setActivePoolId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set of all selected question IDs across all sections and pools to prevent duplicates
  const allSelectedQuestionIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of sections) {
      for (const q of s.questions) set.add(q.id);
      for (const p of (s.pools || [])) {
        for (const pq of p.questions) set.add(pq.id);
      }
    }
    return set;
  }, [sections]);

  const totalQuestions = useMemo(() => {
    return sections.reduce(
      (sum, s) =>
        sum +
        s.questions.length +
        (s.pools || []).reduce((pSum, p) => pSum + p.selectionCount, 0),
      0
    );
  }, [sections]);

  const totalMarks = useMemo(() => {
    return sections.reduce((sum, s) => {
      const fixedMarks = s.questions.reduce((qSum, q) => qSum + q.marks, 0);
      const poolMarks = (s.pools || []).reduce((pSum, p) => {
        const qMark = p.questions[0]?.marks || 0;
        return pSum + p.selectionCount * qMark;
      }, 0);
      return sum + fixedMarks + poolMarks;
    }, 0);
  }, [sections]);

  const filteredRepo = repositoryQuestions.filter((q) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      q.question.toLowerCase().includes(query) ||
      q.topicName.toLowerCase().includes(query) ||
      q.subjectName.toLowerCase().includes(query);
    const matchesSubject = !selectedSubject || q.subjectName === selectedSubject;
    const matchesDifficulty = !selectedDifficulty || q.difficulty === selectedDifficulty;
    return matchesSearch && matchesSubject && matchesDifficulty;
  });

  // Section Management
  const addSection = () => {
    const newOrder = sections.length + 1;
    const newSecId = `sec-${Date.now()}-${newOrder}`;
    const newSection: BuilderSection = {
      id: newSecId,
      title: `Section ${newOrder}`,
      description: "",
      sectionOrder: newOrder,
      questions: [],
      pools: [],
    };
    setSections((prev) => [...prev, newSection]);
    setActiveSectionId(newSecId);
    setActivePoolId(null);
    setErrorMsg(null);
  };

  const updateSectionTitle = (sectionId: string, newTitle: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, title: newTitle } : s))
    );
  };

  const updateSectionDescription = (sectionId: string, newDescription: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, description: newDescription } : s))
    );
  };

  const moveSectionUp = (idx: number) => {
    if (idx <= 0) return;
    setSections((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx - 1];
      next[idx - 1] = temp;
      return next.map((s, i) => ({ ...s, sectionOrder: i + 1 }));
    });
  };

  const moveSectionDown = (idx: number) => {
    if (idx >= sections.length - 1) return;
    setSections((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx + 1];
      next[idx + 1] = temp;
      return next.map((s, i) => ({ ...s, sectionOrder: i + 1 }));
    });
  };

  const removeSection = (sectionId: string) => {
    if (sections.length <= 1) {
      setErrorMsg("A test must contain at least one section.");
      return;
    }
    const target = sections.find((s) => s.id === sectionId);
    const targetHasQuestions =
      target &&
      (target.questions.length > 0 ||
        (target.pools || []).some((p) => p.questions.length > 0));
    if (targetHasQuestions) {
      setErrorMsg(
        `Cannot delete section "${target?.title}" because it contains assigned questions or pools. Move or remove all questions first.`
      );
      return;
    }
    setErrorMsg(null);
    setSections((prev) => {
      const filtered = prev.filter((s) => s.id !== sectionId);
      return filtered.map((s, idx) => ({ ...s, sectionOrder: idx + 1 }));
    });
    if (activeSectionId === sectionId) {
      const remaining = sections.filter((s) => s.id !== sectionId);
      if (remaining.length > 0) {
        setActiveSectionId(remaining[0].id);
        setActivePoolId(null);
      }
    }
  };

  // Pool Management
  const addPoolToSection = (sectionId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    const currentPools = sec?.pools || [];
    const newOrder = currentPools.length + 1;
    const newPoolId = `pool-${Date.now()}-${newOrder}`;
    const newPool: BuilderPool = {
      id: newPoolId,
      title: `Pool ${newOrder}`,
      description: "",
      selectionCount: 1,
      poolOrder: newOrder,
      questions: [],
    };
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, pools: [...(s.pools || []), newPool] }
          : s
      )
    );
    setActiveSectionId(sectionId);
    setActivePoolId(newPoolId);
    setErrorMsg(null);
  };

  const updatePoolTitle = (sectionId: string, poolId: string, newTitle: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              pools: (s.pools || []).map((p) =>
                p.id === poolId ? { ...p, title: newTitle } : p
              ),
            }
          : s
      )
    );
  };

  const updatePoolDescription = (sectionId: string, poolId: string, newDesc: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              pools: (s.pools || []).map((p) =>
                p.id === poolId ? { ...p, description: newDesc } : p
              ),
            }
          : s
      )
    );
  };

  const updatePoolSelectionCount = (sectionId: string, poolId: string, count: number) => {
    const safeCount = Math.max(1, Math.floor(count) || 1);
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              pools: (s.pools || []).map((p) =>
                p.id === poolId ? { ...p, selectionCount: safeCount } : p
              ),
            }
          : s
      )
    );
  };

  const updatePoolUniformMarks = (sectionId: string, poolId: string, newMarks: number) => {
    const validMarks = isNaN(newMarks) || newMarks < 0 ? 1 : newMarks;
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              pools: (s.pools || []).map((p) =>
                p.id === poolId
                  ? {
                      ...p,
                      questions: p.questions.map((q) => ({ ...q, marks: validMarks })),
                    }
                  : p
              ),
            }
          : s
      )
    );
  };

  const removePoolFromSection = (sectionId: string, poolId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              pools: (s.pools || [])
                .filter((p) => p.id !== poolId)
                .map((p, idx) => ({ ...p, poolOrder: idx + 1 })),
            }
          : s
      )
    );
    if (activePoolId === poolId) {
      setActivePoolId(null);
    }
  };

  const removeQuestionFromPool = (sectionId: string, poolId: string, questionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              pools: (s.pools || []).map((p) =>
                p.id === poolId
                  ? {
                      ...p,
                      questions: p.questions.filter((q) => q.id !== questionId),
                    }
                  : p
              ),
            }
          : s
      )
    );
  };

  // Question Assignment
  const addQuestionToTarget = (q: RepositoryQuestion) => {
    if (allSelectedQuestionIds.has(q.id)) return;
    const secId = activeSectionId || sections[0]?.id;
    if (!secId) return;

    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== secId) return sec;

        if (activePoolId) {
          const targetPool = (sec.pools || []).find((p) => p.id === activePoolId);
          if (targetPool) {
            const uniformMarks =
              targetPool.questions.length > 0 ? targetPool.questions[0].marks : q.marks;
            return {
              ...sec,
              pools: (sec.pools || []).map((p) =>
                p.id === activePoolId
                  ? {
                      ...p,
                      questions: [
                        ...p.questions,
                        { id: q.id, question: q, marks: uniformMarks },
                      ],
                    }
                  : p
              ),
            };
          }
        }

        return {
          ...sec,
          questions: [...sec.questions, { id: q.id, question: q, marks: q.marks }],
        };
      })
    );
    setErrorMsg(null);
  };

  const removeQuestionFromSection = (sectionId: string, questionId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id === sectionId) {
          return {
            ...sec,
            questions: sec.questions.filter((q) => q.id !== questionId),
          };
        }
        return sec;
      })
    );
  };

  const moveQuestionUpInSection = (sectionId: string, qIdx: number) => {
    if (qIdx <= 0) return;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const nextQ = [...sec.questions];
        const temp = nextQ[qIdx];
        nextQ[qIdx] = nextQ[qIdx - 1];
        nextQ[qIdx - 1] = temp;
        return { ...sec, questions: nextQ };
      })
    );
  };

  const moveQuestionDownInSection = (sectionId: string, qIdx: number) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        if (qIdx >= sec.questions.length - 1) return sec;
        const nextQ = [...sec.questions];
        const temp = nextQ[qIdx];
        nextQ[qIdx] = nextQ[qIdx + 1];
        nextQ[qIdx + 1] = temp;
        return { ...sec, questions: nextQ };
      })
    );
  };

  const moveQuestionToSection = (
    fromSectionId: string,
    toSectionId: string,
    questionId: string
  ) => {
    if (fromSectionId === toSectionId) return;
    setSections((prev) => {
      const fromSection = prev.find((s) => s.id === fromSectionId);
      const questionItem = fromSection?.questions.find((q) => q.id === questionId);
      if (!questionItem) return prev;

      return prev.map((sec) => {
        if (sec.id === fromSectionId) {
          return {
            ...sec,
            questions: sec.questions.filter((q) => q.id !== questionId),
          };
        }
        if (sec.id === toSectionId) {
          return {
            ...sec,
            questions: [...sec.questions, questionItem],
          };
        }
        return sec;
      });
    });
  };

  const updateQuestionMarks = (
    sectionId: string,
    questionId: string,
    newMarks: number
  ) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          questions: sec.questions.map((q) =>
            q.id === questionId ? { ...q, marks: newMarks } : q
          ),
        };
      })
    );
  };

  const handlePreview = () => {
    const flatQuestions: PreviewQuestion[] = sections.flatMap((sec, secIdx) => {
      const fixed: PreviewQuestion[] = sec.questions.map(({ question, marks }) => ({
        ...question,
        marks,
        options: Array.isArray(question.options) ? question.options.map(String) : [],
        sectionId: sec.id,
        sectionTitle: sec.title.trim() || `Section ${secIdx + 1}`,
        sectionOrder: secIdx + 1,
      }));

      const pooled: PreviewQuestion[] = (sec.pools || []).flatMap((pool) => {
        const shuffled = [...pool.questions].sort(() => Math.random() - 0.5);
        const sampled = shuffled.slice(0, pool.selectionCount);
        return sampled.map(({ question, marks }) => ({
          ...question,
          marks,
          options: Array.isArray(question.options) ? question.options.map(String) : [],
          sectionId: sec.id,
          sectionTitle: sec.title.trim() || `Section ${secIdx + 1}`,
          sectionOrder: secIdx + 1,
        }));
      });

      return [...fixed, ...pooled];
    });

    const previewDraft: PreviewDraft = {
      title: title.trim(),
      description,
      duration: Number(duration),
      testType,
      negativeMarkingEnabled,
      negativeMarkRate: negativeMarkingEnabled ? negativeMarkRate : 0,
      randomizeQuestions,
      randomizeOptions,
      instructions: instructions.trim() === "" ? null : instructions.trim(),
      sections: sections.map((s, idx) => ({
        id: s.id,
        title: s.title.trim() || `Section ${idx + 1}`,
        description: s.description || undefined,
        sectionOrder: idx + 1,
      })),
      questions: flatQuestions,
    };
    sessionStorage.setItem("nexora-admin-test-preview", JSON.stringify(previewDraft));
    router.push("/admin/tests/preview");
  };

  const handleCreateTest = async () => {
    setErrorMsg(null);
    if (!title.trim()) {
      setErrorMsg("Please enter a valid test title.");
      return;
    }
    if (sections.length === 0) {
      setErrorMsg("Please create at least one section.");
      return;
    }
    for (let i = 0; i < sections.length; i++) {
      if (!sections[i].title.trim()) {
        setErrorMsg(`Section ${i + 1} must have a valid title.`);
        return;
      }
    }

    // Validate pools across sections
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const s = sections[sIdx];
      for (let pIdx = 0; pIdx < (s.pools || []).length; pIdx++) {
        const p = s.pools[pIdx];
        if (!p.title.trim()) {
          setErrorMsg(`Pool ${pIdx + 1} in section "${s.title}" must have a valid title.`);
          return;
        }
        if (p.selectionCount < 1) {
          setErrorMsg(`Pool "${p.title}" must select at least 1 question.`);
          return;
        }
        if (p.questions.length < p.selectionCount) {
          setErrorMsg(
            `Pool "${p.title}" in section "${s.title}" requires ${p.selectionCount} question(s) to be selected, but only contains ${p.questions.length} question(s). Please assign more questions to the pool.`
          );
          return;
        }
        const distinctMarks = new Set(p.questions.map((q) => q.marks));
        if (distinctMarks.size > 1) {
          setErrorMsg(
            `All questions in pool "${p.title}" must have identical marks for deterministic scoring. Found conflicting marks: ${Array.from(distinctMarks).join(", ")}.`
          );
          return;
        }
      }
    }

    if (totalQuestions === 0) {
      setErrorMsg("Please add at least one question (fixed or via a pool) to the test.");
      return;
    }

    // Attempt limit: empty = unlimited; otherwise a whole number between 1 and 100.
    let parsedAttemptLimit: number | null = null;
    if (attemptLimit.trim() !== "") {
      const parsed = Number(attemptLimit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        setErrorMsg("Attempt limit must be a whole number between 1 and 100, or left empty for unlimited.");
        return;
      }
      parsedAttemptLimit = parsed;
    }

    // Test instructions: optional plain text, max 5000 chars; empty/whitespace = none.
    let parsedInstructions: string | null = null;
    if (instructions.trim() !== "") {
      if (instructions.trim().length > 5000) {
        setErrorMsg("Test instructions cannot exceed 5000 characters.");
        return;
      }
      parsedInstructions = instructions.trim();
    }

    setLoading(true);
    if (isScheduled && scheduledStartAt && scheduledEndAt) {
      if (new Date(scheduledEndAt).getTime() <= new Date(scheduledStartAt).getTime()) {
        setErrorMsg("Scheduled end time must be strictly after scheduled start time.");
        setLoading(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

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
          negativeMarkingEnabled,
          negativeMarkRate: negativeMarkingEnabled ? negativeMarkRate : 0,
          randomizeQuestions,
          randomizeOptions,
          attemptLimit: parsedAttemptLimit,
          instructions: parsedInstructions,
          status: lifecycleStatus,
          scheduledStartAt: isScheduled && scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null,
          scheduledEndAt: isScheduled && scheduledEndAt ? new Date(scheduledEndAt).toISOString() : null,
          scheduleTimezone: isScheduled ? scheduleTimezone : null,
          isPublished: lifecycleStatus === "published",
          sections: sections.map((s, sIdx) => ({
            title: s.title.trim(),
            description: s.description?.trim() || undefined,
            sectionOrder: sIdx + 1,
            questions: s.questions.map((q, qIdx) => ({
              questionId: q.id,
              questionOrder: qIdx + 1,
            })),
            pools: (s.pools || []).map((p, pIdx) => ({
              title: p.title.trim(),
              description: p.description?.trim() || undefined,
              selectionCount: p.selectionCount,
              poolOrder: pIdx + 1,
              questions: p.questions.map((pq, pqIdx) => ({
                questionId: pq.id,
                questionOrder: pqIdx + 1,
              })),
            })),
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

  const activeSection = sections.find((s) => s.id === activeSectionId) || sections[0];

  return (
    <div className="space-y-6">
      {/* Top Configuration Card */}
      <div className="space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div>
          <p className="text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Configure</p>
          <h3 className="mt-1 text-title-md font-semibold text-text-primary">
            Assessment Parameters
          </h3>
          <p className="mt-1 text-body-sm text-text-muted">Configure the information students will see before starting the test.</p>
        </div>

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
              className="w-full rounded-lg border border-border bg-base px-4 py-2.5 text-body-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
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
              className="w-full rounded-lg border border-border bg-base px-4 py-2.5 text-body-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
              Test Category
            </label>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value as any)}
              className="w-full rounded-lg border border-border bg-base px-4 py-2.5 text-body-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
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
              className="w-full rounded-lg border border-border bg-base p-4 text-body-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Test Instructions (Phase 7E) */}
          <div className="md:col-span-12">
            <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
              Test Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="e.g. This test has 4 sections. No negative marking. You may not use external resources..."
              className="w-full rounded-lg border border-border bg-base p-4 text-body-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-body-xs text-text-muted">
              Shown to students before they start. Duration, marks, sections, attempt limit, and negative marking are already displayed automatically.
            </p>
          </div>

          {/* Negative Marking Configuration */}
          <div className="md:col-span-12 rounded-xl border border-border/70 bg-surface-raised p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                    Negative Marking
                  </span>
                  {negativeMarkingEnabled ? (
                    <span className="rounded bg-error/15 px-2 py-0.5 text-[11px] font-mono font-bold uppercase text-error">
                      Active: -{(negativeMarkRate * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="rounded bg-surface-border px-2 py-0.5 text-[11px] font-mono uppercase text-text-muted">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-xs text-text-muted">
                  Deduct proportional marks for incorrect answers. Unanswered questions always receive 0 marks.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setNegativeMarkingEnabled(!negativeMarkingEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  negativeMarkingEnabled ? "bg-primary" : "bg-surface-border"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    negativeMarkingEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {negativeMarkingEnabled && (
              <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-label-xs font-mono text-text-muted uppercase mr-1">Presets:</span>
                  {[
                    { label: "1/4 Penalty (25%)", rate: 0.25 },
                    { label: "1/3 Penalty (~33%)", rate: 0.33 },
                    { label: "1/2 Penalty (50%)", rate: 0.50 },
                  ].map((preset) => (
                    <button
                      key={preset.rate}
                      type="button"
                      onClick={() => setNegativeMarkRate(preset.rate)}
                      className={`px-2.5 py-1 text-label-xs font-mono rounded border transition-colors ${
                        Math.abs(negativeMarkRate - preset.rate) < 0.005
                          ? "border-primary bg-primary/10 text-primary-text font-bold"
                          : "border-border bg-base text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-label-xs text-text-muted uppercase font-mono">
                      Penalty Rate (%):
                    </label>
                    <div className="relative w-24">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round(negativeMarkRate * 100)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const clamped = Math.max(0, Math.min(100, isNaN(val) ? 0 : val));
                          setNegativeMarkRate(clamped / 100);
                        }}
                        className="w-full rounded-lg border border-border bg-base px-3 py-1.5 text-body-sm font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 text-right pr-6"
                      />
                      <span className="absolute right-2 top-1.5 text-body-sm font-mono text-text-muted">%</span>
                    </div>
                  </div>

                  <p className="text-body-xs font-mono text-text-muted">
                    → Incorrect answers deduct <span className="text-error font-semibold">{(negativeMarkRate * 100).toFixed(0)}%</span> of the question&apos;s marks (e.g. -{(2 * negativeMarkRate).toFixed(2)} on a 2-mark question).
                  </p>
                </div>
              </div>
            )}

            {/* Randomize Questions Toggle */}
            <div className="mt-4 pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                    Randomize Questions
                  </span>
                  {randomizeQuestions ? (
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-mono font-bold uppercase text-primary-text">
                      ON
                    </span>
                  ) : (
                    <span className="rounded bg-surface-border px-2 py-0.5 text-[11px] font-mono uppercase text-text-muted">
                      OFF
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-xs text-text-muted">
                  Questions are shuffled independently for each attempt.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setRandomizeQuestions(!randomizeQuestions)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  randomizeQuestions ? "bg-primary" : "bg-surface-border"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    randomizeQuestions ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Randomize Options Toggle */}
            <div className="mt-4 pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                    Randomize Options
                  </span>
                  {randomizeOptions ? (
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-mono font-bold uppercase text-primary-text">
                      ON
                    </span>
                  ) : (
                    <span className="rounded bg-surface-border px-2 py-0.5 text-[11px] font-mono uppercase text-text-muted">
                      OFF
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-xs text-text-muted">
                  Answer choices are shuffled independently for each attempt.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setRandomizeOptions(!randomizeOptions)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  randomizeOptions ? "bg-primary" : "bg-surface-border"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    randomizeOptions ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Attempt Limit */}
            <div className="mt-4 pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                    Attempt Limit
                  </span>
                  {attemptLimit.trim() === "" ? (
                    <span className="rounded bg-surface-border px-2 py-0.5 text-[11px] font-mono uppercase text-text-muted">
                      Unlimited
                    </span>
                  ) : (
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-mono font-bold uppercase text-primary-text">
                      {attemptLimit}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-xs text-text-muted">
                  Maximum number of attempts a student can submit for this test. Leave empty for unlimited.
                </p>
              </div>

              <input
                type="number"
                min={1}
                max={100}
                placeholder="Unlimited"
                value={attemptLimit}
                onChange={(e) => setAttemptLimit(e.target.value)}
                className="w-28 rounded-lg border border-border bg-base px-3 py-1.5 text-body-sm font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 text-right"
              />
            </div>

            {/* Phase 8: Lifecycle & Availability Scheduling */}
            <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                    Publication Status
                  </span>
                  <p className="mt-1 text-body-xs text-text-muted">
                    Draft tests are private and only visible to administrators.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLifecycleStatus("published")}
                    className={`px-3 py-1.5 rounded-lg text-label-xs font-mono font-semibold transition-colors ${
                      lifecycleStatus === "published"
                        ? "bg-primary text-text-inverse shadow-sm"
                        : "bg-surface-border text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Published
                  </button>
                  <button
                    type="button"
                    onClick={() => setLifecycleStatus("draft")}
                    className={`px-3 py-1.5 rounded-lg text-label-xs font-mono font-semibold transition-colors ${
                      lifecycleStatus === "draft"
                        ? "bg-surface-high text-text-primary border border-border"
                        : "bg-surface-border text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Draft
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/30">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                      Availability Window
                    </span>
                    <span className={`rounded px-2 py-0.5 text-[11px] font-mono font-bold uppercase ${
                      isScheduled ? "bg-primary/15 text-primary-text" : "bg-surface-border text-text-muted"
                    }`}>
                      {isScheduled ? "Scheduled" : "Always Available"}
                    </span>
                  </div>
                  <p className="mt-1 text-body-xs text-text-muted">
                    Restrict when students can start attempts, or leave open indefinitely.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsScheduled(false)}
                    className={`px-3 py-1.5 rounded-lg text-label-xs font-mono font-semibold transition-colors ${
                      !isScheduled
                        ? "bg-primary text-text-inverse shadow-sm"
                        : "bg-surface-border text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Always Available
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScheduled(true)}
                    className={`px-3 py-1.5 rounded-lg text-label-xs font-mono font-semibold transition-colors ${
                      isScheduled
                        ? "bg-primary text-text-inverse shadow-sm"
                        : "bg-surface-border text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Scheduled
                  </button>
                </div>
              </div>

              {isScheduled && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5 mt-2">
                  <div>
                    <label className="block text-label-xs font-mono uppercase text-text-muted mb-1">
                      Start Time (Local)
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledStartAt}
                      onChange={(e) => setScheduledStartAt(e.target.value)}
                      className="w-full rounded-lg border border-border bg-base px-3 py-1.5 text-body-sm font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-label-xs font-mono uppercase text-text-muted mb-1">
                      End Time (Local)
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledEndAt}
                      onChange={(e) => setScheduledEndAt(e.target.value)}
                      className="w-full rounded-lg border border-border bg-base px-3 py-1.5 text-body-sm font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-label-xs font-mono uppercase text-text-muted mb-1">
                      Timezone (IANA)
                    </label>
                    <input
                      type="text"
                      value={scheduleTimezone}
                      onChange={(e) => setScheduleTimezone(e.target.value)}
                      placeholder="e.g. Asia/Kolkata"
                      className="w-full rounded-lg border border-border bg-base px-3 py-1.5 text-body-sm font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Split Builder: Repository (Left) vs Sections Composition (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Left: Repository */}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6 lg:col-span-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Select questions</p>
              <h3 className="mt-1 text-title-md font-semibold text-text-primary">Repository</h3>
            </div>
            <span className="text-right text-label-xs font-mono uppercase text-text-muted">{filteredRepo.length} available</span>
          </div>

          {/* Active section / pool target destination selector banner */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-label-xs font-mono">
            <span className="text-text-muted uppercase shrink-0">Target:</span>
            <select
              value={
                activePoolId
                  ? `${activeSectionId}:pool:${activePoolId}`
                  : `${activeSectionId}:fixed`
              }
              onChange={(e) => {
                const val = e.target.value;
                const parts = val.split(":");
                if (parts[1] === "pool") {
                  setActiveSectionId(parts[0]);
                  setActivePoolId(parts[2]);
                } else {
                  setActiveSectionId(parts[0]);
                  setActivePoolId(null);
                }
              }}
              aria-label="Active target destination"
              className="rounded border border-primary/30 bg-surface px-2.5 py-1 text-primary-text font-bold outline-none focus:ring-2 focus:ring-primary/40 truncate flex-1 min-w-0"
            >
              {sections.map((s, idx) => (
                <optgroup
                  key={s.id}
                  label={`Sec ${idx + 1}: ${s.title || "Untitled"}`}
                >
                  <option value={`${s.id}:fixed`}>
                    Fixed Questions ({s.questions.length} assigned)
                  </option>
                  {(s.pools || []).map((p, pIdx) => (
                    <option key={p.id} value={`${s.id}:pool:${p.id}`}>
                      Pool {pIdx + 1}: {p.title || "Untitled"} (Pick {p.selectionCount} of {p.questions.length})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="relative">
            <label htmlFor="builder-question-search" className="sr-only">Search repository questions</label>
            <input
              id="builder-question-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by keyword, topic, or subject..."
              className="h-11 w-full rounded-lg border border-border bg-base px-10 text-body-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-3 text-[18px] text-text-muted">
              search
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              aria-label="Filter repository by subject"
              className="h-9 min-w-max rounded-lg border border-border bg-base px-3 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All subjects</option>
              {[...new Set(repositoryQuestions.map((q) => q.subjectName))].map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              aria-label="Filter repository by difficulty"
              className="h-9 min-w-max rounded-lg border border-border bg-base px-3 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
            {filteredRepo.map((q) => {
              const isSelected = allSelectedQuestionIds.has(q.id);
              const activePool = (activeSection?.pools || []).find((p) => p.id === activePoolId);
              const btnLabel = isSelected
                ? "Assigned"
                : activePool
                ? `+ Add to Pool "${activePool.title || 'Pool'}"`
                : `+ Add to ${activeSection?.title || "Section"}`;
              return (
                <div
                  key={q.id}
                  className={`space-y-2 rounded-lg border bg-base p-4 transition-colors ${
                    isSelected
                      ? "border-secondary/30 bg-secondary/5"
                      : "border-border hover:border-border-variant"
                  }`}
                >
                  <div className="flex items-center justify-between text-label-xs font-mono">
                    <span className="text-text-muted">
                      ID: {q.id.slice(0, 6).toUpperCase()} • {q.subjectCode}
                    </span>
                    <span className="uppercase text-primary-text">{q.difficulty}</span>
                  </div>
                  <p className="text-body-sm text-text-primary line-clamp-2">
                    {q.question}
                  </p>
                  <div className="flex items-center justify-between pt-2">
                    <span className="min-w-0 truncate text-label-xs font-mono text-text-muted">
                      {q.topicName} · {q.marks} marks · {q.expectedTime || "-"}s
                    </span>
                    <button
                      type="button"
                      onClick={() => addQuestionToTarget(q)}
                      disabled={isSelected}
                      className="shrink-0 rounded-md border border-primary/30 px-2.5 py-1 text-label-xs font-mono font-semibold text-primary-text transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:cursor-default disabled:border-secondary/30 disabled:text-secondary truncate max-w-[220px]"
                    >
                      {btnLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {filteredRepo.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-body-sm font-mono text-text-muted">
              No repository questions match the current search and filters.
            </div>
          )}
        </div>

        {/* Right: Test Composition with Sections */}
        <div className="flex flex-col justify-between space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6 lg:col-span-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
              <div>
                <p className="text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Review composition</p>
                <h3 className="mt-1 text-title-md font-semibold text-text-primary">
                  Sections & Questions
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-right font-mono text-label-xs">
                <span>
                  SECTIONS: <strong className="text-text-primary">{sections.length}</strong>
                </span>
                <span>
                  QUESTIONS: <strong className="text-text-primary">{totalQuestions}</strong>
                </span>
                <span>
                  TOTAL MARKS: <strong className="text-primary-text">{totalMarks}</strong>
                </span>
              </div>
            </div>

            {/* Scrollable Sections Container */}
            <div className="max-h-[500px] space-y-4 overflow-y-auto pr-1">
              {sections.map((sec, secIdx) => {
                const isActive = sec.id === activeSectionId;
                return (
                  <div
                    key={sec.id}
                    className={`rounded-xl border bg-base p-4 space-y-3 transition-colors ${
                      isActive
                        ? "border-primary/50 shadow-sm"
                        : "border-border"
                    }`}
                  >
                    {/* Section Header Controls */}
                    <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSectionId(sec.id);
                            setActivePoolId(null);
                          }}
                          className={`shrink-0 rounded px-2 py-0.5 text-label-xs font-mono font-bold uppercase transition-colors ${
                            isActive
                              ? "bg-primary text-text-inverse"
                              : "bg-surface-high text-primary-text hover:bg-surface-high/80"
                          }`}
                          title="Click to make this the active section for adding questions"
                        >
                          SEC {String(secIdx + 1).padStart(2, "0")}
                        </button>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => updateSectionTitle(sec.id, e.target.value)}
                          placeholder="Section Title (e.g. Aptitude, DSA)"
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-body-sm font-semibold text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 flex-1 min-w-[120px]"
                        />
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-label-xs font-mono text-text-muted px-1">
                          {sec.questions.length} Fixed · {(sec.pools || []).reduce((sum, p) => sum + p.selectionCount, 0)} Pooled
                        </span>
                        {/* Move Section Up */}
                        <button
                          type="button"
                          onClick={() => moveSectionUp(secIdx)}
                          disabled={secIdx === 0}
                          aria-label={`Move Section ${secIdx + 1} up`}
                          className="rounded p-1 text-text-muted transition-colors hover:bg-surface-high hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-20"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                        </button>
                        {/* Move Section Down */}
                        <button
                          type="button"
                          onClick={() => moveSectionDown(secIdx)}
                          disabled={secIdx === sections.length - 1}
                          aria-label={`Move Section ${secIdx + 1} down`}
                          className="rounded p-1 text-text-muted transition-colors hover:bg-surface-high hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-20"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                        </button>
                        {/* Delete Section */}
                        <button
                          type="button"
                          onClick={() => removeSection(sec.id)}
                          disabled={sections.length <= 1}
                          aria-label={`Delete Section ${secIdx + 1}`}
                          title={
                            sections.length <= 1
                              ? "At least one section must exist"
                              : sec.questions.length > 0 || (sec.pools || []).some(p => p.questions.length > 0)
                              ? "Move or remove questions first"
                              : "Remove empty section"
                          }
                          className="rounded p-1 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-error/60 disabled:opacity-20"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Section Description */}
                    <input
                      type="text"
                      value={sec.description}
                      onChange={(e) => updateSectionDescription(sec.id, e.target.value)}
                      placeholder="Optional section description or instructions..."
                      className="w-full rounded-md border border-border/60 bg-surface/50 px-3 py-1 text-label-xs text-text-secondary outline-none placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary/30"
                    />

                    {/* Fixed Questions Sub-section */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-text-muted">
                          Fixed Questions ({sec.questions.length})
                        </span>
                        {!activePoolId && activeSectionId === sec.id && (
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-primary-text">
                            Active Target
                          </span>
                        )}
                      </div>

                      {sec.questions.length > 0 ? (
                        sec.questions.map((sq, qIdx) => (
                          <div
                            key={sq.id}
                            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                              <span className="font-mono text-label-xs text-text-muted shrink-0">
                                {String(qIdx + 1).padStart(2, "0")}
                              </span>
                              <div className="truncate min-w-0">
                                <p className="text-body-sm text-text-primary font-medium truncate">
                                  {sq.question.question}
                                </p>
                                <span className="text-label-xs text-text-muted font-mono">
                                  {sq.question.subjectCode} • {sq.question.topicName}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 shrink-0">
                              {/* Move to another section if multiple sections exist */}
                              {sections.length > 1 && (
                                <select
                                  value={sec.id}
                                  onChange={(e) =>
                                    moveQuestionToSection(sec.id, e.target.value, sq.id)
                                  }
                                  aria-label="Move question to section"
                                  className="h-7 rounded border border-border bg-base px-2 text-label-xs font-mono text-text-secondary outline-none focus:border-primary"
                                >
                                  {sections.map((targetSec, tIdx) => (
                                    <option key={targetSec.id} value={targetSec.id}>
                                      → {targetSec.title || `Sec ${tIdx + 1}`}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {/* Move Up / Down Buttons */}
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveQuestionUpInSection(sec.id, qIdx)}
                                  disabled={qIdx === 0}
                                  aria-label={`Move question ${qIdx + 1} up`}
                                  className="rounded p-1 text-text-muted transition-colors hover:bg-surface-high hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-20"
                                >
                                  <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveQuestionDownInSection(sec.id, qIdx)}
                                  disabled={qIdx === sec.questions.length - 1}
                                  aria-label={`Move question ${qIdx + 1} down`}
                                  className="rounded p-1 text-text-muted transition-colors hover:bg-surface-high hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-20"
                                >
                                  <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                                </button>
                              </div>

                              {/* Marks */}
                              <div className="flex items-center gap-1 font-mono text-label-xs">
                                <input
                                  type="number"
                                  value={sq.marks}
                                  onChange={(e) =>
                                    updateQuestionMarks(
                                      sec.id,
                                      sq.id,
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-12 rounded border border-border bg-surface-high px-1.5 py-0.5 text-center text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                                />
                                <span className="text-text-muted">pts</span>
                              </div>

                              {/* Remove button */}
                              <button
                                type="button"
                                onClick={() => removeQuestionFromSection(sec.id, sq.id)}
                                aria-label={`Remove question ${qIdx + 1} from section`}
                                className="rounded p-1 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-error/60"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  close
                                </span>
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded border border-dashed border-border/70 px-3 py-3 text-center text-label-xs font-mono text-text-muted">
                          No fixed questions in this section.
                        </div>
                      )}
                    </div>

                    {/* Question Pools Sub-section */}
                    <div className="space-y-3 pt-3 border-t border-border/60">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">
                            Question Pools ({(sec.pools || []).length})
                          </span>
                          <p className="text-[11px] font-mono text-text-muted">
                            Randomly samples N questions per attempt from each pool.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addPoolToSection(sec.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-label-xs font-mono font-semibold text-primary-text hover:bg-primary/20 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          + Add Pool
                        </button>
                      </div>

                      {(sec.pools || []).length > 0 ? (
                        <div className="space-y-3">
                          {sec.pools.map((pool, pIdx) => {
                            const isPoolTarget =
                              activeSectionId === sec.id && activePoolId === pool.id;
                            const isUnderCapacity =
                              pool.questions.length < pool.selectionCount;
                            const poolMarks = pool.questions[0]?.marks ?? 1;

                            return (
                              <div
                                key={pool.id}
                                className={`rounded-lg border p-3.5 space-y-3 transition-colors ${
                                  isPoolTarget
                                    ? "border-primary/60 bg-primary/[0.03]"
                                    : "border-border bg-surface/80"
                                }`}
                              >
                                {/* Pool Header & Parameters */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                    <span className="rounded bg-surface-high px-2 py-0.5 text-[11px] font-mono font-bold uppercase text-primary-text">
                                      POOL {pIdx + 1}
                                    </span>
                                    <input
                                      type="text"
                                      value={pool.title}
                                      onChange={(e) =>
                                        updatePoolTitle(sec.id, pool.id, e.target.value)
                                      }
                                      placeholder="Pool Name (e.g. Data Structures Bank)"
                                      className="rounded border border-border bg-base px-2.5 py-1 text-body-sm font-semibold text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 flex-1 min-w-[120px]"
                                    />
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {/* Set as Target Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveSectionId(sec.id);
                                        setActivePoolId(pool.id);
                                      }}
                                      className={`rounded px-2.5 py-1 text-[11px] font-mono font-semibold transition-colors ${
                                        isPoolTarget
                                          ? "bg-primary text-text-inverse"
                                          : "border border-primary/30 text-primary-text hover:bg-primary/10"
                                      }`}
                                    >
                                      {isPoolTarget ? "🎯 Target" : "Set Target"}
                                    </button>

                                    {/* Delete Pool */}
                                    <button
                                      type="button"
                                      onClick={() => removePoolFromSection(sec.id, pool.id)}
                                      aria-label={`Delete pool ${pIdx + 1}`}
                                      className="rounded p-1 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-error/60"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Pool Sampling & Uniform Marks Config */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-label-xs font-mono">
                                  <div className="flex items-center gap-2">
                                    <span className="text-text-muted shrink-0">Sample:</span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, pool.questions.length)}
                                        value={pool.selectionCount}
                                        onChange={(e) =>
                                          updatePoolSelectionCount(
                                            sec.id,
                                            pool.id,
                                            Number(e.target.value)
                                          )
                                        }
                                        className="w-14 rounded border border-border bg-base px-2 py-0.5 text-center font-bold text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                                      />
                                      <span className="text-text-muted">
                                        of {pool.questions.length} Qs
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 sm:justify-end">
                                    <span className="text-text-muted shrink-0">Uniform Marks:</span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        value={poolMarks}
                                        onChange={(e) =>
                                          updatePoolUniformMarks(
                                            sec.id,
                                            pool.id,
                                            Number(e.target.value)
                                          )
                                        }
                                        className="w-14 rounded border border-border bg-base px-2 py-0.5 text-center font-bold text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                                      />
                                      <span className="text-text-muted">pts / Q</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Status / Validation Pill */}
                                <div>
                                  {isUnderCapacity ? (
                                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono text-amber-500">
                                      ⚠️ Under-capacity: requires {pool.selectionCount} question(s) but only {pool.questions.length} assigned
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono text-emerald-500">
                                      ✓ Ready: {pool.selectionCount} will be sampled randomly per attempt ({pool.selectionCount * poolMarks} pts)
                                    </span>
                                  )}
                                </div>

                                {/* Pool Questions List */}
                                <div className="space-y-1.5 pt-1">
                                  {pool.questions.length > 0 ? (
                                    pool.questions.map((pq, pqIdx) => (
                                      <div
                                        key={pq.id}
                                        className="flex items-center justify-between gap-2 rounded border border-border/50 bg-base px-2.5 py-1.5 text-label-xs"
                                      >
                                        <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                          <span className="font-mono text-text-muted shrink-0">
                                            P.{pqIdx + 1}
                                          </span>
                                          <p className="truncate text-text-primary">
                                            {pq.question.question}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="font-mono text-text-muted text-[11px]">
                                            {pq.marks} pts
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeQuestionFromPool(sec.id, pool.id, pq.id)
                                            }
                                            aria-label="Remove question from pool"
                                            className="rounded p-0.5 text-text-muted hover:text-error"
                                          >
                                            <span className="material-symbols-outlined text-[16px]">
                                              close
                                            </span>
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded border border-dashed border-border/60 px-3 py-2.5 text-center text-[11px] font-mono text-text-muted">
                                      No questions in this pool. Set as target and click &apos;+ Add&apos; in repository.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded border border-dashed border-border/60 px-3 py-2.5 text-center text-[11px] font-mono text-text-muted">
                          No pools configured for this section. All questions above are fixed.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add Section Button */}
              <button
                type="button"
                onClick={addSection}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-base/50 py-3 text-body-sm font-semibold font-mono text-text-muted hover:border-primary hover:text-primary-text transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                + Add Section
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border flex flex-col gap-3">
            {errorMsg && (
              <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-label-xs font-mono">
                {errorMsg}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handlePreview}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-5 text-body-sm font-semibold text-primary-text transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/60"
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
                Preview Test
              </button>
              <button
                type="button"
                onClick={handleCreateTest}
                disabled={loading || totalQuestions === 0}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
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
