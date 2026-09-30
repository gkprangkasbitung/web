# Progress

- [x] 1. Foundation: project setup, migrations copied, generated types, design tokens (light/dark), admin shell, auth (§6), permission helpers (§4), activity log (§7), date helpers (§11)
- [x] 2. Security: RLS hardening + public functions (§12.1), atomic RPCs (§12.6)
- [x] 3. Shared table pattern (§9.2)
- [x] 4. Master data: Tempat, Wilayah, Label Jemaat (§9.8)
- [x] 5. Data Jemaat + Keluarga (§9.9–9.10)
- [x] 6. Peribadahan (§9.5)
- [x] 7. Sarana & Dana (§9.7)
- [x] 8. Litbang template (§9.6)
- [x] 9a. Warta admin (§9.4) + Dashboard summaries (§9.3, §12.8)
- [x] 9b. Public site (§8)
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

### Stage 2 (Security), 2026-09-28

**Before deploying to production**
- Push migrations `0019`–`0022` together with `0018`, before deploying.
  - After `0019`, anon can read only published warta and their Litbang and Kesaksian rows. No public page reads anything else yet; stage 9 uses the functions from `0020`.
- Create the first super_admin as described in `docs/bootstrap-super-admin.md`.

**Decisions**
- **0019 RLS hardening**
  - The 11 `*_select` policies that were `using (true)` are dropped and recreated under the same names, now `to authenticated` with `warta:read`. Affected tables: `jemaat`, `keluarga`, `jemaat_labels`, `label_jemaat`, `tempat`, `wilayah`, `peribadahan_*`, `sarana_dana_*`.
    - This conflicts with brief §3 ("never drop or recreate policies"). It was accepted because the project is new and empty, and `0001`–`0017` stay untouched.
    - The unchanged `*_write` policies are `for all`, so `warta:update` still implies read.
  - anon loses every table privilege except `select` on `warta`, `warta_litbang_items`, and `warta_kesaksian_items`. Tables created later still get anon grants from Supabase's default privileges; RLS remains their boundary.
  - `sarana_dana_balances` is now `security_invoker`. It used to bypass RLS.
  - `profiles`: authenticated may update only `full_name` and `avatar_url`. Before, any user could set their own `jemaat_id` or `email` through REST.
    - `jemaat_id` now changes only through `link_user_jemaat`.
    - `email` changes only through the auth trigger.
- **0020 public functions**
  - Three functions:
    - `public_warta_schedule(p_slug)`: the service week.
    - `public_warta_finance(p_slug)`: the finance week, as per-item aggregates in the §9.7 formula, ordered by `name`.
    - `public_jadwal_pekan_ini()`: the Minggu–Sabtu week containing today in Asia/Jakarta, for Beranda and Jadwal Ibadah.
  - A draft or unknown slug returns no rows.
  - All three are SECURITY DEFINER with `search_path = ''`, executable only by anon and authenticated.
  - Shared SQL lives in the `private` schema, which the API does not expose.
  - People appear by name only.
  - `smka_kelompok` is a jsonb array of `{kelompok, pf_nama, laki_laki, perempuan}`. It lists only groups with data (a PF, or an L or P count, 0 included), in the fixed group order.
  - Pages show the ranges with `serviceWeek()` / `financeWeek()` from `lib/dates.ts`, which uses the same arithmetic.
  - The generated types mark every returned column as non-null, but many are nullable (`tempat_nama`, `pelayan_firman_nama`, …). Parse the results with Zod in stage 9.
- **0021 self-lockout guard (§12.3)**
  - Triggers on `user_roles`, `role_permissions`, `roles`, and `permissions` refuse any change that removes one of the acting user's own `roles:*` / `users:*` permissions, unless another of their roles still grants it.
  - The error is `42501` "Tidak bisa mencabut akses roles atau users milik akun sendiri."
  - The triggers cover direct REST writes, not only the RPCs.
  - They stand aside when `auth.uid()` is null (SQL Editor, service role).
- **0022 RPCs.** Each checks the permission explicitly first.

  | Function | Mode | Permission |
  |---|---|---|
  | `set_user_role` | invoker | `users:update` |
  | `link_user_jemaat` | definer (writes `profiles.jemaat_id`) | `users:update` |
  | `set_user_access` | invoker | `users:update` |
  | `set_role_permissions` | invoker | `roles:update` |
  | `create_warta` | definer (the Litbang snapshot must see the whole template) | `warta:create` |
  | `reorder_litbang_categories` | invoker | `warta:update` |
  | `delete_keluarga` | invoker | `warta:update` |
  | `replace_jemaat_labels` | invoker | `warta:update` |

  - Errors for route handlers to map:
    - `42501` → 403
    - `P0002` → 404
    - `23505` → 400 (changed in stage 4 to match brief §10, which lists only 400/401/403/404)
    - `23503` / `22023` → 400
  - Messages are Indonesian.
  - Arguments that default to null are optional in the generated types. Omit them to pass null (for example, no role = "Tidak ada").
  - `set_user_role` on your own account: any real change is refused with "Tidak bisa mengubah role akun sendiri." Saving an unchanged role is a no-op, so `set_user_access` can still update only the jemaat on your own row.
  - `create_warta` inserts the warta and its Litbang snapshot atomically, so the §10 207 "Warta dibuat, tapi gagal menyalin Litbang" can no longer happen. A taken slug raises `23505`; stage 9 retries with a random suffix, up to 5 attempts.
  - Invite (stage 10): `inviteUserByEmail` first, then `set_user_access(user, role, jemaat)` as one transaction. If that call fails, answer 207 "Pengguna diundang, tapi gagal set role/jemaat: …".
  - **Deferred** to their module stages as new migrations, because their parameters depend on the forms:
    - `save_jemaat`: find or create the keluarga case-insensitively, save the profile, and set the labels (stage 5).
    - `update_peribadahan_item` with the SMKA grid (stage 6).

    Whether labels and SMKA keep the §10 207 behavior is decided in those stages.
  - Appends stay in the app. Stage 4 replaced `sort_order = count` with `max + 1` (see there).

**Local development**
- `pnpm test:db` runs pgTAP (`supabase test db --local`) on `supabase/tests/database/*.test.sql`.
  - Each file creates its own fixtures and rolls back, so the tests don't depend on the seed.
  - Never run it with `--linked`.
- `pnpm supabase migration up --local` applies new migrations without a reset.
- `supabase/seed.sql` also adds clearly fictional sample data ("Contoh …"):
  - master data, keluarga, and jemaat with labels and a pastoral note;
  - a published warta for this week and a draft for next week;
  - schedule rows, including SMKA with its grid;
  - opening balances and transactions around the finance week.

  Dates are relative to today in Asia/Jakarta.

**Verification (stage 2)**
- `pnpm test:db`: 5 files, 166 tests, all passing:
  - anon RLS
  - public functions
  - finance formula
  - RPC permissions and happy paths
  - self-lockout guard
- Mutation check: with the `role_permissions` guard trigger dropped, a super_admin's self-removal of `users:update` goes through. The guard tests therefore aren't vacuous.
- REST against the local stack with the anon key:
  - `jemaat`, `keluarga`, `sarana_dana_transactions`, `sarana_dana_balances`, and the schedule and master tables → 42501 (HTTP 401).
  - `warta` → the published row only.
  - `rpc/public_warta_finance` and `rpc/public_warta_schedule` → aggregates and names only. A draft slug returns `[]`.
  - `rpc/set_user_role` → permission denied.
