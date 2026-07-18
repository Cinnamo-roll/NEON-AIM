import { ArrowLeft, Cloud, CloudOff } from "lucide-react";
import type { GridShotCareerDetail, GridShotCareerSession } from "../../../../game/career/gridShotCareer";
import { gridShotCareerDetailToHistoryRecord } from "../../../../game/career/gridShotCareer";
import { getAppLanguage, tx } from "../../../../i18n";
import { GridShotResultPage } from "../../../../pages/GridShotResultPage";
import { CareerDataStatus } from "../../CareerDataStatus";

interface GridShotCareerSessionReviewProps {
  session: GridShotCareerSession;
  detail: GridShotCareerDetail | null;
  loading: boolean;
  error: string | null;
  backLabel: readonly [zh: string, en: string];
  onBack: () => void;
  onRetry?: () => void;
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

export function GridShotCareerSessionReview({
  session,
  detail,
  loading,
  error,
  backLabel,
  onBack,
  onRetry,
}: GridShotCareerSessionReviewProps) {
  if (detail) {
    const record = gridShotCareerDetailToHistoryRecord(detail);
    const targetSizeValue = detail.configuration.targetSize;
    const targetSize = targetSizeValue === "small" || targetSizeValue === "large"
      ? targetSizeValue
      : "medium";
    return (
      <div className="career-session-review-route">
        {(loading || error) && (
          <div className="career-session-review-statuses">
            {loading && (
              <CareerDataStatus
                tone="loading"
                title={tx("正在更新云端详情", "Updating cloud detail")}
                message={tx("当前先显示本地保存的分析，更新完成后会自动替换。", "The saved analysis remains visible and will update automatically.")}
                compact
              />
            )}
            {error && (
              <CareerDataStatus
                tone="warning"
                title={tx("云端详情未更新", "Cloud detail was not updated")}
                message={error}
                actionLabel={onRetry ? tx("重新加载", "Try again") : undefined}
                onAction={onRetry}
                compact
              />
            )}
          </div>
        )}
        <GridShotResultPage
          record={record}
          targetSize={targetSize}
          saveStatus="saved-cloud"
          serverSessionId={session.serverId}
          onTrainingHome={onBack}
          backLabel={backLabel}
        />
      </div>
    );
  }
  return (
    <main className="workspace-main career-page career-detail-page">
      <header className="career-detail-header">
        <button type="button" onClick={onBack}><ArrowLeft size={16} />{tx(...backLabel)}</button>
        <div>
          <span>GRID SHOT · {formatDate(session.completedAt)}</span>
          <h1>{tx("单局详细记录", "Session detail")}</h1>
        </div>
        <div className={`career-source ${session.source}`}>
          {session.source === "cloud" ? <Cloud size={15} /> : <CloudOff size={15} />}
          {session.source === "cloud" ? tx("云端记录", "Cloud record") : tx("本地记录", "Local record")}
        </div>
      </header>
      {loading && (
        <CareerDataStatus
          tone="loading"
          title={tx("正在读取单局分析", "Loading session analysis")}
          message={tx("正在从云端读取完整事件与分析数据，请稍候。", "Loading the complete event and analysis data from the cloud.")}
        />
      )}
      {!loading && error && (
        <CareerDataStatus
          tone="error"
          title={tx("单局分析无法打开", "Session analysis could not be opened")}
          message={error}
          actionLabel={onRetry ? tx("重新加载", "Try again") : undefined}
          onAction={onRetry}
        />
      )}
    </main>
  );
}
