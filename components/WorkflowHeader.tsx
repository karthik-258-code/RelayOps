import { Icon } from "./icons";
import type { HandoverState } from "@/lib/domain/types";
import { pendingReviewCount } from "@/lib/domain/workflow";

const stages = ["Connect", "Reconstruct", "Verify", "Review", "Handover"] as const;

export function WorkflowHeader({ project, projectName, activeStage, onStageChange }: {
  project: HandoverState;
  projectName: string;
  activeStage: number;
  onStageChange: (stage: number) => void;
}) {
  const pending = pendingReviewCount(project.claims, project.reviews);
  return (
    <div className="workflow-header">
      <div className="workflow-title-row">
        <div>
          <div className="breadcrumbs"><a href="/projects">Projects</a><Icon name="chevron" /><span>{projectName}</span></div>
          <h1>Knowledge handover</h1>
          <p className="subtitle">A source-backed view of current work. Review each finding before sharing.</p>
        </div>
        <div className="project-state"><span className={`state-dot ${project.approvedAt ? "approved" : "review"}`} />
          {project.approvedAt ? "Approved snapshot" : "Review in progress"}
        </div>
      </div>
      <div className="stage-navigation-wrap"><div className="stage-progress-caption"><span>HANDOVER PATH</span><span>STEP {activeStage + 1} OF 5</span></div><nav className="stage-nav" aria-label="Handover workflow">
        {stages.map((stage, index) => {
          const current = activeStage === index;
          const complete = index === 0 ? project.sources.length > 0 : index === 1 || index === 2 ? project.claims.length > 0 : index === 3 ? pending === 0 || Boolean(project.approvedAt) : Boolean(project.approvedAt);
          const locked = index === 4 && !project.approvedAt;
          return <button key={stage} type="button" className={`stage-button ${current ? "active" : ""} ${complete && !current ? "complete" : ""} ${locked ? "locked" : ""}`} onClick={() => onStageChange(index)} aria-current={current ? "step" : undefined} aria-label={locked ? "Handover, locked until every finding is reviewed and the handover is approved" : `${stage}${current ? ", current stage" : complete ? ", complete" : ""}`} title={locked ? "Review every finding and approve the handover to unlock" : undefined}>
            <span className="stage-index">{locked ? <Icon name="lock" /> : complete && index < activeStage ? <Icon name="check" /> : `0${index + 1}`}</span>
            <span>{stage}</span>{locked && <span className="stage-lock-label">LOCKED</span>}
          </button>;
        })}
      </nav></div>
    </div>
  );
}
