import { ArrowLeft, Cloud, CloudOff, LoaderCircle, ShieldAlert } from "lucide-react";
import type { GridShotCareerDetail, GridShotCareerSession } from "../../../../game/career/gridShotCareer";
import { gridShotCareerDetailToHistoryRecord } from "../../../../game/career/gridShotCareer";
import { getAppLanguage, tx } from "../../../../i18n";
import { GridShotResultPage } from "../../../../pages/GridShotResultPage";

interface GridShotCareerSessionReviewProps {
  session: GridShotCareerSession;
  detail: GridShotCareerDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
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
  onBack,
}: GridShotCareerSessionReviewProps) {
  if (detail) {
    const record = gridShotCareerDetailToHistoryRecord(detail);
    const targetSizeValue = detail.configuration.targetSize;
    const targetSize = targetSizeValue === "small" || targetSizeValue === "large"
      ? targetSizeValue
      : "medium";
    return (
      <div className="career-session-review-route">
        {loading && <div className="career-detail-sync"><LoaderCircle className="spin" size={14} />{tx("正在同步云端详情", "Syncing cloud detail")}</div>}
        <GridShotResultPage
          record={record}
          targetSize={targetSize}
          saveStatus="saved-cloud"
          serverSessionId={session.serverId}
          onTrainingHome={onBack}
          backLabel={["返回 Grid Shot 档案", "Back to Grid Shot profile"]}
        />
      </div>
    );
  }
  return (
    <main className="workspace-main career-page career-detail-page">
      <header className="career-detail-header">
        <button type="button" onClick={onBack}><ArrowLeft size={16} />{tx("返回生涯", "Back to career")}</button>
        <div>
          <span>GRID SHOT · {formatDate(session.completedAt)}</span>
          <h1>{tx("单局详细记录", "Session detail")}</h1>
        </div>
        <div className={`career-source ${session.source}`}>
          {session.source === "cloud" ? <Cloud size={15} /> : <CloudOff size={15} />}
          {session.source === "cloud" ? tx("云端记录", "Cloud record") : tx("本地记录", "Local record")}
        </div>
      </header>
      {loading && <div className="career-loading"><LoaderCircle className="spin" />{tx("正在读取详细数据", "Loading session data")}</div>}
      {error && <div className="career-error"><ShieldAlert size={18} /><span>{error}</span></div>}
    </main>
  );
}
