# Review at scale and project team invitations

## Status

Product direction approved in chat on 2026-11-11. Written-spec review is pending before implementation planning.

## Problem

Review currently saves one finding decision at a time. A large imported project can have many supported findings, conflicts, and evidence gaps, so a lead must repeat the same decision for each item. Project workspaces already persist project membership and enforce lead/reviewer/contributor roles, but there is no interface for adding collaborators or accepting invitations.

RelayOps uses Supabase Auth and PostgreSQL. The current auth flow supports password sign-in; there is no username/profile directory. The project membership table stores user ID, role, and clearance. Decisions are written individually through a version-checked database function and create a per-finding review-history entry.

## Goals

1. Let a lead or reviewer quickly record consistent decisions for eligible pending findings without hiding conflicts or evidence gaps.
2. Keep every affected finding's decision history and current version correct, and make a bulk action all-or-nothing if any item changed.
3. Let a project lead add a teammate by email, for a new or existing RelayOps account, with an explicit role and clearance.
4. Keep project data inaccessible to an invitee until they authenticate with the invited email and accept the invitation.
5. Keep all invite management and review writes scoped to the selected project.

## Approved user behavior

### Bulk review

In the Review stage, show a short **Review pending findings** section with separate, count-labelled actions:

- **Confirm supported findings** — applies only to pending findings with status `VERIFIED`, using the existing `confirmed` disposition.
- **Keep conflicts unresolved** — applies only to pending `CONFLICT` findings, using `accepted-uncertainty`.
- **Keep evidence gaps visible** — applies only to pending `MISSING EVIDENCE` findings, using `accepted-uncertainty`.

Before writing, show the eligible count and what the action means, then require explicit confirmation. A zero-count action is disabled. Reviewed, rejected, or otherwise non-pending findings are never changed. No bulk rejection, conflict resolution, or replacement wording is provided.

After a successful action, refresh the workspace and announce the count saved. A conflict or gap stays labeled unresolved/uncertain in Review and the incoming handover; it is never relabeled as supported evidence. The lead must still use the existing approval action before a snapshot is published.

### Team invitations

- A **Team** entry in the project header opens a project-scoped team page.
- Only a project lead can view and manage the team or send invitations.
- The lead enters an email address, chooses `reviewer` or `contributor`, and chooses clearance 1–3. The default is contributor at clearance 1; the lead role cannot be granted through an invitation.
- The team page lists current members with email, role, and clearance, and pending invitations with email, role, clearance, expiry, and delivery state. A lead can resend or cancel a pending invite.
- The invitation recipient receives an email link. After Supabase Auth verifies/signs in the recipient, the recipient sees the project name and role and explicitly accepts. They are added to `project_members` only after acceptance.
- Acceptance requires the authenticated account's verified email to match the normalized invited email. The invite is single-use, project-scoped, and expires after seven days. The Auth link may have a shorter provider-configured lifetime; the lead can issue a fresh link while the invitation remains valid.
- Usernames and username search are out of scope. Email is the account identity.

## Architecture

### Bulk review API and transaction

Add an authenticated project-scoped bulk-review endpoint. It accepts an allowlisted bulk disposition and a bounded array of `{claimId, expectedVersion}` entries; it rejects unknown fields, duplicate IDs, empty lists, oversized batches, and unsupported status/disposition pairs.

The server verifies the caller is a lead or reviewer and derives the actor ID from the verified session. A single PostgreSQL transaction then:

1. Locks the project row and checks no import/extraction mutation lease is active.
2. Locks all requested claim rows in stable ID order.
3. Verifies every row belongs to the project, is visible at the caller's clearance, remains pending, has the expected version, and matches the action's required evidence status.
4. If any row fails validation, rolls back the whole batch and returns a safe conflict or authorization error. No subset is written.
5. Increments each affected claim version once, writes one `review_decisions` audit row per claim with the authenticated actor and a bounded note naming the bulk action, and increments project revision once.

The existing single-decision route and database function remain unchanged. Bulk actions must reuse the same role, clearance, mutation-lock, and audit semantics. Any response includes only saved counts and safe error codes, never source content.

### Invitation records and email verification

Use a private, one-time project invitation record containing project ID, normalized email, role, clearance, inviter ID, created/expiry timestamps, and accepted/cancelled/delivery state. Store only a hash for any application invitation token. Enable RLS and deny browser roles direct table access; only server routes and narrowly granted database functions may access these rows.

Maintain a minimal private identity index keyed by Auth user ID and normalized email, including whether the email is verified, synchronized from `auth.users` by a database trigger. Backfill existing accounts in the migration. The index is not exposed to the Data API; it exists only so the server can resolve an exact email without enumerating the global Auth user list. Deleting an Auth user deletes the index row.

For a new or unverified account, the server generates a Supabase Auth invite link; for an existing verified account, it generates a one-time sign-in link. The server delivers the generated link through configured SMTP. Store no raw action link or one-time token. For a resend, generate a new Auth link and replace the outstanding application token if used. Local development uses Supabase's local mail catcher. A hosted deployment needs working SMTP credentials and the exact confirmation callback URL in Supabase Auth's allowed redirect list.