- With real sessions:
  - viewer and super_admin still load the sidebar's categories and Sarana & Dana items;
  - `tanpa-role@` gets none;
  - updating your own `jemaat_id` → 42501, while `full_name` → 204.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` (21 tests) all pass.
- Acceptance 17: the anon half is verified. "`/warta/[slug]` still renders fully" is checked in stage 9.

### Stage 3 (Shared table pattern), 2026-09-28

**Decisions**
- **Libraries**: `@tanstack/react-table` 9.2.4 (v9 API: `useTable` with an explicit `tableFeatures` set, not v8's `useReactTable`) and `react-day-picker` 10.0.1 for the date range calendar. Tests use Testing Library with jsdom 26.1.0, because jsdom 27+ needs Node ≥ 22.12.
  - Vitest runs two projects: `*.test.ts` in node and `*.test.tsx` in jsdom (`vitest.setup.ts` polyfills `ResizeObserver`, `matchMedia`, and `PointerEvent` for Base UI).
- **API**: `useDataTable({ data, columns, getRowId, searchColumns?, initialState?, server? })` returns a controller, and `<DataTable table={controller} label noun canWrite addAction? searchPlaceholder? toolbar? rowActions? isLoading? />` renders it. The same component serves both modes.
  - Columns use `createDataTableColumnHelper<T>()`. Behavior is set through `meta`: `label`, `numeric`, `mono`, `search`, `facet: { title, options, formatValue, emptyLabel, multiple }`, and `className`.
  - Sorting is opt-in per column (`enableSorting: true`). "Unsorted" means the order the data arrived in, for example `sort_order` or newest first.
  - Example column definitions are in `src/components/data-table/testing/columns.tsx`.
- **Sorting**: one column at a time, cycling ascending → descending → unsorted. Text uses `Intl.Collator('id', { sensitivity: 'base', numeric: true })`. Blank values always sort last. `aria-sort` sits on the `<th>`, and the arrow shows only on the active column.
- **Facet counts**: options are the distinct values of **all** loaded rows, so options never disappear while filtering. Each count applies the other active filters but not the column's own (TanStack faceting).
  - Options with 0 matching rows are dimmed but stay selectable.
  - Blank values become the last option, "Tanpa {title}" (for example "Tanpa Wilayah").
  - The accessible name of the trigger is "Filter {title}" ("Filter Wilayah, 2 dipilih"), so it doesn't clash with the "{title}" sort button in the header.
  - `facet.multiple: false` renders a single-select dropdown ("Semua …"). Log Aktivitas's Modul filter will use it, per §9.13.
- **Page resets**: any sort, filter, or search change, and any page size change, returns to page 1. Refreshed data keeps the current page (`autoResetPageIndex: false`). If a delete empties the last page, the table moves back one page.
- **CSV export**: `controller.filteredRows` holds every row matching the filters and search, in the current sort order, across all pages. Stage 5 builds the CSV from it.
- **Server mode**:
  - `useUrlTableState(config)` keeps `page`, `size`, `sort` (`kolom.asc|desc`), `q`, and the filters in the URL. Set filters repeat the param (`module=a&module=b`); date ranges are written `kolom=YYYY-MM-DD~YYYY-MM-DD`. Other params such as `?error=` are kept.
  - The server page parses the same URL with `parseTableSearchParams(searchParams, config)`. Sort columns are whitelisted, `size` must be 10, 20, 50, or 100, and invalid values fall back to the defaults.
  - Search input is debounced by 300 ms, and skeleton rows show while a page loads.
  - The whole-day WIB bounds for timestamps come from `jakartaTimestampBounds(range)` in `lib/dates.ts`.
- **Row actions**:
  - `rowActions: { getRowLabel, edit?: { href | onSelect }, extra?: RowAction[], delete?: { title, description?, onConfirm, hidden? } }`.
  - In read-only mode (`canWrite = false`), "Edit" becomes "Lihat", and "Hapus" and `extra` actions marked `write: true` disappear. The add action appears in the empty state only when `canWrite` is true.
  - When `onConfirm` rejects, the dialog stays open; the module shows the toast.
  - The "⋯" button is hidden only under `@media (hover:hover) and (pointer:fine)`, until the row is hovered or focused.
- **Numeric columns** (numbers, money, dates) are right-aligned in Geist Mono with `tabular-nums`, as decided on 2026-09-28.
- **Shared inputs**:
  - `ConfirmDialog`: focus starts on "Batal"; a spinner shows on "Hapus" while working, and the dialog can't be dismissed until the action finishes.
  - `DateRangeFilter`: a popover calendar, `id` locale, weeks starting Minggu, "today" in WIB. Its value is `{ start?, end? }` as `YYYY-MM-DD`, with the end date inclusive.
  - `MoneyInput`: `number | null`, and a hidden input when `name` is set.
  - `PhoneInput`: digits only, stored as a string.
  - New helpers: `lib/digits.ts`, plus `formatDateCompact`, `jakartaDayStart`, `jakartaTimestampBounds`, `isoDateToLocalDate`, and `localDateToIsoDate` in `lib/dates.ts`.
- **shadcn**: added `table`, `popover`, `alert-dialog`, `select`, and `calendar`.
  - The `select` trigger was changed from h-8 to h-9, to keep 36px controls.
  - `DropdownMenuLinkItem` (Base UI `Menu.LinkItem`) was added to `dropdown-menu.tsx`.
- **Dev-only demo** at `/admin/dev/tabel` (`page.dev.tsx`):
  - `next.config.ts` adds the `dev.tsx` page extension only outside production, so `pnpm build` doesn't include the route at all (confirmed in the build's route list). The page also calls `notFound()` in production.
  - It is not in the sidebar and needs a login.
  - It shows a client table with 57 fictional "Contoh" rows, with toggles for read-only mode, loading, a failing delete, empty data, and export. It also shows a server-mode table backed by a fictional log (URL params, a 400 ms simulated latency) and the three inputs.

**Verification (stage 3)**
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` (51 tests, 8 files) all pass.
- The table tests cover:
  - the sort cycle, and blanks last in both directions;
  - facets AND column search, counts per option, sort keeping the filters, and Reset;
  - page size returning to page 1, and the "{from}–{to} dari {total}" text;
  - export rows being the whole filtered set;
  - the empty and read-only states;
  - keyboard-only sort, row menu, and confirmation dialog.
- Other tests cover `ConfirmDialog`, `MoneyInput`, `PhoneInput`, the URL codec, and the date bounds.
- Mutation check: making sorting start descending fails 3 tests, and removing the reset to page 1 on a page size change fails 1.
- **Not verified yet**: the visual check of the demo page in light and dark mode, at 360px, and with the keyboard in a real browser.
  - While checking, `.env.development.local` was found to set `NEXT_PUBLIC_SUPABASE_URL` to a `*.supabase.co` project, not the local stack described in stage 1.
  - Because of that, the page was only confirmed to exist under `next dev` (without a session it redirects to `/login?next=/admin/dev/tabel`), and no request was made to that project.

### Stage 4 (Master data: Tempat, Wilayah, Label Jemaat), 2026-09-28

