# GKP Rangkasbitung — website & admin panel rebuild

The functional spec is `docs/rebuild-brief.md`. It is the source of truth: when anything here or in a prompt conflicts with it, follow the brief and point out the conflict. Progress is tracked in `docs/progress.md`; read it at the start of every session and update it at the end.

## Commands
- `pnpm dev` / `pnpm typecheck` / `pnpm lint` / `pnpm build`
- After every module: `pnpm typecheck && pnpm lint && pnpm build` must pass, then walk through the relevant acceptance checks (brief §13).

## Hard rules
- `supabase/migrations/0001`–`0017` are copied from the old app and must NEVER be edited, renamed, or deleted. Schema changes go only in new additive migrations (`0018+`).
- NEVER run `supabase db push`, `supabase db reset --linked`, or any command that writes to the linked/production project. Apply migrations to the local stack (`supabase start`) only. I push to production myself.
- Every page and every mutation checks permissions on the server (`requirePermission` / `requirePermissionApi`). A hidden button is never the security boundary. RLS stays enabled on every table.
- `SUPABASE_SERVICE_ROLE_KEY` is used only in server-only modules (`import "server-only"`), and only for the uses listed in brief §3.
- Never commit `.env*` files. Never invent church facts, member data, schedules, or money figures; use `TODO` placeholders.
- Every successful mutation writes an activity log row (brief §7). A logging failure never breaks the action.
- Multi-step writes go through Postgres functions called via RPC, so they are atomic (brief §12.6).

## Conventions
- All UI text is in Bahasa Indonesia, reusing the labels in the brief. Code, identifiers, and comments are in English.
- "Today" and all default dates are computed in Asia/Jakarta. Date math works on `YYYY-MM-DD` values as UTC calendar dates (brief §11). Use the shared helpers in `lib/dates.ts`; never call `new Date().toISOString().slice(0, 10)`.
- Server Components by default; client components only where interactivity needs them.
- Validate every input on the server with Zod before writing.
- Reuse the shared table pattern (brief §9.2) for every admin list; don't build one-off tables.

## Workflow
- One module per session, in the order listed in `docs/progress.md`. Don't touch other modules.
- If the brief is unclear, ask. Don't simplify or drop behavior.
- Keep diffs focused; don't refactor unrelated code.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
