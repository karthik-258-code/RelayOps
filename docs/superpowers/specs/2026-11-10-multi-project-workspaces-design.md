# Multi-project workspaces

## Status

Design approved in chat on 2026-11-10. Written-spec review is pending before implementation planning.

## Problem

RelayOps currently sends every signed-in lead to the single seeded `project-chronos` workspace. GitHub imports and their extracted findings are persisted against that project, so separate repositories and experiments become mixed together. The app has no project list or project creation flow.

## Goal

After signing in, a user sees the projects they belong to, including Project Chronos. They can create a project by entering its name. RelayOps creates the project and makes the creator its lead, then opens that project's Connect stage. Every import, finding, review, and handover remains scoped to the selected project.

## Approved user flow

1. A user signs in and lands on `/projects`.
2. The Projects page lists only projects where the authenticated user has a `project_members` row. Project Chronos is identified as the existing demo project.
3. The user selects a project card to open `/workspace/{projectId}` or selects **New project** and enters a project name.
4. RelayOps validates the name, atomically creates a non-demo project and a lead membership for the signed-in user, and returns the new project ID.
5. The client navigates to `/workspace/{projectId}`. The new workspace starts at Connect and displays the project name.
6. Existing project APIs continue to use the project ID in the route and must verify the signed-in user's membership and clearance before reading or writing project data.

## Architecture

### Project directory and routing

- Add an authenticated `/projects` page as the post-login landing page.
- Replace the fixed Chronos lookup in `app/workspace/page.tsx` with a compatibility route: redirect signed-out users to `/login` and signed-in users to `/projects`.
- Add `app/workspace/[projectId]/page.tsx`. It awaits the dynamic route params using the installed Next.js App Router convention, checks the current user's membership for that exact project ID, and renders the existing workspace with that project ID and membership role/clearance. Unknown projects and non-members do not receive project data.
- Update successful sign-in navigation to `/projects`. Existing public links to `/workspace` remain usable and resolve through its auth-aware redirect.
- The project directory is the only project-selection surface in this release; no project switcher is added inside the five-stage handover flow.

### Project APIs and persistence

- Add authenticated `GET /api/v1/projects` returning a minimal list of the current user's project memberships and associated project fields: ID, name, slug, demo flag, role, and clearance.
- Add authenticated `POST /api/v1/projects` accepting only a trimmed name, with a bounded length of 1–120 characters. The server derives all ownership and membership values from the authenticated session; client-supplied creator IDs, roles, or clearance are rejected/ignored.
- Create the project row and its lead membership atomically in PostgreSQL. Generate a collision-safe slug from the name. Keep the current `projects` and `project_members` tables as the multi-tenant boundary; no source or claim table needs a new project column.
- Use a narrowly granted database function for the atomic create operation if two separate REST writes cannot guarantee rollback. The function is callable only by the trusted service role and receives the server-verified actor ID. Do not expose the service-role key to the browser.
- Reuse existing `getProjectAccess` and per-route authorization checks for all project-specific operations. Add regression coverage showing a member can access an associated project and cannot access another project's data by changing the URL.

### Workspace UI

- Build the Projects page to fit RelayOps' existing palette, type scale, and visual language. Give Chronos a clear demo label; keep the page readable and responsive, with a distinct create action and a short, accessible name form.
- Include loading, empty, validation, slug-generation, and server-error states. Identical display names remain allowed; generated slugs are unique. Disable the submit control during creation and prevent duplicate submissions.
- After project creation, open Connect immediately; do not place a new project into a pre-populated Chronos state.
- Make the current project name in the handover breadcrumb/header dynamic. Keep all five existing workflow stages and their interactions unchanged.

## Local Chronos data cleanup

Before cleanup, create a local-only database backup outside the repository and confirm that it can be read. Then remove the current imported/test content belonging to Project Chronos, including its sources/passages, claims/citations, entities/edges, review decisions, approved snapshots, and acknowledgements. Preserve the local Auth users and sessions where possible, profiles, database schema, Project Chronos row, and project memberships. Re-run the canonical `supabase/seed.sql` to restore the curated synthetic Chronos sample pack; do not reset the whole Supabase instance or touch the linked/production database. Verify the resulting source and finding totals and confirm the seeded lead can still sign in.

New projects are not seeded with Chronos data. Their Connect stage begins empty and all subsequent imports and findings stay within that new project ID.

## Security and failure behavior

- Require a verified Supabase user for project listing and creation.
- Derive the creator from the server-verified user and assign only that user the initial `lead` role at clearance 3.
- Validate project IDs and project names at API boundaries. Return generic user-facing errors; keep database diagnostics in server logs without logging secrets or source content.
- Enforce project membership on the server for the project page and every existing project endpoint. A UUID in the URL is not authorization.
- Keep existing RLS and clearance policies; don't broaden browser access to service-role operations.
- If atomic creation fails, return an error and create neither a project nor an orphaned membership.

## Verification and acceptance criteria

1. Signed-out users are directed to login; successful sign-in opens the Projects page.
2. Project Chronos appears once for its existing members and opens its own Connect stage.
3. Creating a named project creates exactly one project and one lead membership, then navigates to that project's empty Connect stage.
4. Importing a source in a newly created project does not change Chronos sources, claims, or review state; the reverse isolation also holds.
5. A user cannot access or mutate a project they do not belong to, including through direct dynamic URLs and API calls.
6. Existing Chronos users can still complete the five-stage workflow and seeded demo credentials remain valid after local data cleanup.
7. The Projects page works at narrow and desktop viewports, supports keyboard use, and announces form errors and loading state accessibly.
8. Type checking and the full automated test suite pass. A local browser test covers sign-in → project directory → open Chronos → create a project → Connect → import/refresh isolation. No Render deploy or GitHub push is part of this change.

## Explicit non-goals

- Team invitations, organization administration, project deletion/archiving, and membership management UI.
- Moving or copying records between projects.
- Changing the handover review or approval rules.
- Adding a new authentication provider or account-registration flow.
- Changing Render, the linked Supabase project, or the production deployment.
