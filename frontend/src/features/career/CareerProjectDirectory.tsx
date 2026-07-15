import { useMemo, useState, type CSSProperties } from "react";
import { ChevronRight, Search } from "lucide-react";
import { tx } from "../../i18n";
import {
  getTrainingDifficultyLabel,
  trainingCatalogEntries,
  trainingDifficulties,
  type TrainingCatalogEntry,
} from "../../game/trainingCatalog";
import {
  buildCareerDirectoryProjects,
  filterCareerDirectoryProjects,
  type CareerDirectoryProject,
} from "./careerProjectDirectoryFilter";
import type { CareerOverviewProject } from "./careerOverviewModel";

interface CareerProjectDirectoryProps {
  projects: CareerOverviewProject[];
  onOpenProject: (projectId: string) => void;
  catalogEntries?: readonly TrainingCatalogEntry[];
}

function ProjectCardContent({ item }: { item: CareerDirectoryProject }) {
  const visibleMetrics = item.coreMetrics.slice(0, 4);
  const hiddenMetricCount = Math.max(0, item.coreMetrics.length - visibleMetrics.length);
  return (
    <>
      <span className="career-project-card-head"><b>{item.code}</b></span>
      <span className="career-project-card-main"><b>{item.name}</b></span>
      {item.project && (visibleMetrics.length ? (
        <span className="career-project-core-data" data-count={visibleMetrics.length}>
          {visibleMetrics.map((metric) => <span key={metric.code}><small>{metric.label}</small><b>{metric.value}</b></span>)}
        </span>
      ) : (
        <span className="career-project-core-empty">{tx("完成训练后显示项目统计", "Project statistics appear after training")}</span>
      ))}
      <span className="career-project-card-footer">
        {item.project && hiddenMetricCount > 0 && <small>{tx(`+${hiddenMetricCount} 项统计`, `+${hiddenMetricCount} metrics`)}</small>}
        {item.project
          ? <em>{tx("查看项目档案", "Open profile")}<ChevronRight size={16} /></em>
          : <em className="pending">{tx("待开发", "In development")}</em>}
      </span>
    </>
  );
}

export function CareerProjectDirectory({
  projects,
  onOpenProject,
  catalogEntries = trainingCatalogEntries,
}: CareerProjectDirectoryProps) {
  const [query, setQuery] = useState("");
  const directoryProjects = useMemo(
    () => buildCareerDirectoryProjects(projects, catalogEntries),
    [catalogEntries, projects],
  );
  const visibleProjects = useMemo(
    () => filterCareerDirectoryProjects(directoryProjects, query),
    [directoryProjects, query],
  );
  const groups = trainingDifficulties.map((difficulty) => ({
    ...difficulty,
    projects: visibleProjects.filter((project) => project.difficulty === difficulty.id),
  })).filter((group) => group.projects.length > 0);

  return (
    <main className="workspace-main career-directory">
      <header className="career-directory-header">
        <div className="career-directory-heading">
          <h1>{tx("训练项目档案", "Training project profiles")}</h1>
        </div>
      </header>

      <div className="career-directory-result-heading">
        <span><small>{tx("项目目录", "PROJECT DIRECTORY")}</small><b>{query ? tx(`找到 ${visibleProjects.length} 个项目`, `${visibleProjects.length} projects found`) : tx(`共 ${visibleProjects.length} 个项目`, `${visibleProjects.length} projects`)}</b></span>
        <label className="career-directory-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("搜索训练项目", "Search training projects")} aria-label={tx("搜索训练项目", "Search training projects")} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={tx("清空搜索", "Clear search")}>×</button>}
        </label>
      </div>

      <div className="career-directory-groups">
        {groups.map((group) => (
          <section className="career-directory-group" key={group.id} style={{ "--difficulty-color": group.color } as CSSProperties}>
            <header>
              <span className="career-directory-difficulty-code">{group.code}</span>
              <span><small>{group.eyebrow}</small><b>{getTrainingDifficultyLabel(group.id)}{tx("训练", " drills")}</b></span>
              <em>{tx(`${group.projects.length} 个项目`, `${group.projects.length} projects`)}</em>
            </header>
            <div className="career-directory-grid">
              {group.projects.map((item) => item.project ? (
                <button className="career-project-card" type="button" key={item.id} onClick={() => onOpenProject(item.id)}>
                  <ProjectCardContent item={item} />
                </button>
              ) : (
                <article className="career-project-card is-pending" key={item.id}>
                  <ProjectCardContent item={item} />
                </article>
              ))}
            </div>
          </section>
        ))}
        {visibleProjects.length === 0 && (
          <div className="career-directory-empty">
            <Search size={22} />
            <span><b>{tx("没有找到匹配的训练项目", "No matching training projects")}</b><small>{tx("换一个关键词再试试。", "Try another keyword.")}</small></span>
            <button type="button" onClick={() => setQuery("")}>{tx("清空搜索", "Clear search")}</button>
          </div>
        )}
      </div>
    </main>
  );
}
