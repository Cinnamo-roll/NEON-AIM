import {
  Activity,
  BarChart3,
  ChevronRight,
  Clock3,
  Crosshair,
  Gamepad2,
  Layers3,
  Play,
  Target,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAppLanguage, tx } from "../../i18n";
import type { CareerOverviewModel } from "./careerOverviewModel";

interface CareerOverviewProps {
  model: CareerOverviewModel;
  loading: boolean;
  notice: string | null;
  onStartGoal: () => void;
  onBrowseTraining: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenSession: (projectId: string, sessionId: string) => void;
  onOpenGamePlan: () => void;
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.round(durationMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} ${tx("分钟", "min")}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat(getAppLanguage(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SectionHeading({
  index,
  eyebrow,
  title,
  description,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="career-dashboard-section-heading">
      <span className="career-dashboard-index">{index}</span>
      <div><small>{eyebrow}</small><h2>{title}</h2></div>
      {description && <p>{description}</p>}
    </header>
  );
}

export function CareerOverview({
  model,
  loading,
  notice,
  onStartGoal,
  onBrowseTraining,
  onOpenProject,
  onOpenSession,
  onOpenGamePlan,
}: CareerOverviewProps) {
  const goalProgress = model.goal.total > 0
    ? Math.min(100, model.goal.completed / model.goal.total * 100)
    : 0;

  return (
    <main className="workspace-main career-platform-overview career-dashboard">
      <header className="career-dashboard-header">
        <div className="career-dashboard-title">
          <h1>{tx("生涯总览", "Career overview")}</h1>
          <p>{tx("从每一次训练中，看见能力的变化和长期进步。", "See capability changes and long-term progress in every session.")}</p>
        </div>
      </header>

      <section className="career-dashboard-summary" aria-label={tx("生涯摘要", "Career summary")}>
        <div><small>{tx("当前视角", "CURRENT VIEW")}</small><b><Layers3 size={14} />{tx("综合训练", "General training")}<em>{tx(`本周 ${model.weeklyBenchmarkSessions} 基准 · ${model.weeklyPracticeSessions} 自由`, `This week ${model.weeklyBenchmarkSessions} benchmark · ${model.weeklyPracticeSessions} practice`)}</em></b></div>
        <div><small>{tx("累计训练", "TOTAL SESSIONS")}</small><strong>{model.totalSessions}<em>{tx(`${model.benchmarkSessions} 基准 · ${model.practiceSessions} 自由`, `${model.benchmarkSessions} benchmark · ${model.practiceSessions} practice`)}</em></strong></div>
        <div><small>{tx("累计时长", "TOTAL TIME")}</small><strong>{formatDuration(model.totalDurationMs)}<em>{tx(`本周 ${model.weeklySessions} 局 · ${formatDuration(model.weeklyDurationMs)}`, `${model.weeklySessions} this week · ${formatDuration(model.weeklyDurationMs)}`)}</em></strong></div>
        <div><small>{tx("项目档案", "PROJECT PROFILES")}</small><strong>{model.projects.length}<em>/31</em></strong></div>
        <div><small>{tx("最近更新", "LAST UPDATED")}</small><strong>{model.updatedAt ? formatDate(model.updatedAt) : "-"}</strong></div>
      </section>

      <section className="career-dashboard-section career-capability-section">
        <SectionHeading
          index="01"
          eyebrow={tx("综合能力状态", "CAPABILITY STATUS")}
          title={tx("跨训练项目的能力画像", "Capability profile across projects")}
          description={tx("根据训练记录，展示当前水平和变化方向", "See your current level and direction of change from training history")}
        />
        <div className="career-capability-grid">
          {model.abilities.map((ability) => (
            <article key={ability.code} data-trend={ability.trend}>
              <div><span>{ability.label}</span><i /></div>
              <strong>{ability.value}</strong>
              <small>{ability.note}</small>
            </article>
          ))}
        </div>
      </section>

      <div className="career-dashboard-primary-grid">
        <section className="career-dashboard-section career-change-section">
          <SectionHeading
            index="02"
            eyebrow={tx("最近能力变化", "RECENT CAPABILITY CHANGE")}
            title={tx("基准表现轨迹", "Benchmark performance trajectory")}
            description={tx("每分钟得分 / 准确率", "Score per minute / accuracy")}
          />
          {model.trend.length > 1 ? (
            <div className="career-dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.trend} margin={{ top: 18, right: 16, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke="rgba(102, 226, 236, .09)" vertical={false} />
                  <XAxis dataKey="order" tickLine={false} axisLine={false} stroke="#607583" fontSize={10} />
                  <YAxis yAxisId="primary" tickLine={false} axisLine={false} stroke="#607583" fontSize={10} />
                  <YAxis yAxisId="secondary" orientation="right" domain={[0, 100]} hide />
                  <Tooltip contentStyle={{ background: "#071018", border: "1px solid #23404f", borderRadius: 2, fontSize: 11 }} />
                  <Line yAxisId="primary" type="monotone" dataKey="primary" name={tx("每分钟得分", "Score / min")} stroke="#66e2ec" strokeWidth={2.2} dot={{ r: 2.5, fill: "#66e2ec" }} />
                  <Line yAxisId="secondary" type="monotone" dataKey="secondary" name={tx("准确率", "Accuracy")} unit="%" stroke="#7f8cff" strokeWidth={1.6} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="career-dashboard-chart-empty"><BarChart3 size={24} /><p>{tx("完成两局基准训练后显示变化", "Complete two benchmark runs to reveal the trend")}</p></div>
          )}
        </section>

        <section className="career-dashboard-section career-goal-section">
          <SectionHeading
            index="03"
            eyebrow={tx("当前训练目标", "CURRENT TRAINING GOAL")}
            title={tx("本阶段优先事项", "Current stage priority")}
          />
          <div className="career-goal-content">
            <span className="career-goal-icon"><Target size={20} /></span>
            <small>{model.goal.eyebrow}</small>
            <h3>{model.goal.title}</h3>
            <p>{model.goal.description}</p>
            <div className="career-goal-progress"><span><i style={{ width: `${goalProgress}%` }} /></span><b>{model.goal.completed}/{model.goal.total}</b></div>
            <div className="career-dashboard-notice"><small>{tx("训练建议", "RECOMMENDATION")}</small><b>{model.recommendation.title}</b><p>{model.recommendation.description}</p></div>
            <button type="button" onClick={onStartGoal}><Play size={15} fill="currentColor" />{model.goal.actionLabel}</button>
          </div>
        </section>
      </div>

      <section className="career-dashboard-section career-project-section-v2">
        <SectionHeading
          index="04"
          eyebrow={tx("各训练项目状态", "TRAINING PROJECT STATUS")}
          title={tx("训练项目档案", "Training project profiles")}
          description={tx(`已经建立 ${model.projects.length} 个项目档案，更多训练将逐步开放`, `${model.projects.length} project profile created; more training will open over time`)}
        />
        <div className="career-project-table">
          {model.projects.map((project, index) => (
            <button type="button" key={project.definition.id} onClick={() => onOpenProject(project.definition.id)}>
              <span className="career-project-sequence">{String(index + 1).padStart(2, "0")}</span>
              <span className="career-project-symbol"><Crosshair size={19} /></span>
              <span className="career-project-name"><small>{tx(...project.definition.eyebrow)}</small><b>{tx(...project.definition.name)}</b></span>
              <span className="career-project-state" data-trend={project.trend}><i />{project.statusLabel}</span>
              <span className="career-project-summary">{project.summary}</span>
              <span className="career-project-number"><b>{project.sessionCount}</b><small>{tx("总记录", "SESSIONS")}</small></span>
              <span className="career-project-number"><b>{project.benchmarkCount}</b><small>{tx("基准", "BENCHMARK")}</small></span>
              <ChevronRight size={17} />
            </button>
          ))}
          <div className="career-project-upcoming">
            <span>02—31</span><b>{tx("更多训练即将加入", "More training is coming")}</b><p>{tx("新的训练项目会在这里记录你的长期表现和能力变化。", "New training projects will track your long-term performance and capability changes here.")}</p>
            <button type="button" onClick={onBrowseTraining}>{tx("查看训练模块", "Open training module")}<ChevronRight size={15} /></button>
          </div>
        </div>
      </section>

      <section className="career-dashboard-section career-recent-section-v2">
        <SectionHeading
          index="05"
          eyebrow={tx("最近训练记录", "RECENT TRAINING SESSIONS")}
          title={tx("训练与单局分析", "Sessions and analysis")}
          description={loading ? tx("正在同步记录", "Syncing sessions") : tx("点击记录进入完整单局分析", "Open a session for full analysis")}
        />
        {notice && <div className="career-dashboard-notice">{notice}</div>}
        {model.recentSessions.length ? (
          <div className="career-session-table">
            <div className="career-session-table-head"><span>{tx("训练项目 / 时间", "PROJECT / TIME")}</span><span>{tx("训练类型", "CONTEXT")}</span><span>{tx("主要指标", "PRIMARY")}</span><span>{tx("辅助指标", "SECONDARY")}</span><span>{tx("评级", "GRADE")}</span><span /></div>
            {model.recentSessions.map((session) => (
              <button type="button" key={`${session.projectId}:${session.id}`} onClick={() => onOpenSession(session.projectId, session.id)}>
                <span><b>{session.projectName}</b><small>{formatDate(session.completedAt)}</small></span>
                <span>{session.context}</span>
                <strong>{session.primaryValue}</strong>
                <strong>{session.secondaryValue}</strong>
                <em>{session.grade}</em>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : !loading && (
          <div className="career-dashboard-empty">
            <Activity size={25} />
            <div><h3>{tx("还没有训练记录", "No training sessions yet")}</h3><p>{tx("完成第一局后，这里会建立项目档案并开放单局分析。", "Complete your first session to create a project profile and session analysis.")}</p></div>
            <button type="button" onClick={onBrowseTraining}>{tx("选择训练", "Choose training")}</button>
          </div>
        )}
      </section>

      <section className="career-game-enhancement" data-selected="false">
        <Gamepad2 size={21} />
        <div>
          <small>{tx("游戏成长计划", "GAME GROWTH PLAN")}</small>
          <h2>{tx("待开发", "Coming later")}</h2>
          <p>{tx(
            "将在 31 个训练项目完成后，基于完整的项目档案和综合能力数据开放。",
            "This area will open after all 31 training projects are complete, using the full project-profile and capability dataset.",
          )}</p>
        </div>
        <button type="button" onClick={onOpenGamePlan}>{tx("查看开发说明", "View development status")}<ChevronRight size={16} /></button>
      </section>

      <footer className="career-dashboard-footer">
        <span><Clock3 size={13} />{tx("数据来自每一次有效训练", "Built from every valid training session")}</span>
        <span>{model.updatedAt ? `${tx("最近更新", "Last updated")} ${formatDate(model.updatedAt)}` : tx("完成第一局后开始记录", "Tracking starts after your first session")}</span>
      </footer>
    </main>
  );
}
