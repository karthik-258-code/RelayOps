# RelayOps Homepage and Workflow Redesign

## Status

Design direction approved by the project lead. Awaiting review of this specification and implementation plan before coding.

## Intent

Create a distinct public front door for RelayOps and make the existing five-stage workflow feel like five purposeful steps instead of one review screen with changing captions. The primary audience is a project lead preparing a handover; the incoming teammate remains the secondary audience.

## Product truth to preserve

- RelayOps keeps source records attached to project findings and exposes disagreement and missing evidence.
- Reconstruction is deterministic, source-backed, and local to the browser; it is not an AI or live GitHub integration.
- A human must finish review and explicitly approve before the incoming view opens.
- Contributor role filtering happens before rendering; this is a demo role view, not authentication or a server-side security boundary.
- Demo content is synthetic Project Chronos. No customer quotes, case studies, usage numbers, or integration claims may be invented.

## Experience structure

### Public home (`/`)

- Tell a short, specific story about turning scattered project records into a reviewed continuation brief.
- Address a project lead who is preparing to leave context behind. Show what the lead does, what the incoming teammate receives, and why evidence and review matter.
- Use real interface detail from the synthetic Project Chronos workflow as proof, clearly labeled as a demo. Do not fabricate outcome metrics or testimonials.
- Make “Open workspace” the primary action and link directly to `/workspace`.
- Keep the page useful on narrow screens and make the first view communicate the product without scrolling.

### Workspace (`/workspace`)

- Preserve the existing local-first demo and its data, review, approval, role filtering, and acknowledgement behavior.
- Use a recognizable, consistent navigation system with five labeled stages, progress, keyboard focus, and accessible state announcements.
- Give each stage a distinct information hierarchy and a meaningful next action:
  1. **Connect:** authorised source guidance, import control, connected source inventory, and privacy note.
  2. **Reconstruct:** explain the deterministic source-to-finding grouping with a useful findings overview and entry to verification.
  3. **Verify:** focus on conflict and missing-evidence findings, with linked evidence and source comparison; actions lead into review without discarding existing decisions.
  4. **Review:** retain the full claim queue, evidence inspector, human decisions, and explicit approval action.
  5. **Handover:** after approval, show the current role-appropriate handover and acknowledgement flow. Before approval, show a visibly locked state with the reason and a direct action to continue review.
- Keep the approval requirement authoritative. A locked Handover click must not silently look like a successful navigation; the nav announces the lock and the stage content explains what needs to happen.
- Do not make the five stages look like repeated versions of the same dashboard. Avoid decorative equal-card grids and effects that do not clarify status or progress.

## Visual direction

- Warm paper grounds long-form project information; graphite carries primary text; RelayOps green marks progress and approved action; amber marks evidence that needs attention; restrained red is reserved for contradiction or blocking risk.
- Use a confident editorial hierarchy for the public home and a compact, practical working surface for the workflow.
- Use authentic synthetic product evidence and interface elements, not generic stock photography or fabricated customer proof. A small project-record/continuity motif may be drawn with CSS or existing assets if it clarifies the story.
- Motion should explain navigation or state change, remain short and restrained, and honor `prefers-reduced-motion`.
- Maintain readable contrast, visible keyboard focus, status labels beyond color, and a functional narrow-screen layout.

## Routing and persistence

- `/` becomes the public homepage; `/workspace` renders the existing client-side workflow.
- Use Next App Router navigation so the configured GitHub Pages base path remains respected.
- Keep current local storage schema and origin-scoped persistence. Moving the workflow route does not migrate storage across origins.
- Static export must continue to build for GitHub Pages and Render.

## Acceptance criteria

- A first-time visitor can understand RelayOps and reach the workspace without a walkthrough.
- Each of the five workflow stages presents stage-specific information and a useful next step.
- Before approval, selecting Handover communicates why it is locked and keeps the user oriented in Review. After approval, Handover becomes the active stage and displays the current role view.
- Existing source import, reconstruction, review decisions, approval, contributor filtering, acknowledgement, reset, and persistence behavior remain usable.
- Keyboard users can navigate stage controls and the primary actions. The active and locked states are available to assistive technology.
- The home and workspace render well at desktop and narrow mobile widths, with reduced motion support.
- `npm run typecheck` and `npm run build` succeed; manual browser walkthrough covers navigation, the approval gate, and the complete handover.

## Out of scope

- Authentication, server-side persistence, real GitHub integrations, LLM processing, user/team management, PDF export, or new domain workflows.
- Invented performance claims, customer endorsements, or externally sourced assets.
