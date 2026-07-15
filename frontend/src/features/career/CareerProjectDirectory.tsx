import { ChevronRight, Crosshair, Layers3 } from "lucide-react";
import { tx } from "../../i18n";
import type { CareerOverviewProject } from "./careerOverviewModel";

interface CareerProjectDirectoryProps {
  projects: CareerOverviewProject[];
  onOpenProject: (projectId: string) => void;
  onBrowseTraining: () => void;
}

export function CareerProjectDirectory({
  projects,
  onOpenProject,
  onBrowseTraining,
}: CareerProjectDirectoryProps) {
  return (
    <main className="workspace-main career-directory">
      <header className="career-directory-header">
        <div>
          <h1>{tx("训练项目档案", "Training project profiles")}</h1>
          <p>{tx("查看每个训练项目的能力变化、表现趋势和历史记录。", "Review capability changes, performance trends, and history for every training project.")}</p>
        </div>
        <strong>{projects.length}<small>/31</small></strong>
      </header>

      <section className="career-directory-status">
        <div><Layers3 size={17} /><span><small>{tx("项目进度", "PROJECT PROGRESS")}</small><b>{tx(`已经建立 ${projects.length} 个训练项目档案`, `${projects.length} training project profile created`)}</b></span></div>
        <p>{tx("持续训练后，每个项目都会逐渐形成更清晰的能力趋势。", "Each project develops a clearer capability trend as you keep training.")}</p>
      </section>

      <section className="career-directory-grid">
        {projects.map((project, index) => (
          <button type="button" key={project.definition.id} onClick={() => onOpenProject(project.definition.id)}>
            <span className="career-directory-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="career-directory-icon"><Crosshair size={23} /></span>
            <span className="career-directory-copy">
              <small>{tx(...project.definition.eyebrow)}</small>
              <b>{tx(...project.definition.name)}</b>
              <p>{project.summary}</p>
            </span>
            <span className="career-directory-state" data-trend={project.trend}><i />{project.statusLabel}</span>
            <span className="career-directory-stats"><b>{project.sessionCount}</b><small>{tx("记录", "SESSIONS")}</small></span>
            <span className="career-directory-stats"><b>{project.benchmarkCount}</b><small>{tx("基准", "BENCHMARK")}</small></span>
            <ChevronRight size={18} />
          </button>
        ))}
        <article className="career-directory-pending">
          <span>02—31</span>
          <div><small>{tx("更多训练项目", "MORE TRAINING PROJECTS")}</small><b>{tx("训练项目将逐步接入", "More projects will be added over time")}</b><p>{tx("完成已接入的训练后，你可以在这里查看新的能力档案。", "Complete a registered training mode to build its capability profile here.")}</p></div>
          <button type="button" onClick={onBrowseTraining}>{tx("前往训练模块", "Open training module")}<ChevronRight size={15} /></button>
        </article>
      </section>
    </main>
  );
}
