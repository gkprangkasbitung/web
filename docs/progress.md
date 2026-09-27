# Progress

- [x] 1. Foundation: project setup, migrations copied, generated types, design tokens (light/dark), admin shell, auth (§6), permission helpers (§4), activity log (§7), date helpers (§11)
- [ ] 2. Security: RLS hardening + public functions (§12.1), atomic RPCs (§12.6)
- [ ] 3. Shared table pattern (§9.2)
- [ ] 4. Master data: Tempat, Wilayah, Label Jemaat (§9.8)
- [ ] 5. Data Jemaat + Keluarga (§9.9–9.10)
- [ ] 6. Peribadahan (§9.5)
- [ ] 7. Sarana & Dana (§9.7)
- [ ] 8. Litbang template (§9.6)
- [ ] 9. Warta admin (§9.4) + public site (§8)
- [ ] 10. Pengguna, Roles & Permissions, Log Aktivitas, Profil Saya (§9.11–9.14, §12.3)

## Notes / decisions

### Stage 1 (Foundation), 2026-09-28

**Before deploying to production**
- Push migration `0018_get_my_access.sql` to production **before** deploying the new app. Without it, `getAuthenticatedUser` fails closed: every user signs in with no roles and no permissions.
- `src/types/database.ts` was generated from the **local** stack (`pnpm db:types`, migrations 0001–0018). Regenerate it from the live project once (`supabase gen types typescript --project-id <ref>`) and diff it, to catch any schema drift made outside the migrations.
- Invite emails: `/auth/callback` accepts both `?code=` (PKCE) and `?token_hash=&type=` (verifyOtp). Admin-API invites can only be verified with the token hash, so the Supabase "Invite user" email template should link to `{{ .RedirectTo }}` with `token_hash={{ .TokenHash }}&type=invite` appended. Settle this in stage 10, when the invite flow is built.

**Decisions**
- **0018 `get_my_access()`**: a `security definer` function that returns only the caller's (`auth.uid()`) roles and permissions. It is needed because `roles`, `permissions`, and `role_permissions` are readable only with `roles:read`, so editor and viewer could not load their own access. Execute is granted to `authenticated` only; anon gets `permission denied` (verified).
- **Mutations**: route handlers under `/api/admin/...` per §10, using `requirePermissionApi` and the `ok` / `fail` / `partial(207)` / `parseBody` helpers in `lib/api.ts`. Server Actions are used only for login, logout, and set-password.
- **Next.js 16**: `middleware.ts` is now `src/proxy.ts`. It refreshes the session with `getClaims()` and redirects `/admin*` requests without a session to `/login?next=…`. Pages still verify the user with `getUser()`.
- **Versions**: TypeScript 6.0.3 rather than 7.x, because typescript-eslint supports `<6.1`. ESLint 9.39.5 rather than 10.x, because of the react, import, and jsx-a11y plugin peer ranges. Vitest 3.2.7 + Vite 6.4.3 rather than Vitest 5, because the local Node is 22.2.0 and Vitest 5 / rolldown need Node ≥ 22.12. Upgrading Node to 22.12+ LTS or 24 would allow Vitest 5.
- **shadcn/ui 4.21** (Base UI, "nova" preset). It imports `cn` from the `cn` package, shadcn's own replacement for clsx + tailwind-merge, so those two are not dependencies.
- **Design tokens** live in `src/app/globals.css`. Brief "accent" maps to shadcn `--primary`; shadcn's `--accent` is the subtle hover fill (#F2F1EF / #292524).
  - `--input` (#8A837E light, #78716C dark) is darker than `--border` so input outlines meet WCAG 1.4.11 3:1. The brief's #E7E5E4 / #292524 stay for dividers and cards.
  - In dark mode, text on destructive fills is dark (#0C0A09): white on #F97066 is only 2.79:1.
  - Badges are tinted pills: accent, neutral, destructive, and outline-accent. In dark mode they use a dark tint with light text of the same hue.
  - All text pairs were checked at AA or better.
  - Radius is 8px for controls and 12px for cards. Controls are 36px tall (`h-9`).
- **Dates** (`lib/dates.ts`): `today()` uses Asia/Jakarta. Day math works on UTC calendar dates. Day and month names come from fixed tables, so server and browser render identical strings. ESLint forbids `toISOString().slice(…)`. The DB default `jemaat_catatan_pastoral.tanggal = current_date` is UTC, so the app always sends the date explicitly.
- **Activity log** (`lib/activity-log.ts`): writes through the user's own session client, never the service role, because RLS requires `auth.uid() = user_id`. It never throws. Display labels are in `lib/activity-modules.ts`, which is safe to import on the client. Setting the initial password logs `auth` / "Mengatur password awal".
- **Sidebar**: shows every entry the user may see, even for modules not built yet; those routes 404 until their stage. Sarana & Dana sub-entries are ordered by `name`, because the table has no `sort_order`. Sub-entries are always expanded.
- The service-role client (`lib/supabase/admin.ts`) is not created yet. It is added in stage 10, when invites and account deletion first need it.
- The root page `/` is a TODO placeholder only; the public shell comes in stage 9.

**Local development**
- `pnpm supabase start` runs the local stack; Docker Desktop must be running. `supabase/seed.sql` (local only) creates `superadmin@`, `admin@`, `editor@`, `viewer@`, and `tanpa-role@gkp.test`, all with password `password123`.
- `.env.development.local` points `pnpm dev` at the local stack and overrides `.env.local`, which was left untouched. `pnpm build` still reads `.env.local`.
- Analytics is disabled in `supabase/config.toml`, because the log collector needs the Docker daemon exposed over TCP on Windows.

**Verification (stage 1)**
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` (21 tests) all pass.
- Acceptance 15, end to end against the local stack with a no-JS form post:
  - `/login?next=https://example.com` lands on `/admin`.
  - A forged `next` field (`https://example.com`, `//example.com`) in the form post also lands on `/admin`.
  - `/admin/warta` is kept as a valid `next`.
  - A signed-in visitor to `/login?next=<external>` is sent to `/admin`.
- Acceptance 18 is covered by unit tests: at 05:00 WIB on Sunday 2025-11-30, `today()` is 2025-11-30 and `nextSunday(today())` is 2025-11-30.
- Also checked:
  - `/admin` without a session redirects to `/login?next=…`.
  - The viewer's menu hides Pengguna, Roles & Permissions, and Log Aktivitas; super_admin sees them.
  - Login and Logout rows record the email and IP.
  - An old cookie reused after logout is rejected.
  - `/auth/set-password` without a session and `/auth/callback` with a bad code both go to `/login`.
- **Not verified yet**: the visual check of light, dark, and system themes, the 360px layout, and keyboard-only use. These need a manual look in a browser.
