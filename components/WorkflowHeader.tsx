import { Icon } from "./icons";
import type { HandoverState } from "@/lib/domain/types";
import { pendingReviewCount } from "@/lib/domain/workflow";

const stages = ["Connect", "Reconstruct", "Verify", "Review", "Handover"] as const;

export function WorkflowHeader({ project, activeStage, onStageChange }: {
  project: HandoverState;
  activeStage: number;
  onStageChange: (stage: number) => void;
}) {
  const pending = pendingReviewCount(project.claims, project.reviews);
  return (
    <div className="workflow-header">
      <div className="workflow-title-row">
        <div>
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" /><span>Project Chronos</span></div>
          <h1>Knowledge handover</h1>
          <p className="subtitle">A source-backed view of current work. Review each finding before sharing.</p>
        </div>
        <div className="project-state"><span className={`state-dot ${project.approvedAt ? "approved" : "review"}`} />
          {project.approvedAt ? "Approved snapshot" : "Review in progress"}
        </div>
      </div>
      <nav className="stage-nav" aria-label="Handover workflow">
        {stages.map((stage, index) => {
          const current = activeStage === index;
          const complete = index === 0 ? project.sources.length > 0 : index === 1 || index === 2 ? project.claims.length > 0 : index === 3 ? pending === 0 || Boolean(project.approvedAt) : Boolean(project.approvedAt);
          return <button key={stage} type="button" className={`stage-button ${current ? "active" : ""} ${complete && !current ? "complete" : ""}`} onClick={() => onStageChange(index)} aria-current={current ? "step" : undefined}>
            <span className="stage-index">{complete && index < activeStage ? <Icon name="check" /> : `0${index + 1}`}</span>
            <span>{stage}</span>
          </button>;
        })}
      </nav>
    </div>
  );
}
