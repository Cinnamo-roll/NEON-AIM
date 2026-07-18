import {
  AlertTriangle,
  CloudOff,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

type CareerDataStatusTone = "loading" | "warning" | "error";

interface CareerDataStatusProps {
  tone: CareerDataStatusTone;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

export function CareerDataStatus({
  tone,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
  className = "",
}: CareerDataStatusProps) {
  const Icon = tone === "loading" ? LoaderCircle : tone === "warning" ? AlertTriangle : CloudOff;
  const role = tone === "loading" ? "status" : "alert";

  return (
    <div
      className={`career-data-status${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      data-tone={tone}
      role={role}
      aria-live={tone === "loading" ? "polite" : "assertive"}
    >
      <span className="career-data-status-icon" aria-hidden="true">
        <Icon className={tone === "loading" ? "spin" : undefined} size={20} />
      </span>
      <span className="career-data-status-copy">
        <strong>{title}</strong>
        <small>{message}</small>
      </span>
      {onAction && actionLabel && (
        <button type="button" onClick={onAction}>
          <RefreshCw size={14} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