The Auth confirmation route verifies Supabase's one-time email token using the correct allowlisted Auth type (`invite` or `magiclink`) and writes the verified session through the existing cookie-based server client. It permits only a same-origin invitation-accept destination. A new invitee chooses a password before accepting, so they can use RelayOps' existing password sign-in; an existing account keeps its current password. The accept page calls a server endpoint that verifies the signed-in user's email, invitation state, expiry, and project; one atomic database operation inserts the membership and marks the invitation accepted. A replay, cancelled/expired invite, email mismatch, or duplicate membership does not grant access.

Invitation creation and membership writes remain server-only. Every API route validates input and checks the verified session and project lead membership. The database transaction caps each project at 25 pending invitations and limits each lead to 10 invitation sends per rolling hour; Supabase/Auth delivery limits remain in force as a second layer. Responses do not reveal whether an arbitrary email already has a RelayOps account. Error messages do not expose auth tokens, SMTP errors, or database internals.

### Team view

The project-scoped team page gets its project name and membership context only after the normal server-side project membership check. The server returns only the current project's members and invitations. Email and optional display name are rendered as escaped text. No global account search, username lookup, invitee list, team-wide cross-project view, or lead transfer is added.

## Data model and migration

- Add the private identity index with unique normalized email, email verification state, a foreign key to `auth.users` with `ON DELETE CASCADE`, and an Auth insert/email-update/verification synchronization trigger. Backfill existing Auth users.
- Add the project invitation table with a foreign key to projects, inviter user ID, constrained project role (reviewer/contributor only), clearance check (1–3), unique normalized email per active project invitation, application-token hash where needed, expiry, and delivery/accept/cancel state. Index inviter plus creation time for the rolling-hour send limit.
- Enable RLS and grant no direct table privileges to `anon` or `authenticated`. Grant only the required service-role access and function execution. Revoke default PUBLIC execution on new database functions.
- Do not change the existing `project_members` table's role meanings or alter the review/approval criteria.

## Failure behavior

- A stale claim, permission change, import/extraction lock, or invalid status in a bulk batch yields no writes. The UI asks the user to refresh and retry.
- If invitation record creation succeeds but email delivery fails, retain a non-usable failed-delivery invitation state that the lead can safely retry or cancel. Do not add membership before acceptance.
- A provider rate limit, unavailable SMTP server, invalid redirect URL, or expired link gets a clear recovery message; never display the generated link, token, or SMTP credential in application logs/UI.
- A recipient with a different or unverified email cannot accept; they can sign in using the invited address or ask the lead to resend/cancel.
- A team page or API request by a reviewer/contributor returns a non-leaking unauthorized/not-found response.

## Security and privacy

- Authentication does not imply project access. Every team, invite, accept, and bulk-review route checks exact project membership and role on the server.
- Only a project lead may invite. Invite inputs cannot grant `lead`; role and clearance are validated against explicit allowlists.
- The user identity index and invitation rows are never directly readable from browser roles. A server lead's exact-email invite flow does not return a global user directory or account-existence signal.
- Invite links are short-lived credentials: never log or persist their raw value, never expose them to other team members, and accept them once only.
- Use the authenticated user ID for inviter and reviewer identity; do not trust client-supplied actor IDs.
- Keep SMTP credentials and Supabase service-role/secret keys server-side. Store them only in local environment configuration or deployment secrets.
- Store the minimum email data needed for pending invites, remove cancelled/expired invite records after a short retention period, and cascade-delete identity index records with Auth users.

## Verification and acceptance criteria

1. The three bulk actions list the correct pending counts and affect only their own evidence-status group.
2. Each successful bulk operation creates exactly one append-only decision-history entry per finding, increments every claim version once, increments project revision once, and leaves conflicts/gaps visibly unresolved.
3. A stale version, wrong project ID, low-clearance claim, active project mutation lock, unauthorized role, or invalid status causes the entire batch to roll back.
4. A lead can invite both an existing Auth account and a new email address; the chosen role and clearance match the created membership after acceptance.
5. An invitation cannot be accepted by a different email, reused, accepted after cancellation/expiry, or used to access project data before authentication and acceptance.
6. Only project leads can list, create, resend, and cancel invitations; reviewers and contributors cannot enumerate the team through UI or API.
7. A failed email delivery creates no membership and can be retried without creating duplicate active invitations or users.
8. Local Auth mail is inspectable in Mailpit; deployed SMTP/redirect requirements are documented and clearly surfaced when missing.
9. Accessibility includes keyboard-operable confirmations and invitation forms, named controls, and live status/errors. Review and Team layouts work at desktop and mobile widths.
10. The full automated test suite, typecheck, migration tests, and isolated headless browser flow pass. Browser testing covers a dry-run email-link acceptance using local Auth/Mailpit, and a simulated bulk conflict/rollback. No real-provider email or production membership is mutated during tests.

## Non-goals

- Usernames, public account search, organizations, cross-project team administration, or role/clearance escalation workflows.
- Team invitations to the lead role, transfer of project ownership, or project deletion.
- Automatically resolving conflicts or filling evidence gaps with model output.
- Changing individual review decisions, approval requirements, extraction behavior, or the deployed Render service.
- Sending emails through a third-party API integration. SMTP remains the delivery contract.

## Source references

- Supabase email invitation behavior and existing-account limitation: https://supabase.com/docs/guides/auth/users
- Supabase Admin link generation for custom email providers: https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- Supabase passwordless link and PKCE behavior: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase server-side PKCE callback: https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Supabase SMTP setup: https://supabase.com/docs/guides/auth/auth-smtp