**Decisions**
- **Shared mutation pattern** (`lib/api-mutation.ts`), for every module from now on:
  - `mutation({ permission, params?, schema?, status?, notFound?, run })` returns a route handler. The order is fixed:
    1. `requirePermissionApi` (401 / 403)
    2. route params through Zod (a mismatch, such as a malformed uuid, is a 404)
    3. the JSON body through Zod (400 with the first issue's message)
    4. `run`
    5. `logActivity` (never throws)
    6. `revalidatePath` for each target
    7. `{ data }`
  - `run` returns `{ data, log: { module, activity }, revalidate? }`. To fail, it throws `ApiError(status, message)` or `dbError(error, { unique, notFound, inUse })`. Any other error is logged to the console and answered with a generic 500. Raw database text never reaches the client.
  - `dbError` mapping:
    - `23505` → 400 `unique`
    - `23503` → 400 `inUse`
    - `42501` → 403
    - `P0002`, `PGRST116`, `22P02` → 404 `notFound`
    - `22023`, `23502`, `23514` → 400
    - anything else → 500
  - Zod helpers in `lib/validation.ts`: `requiredText(message, max)` (trimmed, not empty), `optionalText(max)` (trimmed; empty becomes null), and `idParams`.
  - On the client, `apiFetch` / `errorMessage` in `lib/api-client.ts` return `data` or throw with the server's message. The caller shows a toast and calls `router.refresh()`. `apiFetch` doesn't surface a 207's `error` yet; add that in the first stage that answers 207.
  - Update and delete use `.select().maybeSingle()`, so a missing row (or one RLS hides) is a 404. Delete takes the name for the log from the deleted row.
- **Master data** shares one config per module (`lib/master-data.ts`):
  - the route factories in `lib/master-data-routes.ts`;
  - `MasterDataPage` (server) and `MasterDataManager` (client) in `components/master-data/`.
  - Route files under `app/api/admin/{tempat,wilayah,label-jemaat}` only wire the config.
- **`sort_order`**: new rows get `max(sort_order) + 1` (0 when empty), not the row count. This departs from the wording of brief §11 but follows its intent, "new rows go last", and was approved on 2026-09-28.
  - After a delete, the count can fall below an existing value. For example, with 0,1,2,3, deleting 0 and 1 makes the count 2, and the new row would land before 3.
  - The default order is `sort_order, created_at, id`. Two concurrent adds that get the same value both stay last, in insertion order. No migration is needed.
- **Labels are unique case-insensitively** in the app (approved): an `ilike` check with LIKE wildcards escaped, excluding the row itself, so "Pendeta" and "pendeta" can't both exist.
  - The DB constraint stays case-sensitive; a concurrent exact duplicate still raises `23505`, which gets the same message, "Nama label sudah digunakan."
  - Tempat and wilayah names are not unique (the brief doesn't ask for it).
- **Foreign keys** already match §9.8, so there is no migration:
  - `peribadahan_items.tempat_id`, `peribadahan_items.wilayah_id`, and `jemaat.wilayah_id` are set null;
  - `jemaat_labels.label_id` cascades.
  - FK actions ignore RLS, so an editor's delete clears them too (pgTAP-tested).
- **Activity sentences**:
  - `Menambah tempat "…"`, `Mengubah tempat "…"`, `Mengubah tempat "Lama" menjadi "Baru"` (on rename), and `Menghapus tempat "…"`.
  - Wilayah uses `wilayah`, and labels use `label jemaat`.
  - Modules are `tempat`, `wilayah`, and `label_jemaat`.
- **UI**:
  - All columns are sortable and have column search; for Wilayah and Label the brief doesn't say.
  - The edit dialog is titled with the record name. Read-only users get "Lihat" with disabled fields and "Tutup".
  - Delete dialogs are `Hapus tempat/wilayah/label "{nama}"?` and state what gets cleared.
  - Revalidation covers the list page plus the layouts that show the data: peribadahan and warta, plus jemaat and keluarga for wilayah, and jemaat for labels.
- **shadcn `dialog`** was added, with its close label translated to "Tutup".
- **Sidebar**: unchanged; the entries were already there in §9.1 order with `warta:read`.

**Local development**
- `pnpm test:integration` (`vitest.integration.config.ts`, `tests/integration/`) runs route handlers in-process against the local stack as real seeded users.
  - `next/headers` is backed by a cookie jar filled by a real sign-in; `next/cache` is mocked.
  - It reads the URL and key from `supabase status` and refuses anything that isn't `127.0.0.1` / `localhost`.
  - Activity rows it writes stay, because the table is append-only; the other rows it creates are deleted afterwards.
  - It is kept out of `pnpm test` because it needs the stack.

**Verification (stage 4)**
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- `pnpm test`: 93 tests, 12 files.
  - `mutation` / `dbError` / `logActivity` unit tests.
  - Permission checks per route.
  - `MasterDataManager` in jsdom: add, inline error, edit title, delete confirmation, and read-only mode.
- `pnpm test:db`: 6 files, 193 tests, including the new `master_data.test.sql`:
  - viewer reads but can't write;
  - editor writes;
  - FK clearing and cascade;
  - `23505`.
- `pnpm test:integration`: 20 tests. For each of the three modules:
  - no session → 401;
  - viewer → 403 on add, edit, and delete, with nothing written;
  - blank name → 400;
  - missing or malformed id → 404;
  - add goes last;
  - exactly one `activity_logs` row per mutation, with the right module, sentence, email `editor@gkp.test`, and the forwarded IP.

  Also:
  - label duplicates (exact, other case, padded, on rename, and two concurrent adds) → "Nama label sudah digunakan.";
  - deleting a tempat or wilayah used by `peribadahan_items` leaves the row with `tempat_id` / `wilayah_id` null.
- Mutation checks:
  - Making POST need only `warta:read` fails 3 unit tests. The integration tests alone still pass, because RLS also refuses the viewer (`42501` → 403).
  - Removing the case-insensitive label check fails 1 integration test.
- **Not verified yet**: the pages in a real browser (light and dark, 360px, keyboard).
  - Another `next dev` was already running for this folder on :3000, pointed at the `*.supabase.co` project, and Next 16 allows only one dev server per folder. It was left alone, and no request was made to that project.


### Stage 5 (Data Jemaat + Keluarga), 2026-09-28

**Decisions approved before starting (asked, not decided alone)**
- **"Tambah Anggota" and other families**: the picker shows every jemaat not already in *this* family, including people already in another family (brief §9.10's own wording), and picking one moves them. Approved with a warning: the picker/form shows which family they'd be moved out of, and a confirmation ("akan dipindahkan dari keluarga X") is required before the move is submitted.
- **Kepala Keluarga**: enforced at one per family (the brief doesn't set this rule). Enforced in the database with a partial unique index (`jemaat_satu_kepala_keluarga` on `jemaat(keluarga_id) where hubungan_keluarga = 'Kepala Keluarga'`), so it holds for every write path (`save_jemaat`, `set_jemaat_keluarga`, and any future one), not just the ones the app happens to check. Message: "Keluarga ini sudah punya Kepala Keluarga."

**0023 migration**
- `keluarga_nama_lower_idx`: unique index on `lower(nama)`, catching case-only duplicates that the existing case-sensitive constraint (0017) doesn't. Both stay; the case-sensitive one is now redundant but harmless.
- `save_jemaat(...)`: one atomic RPC for both create and edit (`p_id` null = create). Resolves `keluarga` by name case-insensitively (creates it if unmatched, races handled by catching the unique violation and re-selecting), clears `hubungan_keluarga` when the family name is blank, checks Kepala Keluarga and `nomor_anggota` uniqueness with clean pre-checks *and* a fallback that catches the underlying constraint by name (never leaks raw constraint text), then calls the existing `replace_jemaat_labels` to set labels. Because it's fully atomic, save_jemaat can never partially fail the way the brief's §10 207 describes — same reasoning as `create_warta` in stage 2 has this pattern. **This module never returns a 207.**
- `set_jemaat_keluarga(p_jemaat_id, p_keluarga_id, p_hubungan_keluarga)`: one RPC behind three UI actions — "Tambah Anggota" (both set), the inline hubungan edit (same family, new hubungan), and "Keluarkan" (both omitted/null). Keeps the Kepala Keluarga check in one place regardless of which action calls it.
- `rpcError` added to `lib/api-mutation.ts` next to `dbError`: unlike `dbError`, it forwards the RPC's own message for 42501/P0002/22023/23503/23505, because every message these two RPCs raise is hand-authored Indonesian text, not raw Postgres text. Route handlers for future RPC-backed mutations (Peribadahan's SMKA grid, stage 6) should use the same helper rather than `dbError`.
- Both RPCs and the new indexes are covered by `supabase/tests/database/jemaat_keluarga.test.sql` (30 tests): permission checks, family resolve/reuse/race, blank-name clears hubungan too, Kepala Keluarga rejected and allowed-on-no-change, nomor_anggota uniqueness, and all three `set_jemaat_keluarga` actions.

**Routes and data loading**
- `lib/jemaat-routes.ts` / `lib/keluarga-routes.ts`: the `mutation()` pattern from stage 4, same as master data. Lists are loaded with plain per-table queries joined in TypeScript (`Map` lookups) rather than PostgREST embedding, to keep the return types exact without fighting the generated embedding types — jemaat and keluarga are both small, fully-loaded tables anyway (brief §9.2).
- `penulis_id`/`penulis_nama` on a pastoral note: the Zod schema for the create route has no such fields at all, so a client-sent value is dropped before it ever reaches the handler; the server always sets them from the session user.
- Deleting a jemaat is a plain `delete` (not an RPC): the FKs already do the right thing (cascade for labels/notes, set null everywhere else per brief §9.9), so there's nothing multi-step about it.

**UI**
- Added `combobox.tsx`, `input-group.tsx`, and `textarea.tsx` under `components/ui`, generated from `shadcn add combobox` (Base UI's own `Combobox` primitive) but **hand-copied**, not run directly — the CLI would have overwritten `button.tsx`/`input.tsx` with un-customized defaults (h-8 controls, no `icon-sm`), clobbering the stage-1 36px control convention. Heights in the copied files were adjusted from `h-8`/`min-h-8` to `h-9`/`min-h-9` to match.
- `components/shared/person-picker.tsx` (brief §9.5, reusable): searchable combobox over jemaat, matching name or any label, each option showing its labels. Used now in Keluarga's "Tambah Anggota"; will be reused for Peribadahan's person fields in stage 6.
- `components/shared/keluarga-combobox.tsx`: a *creatable* combobox — the typed text is the value (submitted and resolved server-side by `save_jemaat`), suggestions are just existing families. The brief's "Tidak ditemukan - buat dulu di halaman Keluarga" empty-state text is informational only; per §9.9's own description of the server behavior, typing a new name and saving still creates the family.
- `components/shared/label-multi-select.tsx`: multi-select combobox with chips, over Label Jemaat.
- `components/shared/date-picker.tsx`: single-date version of the existing `DateRangeFilter`, for Tanggal Lahir/Masuk and pastoral note dates.
- Avatar palette: 6 tokens (`--avatar-1`..`--avatar-6` + `-foreground`) added to `globals.css`/`@theme inline`, light and dark. `avatarColorIndex(name)` in `lib/format.ts` picks one deterministically (simple string hash mod 6); `InitialsAvatar` uses it instead of the flat neutral badge color it had before.
- Status badges use exactly the brief's own example: Simpatisan `outline-accent`, Baptis Anak `accent`, Sidi and Anggota Penuh both `neutral`.
- "Anggota Keluarga" on the jemaat detail page is a plain list, not the shared `DataTable`: it has no sort/filter/search/pagination need (brief just asks for name, hubungan, and status), so the table pattern would be pure overhead there. Catatan Pastoral and the Keluarga members table *do* use `DataTable`, since they're real lists.
- CSV export (`lib/csv.ts`) runs entirely in the browser from `table.filteredRows`; formula-injection prefixes (`=`, `+`, `-`, `@`, tab, CR) get a leading `'` before the cell is quoted. BOM prepended in `downloadCsv`.

**Verification (stage 5)**
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass; all 26 routes (list/detail pages + the new API routes) show up in the build's route list.
- `pnpm test`: 96 tests, 13 files (adds `lib/csv.test.ts`: quoting, formula-injection escaping; BOM is `downloadCsv`'s job so untested here since it needs a browser).
- `pnpm test:db`: 7 files, 223 tests (30 new, see above).
- `pnpm test:integration`: 2 files, 35 tests. New file `jemaat-keluarga.test.ts` (15 tests) covers, against the real local stack: 401/403 on every route; create resolves/reuses a family case-insensitively; label replacement is all-or-nothing (an unknown label id in the set leaves the old set intact); Kepala Keluarga rejected through the HTTP route with the friendly message; a pastoral note's `penulis_nama`/`penulis_id` sent by the client are silently ignored; deleting a jemaat removes their notes and clears a schedule reference; keluarga name uniqueness (case-insensitive) through HTTP; deleting a family detaches members; add/inline-edit/"Keluarkan" each log exactly one activity row with the right sentence; "Tambah Anggota" can move someone out of another family.
- **Not verified yet**: everything that needs an actual browser — light/dark/360px/keyboard-only use in general (per stages 1, 3, 4), and specifically the three new Base UI Combobox-based components (person picker keyboard nav and label matching, label chips add/remove, the keluarga creatable combobox's fill-on-select behavior). These were built directly against Base UI's documented prop types and exercised only through typecheck/build/integration tests, not in a live browser session.

### Stage 6 (Peribadahan), 2026-09-28

**Decisions approved before starting (plan and questions asked, not decided alone)**
- **Search on `/admin/peribadahan`**: server-side via a new RPC (`search_peribadahan_item_ids`), not a client `globalFilter` and not a hand-built PostgREST `.or()` string. Reasons: `catatan` and `bahan_alkitab` are never rendered as columns on that page (only `tema`/`dpa` are, merged into "Ringkasan"), so a client-side filter over rendered cell text can't reach them; and `.or()` built from user input is unsafe because commas/parentheses in the value can inject extra filter conditions. `p_search` is a genuine bound RPC parameter (not string-concatenated into a filter), so only `%`/`_` need escaping (`escapeLike`, already in `lib/api-mutation.ts`) — commas and parentheses need no special handling. The rest of the page (facets, sort, the date-range filter, pagination) stays client-side per §9.2's "bounded list" model: the Server Component reloads via `?q=` (a plain `router.replace`, no `useSearchParams`/`useUrlTableState`, so no Suspense boundary is needed — `searchParams` comes in through the page prop instead), and the returned (possibly narrowed) row set is handed to `useDataTable` in client mode as usual.
- **`DataTable` extended with `meta.facetOnly`** (`features.ts`, `data-table.tsx`): a column that feeds a toolbar facet without its own header/body cell. Needed because the brief's "Ringkasan" column merges Tempat/Wilayah/Tema/DPA into one string, but "Wilayah and Tempat facets" still need to filter on the raw, unmerged value — TanStack faceting needs a real column with that accessor, but showing Tempat and Wilayah as their own visible columns too would defeat the point of Ringkasan. `facetOnly` columns are excluded from the rendered header/body but still counted for `getFacetedUniqueValues()`. Backward-compatible: every existing column (no `facetOnly` set) renders exactly as before (confirmed: stage 3's `data-table.test.tsx`, 9 tests, still passes unchanged).
- **Fields outside a row's category layout are always nulled by the server**, never rejected with 400. The category is fixed at creation and only known once the row is fetched inside the mutation's `run()` (after Zod validation already ran), so a per-category *strict* Zod schema isn't reachable in the existing `mutation()` pipeline. One superset schema (every field optional) is used for `PATCH`, and `run()` forwards only the fields the row's `layoutFor(key)` allows to the RPC; everything else becomes `undefined` (Postgres default `null`) regardless of what the client sent. The add/edit forms only ever render applicable fields anyway, so this is defense in depth, not the primary path.
- **DatePicker extended with `minDate`/`maxDate`** (inclusive; `react-day-picker`'s `{ before }`/`{ after }` matchers), and `JadwalDialog` (the "Tambah Jadwal" dialog) takes optional `minDate`/`maxDate`/`defaultDate` so stage 9 can reuse it inside a warta's Bidang Peribadahan (brief §12.5: any date in the service week, default the kebaktian date) without copying the dialog.
- **Waktu is optional** on "Tambah Jadwal" (only Tanggal is required) — the brief doesn't mark it "(required)" the way Warta's Tanggal Kebaktian is, `jam` has no `not null` constraint, and it fits the "fill in the rest via Edit" spirit of the dialog.
- **`sort_order` = count of rows already on that date, across every category** (not per-category) — matches the brief's literal wording (§9.5, §11) and the fact that a warta's service-week list and the public page both order "by date then `sort_order`" across categories on the same day. This is a plain two-step insert (select count, then insert), not an RPC: the same accepted race as master data's appends (stage 4) — two concurrent adds on the same date can get the same `sort_order` and just stay in insertion order.

**0024 migration**
- `update_peribadahan_item(...)`: one RPC, security invoker, for every category. It does a full-column `update` of the general fields (whatever the caller passes, defaulting to `null` — the per-category nulling happens in the TypeScript layer before the call, as decided above) and, only when the row's category is `smka`, upserts its 8-row grid (`insert ... on conflict (item_id, kelompok) do update`) in the same transaction. It doesn't re-derive the per-category field list in SQL — that would duplicate `lib/peribadahan.ts` — except for the one thing only the database can enforce atomically: the SMKA grid must be exactly 8 known groups (raises `22023` otherwise), and `pf_id` is always stored as `null` for `guru_sekolah_minggu`/`orang_tua` no matter what's sent, since those two groups have no PF. Negative attendance (either the general fields or inside the grid) is rejected with `22023` and a friendly message before it can reach the new check constraints below — `rpcError` (stage 5) doesn't map `23514`, so relying on the constraint alone would surface as a raw 500.
- `search_peribadahan_item_ids(p_search text) returns table (id uuid)`: security invoker (so RLS applies exactly as it would to a direct read — a user without `warta:read` gets nothing, not an error), matches `tema`/`dpa`/`catatan`/`bahan_alkitab` case-insensitively.
- New check constraints: `peribadahan_items.kehadiran_laki_laki/perempuan/anak >= 0` and `peribadahan_smka_kelompok.laki_laki/perempuan >= 0` (both nullable-safe) — the DB floor the brief asks for, underneath the RPC's own check and the client's Zod validation.

**Routes and data loading (`lib/peribadahan.ts`, `lib/peribadahan-routes.ts`)**
- `lib/peribadahan.ts` is the single category-layout config (key → fields, attendance, notes label, Liturgos label), with `umum` as the fallback for an unknown key. It's imported by the Zod nulling logic, the edit dialog's conditional fields, and the category page's column builder — never duplicated.
- Loaders join `tempat`/`wilayah`/`peribadahan_categories`/`jemaat` names in TypeScript (`Map` lookups), the same pattern as stage 5's jemaat/keluarga loaders, for the same reason (small, fully-loaded tables; exact return types without fighting PostgREST embedding types).
- SMKA groups are loaded for **every** SMKA row on both `/admin/peribadahan` and `/admin/peribadahan/[key]`, not only the category page — editing an SMKA row from the all-categories list needs its grid prefilled too, so both loaders call the same `loadSmkaGroups` helper.
- Person pickers reuse `listPeopleForPicker`/`PersonPicker` from stage 5 as-is; no new picker code.
- "Tambah Jadwal" and "Hapus" are plain insert/delete through `mutation()` (not RPCs) — same reasoning as `deleteJemaat` in stage 5: nothing about either is genuinely multi-step.
- Category lookup by `key` returning no row means the key doesn't exist in the database at all → the page 404s. A key that *does* exist but has no matching entry in `PERIBADAHAN_LAYOUTS` falls back to the `umum` layout instead (the brief's two separate rules: routing validity vs. layout fallback).

**UI**
- One `PeribadahanManager` (`components/peribadahan/`) serves both `/admin/peribadahan` (scope `"all"`) and `/admin/peribadahan/[key]` (scope `"category"`), building different columns per scope rather than two near-duplicate table components.
- `JadwalDialog` and `EditJadwalDialog` reset their state by remounting (`key={addKey}` bumped on every "Tambah Jadwal" click; `key={editRow?.id}`) instead of an effect that calls `setState` — matches `react-hooks/set-state-in-effect` and the existing "keep the row while closing" convention (stages 4-5): the parent never clears `editRow` back to `null` on close, only when a new row is picked.
- `SmkaGrid` is its own component (8 fixed rows, PF picker only for the 6 kelas rows) so it composes cleanly inside `EditJadwalDialog` rather than inlining the grid markup there.
- Delete confirmation: `Hapus "{kategori} · {tanggal panjang}"?`, per brief. Activity sentences follow the brief's own example literally — the category name is **not** quoted (`Menambah jadwal Kebaktian Minggu tanggal 2025-11-30`), unlike jemaat/master-data sentences which do quote the name.

**Local development**
- Migration `0024_peribadahan_rpcs.sql` applied to the local stack (`pnpm supabase migration up --local`) and types regenerated (`pnpm db:types`).

**Verification (stage 6)**
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass; `/admin/peribadahan`, `/admin/peribadahan/[key]`, and their two API routes show up in the build's route list.
- `pnpm test`: 109 tests, 15 files (adds `lib/peribadahan.test.ts`: the layout table matches the brief's per-category columns exactly; `jadwal-dialog.test.tsx`: the Tanggal default under mocked system time, both at 05:00 WIB on a Sunday and 23:00 WIB on a Saturday, brief §13 #18).
- `pnpm test:db`: 8 files, 251 tests (28 new, `peribadahan.test.sql`): who may call `update_peribadahan_item`/`search_peribadahan_item_ids`; a signed-in user without `warta:read` gets zero search results (RLS, not a function-level check); general fields save and only those; negative attendance rejected and nothing changed; the SMKA grid's every rejection path (no grid, too few groups, an unknown key, a duplicate key, a negative count inside the grid) leaves all 8 rows unwritten; a valid grid saves all 8, re-saving upserts rather than duplicating, and a PF sent for Guru Sekolah Minggu/Orang Tua is ignored; a search string built to look like an injection (`'tema),(select 1) --'`) causes no error; both check constraints reject a direct negative write.
- `pnpm test:integration`: 3 files, 46 tests. New file `peribadahan.test.ts` (11 tests): 401/403 on every route with nothing written; an unknown Jenis is rejected; `sort_order` is the row count on that date across two different categories; a category's disallowed fields (tested on Kebaktian Pria: no Wilayah field, only Laki-laki attendance) are nulled even when the client sends them; a negative attendance count is rejected before the database; 404 for a missing/malformed id; the SMKA grid saves atomically through HTTP and an incomplete one writes nothing; delete cascades the SMKA grup and logs one row; and — exercising the real `escapeLike` + RPC path via `loadPeribadahanOverview` — a literal `%`/`_` in the search text matches only literally (a regression guard: if escaping broke, "A%B" would wrongly match "AXB" as a wildcard), while a comma-and-parenthesis-laden search string causes no error.
- **Not verified yet**: an actual browser (light/dark, 360px, keyboard-only use, and specifically the SMKA grid's layout and the two DatePicker/PersonPicker-heavy dialogs). A `next dev` for this folder was already running on :3000 against the `*.supabase.co` project from `.env.development.local` (the same pre-existing mismatch stage 3 and 4 found and left alone), and Next 16 allows only one dev server per folder, so no new one was started and no request was made to that project.

### Stage 7 (Sarana & Dana), 2026-09-29

**Decisions approved before starting (plan and questions asked, not decided alone)**
- **The one finance-report formula turned out to already be centralized.** `private.sarana_dana_report` (stage 2, 0020) was already the single core function — `public_warta_finance` already called it rather than computing its own copy. So the "refactor" brief §9.7/12.6 asks for (only if the stage-2 function computed it itself) wasn't needed; the only new piece is `public.sarana_dana_report(p_start, p_end)`, an admin-facing wrapper with an explicit `warta:read` check, added now so it exists for the warta finance tab in stage 9, and tested for exact numeric agreement with `private.sarana_dana_report` even though no stage-7 page calls it yet (the ledger only needs the running balance and a plain transaction list, not a period report).
- **Money rules are enforced with a trigger, not a rewritten column type.** `jumlah` stays `numeric(14,2)` (0008); a new check constraint (`jumlah = trunc(jumlah) and jumlah >= 0 and jumlah <= 10000000000`) rejects decimals and bounds the value, without risking a silent rounding of bad data the way `alter column ... type numeric(14,0)` could. Ceiling: **Rp 10,000,000,000** (10 billion), generous enough for a real large transaction (e.g. a building fund) while catching an obvious typo.
- **"Selalu"/"dipaksa" (Persembahan Bulanan's tipe, and jemaat_id) are silently corrected by a `before insert or update` trigger, not rejected** — the brief's own wording implies normalization, and the test list explicitly allows either outcome ("tersimpan sebagai masuk **atau** ditolak"). **`item_id` changing is rejected** (`22023`), since "can't be changed" has no sensible silent correction. Because the DB is the actual enforcer, the Next.js route handlers never re-derive these rules in TypeScript: they forward the Zod-validated input as-is and `.select()` the row back after writing, so the response (and the activity log line built from it) always reflects what the trigger actually stored.
- **`saldo_awal` gets no new integer constraint.** The brief's whole-number rule is stated for `jumlah` (transactions), not the opening balance, and the "Saldo Awal" field is already a `MoneyInput` (digits only), so the UI can't produce a fractional value in the first place.
- **Items can't be added or removed, enforced at the RLS layer too.** `sarana_dana_items_write` ("for all", 0003) is replaced by `sarana_dana_items_update` ("for update" only) — same accepted pattern as 0019's policy replacements on tables from earlier migrations. No policy covers insert/delete, so both are refused for every role, not just hidden from the UI.
- Ledger's default sort: **tanggal terbaru dulu**, matching every other dated-record module (Warta, Peribadahan, Log Aktivitas).
- Ledger's date-range filter default (no `?tanggal=` in the URL): **no filter, every transaction loads**.

**0025 migration**
- `sarana_dana_transactions_jumlah_bounds_check`: named this (not `..._jumlah_check`) because Postgres had already auto-named 0008's inline `check (jumlah >= 0)` exactly `sarana_dana_transactions_jumlah_check` — the first migration attempt collided with it and had to be renamed (harmless naming accident, not a partial-apply issue; confirmed via `\d sarana_dana_transactions`).
- `private.enforce_sarana_dana_transaction_rules()` (trigger function, in the `private` schema per its own stated purpose: "internal helpers for ... triggers"): the three rules above, in one `before insert or update` trigger.
- `sarana_dana_items_update` replaces `sarana_dana_items_write`.
- `public.sarana_dana_report`: **security definer** (not invoker, despite the initial plan saying invoker) — `private` is revoked from `public` (0020), so an invoker call from `authenticated` failed with "permission denied for schema private" the first time it was tested against a real session. Definer is safe here the same way it is for `public_warta_finance`/`create_warta`: the permission check (`warta:read`) runs first, before anything the elevated privilege could expose.

**Routes and data loading (`lib/sarana-dana.ts`, `lib/sarana-dana-routes.ts`)**
- `lib/sarana-dana.ts`: `PERSEMBAHAN_BULANAN_KEY`, `formatSignedJumlah` (the "+"/"−" prefix), and the ledger's `?tanggal=start~end` URL codec (a small hand-rolled pair, not the shared `DataTableState` machinery — same choice as stage 6's `?q=` search, since this page's URL state isn't a full table-state story).
- `updateSaranaDanaItem` (`PATCH /api/admin/sarana-dana/[id]`) serves **two** different UI actions (Overview's Edit-Keterangan dialog, and the ledger's inline Saldo Awal field) through one endpoint: the Zod schema keeps `keterangan`/`saldoAwal` genuinely optional (not defaulted to `null` the way `optionalText` normally would), so `run()` can tell "the client didn't send this field" from "the client cleared it," and only ever writes the field(s) actually sent. The activity sentence picks between "Mengubah keterangan …" and "Mengubah saldo awal … menjadi …" based on which field was present.
- Transaction routes are `/api/admin/sarana-dana/[id]/transactions` and `.../[transactionId]`, matching brief §10's reference shape exactly (`id` = the item's own uuid, English "transactions"). **This isn't just brief-following for its own sake**: an initial version used `/[key]/transaksi/[id]` (the item's slug, Indonesian segment name, mirroring Peribadahan's `categoryKey` pattern) — that built and typechecked fine, but crashed `next dev` at startup with "You cannot use different slug names for the same dynamic path ('id' !== 'key')", because `/api/admin/sarana-dana/[id]` (the item PATCH route) and `/api/admin/sarana-dana/[key]/...` are siblings under the same parent directory, and Next.js's App Router requires every dynamic segment at one position in the tree to share one param name. `pnpm build` didn't catch it either (its own error only surfaced once someone ran `next dev`; the router's route-tree validation runs at dev/build-server construction, not sanity-checked by `tsc` or `eslint`). Fixed by adopting the brief's own `[id]` naming throughout, which sidesteps the conflict and needed no special-casing: `createTransaction`/`updateTransaction`/`deleteTransaction` now look the item up by `id` directly (simpler than the old `key` lookup, one indexed PK read instead of a `key` filter).

**UI**
- `TransactionsTable` (`components/sarana-dana/`) is a fully self-contained component — its own "Tambah Transaksi" button, add/edit dialogs, and delete confirm — built to be dropped into different containers rather than assuming a page owns a `PageHeader` action slot the way Peribadahan's manager does. It takes an optional `toolbar` node (the ledger page passes its `DateRangeFilter` there) and optional `minDate`/`maxDate` (unused this stage; for the warta finance tab in stage 9). `TransactionDialog` is **one** component for add and edit (unlike Peribadahan's two), since the brief states the edit dialog has exactly the same fields as add.
- Both dialogs (`TransactionDialog`, `KeteranganDialog`) reset by remounting on a fresh `key` from the parent (a bumped counter for "add," the row's id for "edit"), not a `useEffect` that calls `setState` — same reasoning as stage 6 (avoids `react-hooks/set-state-in-effect`, and matches the established "keep the row while closing" convention).
- Jumlah's "+"/"−" prefix is the primary signal for masuk/keluar; color (`text-destructive` for pengeluaran) is secondary only, per brief §9.7's own accessibility note.

**Local development**
- Docker Desktop and the local Supabase stack weren't running at the start of this session; both were started before any migration work. Mid-session, Docker's own container state got into a conflicted spot (a stale `supabase_kong_...` container blocked a restart) — resolved with a plain `supabase stop` + `supabase start`, which restored from the persisted local backup (all migrations through 0024 intact) before 0025 was applied.
- Migration `0025_sarana_dana_rules.sql` applied via `pnpm supabase migration up --local`; the `security definer` fix (found via a failing pgTAP run, not by the plan) was pushed to the live local DB directly with `psql` mid-session and folded back into the migration file so a fresh clone gets it correctly the first time.

**Verification (stage 7)**
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass; `/admin/sarana-dana`, `/admin/sarana-dana/[key]`, and the three new API routes show up in the build's route list.
- `pnpm test`: 115 tests, 17 files (adds `lib/sarana-dana.test.ts`: the +/− formatter, the `?tanggal=` codec round-tripping and rejecting bad input; `transaction-dialog.test.tsx`: Tanggal defaults to today under a mocked Sunday-05:00-WIB clock, brief §13 #18).
- `pnpm test:db`: 9 files, 274 tests (23 new, `sarana_dana.test.sql`): items can't be inserted (throws) or deleted/updated-by-a-viewer (0 rows affected, not an exception — RLS with no matching policy just hides the row, confirmed against the exact convention already used in `master_data.test.sql`); Persembahan Bulanan's tipe and jemaat_id are corrected on both insert and update; every other item's jemaat_id is forced null on both; `item_id` is rejected on change; the jumlah bounds constraint rejects a decimal, a negative, and one over the ceiling, and accepts exactly the ceiling and zero; `sarana_dana_report` is refused for anon and for a signed-in user without `warta:read`, and for a viewer it matches `private.sarana_dana_report` exactly (compared via a temporary table, since `authenticated` genuinely can't select from the `private` schema directly).
- `pnpm test:integration`: 4 files, 59 tests. New file `sarana-dana.test.ts` (13 tests): 401/403 with nothing written; the item PATCH route distinguishes which field was sent and logs the matching sentence; a decimal/negative/over-ceiling jumlah is rejected before the database; the **response body** for a Persembahan Bulanan transaction shows tipe forced to masuk, and for another item shows jemaat_id forced null — proving the app never had to duplicate the trigger's logic, since it just echoes back what the DB actually stored; 404 for a missing/malformed id and for a real transaction addressed under the wrong item key; one activity log row per mutation. Run twice back to back to confirm the run-unique tanggal/jumlah values in the activity sentences don't collide with themselves (one assertion — the Keterangan edit's — carries no unique detail by design, so it compares a before/after count instead of an exact row count).
- **Not verified yet**: an actual browser (light/dark, 360px, keyboard-only use, and specifically the inline Saldo Awal form and the DateRangeFilter toolbar interaction on the ledger page). No `next dev` was running at the end of this session, but `.env.development.local` still points at the `*.supabase.co` project rather than the local stack (the same pre-existing mismatch noted since stage 3), so starting one wouldn't have exercised this stage's code against real local data.

### Stage 8 (Litbang template), 2026-09-29

**Decisions**
- **Route path is `/api/admin/litbang-template`**, not `/api/admin/litbang` (the admin page is still `/admin/litbang`) — brief §10's own "current endpoints" reference lists it that way, and the `[id]` and `reorder` routes sit as siblings under it (a static segment next to a dynamic one, unlike the stage-7 `[id]`/`[key]` collision, so no `next dev` route-tree conflict).
- **No GET route.** Brief §10 doesn't list one for this module (unlike Tempat/Wilayah/Label). `loadLitbangCards` is called directly from the server page component, same shape as `loadSaranaDanaOverview` (stage 7); the client never fetches the list itself, only mutates and calls `router.refresh()`.
- **One PATCH endpoint, two independent field groups**, same pattern as stage 7's `updateSaranaDanaItem`: the card's "Simpan" button sends `{ name, deskripsi }` together; the Aktif checkbox sends `{ active }` alone, immediately on toggle (not gated behind Simpan) — because the brief's toast text ("Diaktifkan - akan ikut ke warta baru" / "Dinonaktifkan - ...") reads as an immediate confirmation, not a deferred one. The Zod schema keeps every field genuinely optional (undefined when not sent, not coerced to null) so `run()` can tell which group arrived and pick between "Mengaktifkan/Menonaktifkan" and "Mengubah" (or "... menjadi ..." on rename) for the activity sentence.
- **Reorder RPC already existed** (`reorder_litbang_categories`, 0022, stage 2) and already does everything the brief asks: atomic, `sort_order` = position, and rejects an `ids` array that isn't exactly the current set (missing, duplicate, or foreign id) with "Daftar Litbang sudah berubah. Muat ulang halaman lalu coba lagi." No new migration this stage.
- **Optimistic reorder without a synced local copy of the list**: the manager keeps only `pendingOrder: string[] | null` (the ids in their new order). Render order each pass is `pendingOrder` (falling back to the `cards` prop's order) filtered down to ids `cards` still has, with any id in `cards` but not yet in that list appended at the end. This self-heals when an unrelated add/delete changes `cards` without an effect or a full local list copy: membership always comes live from the prop, only order is locally overridden. On a failed save, `pendingOrder` is reset to the pre-drag order (rollback); on success it's left as-is and `router.refresh()` brings the prop in line with it.
- **Card-level edit state (Nama/Deskripsi) is held locally per card**, initialized once from the `card` prop and never resynced from later prop changes — same reasoning as the KeteranganDialog/TransactionDialog "remount on key change" convention elsewhere, except there's no natural remount trigger here (the card isn't inside a dialog), so an in-progress edit is deliberately left undisturbed by unrelated refreshes (e.g. another card's save, or a reorder). Concurrent multi-admin edits to the same card's name/deskripsi aren't guarded against (the brief only asks for the reorder RPC's conflict check); toggling Aktif reads live from the `card.active` prop instead, since it's a single immediate round-trip with no local draft to protect.
- **New dependencies**: `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2 (pinned exact, matching every other dependency in this project); shadcn `checkbox` (Base UI, added via `shadcn add checkbox` — only added `checkbox.tsx`, didn't touch `button.tsx`/`input.tsx`, so the stage-5 CLI-clobbering risk didn't apply here).
- **Keyboard reordering**: `MouseSensor` + `TouchSensor` + `KeyboardSensor` (`sortableKeyboardCoordinates`), drag handle is a dedicated grip button (not the whole card) so inputs stay clickable/typable. `DndContext`'s `accessibility.announcements` and `screenReaderInstructions` are custom Indonesian sentences (the dnd-kit defaults are English). The handle is only rendered when `canWrite`; a viewer gets no drag affordance at all, and `handleDragEnd` also checks `canWrite` as defense in depth.

**Routes and data loading (`lib/litbang.ts`, `lib/litbang-routes.ts`)**
- `loadLitbangCards`, `createLitbangCard`, `updateLitbangCard`, `deleteLitbangCard`, `reorderLitbangCards` — same `mutation()` pattern as every module since stage 4. New rows append at `max(sort_order) + 1` (stage 4's convention, not the row count).
- Deleting or editing a template card never touches `warta_litbang_items` (brief §13 #3): the FK (`litbang_category_id`, set null, from 0003) already does this; nothing in the route handler needs to know about `warta_litbang_items` at all.

**UI**
- `components/litbang/`: `litbang-manager.tsx` (DndContext/SortableContext, "Tambah Litbang" action, optimistic reorder), `litbang-card.tsx` (drag handle, Nama, Aktif, Deskripsi, Simpan, Hapus via `ConfirmDialog`), `add-litbang-dialog.tsx`.
- Inactive cards: `opacity-60` on the `Card` plus a `Badge variant="neutral"` reading "Nonaktif" (brief: dim alone isn't enough).
- Read-only mode: no drag handle, no "Tambah Litbang"/Simpan/Hapus; the Aktif checkbox and Nama/Deskripsi fields render disabled (same "same screens, disabled" convention as every other module, brief §11).

**Verification (stage 8)**
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass; `/admin/litbang` and the three new API routes show up in the build's route list, confirming no route-tree conflict from the `[id]`/`reorder` siblings.
- `pnpm test`: 119 tests, 18 files (adds `litbang-manager.test.tsx`, 4 tests: keyboard-only reorder end-to-end through a stubbed `getBoundingClientRect` — jsdom returns an all-zero rect for every element, which `sortableKeyboardCoordinates` needs distinct values from to find "the next card down"; rollback plus the server's message on a failed save; both toggle-direction toasts; read-only mode hides the handle and every write control).
- `pnpm test:db`: 10 files, 291 tests (17 new, `litbang.test.sql`): viewer reads but can't write; editor writes; editing or deleting a card already copied into a warta leaves that warta's `warta_litbang_items` row untouched (only `litbang_category_id` goes null on delete); deactivating a card doesn't touch the warta's copy; reorder rejects a list with a foreign id even at the right count (the one branch of the existing RPC the stage-2 tests hadn't exercised).
- `pnpm test:integration`: 5 files, 66 tests. New file `litbang.test.ts` (7 tests): 401/403 on every route including reorder, with nothing written; add/rename/toggle-off/toggle-on/delete each log exactly one activity row with the right sentence; 400 for a blank name and a no-op PATCH body; 404 for a missing/malformed id; reorder saves atomically and rejects a stale (incomplete) list with the RPC's own message; editing then deleting a card already copied into a real `warta_litbang_items` row leaves that row's `name`/`deskripsi` untouched and only nulls `litbang_category_id`.
- **Not verified yet**: an actual browser (light/dark, 360px, and specifically pointer/touch dragging, which the component tests don't cover — only the keyboard path was exercised, since mouse/touch drag-and-drop can't be driven through Testing Library's `userEvent` the way keyboard activation can). No `next dev` was running at the end of this session; `.env.development.local` still points at the `*.supabase.co` project rather than the local stack (the same pre-existing mismatch noted since stage 3).

### Stage 9a (Warta admin + Dashboard), 2026-09-29

**Before deploying to production**
- Push migration `0026_warta_rules.sql` together with 0018–0025.

**Decisions approved before starting (plan and questions asked, not decided alone)**
- **Creating a warta needs no 207 path.** `create_warta` (0022, stage 2) already inserts the draft (`created_by = auth.uid()`) and snapshots the active Litbang cards in one transaction, so "Warta dibuat, tapi gagal menyalin Litbang" can't happen. It was not changed.
- **Slug**: `slugify("{tanggal}-{judul}")` in `lib/warta.ts` (NFD, strip marks, lowercase, runs of other characters become `-`, trim). One plain attempt, then up to **5 retries** with `-xxxx` (4 base-36 characters from `crypto.getRandomValues`). A retry happens only on `23505` for `warta_slug_key`; there is no check-then-insert. After that, 400 "Gagal membuat alamat unik untuk warta ini. Coba simpan lagi."
- **`warta_litbang_items` is update-only at the RLS layer.** `warta_litbang_items_write` (`for all`, 0003) is replaced by `warta_litbang_items_update`, the same accepted pattern as 0025's `sarana_dana_items_update`.
  - Cards come only from `create_warta` (definer, bypasses RLS) and leave only through the FK cascade.
  - A direct REST insert is refused (`42501`), and a direct delete affects 0 rows.
- **Tanggal Kebaktian is not restricted to Sunday.** Other services in the week (KRT, PA, Doa Pagi, …) fall on other days anyway. The create form defaults to `nextSunday()`.
- **Changing Tanggal Kebaktian later keeps the old slug** (§9.4 "never changes"). The service and finance weeks follow the new date.
- **Transactions in the warta finance tab** use the stage-7 `TransactionDialog` defaults as they are: Tanggal defaults to today, and there are **no** min/max bounds. The brief doesn't restrict transactions to the finance week (unlike "Tambah Jadwal", §12.5). A transaction dated outside the week is saved to the ledger but doesn't show in that tab.
- **Optimistic concurrency, for Section 1 (Informasi & Renungan) only.**
  - The PATCH body carries `expectedUpdatedAt`, and the update is `… where id = $1 and updated_at = $2`: compare-and-swap in one statement, with no gap between reading and writing.
  - 0 rows on a warta that still exists → 400 "Warta ini sudah diubah orang lain sejak kamu membukanya. Muat ulang halaman …". It's 400 rather than 409 because §10 lists only 400/401/403/404. The typed text stays in the form.
  - The form keeps its base `updated_at` in local state (not the prop), so a refresh from another section can't silently move it forward under unsaved edits. It advances only from its own save's response.
  - Not applied to:
    - status: the body is the *target* status, so it's idempotent;
    - Litbang deskripsi and Kesaksian items: small per-row edits, and those tables have no `updated_at` (same stance as stage 8);
    - schedule rows and transactions: their own modules.

**0026 migration**
- `warta_slug_format_check`: `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`.
- `private.enforce_warta_rules()`, `before insert or update` on `warta`:
  - **Insert** by a signed-in user: `created_by := auth.uid()` and `status := 'draft'`, since publishing needs `warta:update`, not `warta:create`. It stands aside when `auth.uid()` is null (seed, SQL Editor), like 0021.
  - `published_at` is set on insert from the status; `created_at` / `updated_at` = `now()`.
  - **Update**: a changed slug raises `22023` "Slug warta tidak bisa diubah." `created_by` and `created_at` revert to the old values.
  - `published_at`: `now()` when the status becomes published, `null` when it returns to draft, otherwise the old value. A client value is always ignored.
  - `updated_at` moves **only when an Informasi/Renungan column changes**, so Terbitkan doesn't cause a false concurrency conflict.
- `private.enforce_warta_litbang_item_rules()`, `before update` on `warta_litbang_items`:
  - `name` and `warta_id` are fixed (`22023`).
  - `litbang_category_id` may only become null, which the FK set-null from a deleted template card still needs; the pgTAP test proves it passes.

**Routes and data loading**
- `lib/warta-routes.ts` uses the `mutation()` pattern:
  - `POST /api/admin/warta` (`warta:create`);
  - `PATCH /[id]` (`warta:update`; either `{ status }` or the fields + `expectedUpdatedAt`, with the branch picked by the presence of `status` so Zod reports the field's own message instead of a generic union error);
  - `DELETE /[id]` (`warta:delete`);
  - `PATCH /[id]/litbang/[itemId]` (`{ deskripsi }` only);
  - `POST /[id]/kesaksian`, `PATCH` / `DELETE /[id]/kesaksian/[itemId]`.

  No GET routes (same as stage 8); pages load on the server. Child rows are always filtered by `warta_id` too, so an item addressed under the wrong warta is a 404.
- Kesaksian appends at `max(sort_order) + 1` within the warta (stage 4's convention).
- Activity sentences (module `warta`):
  - `Membuat warta "…" (YYYY-MM-DD)`, `Mengubah warta …`, `Mempublikasikan warta …`, `Menarik warta … ke draft`, `Menghapus warta …`;
  - `Mengubah litbang "…" pada warta …`;
  - `Menambah/Mengubah kesaksian "…" pada warta …`, `Menghapus kesaksian "…" dari warta …`.
- New loaders:
  - `loadPeribadahanRange(supabase, range)` (peribadahan-routes, reusing `loadReferenceData`/`toItemRow`/`loadSmkaGroups`; ordered by date then `sort_order`).
  - `loadWartaFinance(supabase, range)` (sarana-dana-routes). The four figures come **only** from `rpc('sarana_dana_report')`, never recomputed in TS. The transactions go through `toTransactionRows`, extracted from `loadSaranaDanaLedger` so both share it.
  - `loadWartaList` / `loadLatestWarta` / `loadWartaEditor`.
- Peribadahan and Sarana & Dana mutations now revalidate `/admin/warta` as a **layout** (it was the page only, so `/admin/warta/[id]` was missed) plus `/admin` for the dashboard (`WARTA_VIEWS` in each file).
- `weekContaining(date)` in `lib/dates.ts`: the Minggu–Sabtu week around a date, for the dashboard, with the same definition as `public_jadwal_pekan_ini`.

**UI**
- **Peribadahan reuse without a copy.** `PeribadahanManager` was split:
  - column builders moved to `peribadahan-columns.tsx`, with a new `buildWeekColumns` (Tanggal, Waktu, Jenis, Ringkasan, no sorting, per §9.4);
  - the add/edit/delete wiring (button, row actions, both dialogs) moved to the `usePeribadahanActions` hook.

  The Peribadahan pages behave as before; the warta section composes the same hook with `defaultDate`/`minDate`/`maxDate` = the service week.
- `components/warta/`:
  - `warta-list-manager` (Status facet, date range on tanggal, "Hapus" hidden without `warta:delete`);
  - `warta-create-form`;
  - `warta-info-fields` (shared by create and Section 1);
  - `warta-editor` (back link, judul + status badge + date + slug, Terbitkan/Tarik ke Draft, Hapus Warta);
  - one file per section;
  - `warta-status-badge` (Published = accent, Draft = neutral; server-safe, so the dashboard can use it).
- Each section is a `<section aria-labelledby>` with an `h2`.
- Litbang cards show the name as fixed text (not an input). Kesaksian items are edited in place, with "Tambah Item Baru" closing the list.
- The page renders `<WartaEditor key={warta.id}>`, so moving between two warta remounts every form instead of keeping stale local state.
- **shadcn `tabs`** added (only `tabs.tsx`). Two changes from the generated file:
  - list height `h-8` → `h-9` (36px controls);
  - inactive tab text `text-foreground/60` → `text-muted-foreground`, because 60% foreground on `--muted` is about 4.4:1 (under AA), while muted-foreground is about 6.8:1 light / 6.1:1 dark.
- **Dashboard**:
  - The existing greeting, roles, permission count, and forbidden notice (stage 1) stay.
  - With `warta:read` it adds read-only cards: Warta terbaru (status badge + link), Jadwal minggu ini (Minggu–Sabtu containing today in WIB), and Saldo Sarana & Dana (from `sarana_dana_balances`).
  - A failed summary shows an inline message instead of failing the page.

**Verification (stage 9a)**
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass. `/admin/warta`, `/admin/warta/new`, `/admin/warta/[id]`, and the five API routes are in the build's route list.
- `next dev`: a dev server for this folder was already running on :3000 and was left alone. Its log shows clean recompiles after the new route files were added (no route-tree conflict; the only dynamic segment names under `warta` are `[id]` and `[itemId]`).
- `pnpm test`: 133 tests, 20 files.
  - `lib/warta.test.ts`: slugify, diacritics, runs/trim, a non-latin judul, and every output matching the DB check; the suffix format.
  - `weekContaining` tests.
  - `warta-editor.test.tsx`:
    - read-only mode: all 5 sections, every textbox disabled, no action buttons or add form;
    - an editor without delete;
    - the figures rendered exactly as passed;
    - publish sends only `{ status }`;
    - Section 1 sends its starting `updated_at`, then the one the server returned, and keeps the typed text on a conflict;
    - a blank judul is caught client-side.
- `pnpm test:db`: 11 files, 323 tests (32 new, `warta.test.sql`):
  - create_warta snapshot (active only);
  - a direct insert forced to draft, the caller as author, and no published_at;
  - slug format; slug update rejected; created_by kept;
  - published_at set, kept, and cleared;
  - updated_at moves on content only and can't be set directly;
  - Litbang copy: deskripsi editable, template untouched; name, warta_id, and category repoint rejected; direct insert and delete refused;
  - the FK set-null still works;
  - viewer can't update; editor can't delete; admin deletes;
  - after a delete, only Litbang and Kesaksian go, while schedule rows, transactions, other warta, and the template stay.
- `pnpm test:integration`: 6 files, 79 tests. New `warta.test.ts` (13 tests):
  - 401 and 403 on every route, with nothing written;
  - the whole lifecycle for §13 #2 (editor creates, edits, publishes, unpublishes; editor delete → 403; admin delete → 200), with exact activity rows (email, IP) and `created_by`/`status`/`published_at`/slug from the body ignored;
  - validation, and 404 for missing or malformed ids;
  - a second identical tanggal + judul gets `base-xxxx`;
  - a REST slug update is refused even for super_admin;
  - a stale `expectedUpdatedAt` → 400 with nothing written, and a status change doesn't cause a false conflict;
  - §13 #3: only the active card is copied, and editing warta A's copy changes neither the template nor warta B (a client-sent `name` is ignored);
  - Kesaksian appends in order;
  - §13 #4: a row added through the warta's "Tambah Jadwal" path shows on the overview and category loaders, and an edit made there shows in the warta's service-week loader, while a row outside the week doesn't;
  - the finance tab's figures deep-equal `rpc('sarana_dana_report')` for the finance week, and the tab holds exactly that item's in-range transactions;
  - deleting a warta leaves its schedule row and transaction.

  `litbang.test.ts` now builds its snapshot with `create_warta` instead of a direct insert, which 0026 refuses.
- Mutation checks:
  - dropping both 0026 triggers fails 5 pgTAP tests before the file aborts (it can't disable a trigger that no longer exists);
  - removing the `updated_at` condition from the UPDATE fails the concurrency integration test;
  - showing the Kesaksian add form without `warta:update` fails the read-only component test.
- **Not verified yet**: an actual browser (light and dark, 360px, keyboard-only; in particular the tabs on a narrow screen, the DatePicker inside the Informasi fieldset, and the editor's long page). The running dev server points at the `*.supabase.co` project (`.env.development.local`, the same mismatch noted since stage 3), so no request was made to it.
- The local database was **not** reset; 0026 was applied with `migration up --local`. The seed inserts warta as `postgres` (where `auth.uid()` is null), so the new trigger stands aside for it, the same way the pgTAP fixtures run.

### Stage 9b (Public site), 2026-09-29

**Before deploying to production**
- Push migration `0027_public_jadwal_mendatang.sql` together with 0018–0026.

**Decisions approved before starting (plan and questions asked, not decided alone)**
- **Reading the warta tables directly as anon.** Stage 2 has no function for the warta header, renungan, Litbang, Kesaksian, or the `/warta` list. They are read straight from `warta`, `warta_litbang_items`, and `warta_kesaksian_items`, which RLS (0019) already limits to published warta. Every query also filters `status = 'published'` and names its columns. The schedule and finance still come **only** from the public functions. No query touches `jemaat`, `keluarga`, or transactions, and no service-role key is used.
- **Cookie-less public client** (`lib/supabase/public.ts`): anon key, no session, `cache: "no-store"` on every fetch. With the cookie client, a signed-in admin would get `warta:read` through RLS and see drafts on public pages.
- **Jadwal Ibadah uses a new function, `public_jadwal_mendatang()` (0027).** It returns today through today + 6 in WIB. `public_jadwal_pekan_ini` returns the Minggu–Sabtu week around today, which on a Saturday is mostly past.
  - The function takes no parameters, so anon can't page through history.
  - It reuses `private.schedule_rows`.
  - It returns schedule columns and names only: no attendance, no catatan, no SMKA grid.
  - Beranda keeps `public_jadwal_pekan_ini` ("this week", brief §2).
- **Caching: every data page renders per request.** Each loader in `lib/public-site.ts` calls `connection()`. There is no ISR and no `revalidateTag`. Reasons:
  - "Tarik ke Draft" must take effect immediately, including for writes made outside the app (SQL Editor, or direct REST by a signed-in user).
  - Too many mutations would otherwise need invalidating, and missing one silently leaves the page stale:
    - warta status, fields, delete, Litbang deskripsi, and Kesaksian;
    - every peribadahan write;
    - every transaction write and `saldo_awal` (they change Saldo Awal of every later week);
    - tempat and wilayah renames and deletes;
    - jemaat renames and deletes (names appear in the schedule).
  - "This week" and "7 days" roll over at midnight WIB.
  - The load is 3–4 small parallel queries per request.
  - Without `connection()`, cookie-less fetches would be prerendered at `next build` against the production DB and never refreshed.
  - So **no mutation needs to revalidate the public site.** The existing admin `revalidatePath` calls stay as they are.
  - Tentang Kami and Kontak have no data. They are static with `revalidate = 86400`, so the footer's year rolls over.
- **Placeholders**: visitors see a dashed "Konten sedang disiapkan." block (`PlaceholderBlock`), not a raw "TODO:". Each call site has a `TODO(konten)` comment saying what the church must supply. No church facts were invented, apart from one generic welcome line on Beranda, which is also marked `TODO(konten)`.

**Routes and data loading**
- Route group `src/app/(public)/`: `/`, `/tentang-kami`, `/jadwal-ibadah`, `/warta`, `/warta/[slug]`, `/kontak`, plus `not-found.tsx` and `error.tsx` (Next 16's `retry()` prop). The old `src/app/page.tsx` placeholder moved in here.
- **No `loading.tsx` anywhere in the group.** A Suspense boundary starts streaming with status 200, and `notFound()` on `/warta/[slug]` must answer a real 404 (Next 16 docs, loading.md "Status codes").
- `loadPublicWarta(slug)` is wrapped in React `cache()`, so `generateMetadata` and the page share one load per request.
  - A malformed slug (the 0026 format) returns null before any query.
  - A draft or unknown slug returns null → `notFound()`.
  - A database error throws, and `error.tsx` shows the message.
- `generateMetadata`: title = judul kebaktian, description = tema (the long date when tema is empty).
- RPC results are parsed with Zod (`lib/public-schedule.ts`), since the generated types call nullable columns non-null. `numeric` is coerced.
- `scheduleFields(row)` shows a field only when the row's category layout has it (`layoutFor`, stage 6) **and** it's filled, in §8's order.
  - An attendance count of 0 counts as filled.
  - SMKA uses `liturgosLabel` "Pelayan Liturgi". The group table lists exactly the groups `public_warta_schedule` returns, which are only the groups with data.
- The four finance figures come straight from `public_warta_finance`, never recomputed.

**UI** (`components/public/`)
- Shell: skip link, sticky header (brand, links with `aria-current`, `ThemeSwitcher`), footer "© {year} GKP Rangkasbitung." with the year in WIB. Below `md`, the links move into a Sheet menu ("Buka menu"), because five links don't fit at 360px.
- `/warta/[slug]` is one `<article>`: h1 judul, h2 per section, h3 day, h4 service. Renungan, Litbang, and Kesaksian are hidden when empty, per §8. Multi-line text is plain text with `whitespace-pre-line`, with no `dangerouslySetInnerHTML`.
- The finance figures are a `dl` per item: one column under 400px, then 2, then 4, with tabular figures.
- Beranda: a hero with the name and this week's services (compact list), the latest warta card, and placeholder sections. A failed section shows an inline message instead of failing the page.

**Verification (stage 9b)**
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass. `/`, `/jadwal-ibadah`, `/warta`, and `/warta/[slug]` build as ƒ (dynamic). `/kontak` and `/tentang-kami` are ○ with a 1-day revalidate.
- `pnpm test`: 152 tests, 23 files.
  - `lib/public-schedule.test.ts`: field order and labels, hidden empty fields, 0 kept, "Pelayan Liturgi", a field outside the layout never shown, the umum fallback, Zod parsing, grouping.
  - `warta-public-view.test.tsx`: section order and both ranges; a renungan holding `<script>`/`<b>` renders no element and keeps its text; the SMKA table lists only the given groups; the four figures; empty sections hidden.
  - `public-nav.test.tsx`: five links in order, `aria-current`, and the mobile menu opened by keyboard and closed after a link.
- `pnpm test:db`: 12 files, 334 tests. New `public_jadwal_mendatang.test.sql` (11 tests): definer, empty search_path, no parameters, anon/authenticated only, the column set, today..+6 in WIB only, and no phone, address, birth date, occupation, or catatan in the output.
- `pnpm test:integration`: 7 files, 87 tests. New `public-site.test.ts` (8 tests), all through the cookie-less client:
  - §13 #17: anon `select` on `jemaat`, `keluarga`, `sarana_dana_transactions`, `sarana_dana_balances`, and the schedule tables → `42501`. A published warta loads all sections, with the Pelayan Firman by name and none of their other data.
  - §13 #5: the public figures deep-equal both the editor's `loadWartaFinance` and `rpc('sarana_dana_report')` for the finance week.
  - Drafts, unknown slugs, and malformed slugs return null. "Tarik ke Draft" through the real PATCH route makes the next load null and removes the warta from the list; republishing brings it back.
  - `<script>` in a renungan comes back as the literal text.
  - `loadJadwalMendatang` returns today..+6 only, without attendance or catatan.
  - `connection()` is mocked to a no-op there, because it throws outside a Next request.
- Mutation checks: rendering the renungan with `dangerouslySetInnerHTML` fails the `<script>` test, and dropping the layout filter in `scheduleFields` fails 2 tests.
- **HTTP**, with `next build` + `next start` on :3107. Both used process-env overrides pointing at the local stack only; the built server bundle was checked to contain no project `*.supabase.co` URL.
  - All five pages → 200, with titles "{page} | GKP Rangkasbitung", `lang="id"`, and the warta description = tema.
  - Seeded draft, test draft, unknown slug, `Huruf-Besar`, and an encoded `../` slug → 404.
  - A renungan with `<script>` and `<img onerror>` appears only HTML-escaped.
  - Setting the warta to draft in the DB → the very next request is 404, and it's gone from `/warta` and Beranda.
  - A schedule edit shows on the next request.
  - Warta pages are sent `Cache-Control: private, no-cache, no-store`.
  - The fixtures were deleted afterwards, and `pnpm build` was rerun with the normal env.
- **Not verified yet**: an actual browser (light, dark, and system themes; 360px; keyboard-only use, especially the Sheet menu's focus return and the SMKA table's horizontal scroll on a narrow screen). No browser tool was available in this session.
- Follow-up outside this stage: an unmatched URL (for example `/halaman-acak`) still gets Next's default English 404, because there is no root `app/not-found.tsx`. A root one would also replace the admin's 404 pages, so it was left alone.
