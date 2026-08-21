"use client";

import { useState } from "react";

interface QuestionReviewItem {
  questionId: string;
  question: string;
  questionType: "single_choice" | "multiple_choice";
  options: any;
  correctAnswer: any;
  explanation: string | null;
  marks: number;
  difficulty: string;
  subjectName: string;
  subjectCode: string;
  topicName: string;
  order: number;
  selectedAnswer: any;
  isCorrect: boolean | null;
  timeSpent: number | null;
}

export function DetailedReviewTable({
  questions,
}: {
  questions: QuestionReviewItem[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-surface-high border-b border-border text-label-xs font-mono text-text-muted uppercase">
        <div className="col-span-1">Q#</div>
        <div className="col-span-6 sm:col-span-7">Subject / Topic</div>
        <div className="col-span-3 sm:col-span-2">Status</div>
        <div className="col-span-2 text-right">Action</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {questions.map((q, idx) => {
          const isAnswered =
            q.selectedAnswer !== null && q.selectedAnswer !== undefined;
          const isCorrect = q.isCorrect === true;
          const isExpanded = expandedId === q.questionId;

          let statusBadge = (
            <span className="text-label-xs px-2 py-0.5 rounded bg-surface-highest text-text-muted font-mono inline-block">
              Unanswered
            </span>
          );

          if (isAnswered) {
            if (isCorrect) {
              statusBadge = (
                <span className="text-label-xs px-2 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 font-mono inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Correct
                </span>
              );
            } else {
              statusBadge = (
                <span className="text-label-xs px-2 py-0.5 rounded bg-error/10 text-error border border-error/20 font-mono inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                  Incorrect
                </span>
              );
            }
          }

          return (
            <div key={q.questionId} className="bg-surface hover:bg-surface-high/30 transition-colors">
              <div
                onClick={() => toggleExpand(q.questionId)}
                className="grid grid-cols-12 gap-4 px-5 py-3.5 items-center cursor-pointer text-body-sm"
              >
                <div className="col-span-1 font-mono text-label-xs text-text-muted">
                  {String(idx + 1).padStart(2, "0")}
                </div>

                <div className="col-span-6 sm:col-span-7 truncate">
                  <span className="text-text-primary font-medium mr-2">
                    {q.subjectName}
                  </span>
                  <span className="text-label-xs text-text-muted font-mono hidden sm:inline">
                    • {q.topicName}
                  </span>
                </div>

                <div className="col-span-3 sm:col-span-2">{statusBadge}</div>

                <div className="col-span-2 text-right">
                  <button className="text-label-xs font-mono text-primary-text hover:text-primary transition-colors inline-flex items-center gap-1">
                    <span>{isExpanded ? "Hide" : "View"}</span>
                    <span className="material-symbols-outlined text-[16px]">
                      {isExpanded ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Collapsible Question Detail */}
              {isExpanded && (
                <div className="px-5 py-6 bg-base border-t border-border space-y-5 animate-fade-in">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-label-xs px-2 py-0.5 rounded bg-surface-high text-primary-text border border-border font-mono uppercase">
                        {q.difficulty} • {q.marks} Marks
                      </span>
                    </div>
                    <p className="text-body-md text-text-primary whitespace-pre-wrap">
                      {q.question}
                    </p>
                  </div>

                  {/* Options Comparison */}
                  <div className="space-y-2 pt-2">
                    <span className="text-label-xs text-text-muted uppercase font-mono block">
                      Options & Comparison
                    </span>
                    {Array.isArray(q.options) &&
                      q.options.map((opt: string, optIdx: number) => {
                        const isStudentChoice =
                          q.questionType === "single_choice"
                            ? String(q.selectedAnswer).trim() === String(opt).trim()
                            : Array.isArray(q.selectedAnswer) &&
                              q.selectedAnswer.includes(opt);

                        const isCorrectChoice =
                          q.questionType === "single_choice"
                            ? String(q.correctAnswer).trim() === String(opt).trim()
                            : Array.isArray(q.correctAnswer) &&
                              q.correctAnswer.includes(opt);

                        let borderClass = "border-border bg-surface";
                        if (isCorrectChoice) {
                          borderClass = "border-secondary/60 bg-secondary/10 text-text-primary";
                        } else if (isStudentChoice && !isCorrectChoice) {
                          borderClass = "border-error/60 bg-error/10 text-text-primary";
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-lg border text-body-sm flex items-start justify-between gap-3 ${borderClass}`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="font-mono text-label-xs font-bold text-text-muted mt-0.5">
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <span>{opt}</span>
                            </div>

                            <div className="flex items-center gap-2 font-mono text-label-xs flex-shrink-0">
                              {isStudentChoice && (
                                <span className="px-2 py-0.5 rounded bg-primary/20 text-primary-text">
                                  Your Choice
                                </span>
                              )}
                              {isCorrectChoice && (
                                <span className="px-2 py-0.5 rounded bg-secondary/20 text-secondary font-bold">
                                  Correct Answer
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="bg-surface-high border border-border p-4 rounded-lg">
                      <span className="text-label-xs text-secondary uppercase font-mono block mb-1 font-bold">
                        Explanation
                      </span>
                      <p className="text-body-sm text-text-secondary leading-relaxed">
                        {q.explanation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
