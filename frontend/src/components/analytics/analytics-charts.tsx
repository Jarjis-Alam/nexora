"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { AnalyticsData } from "@/server/analytics";

export function AnalyticsCharts({ data }: { data: AnalyticsData }) {
  const readinessRadius = 40;
  const readinessCirc = 2 * Math.PI * readinessRadius;
  const readinessVal = data.readiness.score ?? 0;
  const readinessOffset =
    readinessCirc - (readinessVal / 100) * readinessCirc;
  const maxScore = Math.max(
    10,
    Math.ceil(Math.max(...data.performanceOverTime.map((point) => point.score), 0) / 10) * 10
  );
  const hasTrend = data.performanceOverTime.length > 1;

  return (
    <div className="space-y-8">
      {/* Row 1: Readiness + Performance Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Placement Readiness Breakdown (Span 4) */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-primary/20 bg-surface p-5 sm:p-6">
          <div>
            <h3 className="text-title-md font-semibold text-text-primary mb-6 flex items-center justify-between">
              Placement Readiness
              <span className="material-symbols-outlined text-text-muted text-[18px]">
                speed
              </span>
            </h3>

            {/* Circular Radial Gauge */}
            <div className="relative mb-6 flex justify-center">
              <svg className="w-36 h-36" viewBox="0 0 100 100">
                <circle
                  className="text-surface-high stroke-current"
                  cx="50"
                  cy="50"
                  fill="transparent"
                  r={readinessRadius}
                  strokeWidth="8"
                />
                <circle
                  className="text-primary stroke-current progress-ring__circle"
                  cx="50"
                  cy="50"
                  fill="transparent"
                  r={readinessRadius}
                  strokeDasharray={readinessCirc}
                  strokeDashoffset={readinessOffset}
                  strokeLinecap="round"
                  strokeWidth="8"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold font-mono text-text-primary leading-none">
                  {data.readiness.score !== null ? `${data.readiness.score}%` : "--"}
                </span>
                <span className="text-label-xs text-primary-text font-mono mt-1 px-2 py-0.5 bg-primary/10 rounded uppercase">
                  {data.readiness.level || "UNTESTED"}
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown Bars */}
          {data.readiness.breakdown && (
            <div className="space-y-3 border-t border-border pt-4 font-mono text-label-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-text-muted">Aptitude</span>
                  <span className="text-text-primary font-bold">
                    {data.readiness.breakdown.aptitude}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${data.readiness.breakdown.aptitude}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-text-muted">DSA</span>
                  <span className="text-text-primary font-bold">
                    {data.readiness.breakdown.dsa}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${data.readiness.breakdown.dsa}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-text-muted">Core CS</span>
                  <span className="text-text-primary font-bold">
                    {data.readiness.breakdown.coreCs}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${data.readiness.breakdown.coreCs}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-text-muted">SQL</span>
                  <span className="text-text-primary font-bold">
                    {data.readiness.breakdown.sql}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${data.readiness.breakdown.sql}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Performance Over Time (Span 8) */}
        <div className="lg:col-span-8 flex flex-col justify-between rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-title-md font-semibold text-text-primary">
              Performance Over Time
            </h3>
            <span className="text-right text-label-xs font-mono text-text-muted">
              {hasTrend ? "HISTORICAL ATTEMPTS" : "LIMITED HISTORY"}
            </span>
          </div>

          <div className="h-64 w-full" aria-label="Historical score performance chart">
            {data.performanceOverTime.length >= 1 ? (
              <div className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.performanceOverTime}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4d8eff" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4d8eff" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis
                    dataKey="date"
                    stroke="#8c909f"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#8c909f"
                    fontSize={11}
                    domain={[0, maxScore]}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#121212",
                      borderColor: "#262626",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontFamily: "JetBrains Mono",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#adc6ff"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#4d8eff", stroke: "#adc6ff", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#4d8eff", stroke: "#ffffff", strokeWidth: 2 }}
                    fillOpacity={1}
                    fill="url(#scoreGradient)"
                    name="Score"
                  />
                </AreaChart>
              </ResponsiveContainer>
              {!hasTrend && (
                <p className="mt-1 text-center text-label-xs font-mono text-text-muted">
                  Complete another test to establish a performance trend.
                </p>
              )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-body-sm font-mono text-text-muted">
                No attempts in this period.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Difficulty Performance & Weakest/Strongest Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Difficulty Breakdown (Span 4) */}
        <div className="lg:col-span-4 space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="text-title-md font-semibold text-text-primary">
            Difficulty Performance
          </h3>

          <div className="space-y-4">
            {data.difficultyPerformance.map((diff) => (
              <div key={diff.difficulty} className="space-y-1.5">
                <div className="flex justify-between text-label-xs font-mono">
                  <span className="text-text-primary capitalize">
                    {diff.difficulty}
                  </span>
                  <span className="text-right text-text-muted">
                    {diff.attempted > 0
                      ? `${diff.correct}/${diff.attempted} (${diff.accuracy}%)`
                      : "Not attempted"}
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-high rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      diff.difficulty === "easy"
                        ? "bg-secondary"
                        : diff.difficulty === "medium"
                        ? "bg-primary"
                        : "bg-tertiary"
                    }`}
                    style={{ width: `${diff.accuracy}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strongest & Weakest Topics (Span 8) */}
        <div className="lg:col-span-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h3 className="mb-5 text-title-md font-semibold text-text-primary">
            Topic Strength Matrix
          </h3>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Strongest */}
            <div>
              <span className="text-label-xs text-secondary uppercase font-mono font-bold block mb-3">
                Top Performing Topics
              </span>
              {data.strongestTopics.length > 0 ? (
                <div className="space-y-2">
                  {data.strongestTopics.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-surface-high border border-border flex justify-between items-center text-body-sm"
                    >
                      <span className="text-text-primary truncate mr-2">
                        {t.topicName}
                      </span>
                      <span className="text-label-xs font-mono font-bold text-secondary">
                        {t.accuracy}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-2 text-label-xs font-mono leading-relaxed text-text-muted">
                  No strong topic classifications yet. Complete more questions to establish reliable topic-level performance.
                </p>
              )}
            </div>

            {/* Weakest */}
            <div>
              <span className="text-label-xs text-error uppercase font-mono font-bold block mb-3">
                Focus Areas for Improvement
              </span>
              {data.weakestTopics.length > 0 ? (
                <div className="space-y-2">
                  {data.weakestTopics.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-surface-high border border-border flex justify-between items-center text-body-sm"
                    >
                      <span className="text-text-primary truncate mr-2">
                        {t.topicName}
                      </span>
                      <span className="text-label-xs font-mono font-bold text-error">
                        {t.accuracy}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-2 text-label-xs font-mono leading-relaxed text-text-muted">
                  No focus areas detected by the current topic threshold.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
