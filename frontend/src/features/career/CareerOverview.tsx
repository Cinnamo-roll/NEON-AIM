import {
  Activity,
  Bot,
  ChevronRight,
  Clock3,
  History,
  Send,
} from "lucide-react";
import { getAppLanguage, tx } from "../../i18n";
import type { CareerOverviewModel } from "./careerOverviewModel";

interface CareerOverviewProps {
  model: CareerOverviewModel;
  loading: boolean;
  notice: string | null;
  onBrowseTraining: () => void;
  onOpenSession: (projectId: string, sessionId: string) => void;
}

const AI_CHAT_PROMPTS = [
  ["我最近进步了吗？", "Am I improving recently?"],
  ["现在最该练什么？", "What should I train next?"],
  ["哪些能力还不稳定？", "Which skills are still inconsistent?"],
] as const;

function formatDuration(durationMs: number) {
  const totalMinutes = Math.round(durationMs / 60_000);
  if (totalMinutes < 60) return tx(`${totalMinutes} 分钟`, `${totalMinutes} min`);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes
    ? tx(`${hours} 小时 ${minutes} 分`, `${hours}h ${minutes}m`)
    : tx(`${hours} 小时`, `${hours}h`);
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

export function CareerOverview({
  model,
  loading,
  notice,
  onBrowseTraining,
  onOpenSession,
}: CareerOverviewProps) {
  const recentSessions = model.recentSessions.slice(0, 5);

  return (
    <main className="workspace-main career-platform-overview career-dashboard career-overview-simple">
      <header className="career-dashboard-header career-overview-header">
        <div className="career-dashboard-title">
          <h1>{tx("生涯总览", "Career overview")}</h1>
        </div>
        <small className="career-overview-updated">
          <Clock3 size={13} />
          {model.updatedAt
            ? `${tx("最近更新", "Updated")} ${formatDate(model.updatedAt)}`
            : tx("等待第一局训练", "Waiting for the first session")}
        </small>
      </header>

      <section className="career-overview-key-metrics" aria-label={tx("训练概况", "Training summary")}>
        <div><small>{tx("累计训练", "TOTAL SESSIONS")}</small><strong>{model.totalSessions}<em>{tx("次", "sessions")}</em></strong></div>
        <div><small>{tx("累计时长", "TOTAL TIME")}</small><strong>{formatDuration(model.totalDurationMs)}</strong></div>
        <div><small>{tx("本周训练", "THIS WEEK")}</small><strong>{model.weeklySessions}<em>{tx("次", "sessions")}</em></strong></div>
        <div><small>{tx("本周时长", "WEEKLY TIME")}</small><strong>{formatDuration(model.weeklyDurationMs)}</strong></div>
      </section>

      {notice && <div className="career-dashboard-notice">{notice}</div>}

      <div className="career-overview-focus-grid">
        <section className="career-overview-panel career-overview-recent-panel">
          <header className="career-overview-simple-heading">
            <span><History size={16} /><h2>{tx("最近训练", "Recent training")}</h2></span>
            <small>{loading ? tx("正在同步", "Syncing") : tx("点击记录打开历史训练复盘", "Open a historical session review")}</small>
          </header>
          {recentSessions.length ? (
            <div className="career-overview-recent-list">
              {recentSessions.map((session) => (
                <button type="button" key={`${session.projectId}:${session.id}`} onClick={() => onOpenSession(session.projectId, session.id)}>
                  <time dateTime={session.completedAt}>{formatDate(session.completedAt)}</time>
                  <span><strong>{session.projectName}</strong><small>{session.context}</small></span>
                  <span><b>{session.primaryValue}</b><small>{session.secondaryValue}</small></span>
                  <em data-grade={session.grade}>{session.grade}</em>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="career-overview-compact-empty">
              <Activity size={22} />
              <div>
                <strong>{loading ? tx("正在同步训练记录", "Syncing training history") : tx("还没有训练记录", "No sessions yet")}</strong>
                <small>{tx("完成第一局后，可从这里打开对应的历史复盘。", "Complete a session to open its historical review here.")}</small>
              </div>
              {!loading && <button type="button" onClick={onBrowseTraining}>{tx("选择训练", "Choose training")}</button>}
            </div>
          )}
        </section>

        <section className="career-overview-ai-chat" aria-label={tx("AI 对话", "AI chat")}>
          <header>
            <span><Bot size={17} /></span>
            <div><small>{tx("AI 对话", "AI CHAT")}</small><h2>{tx("与你的生涯数据对话", "Talk with your Career data")}</h2></div>
            <em>{tx("会员功能 · 未来开发", "MEMBER FEATURE · COMING LATER")}</em>
          </header>
          <div className="career-overview-ai-body">
            <p>{tx(
              "未来，AI 可以结合你的全部训练记录、能力档案和长期变化，回答进步、短板与下一步训练问题。",
              "AI will use your full training history, capability profile, and long-term changes to answer questions about progress, weaknesses, and what to train next.",
            )}</p>
            <div>
              {AI_CHAT_PROMPTS.map((prompt) => <button type="button" key={prompt[0]} disabled>{tx(prompt[0], prompt[1])}</button>)}
            </div>
          </div>
          <footer>
            <span>{tx("未来可直接询问你的生涯数据", "Ask about your Career data here in the future")}</span>
            <button type="button" disabled aria-label={tx("发送", "Send")}><Send size={15} /></button>
          </footer>
        </section>
      </div>
    </main>
  );
}
