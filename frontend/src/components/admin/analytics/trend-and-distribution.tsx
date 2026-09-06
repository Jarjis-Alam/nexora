"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";

interface TrendAndDistributionProps {
  scoreDistribution: { bin: string; count: number; percentage: number }[];
  accuracyDistribution: { bin: string; count: number; percentage: number }[];
  performanceTrend: {
    date: string;
    avgScore: number;
    avgAccuracy: number;
    attemptsCount: number;
  }[];
  isLimitedHistory: boolean;
  totalSubmitted: number;
}

export function TrendAndDistribution({
  scoreDistribution,
  accuracyDistribution,
  performanceTrend,
  isLimitedHistory,
  totalSubmitted,
}: TrendAndDistributionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Performance Trend Over Time (Span 7) */}
      <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-title-sm font-semibold text-text-primary">
              Performance Trend Over Time
            </h3>
            <p className="text-[11px] font-mono text-text-muted mt-0.5">
              Daily average score & accuracy across submitted attempts
            </p>
          </div>
          <span
            className={`text-label-xs font-mono px-2 py-0.5 rounded uppercase font-semibold ${
              isLimitedHistory
                ? "bg-surface-high text-text-muted border border-border"
                : "bg-primary/10 text-primary-text border border-primary/30"
            }`}
          >
            {isLimitedHistory ? "Limited History" : "Historical Trend"}
          </span>
        </div>

        <div className="h-64 w-full">
          {totalSubmitted === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
              <span className="material-symbols-outlined text-[28px] text-text-muted mb-2">
                timeline
              </span>
              <p className="text-body-sm font-mono text-text-muted">
                No submitted attempts recorded yet.
              </p>
              <p className="text-label-xs text-text-muted/70 mt-1 font-mono">
                Student submissions will establish performance trend lines here.
              </p>
            </div>
          ) : isLimitedHistory ? (
            <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
              <div className="flex items-center gap-6 mb-3">
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-primary-text">
                    {performanceTrend[0]?.avgScore ?? 0}%
                  </div>
                  <div className="text-label-xs font-mono text-text-muted">
                    Average Score
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-secondary">
                    {performanceTrend[0]?.avgAccuracy ?? 0}%
                  </div>
                  <div className="text-label-xs font-mono text-text-muted">
                    Average Accuracy
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-text-primary">
                    {performanceTrend[0]?.attemptsCount ?? 0}
                  </div>
                  <div className="text-label-xs font-mono text-text-muted">
                    Attempt{performanceTrend[0]?.attemptsCount === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              <p className="text-label-xs font-mono text-text-muted">
                Recorded on {performanceTrend[0]?.date || "single date"}. Additional daily data points needed to manufacture trend curve.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={performanceTrend}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="scoreTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4d8eff" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#4d8eff" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="accTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis
                  dataKey="date"
                  stroke="#8c909f"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                  tickLine={false}
                />
                <YAxis
                  stroke="#8c909f"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                  domain={[0, 100]}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#121212",
                    borderColor: "#262626",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="avgScore"
                  stroke="#adc6ff"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#4d8eff" }}
                  activeDot={{ r: 5, fill: "#adc6ff" }}
                  fill="url(#scoreTrendGrad)"
                  name="Avg Score %"
                />
                <Area
                  type="monotone"
                  dataKey="avgAccuracy"
                  stroke="#2dd4bf"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#0d9488" }}
                  activeDot={{ r: 5, fill: "#2dd4bf" }}
                  fill="url(#accTrendGrad)"
                  name="Avg Accuracy %"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Score & Accuracy Distribution Histograms (Span 5) */}
      <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-border bg-surface p-5">
        <div>
          <h3 className="text-title-sm font-semibold text-text-primary">
            Score & Accuracy Distribution
          </h3>
          <p className="text-[11px] font-mono text-text-muted mt-0.5 mb-4">
            Binned cohorts of submitted student scores
          </p>
        </div>

        {totalSubmitted === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
            <span className="material-symbols-outlined text-[28px] text-text-muted mb-2">
              bar_chart
            </span>
            <p className="text-body-sm font-mono text-text-muted">
              No score distribution data yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score Bins Bars */}
            <div>
              <div className="flex justify-between text-label-xs font-mono text-text-muted mb-2 uppercase">
                <span>Score Cohort</span>
                <span>Attempts (% of total)</span>
              </div>
              <div className="space-y-2">
                {scoreDistribution.map((bin) => (
                  <div key={bin.bin} className="space-y-1 font-mono text-label-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-text-primary font-medium">{bin.bin}%</span>
                      <span className="text-text-secondary">
                        {bin.count} ({bin.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-surface-high rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.max(bin.percentage, bin.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Accuracy Distribution summary */}
            <div className="border-t border-border pt-3">
              <span className="text-[11px] font-mono uppercase text-text-muted block mb-1.5">
                Accuracy Cohorts
              </span>
              <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-label-xs">
                {accuracyDistribution.map((b) => (
                  <div
                    key={b.bin}
                    className="p-1.5 rounded bg-surface-high border border-border/80"
                  >
                    <div className="text-[10px] text-text-muted">{b.bin}%</div>
                    <div className="font-bold text-text-primary mt-0.5">{b.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
