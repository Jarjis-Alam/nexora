"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function QuestionForm({
  subjects,
  topics,
}: {
  subjects: { id: string; name: string; code: string }[];
  topics: { id: string; name: string; subjectId: string }[];
}) {
  const router = useRouter();
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    subjects[0]?.id || ""
  );
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [question, setQuestion] = useState("");
  const [questionType, setQuestionType] = useState<"single_choice" | "multiple_choice">("single_choice");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [marks, setMarks] = useState(2);
  const [expectedTime, setExpectedTime] = useState(60);
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);

  const availableTopics = topics.filter((t) => t.subjectId === selectedSubjectId);

  const handleOptionChange = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctAnswer) {
      alert("Please specify the correct answer.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          questionType,
          options: options.filter((o) => o.trim().length > 0),
          correctAnswer,
          subjectId: selectedSubjectId,
          topicId: selectedTopicId || availableTopics[0]?.id,
          difficulty,
          marks: Number(marks),
          expectedTime: Number(expectedTime),
          explanation,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create question");
      }

      router.push("/admin/questions");
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to save question.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-7 rounded-xl border border-border bg-surface p-5 sm:p-8"
    >
      <div>
        <p className="mb-3 text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Question Content</p>
        <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
          Question Content *
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          rows={4}
          placeholder="State the technical question prompt clearly..."
          className="w-full bg-base border border-border rounded p-4 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <p className="mb-1 text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Classification</p>
          <p className="text-label-xs font-mono text-text-muted">Assign the curriculum subject and topic before configuring answers.</p>
        </div>
        <div>
          <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Subject *
          </label>
          <select
            value={selectedSubjectId}
            onChange={(e) => {
              setSelectedSubjectId(e.target.value);
              setSelectedTopicId("");
            }}
            className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Topic *
          </label>
          <select
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
          >
            {availableTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-3">
          <p className="mb-1 text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Assessment Metadata</p>
        </div>
        <div>
          <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Difficulty
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as any)}
            className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div>
          <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Marks
          </label>
          <input
            type="number"
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
            className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Expected Time (Sec)
          </label>
          <input
            type="number"
            value={expectedTime}
            onChange={(e) => setExpectedTime(Number(e.target.value))}
            className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3 pt-4 border-t border-border">
        <p className="text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Answer Configuration</p>
        <label className="text-label-xs text-text-muted uppercase font-mono block">
          Options (Enter at least 2)
        </label>
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <span className="font-mono text-label-xs text-text-muted w-6">
              {String.fromCharCode(65 + idx)}.
            </span>
            <input
              type="text"
              value={opt}
              onChange={(e) => handleOptionChange(idx, e.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + idx)}`}
              className="flex-1 bg-base border border-border rounded px-4 py-2 text-body-sm text-text-primary focus:border-primary focus:outline-none"
            />
          </div>
        ))}
      </div>

      {/* Correct Answer */}
      <div>
        <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
          Correct Answer Key (Exact Option String) *
        </label>
        <input
          type="text"
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
          required
          placeholder="Paste exact matching string of the correct option..."
          className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary focus:border-primary focus:outline-none"
        />
      </div>

      {/* Explanation */}
      <div>
        <p className="mb-3 text-label-xs font-mono font-bold uppercase tracking-wider text-primary-text">Explanation</p>
        <label className="text-label-xs text-text-muted uppercase font-mono block mb-2">
          Explanation & Derivation (Revealed Post-Submission)
        </label>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={3}
          placeholder="Explain why this answer is correct and provide technical steps..."
          className="w-full bg-base border border-border rounded p-4 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
        />
      </div>

      <div className="pt-4 border-t border-border flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-text-inverse font-semibold text-body-sm px-8 py-3 rounded hover:bg-primary-text transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Authoring..." : "Create Question"}
        </button>
      </div>
    </form>
  );
}
