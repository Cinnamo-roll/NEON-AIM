import type { CSSProperties } from "react";
import { Zap } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrainingSessionReviewModel } from "../../features/trainingReview/trainingSessionReviewModel";
import { tx } from "../../i18n";

export function TrainingSessionMetricGrid({ metrics }: Pick<TrainingSessionReviewModel, "metrics">) {
  return <div className="result-workbench-metrics" aria-label={tx("本局核心数据", "Core session data")}>
    {metrics.map((metric) => {
      const Icon = metric.icon;
      return <article key={metric.id}>
        <Icon />
        <div><small>{metric.label}</small><b>{metric.value}</b><em>{metric.detail}</em></div>
      </article>;
    })}
  </div>;
}

export function TrainingSessionStatsCard({ model }: { model: TrainingSessionReviewModel }) {
  const { chart, highlights, scoreBreakdown, phases } = model;
  return <section className="result-stats-canvas">
    <header className="result-stats-title">
      <div><small>{tx("数据统计", "Session data")}</small></div>
    </header>
    <div className="result-stats-main">
      <div className="result-rhythm-chart">
        <div className="result-rhythm-highlights">
          {highlights.map((highlight) => <span key={highlight.id} style={{ "--highlight-color": highlight.color } as CSSProperties}>
            <small>{highlight.label}</small><b>{highlight.context}</b><em>{highlight.value}</em>
          </span>)}
        </div>
        <div className="result-chart-legend">
          {chart.series.map((series) => <span key={series.key} data-kind={series.kind} style={{ "--series-color": series.color } as CSSProperties}>
            <i />{series.label}
          </span>)}
        </div>
        <div className="result-composed-chart-scroll">
          <div className="result-composed-chart" style={{ minWidth: `${chart.minWidth}px` }} aria-label={chart.ariaLabel}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart data={chart.data} barGap={5} barCategoryGap="34%" margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(165, 190, 202, .08)" vertical={false} />
                <XAxis dataKey={chart.categoryKey} interval={0} stroke="#67737e" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis yAxisId="primary" domain={chart.axes.primary.domain} ticks={chart.axes.primary.ticks} allowDecimals={chart.axes.primary.allowDecimals ?? true} width={28} stroke="#67737e" tickLine={false} axisLine={false} fontSize={10} unit={chart.axes.primary.unit} />
                {chart.axes.secondary && <YAxis yAxisId="secondary" orientation="right" domain={chart.axes.secondary.domain} ticks={chart.axes.secondary.ticks} width={32} stroke="#67737e" tickLine={false} axisLine={false} fontSize={10} unit={chart.axes.secondary.unit} />}
                <Tooltip contentStyle={{ background: "#071018", border: "1px solid rgba(148, 174, 188, .18)", borderRadius: 10, fontSize: 11 }} cursor={{ fill: "rgba(255, 255, 255, .025)" }} />
                {chart.series.filter((series) => series.kind === "bar").map((series) => <Bar
                  key={series.key}
                  yAxisId={series.axis}
                  dataKey={series.key}
                  name={series.label.replace(/ · .+$/, "")}
                  fill={series.color}
                  fillOpacity={0.82}
                  maxBarSize={22}
                  radius={[4, 4, 2, 2]}
                />)}
                {chart.series.filter((series) => series.kind === "line").map((series) => <Line
                  key={series.key}
                  yAxisId={series.axis}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label.replace(/ · .+$/, "")}
                  unit={series.unit}
                  stroke={series.color}
                  strokeWidth={2.4}
                  dot={{ r: 3, fill: "#071018", stroke: series.color, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: series.color, stroke: "#071018", strokeWidth: 2 }}
                  connectNulls={false}
                />)}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <aside className="result-score-distribution">
        <header><Zap /><span><small>{scoreBreakdown.label}</small></span></header>
        <div className="result-score-total"><small>{scoreBreakdown.totalLabel}</small><strong>{Math.round(scoreBreakdown.total).toLocaleString()}</strong></div>
        <div className="result-score-stack" aria-label={tx("得分占比", "Score shares")}>
          {scoreBreakdown.parts.map((part) => {
            const share = scoreBreakdown.total > 0 ? part.value / scoreBreakdown.total * 100 : 0;
            return <i key={part.id} style={{ width: `${Math.max(0, Math.min(100, share))}%`, background: part.color }} />;
          })}
        </div>
        <div className="result-score-legend">
          {scoreBreakdown.parts.map((part) => {
            const share = scoreBreakdown.total > 0 ? part.value / scoreBreakdown.total * 100 : 0;
            return <span key={part.id}><i style={{ background: part.color }} /><small>{part.label}</small><b>{Math.round(part.value).toLocaleString()}</b><em>{share.toFixed(1)}%</em></span>;
          })}
        </div>
        <section className="result-phase-summary">
          <header><small>{phases.label}</small><em>{phases.headlineMetricLabel}</em></header>
          <div>
            {phases.items.map((phase) => <article key={phase.id}>
              <header><span>{phase.indexLabel}</span><b>{phase.label}</b><strong>{phase.headlineValue}</strong></header>
              <footer>{phase.stats.map((stat) => <span key={stat.label}>{stat.label}<b>{stat.value}</b></span>)}</footer>
            </article>)}
          </div>
        </section>
      </aside>
    </div>
  </section>;
}
