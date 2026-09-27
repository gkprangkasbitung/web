# Progress

- [x] 1. Foundation: project setup, migrations copied, generated types, design tokens (light/dark), admin shell, auth (§6), permission helpers (§4), activity log (§7), date helpers (§11)
- [x] 2. Security: RLS hardening + public functions (§12.1), atomic RPCs (§12.6)
- [x] 3. Shared table pattern (§9.2)
- [x] 4. Master data: Tempat, Wilayah, Label Jemaat (§9.8)
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

