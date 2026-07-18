import { useState } from "react";
import { Activity, ChevronLeft, ChevronRight, History } from "lucide-react";
import { getAppLanguage, tx } from "../../i18n";
import { CareerDataStatus } from "./CareerDataStatus";
import type { CareerOverviewModel } from "./careerOverviewModel";
import { CAREER_OVERVIEW_PAGE_SIZE, getCareerOverviewPaginationItems } from "./careerOverviewPagination";

interface CareerOverviewProps {
  model: CareerOverviewModel;
  loading: boolean;
  notice: string | null;
  onBrowseTraining: () => void;
  onOpenSession: (projectId: string, sessionId: string) => void;
  onRetry: () => void;
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.round(durationMs / 60_000);
  if (totalMinutes < 60) return tx(`${totalMinutes} 分钟`, `${totalMinutes} min`);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes
    ? tx(`${hours} 小时 ${minutes} 分钟`, `${hours}h ${minutes}m`)
    : tx(`${hours} 小时`, `${hours}h`);
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { date: "-", time: "-" };
  const locale = getAppLanguage();
  return {
    date: new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
    }).format(date),
    time: new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

export function CareerOverview({
  model,
  loading,
  notice,
  onBrowseTraining,
  onOpenSession,
  onRetry,
}: CareerOverviewProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(model.recentSessions.length / CAREER_OVERVIEW_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const recentSessions = model.recentSessions.slice(
    currentPage * CAREER_OVERVIEW_PAGE_SIZE,
    (currentPage + 1) * CAREER_OVERVIEW_PAGE_SIZE,
  );
  const paginationItems = getCareerOverviewPaginationItems(currentPage, totalPages);
  const hasSavedData = model.totalSessions > 0;

  return (
    <main className="workspace-main career-platform-overview career-dashboard career-overview-simple">
      <header className="career-primary-header career-dashboard-header career-overview-header">
        <div className="career-primary-header-content career-dashboard-title">
          <h1>{tx("生涯总览", "Career overview")}</h1>
        </div>
      </header>

      <section className="career-overview-core-metrics" aria-label={tx("训练核心指标", "Core training metrics")}>
        <article>
          <small>{tx("累计训练", "Total sessions")}</small>
          <strong>{model.totalSessions}<em>{tx("局", "sessions")}</em></strong>
        </article>
        <article>
          <small>{tx("累计时长", "Total time")}</small>
          <strong>{formatDuration(model.totalDurationMs)}</strong>
        </article>
        <article data-period="recent">
          <small>{tx("近 7 天训练", "Sessions in the last 7 days")}</small>
          <strong>{model.weeklySessions}<em>{tx("局", "sessions")}</em></strong>
        </article>
        <article data-period="recent">
          <small>{tx("近 7 天时长", "Time in the last 7 days")}</small>
          <strong>{formatDuration(model.weeklyDurationMs)}</strong>
        </article>
      </section>

      {loading && (
        <CareerDataStatus
          tone="loading"
          title={tx("正在同步生涯数据", "Syncing Career data")}
          message={hasSavedData
            ? tx("正在检查云端更新；当前已保存的数据仍可正常查看。", "Checking for cloud updates. Saved data remains available while syncing.")
            : tx("正在读取训练记录与能力档案，请稍候。", "Loading training history and the capability profile.")}
          compact
        />
      )}
      {notice && (
        <CareerDataStatus
          tone={hasSavedData ? "warning" : "error"}
          title={hasSavedData ? tx("部分生涯数据未更新", "Some Career data is out of date") : tx("生涯数据加载失败", "Career data failed to load")}
          message={notice}
          actionLabel={tx("重新加载", "Try again")}
          onAction={onRetry}
          compact
        />
      )}

      <section className="career-overview-history" aria-label={tx("最近训练", "Recent training")}>
        <header className="career-overview-history-heading">
          <span className="career-overview-history-title">
            <i><History size={19} /></i>
            <h2>{tx("最近训练", "Recent training")}</h2>
          </span>
        </header>

        {recentSessions.length ? (
          <>
            <div className="career-overview-session-list">
              {recentSessions.map((session) => {
                const completedAt = formatSessionTime(session.completedAt);
                return (
                  <button
                    type="button"
                    className="career-overview-session"
                    key={`${session.projectId}:${session.id}`}
                    onClick={() => onOpenSession(session.projectId, session.id)}
                    aria-label={tx(`打开 ${session.projectName} 单局分析`, `Open ${session.projectName} session analysis`)}
                  >
                    <time dateTime={session.completedAt}>
                      <b>{completedAt.date}</b>
                      <small>{completedAt.time}</small>
                    </time>

                    <span className="career-overview-session-main">
                      <span>
                        <strong>{session.projectName}</strong>
                        <em>{session.sessionType === "benchmark" ? tx("标准训练", "Standard training") : tx("自由练习", "Free practice")}</em>
                      </span>
                      <small>{session.context}</small>
                    </span>

                    <span className="career-overview-session-metrics">
                      <span><small>{session.primaryLabel}</small><b>{session.primaryValue}</b></span>
                      <span><small>{session.secondaryLabel}</small><b>{session.secondaryValue}</b></span>
                    </span>

                    <em className="career-overview-session-grade" data-grade={session.grade}>{session.grade}</em>
                    <span className="career-overview-session-action">
                      <ChevronRight size={18} />
                    </span>
                  </button>
                );
              })}
            </div>
            {totalPages > 1 && (
              <nav className="career-overview-pagination" aria-label={tx("最近训练分页", "Recent training pages")}>
                <div className="career-overview-pagination-controls">
                  <button
                    type="button"
                    disabled={currentPage === 0}
                    aria-label={tx("上一页", "Previous page")}
                    onClick={() => setPage(Math.max(0, currentPage - 1))}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="career-overview-page-numbers">
                    {paginationItems.map((item) => typeof item === "number" ? (
                      <button
                        type="button"
                        key={item}
                        className={item === currentPage ? "active" : undefined}
                        aria-current={item === currentPage ? "page" : undefined}
                        aria-label={tx(`第 ${item + 1} 页`, `Page ${item + 1}`)}
                        onClick={() => setPage(item)}
                      >
                        {item + 1}
                      </button>
                    ) : (
                      <span key={item} aria-hidden="true">…</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={currentPage === totalPages - 1}
                    aria-label={tx("下一页", "Next page")}
                    onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </nav>
            )}
          </>
        ) : loading ? (
          <div className="career-overview-session-skeleton" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => <span key={index}><i /><i /><i /><i /></span>)}
          </div>
        ) : (
          <div className="career-overview-compact-empty">
            <Activity size={24} />
            <div>
              <strong>{hasSavedData ? tx("最近 7 天没有训练记录", "No sessions in the last 7 days") : tx("还没有训练记录", "No sessions yet")}</strong>
              <small>{hasSavedData
                ? tx("更早的记录仍保留在对应项目档案中。完成新训练后会显示在这里。", "Older sessions remain in their project profiles. New sessions will appear here.")
                : tx("完成第一局后，可以从这里打开对应的单局分析。", "Complete a session to open its analysis here.")}</small>
            </div>
            <button type="button" onClick={onBrowseTraining}>{tx("选择训练", "Choose training")}</button>
          </div>
        )}
      </section>
    </main>
  );
}
