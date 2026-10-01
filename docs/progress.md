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
- [x] 10. Pengguna, Roles & Permissions, Log Aktivitas, Profil Saya (§9.11–9.14, §12.3)
- [x] 9c. Public UI sesuai docs/design/ (layout + placeholder, lapisan data terpisah)
- [x] 11a. Upload foto + Profil Gereja (§14.1, §14.5)
- [x] 11b. Pelayanan, Majelis, Kegiatan + sambungkan halaman publik ke data (§14.2–14.4, §14.6)
- [x] 11c. Pendeta: modul CMS + Sambutan memakai data pendeta + section di Tentang Kami (§14.7)
- [x] 11d. Komisi: master jabatan, komisi + anggota, halaman publik /komisi (§14.8)

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

  | Function                     | Mode                                                       | Permission     |
  | ---------------------------- | ---------------------------------------------------------- | -------------- |
  | `set_user_role`              | invoker                                                    | `users:update` |
  | `link_user_jemaat`           | definer (writes `profiles.jemaat_id`)                      | `users:update` |
  | `set_user_access`            | invoker                                                    | `users:update` |
  | `set_role_permissions`       | invoker                                                    | `roles:update` |
  | `create_warta`               | definer (the Litbang snapshot must see the whole template) | `warta:create` |
  | `reorder_litbang_categories` | invoker                                                    | `warta:update` |
  | `delete_keluarga`            | invoker                                                    | `warta:update` |
  | `replace_jemaat_labels`      | invoker                                                    | `warta:update` |
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

- **"Tambah Anggota" and other families**: the picker shows every jemaat not already in _this_ family, including people already in another family (brief §9.10's own wording), and picking one moves them. Approved with a warning: the picker/form shows which family they'd be moved out of, and a confirmation ("akan dipindahkan dari keluarga X") is required before the move is submitted.
- **Kepala Keluarga**: enforced at one per family (the brief doesn't set this rule). Enforced in the database with a partial unique index (`jemaat_satu_kepala_keluarga` on `jemaat(keluarga_id) where hubungan_keluarga = 'Kepala Keluarga'`), so it holds for every write path (`save_jemaat`, `set_jemaat_keluarga`, and any future one), not just the ones the app happens to check. Message: "Keluarga ini sudah punya Kepala Keluarga."

**0023 migration**

- `keluarga_nama_lower_idx`: unique index on `lower(nama)`, catching case-only duplicates that the existing case-sensitive constraint (0017) doesn't. Both stay; the case-sensitive one is now redundant but harmless.
- `save_jemaat(...)`: one atomic RPC for both create and edit (`p_id` null = create). Resolves `keluarga` by name case-insensitively (creates it if unmatched, races handled by catching the unique violation and re-selecting), clears `hubungan_keluarga` when the family name is blank, checks Kepala Keluarga and `nomor_anggota` uniqueness with clean pre-checks _and_ a fallback that catches the underlying constraint by name (never leaks raw constraint text), then calls the existing `replace_jemaat_labels` to set labels. Because it's fully atomic, save_jemaat can never partially fail the way the brief's §10 207 describes — same reasoning as `create_warta` in stage 2 has this pattern. **This module never returns a 207.**
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
- `components/shared/keluarga-combobox.tsx`: a _creatable_ combobox — the typed text is the value (submitted and resolved server-side by `save_jemaat`), suggestions are just existing families. The brief's "Tidak ditemukan - buat dulu di halaman Keluarga" empty-state text is informational only; per §9.9's own description of the server behavior, typing a new name and saving still creates the family.
- `components/shared/label-multi-select.tsx`: multi-select combobox with chips, over Label Jemaat.
- `components/shared/date-picker.tsx`: single-date version of the existing `DateRangeFilter`, for Tanggal Lahir/Masuk and pastoral note dates.
- Avatar palette: 6 tokens (`--avatar-1`..`--avatar-6` + `-foreground`) added to `globals.css`/`@theme inline`, light and dark. `avatarColorIndex(name)` in `lib/format.ts` picks one deterministically (simple string hash mod 6); `InitialsAvatar` uses it instead of the flat neutral badge color it had before.
- Status badges use exactly the brief's own example: Simpatisan `outline-accent`, Baptis Anak `accent`, Sidi and Anggota Penuh both `neutral`.
- "Anggota Keluarga" on the jemaat detail page is a plain list, not the shared `DataTable`: it has no sort/filter/search/pagination need (brief just asks for name, hubungan, and status), so the table pattern would be pure overhead there. Catatan Pastoral and the Keluarga members table _do_ use `DataTable`, since they're real lists.
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
- **Fields outside a row's category layout are always nulled by the server**, never rejected with 400. The category is fixed at creation and only known once the row is fetched inside the mutation's `run()` (after Zod validation already ran), so a per-category _strict_ Zod schema isn't reachable in the existing `mutation()` pipeline. One superset schema (every field optional) is used for `PATCH`, and `run()` forwards only the fields the row's `layoutFor(key)` allows to the RPC; everything else becomes `undefined` (Postgres default `null`) regardless of what the client sent. The add/edit forms only ever render applicable fields anyway, so this is defense in depth, not the primary path.
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
- Category lookup by `key` returning no row means the key doesn't exist in the database at all → the page 404s. A key that _does_ exist but has no matching entry in `PERIBADAHAN_LAYOUTS` falls back to the `umum` layout instead (the brief's two separate rules: routing validity vs. layout fallback).

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
    - status: the body is the _target_ status, so it's idempotent;
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

### Stage 10 (Pengguna, Roles & Permissions, Log Aktivitas, Profil Saya), 2026-09-30

**Before deploying to production**

- Push migration `0028_users_roles_audit.sql` together with 0018–0027.
- Set `SITE_URL` (server-only) in the hosting environment, and configure Supabase Auth: Site URL, the Redirect URL `https://<domain>/auth/callback**`, and the "Invite user" template. Step by step in `docs/bootstrap-super-admin.md` → "Invites". Without `SITE_URL`, invites fail closed with a 500.
- Configure custom SMTP in Supabase before inviting in earnest. The built-in sender allows only a few emails per hour.
- This settles the stage 1 note on the invite template: the link uses `{{ .SiteURL }}`, not `{{ .RedirectTo }}`.

**Decisions approved before starting (plan and questions asked, not decided alone)**

- **`SITE_URL` is server-only** (`lib/site-url.ts`). It must be an origin only, on https (http only for localhost).
  - The invite's `redirectTo` is `${SITE_URL}/auth/callback?next=/auth/set-password`. It is never built from Host / Origin / X-Forwarded-Host.
  - The invite template builds its link from the Supabase Site URL, so a request can't steer the link's domain at all.
  - Added to `.env.local.example`. Approved despite the `.env*` rule, because the file holds no secret.
- **The password change asks for the current password.** This is an addition to §9.14. The server:
  1. checks the password with a throwaway, cookie-less `signInWithPassword` (the email comes from the session, not the request);
  2. revokes that throwaway session;
  3. calls `updateUser`;
  4. calls `signOut({ scope: "others" })`.

  The invite's `/auth/set-password` is unchanged; it has no old password.

- **The super_admin guards apply on every path**: the service role, the Supabase dashboard, and the SQL Editor. 0021, by contrast, stands aside when `auth.uid()` is null. Manual repair means disabling the trigger inside a transaction (documented).
- **Role edit dialog** (Nama + Deskripsi) exists; the super_admin name is fixed. `PATCH /api/admin/roles/[id]` takes either `{ permissionIds }` or `{ name, description }`, branched the same way as warta's PATCH.
- **One user PATCH**: `PATCH /api/admin/users/[id]` `{ roleId?, jemaatId }` goes through `set_user_access`, so it is atomic. It replaces §10's separate `/role` and `/jemaat` endpoints.
  - Leaving out `roleId` keeps the roles and calls `link_user_jemaat` only.
  - The dialog does this on your own row, where the role can't change.
- **`activity_logs` hardening**: every item approved (see 0028 below).
- **Skipped** (suggested and approved):
  - an "undangan belum diterima" badge, which would need a definer function over `auth.users`;
  - user counts in the delete-role dialog.

**0028 migration**

- **super_admin guards.** The triggers are named `guard_super_admin`, which sorts after 0021's `guard_own_admin_access`, so acting on your own access still reports 0021's message.
  - `user_roles`: the last super_admin assignment can't be deleted (including the cascade from deleting the auth user), switched, or moved.
    - The check is serialized with `select … for update` on the super_admin role row, so two super_admins demoting each other at once can't both succeed.
    - No automated test covers this, because pgTAP runs in one session.
  - `roles`: super_admin can't be deleted or renamed. Its description can change.
  - `role_permissions`: super_admin's `roles:*` / `users:*` grants can't be removed. Its other grants (`warta:*`, `activity_log:read`) can.
  - Messages (42501):
    - "Harus ada minimal satu super_admin."
    - "Role super_admin tidak bisa dihapus."
    - "Nama role super_admin tidak bisa diubah."
    - "Permission roles dan users milik super_admin tidak bisa dicabut."
- **`set_role_ui_permissions(p_role_id, p_permission_ids)`**: invoker, needs `roles:update`.
  - It replaces the set only within `warta`, `users`, `roles`, and `activity_log`. `announcements`/`content` grants stay.
  - Ids outside those four resources → 22023 "Permission tidak dikenal."
  - `set_role_permissions` (0022) is kept, but the app no longer uses it.
- **Role names**: `roles_name_lower_idx` (unique `lower(name)`) and `roles_name_not_blank_check`.
- **`activity_logs` is append-only for everyone.**
  - `revoke update, delete, truncate` from anon, authenticated, and service_role.
  - A `before update or delete` trigger refuses everything except the FK's own set-null of `user_id`, with every other column unchanged.
  - A `before truncate` trigger refuses truncation.
  - On a signed-in user's insert, `user_email` comes from `auth.users` and `created_at` is `now()`, whatever the client sent. Without `auth.uid()` (seed, tests), the given values are kept.
- **`search_activity_logs(p_search)`**: invoker, returns `setof activity_logs`, and matches activity or email with ILIKE.
  - Same pattern as stage 6: `escapeLike` in TS, then a bound parameter, never a `.or()` string.
  - Module, date range, order, and range are PostgREST filters on the RPC result.
- **Bug fix found this stage: deleting an account that had created a warta failed.**
  - 0026's `enforce_warta_rules` reverted every change to `created_by`, including the FK's `on delete set null`. The delete therefore raised a foreign-key violation (reproduced on the local DB before the fix).
  - The replaced function lets `created_by` become null only when that user no longer exists. Any other rewrite is still reverted.
  - It is now `security definer`, so it can read `auth.users`; otherwise it is identical.

**Routes and data loading**

- `lib/supabase/admin.ts` (`server-only`) exports only `inviteUser` and `deleteAuthUser`. The service-role client is never exported (brief §3).
- `mutation()` gained two options:
  - `permission: "signed-in"` (with `requireUserApi`), for `/api/account/*`;
  - `partial` in `run`'s result → 207 `{ data, error }`, still logging the main write.
- `apiFetchWithWarning` returns the 207's `error`. `apiFetch` is unchanged for callers.
- `rpcError` and the new `guardError` forward a 42501 only when its message is one of the hand-written access-guard messages (0021, 0022, 0028). Any other 42501 (RLS, privileges) still gets the generic text.
- **Invite** (`POST /api/admin/users`, `users:create`):
  1. Pre-checks run before the email goes out: the role exists, and the jemaat exists and isn't linked. Failing them gives a 400, not a 207.
  2. `inviteUserByEmail` with `full_name`.
     - `email_exists` → "Email ini sudah terdaftar sebagai pengguna."
     - An email rate limit → a friendly 400.
  3. `set_user_access`. On failure → 207 "Pengguna diundang, tapi gagal set role/jemaat: …".

  GoTrue sends the invite again to an address that was invited but never accepted.

- **Delete** (`DELETE /api/admin/users/[id]`, `users:delete`):
  1. Your own id → 403 "Tidak bisa menghapus akun sendiri."
  2. The last super_admin → 403. This is a friendly pre-check; the trigger is the real guard.
  3. `deleteAuthUser`.
- **One jemaat per account**:
  - The RPC's pre-check plus the unique index enforce it. A race's raw 23505 is mapped to "Jemaat ini sudah terhubung ke akun lain."
  - In the picker, a jemaat linked to another account is shown disabled with "Terhubung ke {email}" (`PersonPicker` gained `disabledReason`).
- **Log Aktivitas** (`lib/activity-log-routes.ts`):
  - The URL is parsed with stage 3's `parseTableSearchParams`: size 10/20/50/100, sort only on `created_at`/`module`. Only a known module key is applied.
  - The date range uses `jakartaTimestampBounds`: the end date counts through 23:59:59 WIB, sent as `lt` 00:00 WIB the next day.
  - A page past the end (PostgREST 416 or an empty page) falls back to the last page, and the page redirects so the URL matches.
  - Sorting by Modul uses the key, so "Pengguna" (`users`) sorts near the end rather than by its label.
- Activity sentences:

  | Module  | Sentences                                                                                                                                                                                                                             |
  | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `users` | `Mengundang pengguna "…"`, `Mengubah role pengguna "…" menjadi "…"`, `Menautkan pengguna "…" ke jemaat "…"`, `Melepas tautan jemaat dari pengguna "…"`, `Mengubah akses pengguna "…": role "…", jemaat "…"`, `Menghapus pengguna "…"` |
  | `roles` | `Menambah role "…"`, `Mengubah role "…"` / `Mengubah nama role "…" menjadi "…"`, `Mengubah permission role "…" (+warta:update, −warta:delete)`, `Menghapus role "…"`                                                                  |
  | `akun`  | `Mengubah nama lengkap menjadi "…"`, `Mengosongkan nama lengkap`, `Mengganti password`                                                                                                                                                |

**Revoking access (E)**

- Permissions are re-read on every request:
  - `getAuthenticatedUser` calls `getUser()` (the Auth server) and `get_my_access`, and React `cache()` lasts only one request.
  - RLS uses `has_permission` on live tables.
  - A role change applies on the next request with the same cookie (integration-tested both ways).
- A deleted user:
  - `getUser()` fails, so pages redirect to `/login` and APIs answer 401.
  - Their access token still passes PostgREST's signature check until it expires (1 h). But `user_roles` cascaded, so the token has no permissions, and log inserts fail the FK (tested over REST).
- Open browser tabs keep their already-rendered sidebar until the next navigation. Every page and API still checks on the server.

**Client IP (brief §7) and hosting**

- `getClientIp` takes the first `x-forwarded-for` entry, else `x-real-ip`. The client can put anything in `x-forwarded-for`, so the value can only be trusted when a proxy you trust overwrites it.
- **Vercel (current)**: Vercel overwrites `x-forwarded-for` with the real client IP, so the logged IP is reliable.
- **Domainesia (possible later)**: on cPanel Node.js hosting (Apache/LiteSpeed in front) or a VPS behind nginx, the proxy usually _appends_ to `x-forwarded-for`. Its first entry is then whatever the client sent.
  - Before moving, change `getClientIp` to trust only what that proxy sets. Options:
    - `x-real-ip` set by nginx (`proxy_set_header X-Real-IP $remote_addr;`);
    - the last `x-forwarded-for` entry, added by the trusted proxy;
    - `cf-connecting-ip` behind Cloudflare.
  - Not changed now, as agreed.

**UI**

- **Pengguna**:
  - The shared table: Nama (avatar and a "Kamu" badge), Email, Role (facet, with "Tanpa role"), Jemaat.
  - Edit/Lihat dialog: Role + Jemaat, one "Simpan".
  - On your own row, the Role select is disabled with a note, and "Hapus" isn't offered.
  - A user holding several roles (possible only through SQL) is shown with all of them. Saving replaces them with one, and the dialog says so.
  - A 207 invite shows a warning toast (10 s), not a success.
- **Roles & Permissions**:
  - Role cards, sorted by name: description, and one mono badge per visible permission. announcements/content are never shown.
  - Icon buttons on each card: Edit (`roles:update`) and Hapus (`roles:delete`, not on super_admin).
  - The permission editor appears only with `roles:update`. It is a real `<table>`:
    - rows are roles, columns are resource/action, and the role column is sticky, with horizontal scroll on narrow screens;
    - "—" marks a permission that doesn't exist (activity_log has only read);
    - each row has its own "Simpan"/"Batal", enabled only after a change;
    - super_admin's roles/users boxes are disabled, with "(terkunci)" in their label.
  - A standing warning says roles:_/users:_ equal super admin access. A save that newly grants one of them asks for confirmation first.
  - The matrix is an editor, not a list, so it doesn't use the shared DataTable.
- **Log Aktivitas**: stage 3's server-mode table (search, Modul single-select with the §7 labels, date range, Waktu in WIB, IP in mono).
- **Profil Saya**:
  - Informasi Akun: email, role badges or "Tanpa role", and Nama Lengkap + Simpan.
  - Ganti Password: Password saat ini, Password baru, Konfirmasi.
- **Streamed redirects**: `/admin` has a `loading.tsx` (stage 1). Once streaming has started, a forbidden page can answer 200 with `<meta http-equiv="refresh" content="1;url=/admin?error=forbidden">` instead of a 307, which is Next's documented behavior.
  - The HTTP check confirmed that such a response carries no other account's data.
  - It applies to every admin page, not only this stage's.
- **To check in a browser**: Peribadahan's `Select`s (stage 6) don't pass `items`. Base UI uses `items` to show the selected label before the popup has opened. This stage's selects do pass it.

**Local development**

- `supabase/config.toml` now loads `supabase/templates/invite.html`. That needed a `supabase stop` + `start`, which restored from the local backup with nothing lost. Invite emails land in Mailpit (`http://127.0.0.1:54324`).
- The integration harness now also sets `SUPABASE_SERVICE_ROLE_KEY` and `SITE_URL`, from the local stack only. It gained `serviceClient`, `createTestUser`, `latestMail`, `setRequestHeaders`, and a `password` argument for `signIn`.

**Verification (stage 10)**

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass. `/admin/users`, `/admin/roles`, `/admin/log-aktivitas`, `/admin/akun`, and the six new API routes are in the build's route list.
- `pnpm test`: 180 tests, 26 files. New:
  - `site-url.test.ts`: accepted and rejected origins; it fails closed.
  - `mutation`: "signed-in", the 207, and guard-message forwarding.
  - `users-manager.test.tsx`: no Hapus on your own row; your own role locked and not sent; a 207 shown as a warning; no invite/delete controls without the permission.
  - `permission-matrix.test.tsx`: the warning, hidden resources, locked super_admin boxes, per-row save, and the confirmation before granting users:\*.
- `pnpm test:db`: 14 files, 389 tests.
  - New: `users_roles.test.sql` (29) and `activity_logs.test.sql` (26).
  - `access_guard.test.sql`'s "postgres can still change role permissions" now uses the backup role, because super_admin's own grants are locked by design since 0028.
- `pnpm test:integration`: 8 files, 105 tests. The new `users-roles.test.ts` (18) covers every item on the stage's test list:
  - viewer 403s and the forbidden redirects (§13 #1);
  - the invite with a forged Host/X-Forwarded-Host/Origin: the `redirectTo` passed to Supabase and the emailed link both use the configured origin;
  - the exists / linked-jemaat / invalid-email errors, with no email sent;
  - the 207;
  - one jemaat per account;
  - your own role change refused, while your own jemaat link can change;
  - deleting your own account refused (§13 #12);
  - the last super_admin can't be demoted or deleted;
  - a role change applying on the next request, both ways;
  - a deleted user's cookie → 401 and `/login`, and their token can't write or log over REST;
  - roles CRUD with hidden grants preserved, and the super_admin role protections;
  - update/delete on `activity_logs` over REST → 42501, for both super_admin and viewer;
  - the log filter: an entry at 23:30 WIB on the end date included and one at 00:30 the next day excluded; a literal `%`; the module filter; an injection-shaped search; page clamping;
  - the profile name, including an empty name saved as null;
  - the password change: wrong current password, too short, mismatch, and unchanged password each give their message; a successful change signs out the other session.
- **HTTP**: `next build` + `next start` on :3107 against the local stack. It used env overrides, the server output contains no project URL, and the normal build was rerun afterwards.
  - `/login?next=https://example.com` → `/admin` (§13 #15).
  - Viewer on the three pages → `/admin?error=forbidden`; the notice shows, the sidebar hides them, and the API → 403.
  - An invite sent with a forged Host / X-Forwarded-Host / Origin → the email link uses the Site URL.
  - Invite end to end locally (§13 #13): following the link → `/auth/set-password` → a no-JS password form post → `/admin` showing role editor; signing in with the new password works.
  - The callback ignores a forged Host.
  - `?page=9999&size=1000` on the log → the last page, with size dropped from the URL.
- Mutation checks:
  - dropping the three super_admin triggers fails 14 pgTAP tests;
  - dropping the two log triggers fails 5;
  - showing "Hapus" on your own row fails the component test;
  - removing the server's own-account check fails the integration test. It was run alone, so the last-super_admin guard kept the seed account safe.
- **Not verified yet**: an actual browser (light/dark, 360px, keyboard-only). This matters most for the permission matrix's horizontal scroll and sticky column, the Base UI Select/Combobox dialogs, and the disabled "Terhubung ke …" options. No browser tool was available. The dev server already running on :3000 (pointed at the `*.supabase.co` project) was left alone.

### Stage 9c (Public UI), 2026-09-30

Visual-only stage on top of stage 9b's data layer: no migration, no new route, no RLS/RPC change. Plan (component structure, loader shape, dark-mode mapping) was written up and approved before starting.

**Decisions approved before starting**

- **Jadwal Ibadah's data source switches from the rolling 7-day `public_jadwal_mendatang` (stage 9b) to the Minggu–Sabtu `public_jadwal_pekan_ini`** (same range as Beranda), per this stage's explicit instruction for day tabs over "Minggu–Sabtu minggu ini". `public_jadwal_mendatang` (0027) and its loader (`loadJadwalMendatang`/`parseUpcomingScheduleRows` in `lib/public-site.ts`/`lib/public-schedule.ts`) are left in place, tested, and unused by any page — removing a migrated, working DB function was out of scope for a visual stage.
- **Brand band tokens.** The header/hero/page-title band/footer/dark CTA sections in `docs/design/*.html` are a fixed color-blocked surface, not a themable one: `--brand`/`--brand-foreground`/`--brand-muted`/`--brand-border` (`#1F2E29`/`#FAFAF9`/`#B7CBC3`/`rgb(250 250 249 / 14%)`) are declared identically under `:root` and `.dark` in `globals.css`. Everything else (cards, borders, text, `--primary`) reuses the tokens from stage 1 unchanged.
- **Newsreader** (`next/font/google`) added in `app/layout.tsx`, mapped to `--font-serif` in `@theme inline`. Public headings only; the admin shell never sets `font-serif`.
- **Header has two looks from one component** (`components/public/public-header.tsx`, the only client piece of the shell): "brand" (dark band, desktop only) on `/`, `/tentang-kami`, `/jadwal-ibadah`, `/kontak`, and "plain" (light bordered bar) on `/warta*` at every width and on every page below `md` — derived from `usePathname()`, not threaded through each page. `PublicNav` gained a `variant` prop for this; its last link (Kontak) renders as the mockups' pill CTA only in the "brand" variant desktop. `ThemeSwitcher` gained an optional `className` so the header can recolor its trigger on the brand band without changing its look anywhere else it's used (admin topbar, `auth-card`).
- **Placeholder content is never a single "being prepared" box per section.** `lib/public/placeholder-content.ts` returns arrays sized like each mockup's own `hint-placeholder-count` (6 pelayanan, 3 kegiatan, 4 linimasa, 4 majelis, 4 kontak fields), so the layout reads as complete; every string inside is still literally `TODO: …`, never an invented fact. Fields that stay genuinely absent (`kontak.telepon`, `rekening`) render their card/banner in a placeholder-styled state rather than being hidden — the §14.6 "hide empty sections" rule is deferred to when the real modules (11a/11b/14) exist.

**Data layer**

- `lib/public/site-content.ts`: one loader function per page (`loadBerandaContent`, `loadTentangKamiContent`, `loadJadwalIbadahContent`, `loadKontakContent`), each composing the real stage-9b loaders (`Result<T>`, can fail) with `lib/public/placeholder-content.ts` (plain values, never fails). `/warta` and `/warta/[slug]` keep calling `loadPublicWartaList`/`loadPublicWarta` directly, since they have no placeholder part.
- `lib/public/whatsapp.ts`: `buildWaLink(phone)` — digits only, a leading `0` becomes `62`. Unit-tested. The Kontak loader returns `telepon: null` (no invented number), so `WhatsappButton` renders a neutral disabled-looking state today; once stage 14 fills a real number, the same code renders a live link with no change.
- `lib/dates.ts` gained `formatDayShort` (e.g. "Rab") for the day tabs.

**UI** (`components/public/`)

- New: `public-header.tsx` (see above), `brand-mark.tsx`, `public-image.tsx` (`PublicImage`: required alt, dashed placeholder box when `photo` is `null` — true for every photo right now — never an external domain), `hero.tsx`, `schedule-tabs.tsx`, `ministry-grid.tsx`, `activity-grid.tsx`, `timeline.tsx`, `majelis-grid.tsx`, `contact-cards.tsx` (`ContactCards` + `WhatsappButton`), `rekening-banner.tsx`, `map-placeholder.tsx`, `warta-table-of-contents.tsx`.
- `public-shell.tsx` split: the interactive header moved out to `public-header.tsx` so `PublicContainer`/`PublicSection`/`PublicPageHeader`/`PlaceholderBlock` stay plain Server Components (brief's "Server Components by default"). Added `PublicPageTitleBand` (the dark title band on Tentang Kami/Jadwal Ibadah/Kontak); `PublicPageHeader` (light, no band) is now used only on `/warta`'s list page, which keeps the "plain" header at every width per `warta-detail.html`.
- `schedule-tabs.tsx`: Base UI `Tabs` (already in the project since stage 9a) with `activateOnFocus` — its default is `false` (arrow keys only move focus; Enter/Space activates), which would make a 7-day picker feel unresponsive, so this stage turns it on so arrow keys immediately switch the shown day. Reuses `ScheduleEntry` (newly exported from `schedule-list.tsx`) inside each day's panel rather than a second row renderer.
- `warta-public-view.tsx`: added the table-of-contents rail (`grid-cols-[200px_minmax(0,42rem)]` on `lg`), `font-serif` headings, and a "Tema: " prefix on the header's tema line (the one rendered-text change to an existing tested component; `warta-public-view.test.tsx` was updated to match). Heading levels/ids/section order are unchanged from stage 9b, so every other existing assertion still holds. `/warta/[slug]/page.tsx` switched from `PublicContainer narrow` to the default width to fit the rail.
- Jadwal Ibadah dropped the old static "Jadwal rutin" placeholder section (not in the mockup; the real week schedule now covers that ground) in favor of the mockup's "Pertama kali datang?" and "Warta minggu ini" aside cards.

**Verification (stage 9c)**

- `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass; the six public routes build with the same static/dynamic split as stage 9b (`/kontak`, `/tentang-kami` static with `revalidate = 86400`; the rest dynamic).
- `pnpm test`: 185 tests, 28 files (adds `lib/public/whatsapp.test.ts`, 2 tests; `schedule-tabs.test.tsx`, 3 tests: default tab is today's under a mocked Sunday-adjacent Wednesday, `activateOnFocus` moves the shown day with `{ArrowRight}` alone with no time mocking needed, and an empty day shows the friendly message). `warta-public-view.test.tsx`'s tema assertion updated for the new "Tema: " prefix; every other assertion in that file (section order, heading levels, the SMKA table, the four finance figures, HTML-as-text, hidden-when-empty) needed no change.
- **HTTP**, `next build` + a background `next start` on :3107, both via process-env overrides pointing at the local stack only (confirmed the production `.next/server`/`.next/static` output contains no `*.supabase.co` URL — only stale `.next/dev/*` cache from an earlier `next dev` session did, which ships to no one); the normal build was rerun afterwards.
  - All five pages → 200, titles "{page} | GKP Rangkasbitung", `lang="id"`, Newsreader's font variable present on `<html>`.
  - `/warta/does-not-exist` → 404.
  - `/warta/2026-09-27-contoh-warta-minggu-ini` (seeded) → 200, all five `h2` sections present with ids matching the table-of-contents anchors exactly.
  - `/jadwal-ibadah` → 7 `role="tab"` elements.
  - Anon REST `jemaat` and `sarana_dana_transactions` → 401, unchanged from stage 2/9b.
- **Not verified yet**: an actual browser (dark theme, 360px layout, and pointer/keyboard use beyond what the component tests exercise — the mobile slide-over menu's focus return, the brand-vs-plain header's visual seam at the `md` breakpoint, and the schedule tabs' wrapping at 360px). No browser tool was available in this session.

### Stage 11a (Upload foto + Profil Gereja), 2026-09-30

**Before deploying to production**

- Push migration `0029_situs_profil_gereja.sql` together with 0018–0028. It creates the `situs` bucket itself (public, 5 MB, JPEG/PNG/WebP).
- After pushing, upload one photo in production. `private.enforce_situs_photo_paths` is a definer function owned by `postgres` that reads `storage.objects`. If a photo that was just uploaded gets "Foto tidak ditemukan di penyimpanan.", the hosted `postgres` role doesn't bypass RLS on `storage.objects`, and the check needs another way to read it.
- Vercel caps a request body at 4.5 MB before the route runs. The browser shrinks a file over 4 MB first (see below), so a 4.5–5 MB photo still works.

**Decisions approved before starting (plan and questions asked, not decided alone)**

- **Service role for storage** (an approved addition to brief §3): `lib/supabase/storage-admin.ts` (`server-only`) exports only `uploadSitusObject`, `removeSitusObjects`, and `listSitusObjects`, all limited to the `situs` bucket.
  - The client is never exported.
  - The bucket has **no** storage policy, so anon and authenticated can't insert, update, delete, or list (pgTAP and integration tested). Public read works by URL only.
- **Body limit / Vercel**: the server accepts up to 5 MB (brief).
  - `PhotoField` shrinks a file over 4 MB in the browser (canvas, long edge 2000 px). A PNG that is still too big becomes a JPEG.
  - The server still validates and re-encodes whatever arrives.
  - A 413 from the platform shows "File terlalu besar untuk diunggah…".
- **Output format** follows the input: JPEG → JPEG q85 (mozjpeg), PNG → PNG lossless (so QRIS stays sharp), WebP → WebP q85.
- **Public pages render per request.**
  - Tentang Kami and Kontak lost `revalidate = 86400` and now read through `connection()`, like 9b's data pages.
  - The public layout loads the footer's social links, so every public page is dynamic.
  - Why not static: a static page would read the production DB at `next build`, and an edit made through REST would show up to a day late.
  - Every `situs` mutation still calls `revalidatePath("/", "layout")` and revalidates `/admin/profil-gereja`.
- **Hero "Kebaktian Minggu" card**: 9c filled it with jam sekretariat, which is wrong for that label. It now lists this week's Kebaktian Minggu (`umum`) times from `public_jadwal_pekan_ini`, for example "07.00 & 09.30 WIB", and is hidden when there are none. The Lokasi card uses alamat and is hidden when empty.
- **Social links** go in the footer on every public page ("Ikuti kami", as in the beranda mockup). They are text links, because lucide 1.x has no brand icons, and are hidden when none is set.
- **Sidebar**: only Profil Gereja for now, under the heading "Konten Situs" after Label Jemaat.
  - `NavItem.group`: consecutive entries with the same group render in a `role="group"` block with a heading.
  - Stage 11b adds Pelayanan, Majelis, and Kegiatan to the same group.
- **Linimasa `tahun`** is free text, at most 20 characters (e.g. "1950-an").

**0029 migration**

- **Permissions**: `situs:{create,read,update,delete}` and `situs_rekening:update`, seeded per §14.
  - `set_role_ui_permissions` (0028, `create or replace`) now covers both resources.
  - `VISIBLE_RESOURCES` and the `Resource` type include both, so they appear in the permission matrix. `situs_rekening` shows "—" for create, read, and delete.
- **`profil_gereja`** is a singleton: `id smallint primary key default 1` with `check (id = 1)`, seeded with one row. Authenticated has no insert, delete, or truncate on it. Checks:
  - every text column: not blank (blank is stored as null) and a length cap;
  - `telepon` `^[0-9]{8,15}$`; email format;
  - `maps_url`: https with host `google.com`, `www.google.com`, or `maps.google.com` and a `/maps` path, or `maps.app.goo.gl/…`;
  - social URLs: https with the platform's own host (`instagram.com`; `youtube.com` incl. `m.`; `facebook.com` incl. `m.`/`web.`). The host must be followed by "/", so lookalike hosts, `@` userinfo, and ports fail;
  - `misi text[]`: at most 20 lines, each non-blank and at most 500 characters (`private.is_valid_misi`);
  - photos: path and alt both set or both null, alt required, and the path must match `{folder}/{uuid v4}.{jpg|png|webp}` (`private.is_situs_photo_path`).
- **`profil_gereja_rekening`** is a separate singleton, so RLS alone limits writes to `situs_rekening:update`.
  - Nama bank, nomor rekening, and atas nama are all set or all empty.
  - `nomor_rekening` is digits, optionally grouped with spaces or dashes.
  - It also holds the QRIS photo pair.
- **`update_profil_gereja_rekening(...)`** (invoker, checks `situs_rekening:update`) locks the row, updates it, and returns `{old, new}` for the activity log. Every argument defaults to null.
- **`profil_gereja_linimasa`**: insert needs `situs:create`, update needs `situs:update`, and delete needs `situs:delete` (so editor can't delete). `reorder_profil_linimasa(ids)` has the same contract as `reorder_litbang_categories`.
- **`private.enforce_situs_photo_paths`** (trigger, definer): a photo path that changes must exist in `storage.objects` in the `situs` bucket (22023 "Foto tidak ditemukan di penyimpanan.").
  - A malformed path is left to the CHECK (23514).
  - So no write path, REST included, can store a broken reference.
- **`public_profil_gereja()`** (definer, anon and authenticated) returns jsonb with exactly the public fields plus `linimasa`, and no `updated_at`. anon has no privileges on the three tables.
- **`situs_referenced_photo_paths()`** (definer, needs `situs:update`) returns every path a row refers to. Stage 11b adds its tables here and its folders to `SITUS_FOLDERS` in `lib/situs-photos.ts`.

**Photo pipeline (reusable for 11b)**

- **`lib/image-processing.ts`**:
  1. Check the magic bytes (JPEG `FFD8FF`, the PNG signature, or `RIFF….WEBP`). SVG, GIF, scripts, and everything else are refused before sharp sees them.
  2. sharp's own `format` must agree with the magic bytes. Decoding uses `limitInputPixels` 60 MP and reads the first frame only.
  3. `.autoOrient()`, then resize to fit inside 2000 px (`withoutEnlargement`).
  4. Re-encode with no `keepMetadata`, so EXIF/GPS, XMP, ICC, and appended bytes are all gone.

  `sharp` is pinned to 0.35.4, the version Next already ships.

- **`lib/situs-photos.ts`**:
  - `withPhotoSlot(shape)`: a multipart schema whose `foto_file` / `foto_alt` / `foto_hapus` fields become `input.foto`.
  - `savePhotoSlot({ folder, slot, current, write })`:
    1. Validate and re-encode the photo.
    2. Upload it as `{folder}/{randomUUID}.{ext}`.
    3. Call `write(next)`.
    4. If `write` fails, delete the new object.
    5. On success, delete the old object only if `situs_referenced_photo_paths` no longer lists it.
    6. Sweep: delete unreferenced objects older than 15 minutes.

    Steps 4–6 never fail the request; a leftover object waits for the next sweep.

  - Accepted risk: a REST write that re-points a row at the old path between step 5's check and the delete would break that reference. It needs a deliberate REST call timed into that gap.

- **`mutation({ multipart: { maxBytes, tooLarge } })`** uses `parseMultipart` / `readLimitedBody` in `lib/api.ts`.
  - It refuses early on Content-Length and also counts bytes while streaming.
  - The limit is 5 MB + 64 KB. Over it: 400 "Ukuran foto maksimal 5 MB." (§10 lists no 413).
- **`apiFetch`** sends a `FormData` body as multipart.
- **Client**:
  - `lib/photo-upload-client.ts`: `prepareUpload` and `appendPhotoFields`.
  - `components/shared/photo-field.tsx`: preview, "Pilih Foto" / "Ganti Foto" / "Hapus Foto", and alt text that is required whenever a photo will exist.
- **`next.config.ts`**:
  - `images.remotePatterns` allows only `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/situs/**`.
  - `dangerouslyAllowLocalIP` is on only when that URL is 127.0.0.1 or localhost.

**Routes (`lib/profil-gereja-routes.ts`)**

- PATCH, multipart:
  - `/api/admin/profil-gereja/beranda`, `/sambutan`, and `/tentang` need `situs:update`.
  - `/persembahan` needs `situs_rekening:update`. Uploading or removing the QRIS file also needs `situs:update`.
- PATCH, JSON: `/kontak` and `/sosial-media`. URLs are normalized through `new URL()` (scheme and host lowercased), then checked against the same patterns as the DB.
- Linimasa:
  - `POST /linimasa` (`situs:create`; appends at max + 1);
  - `PATCH /linimasa/[id]` (`situs:update`);
  - `DELETE /linimasa/[id]` (`situs:delete`);
  - `POST /linimasa/reorder` (`situs:update`).
- Activity log, module `situs` (label "Konten Situs"):
  - `Mengubah profil gereja bagian {Beranda|Sambutan|Tentang|Kontak|Sosial Media}`, plus " (foto ditambahkan|diganti|dihapus)" or " (teks alternatif foto diubah)" when the photo changed;
  - `Mengubah rekening persembahan: nama bank (kosong) → "…"; nomor rekening "…" → "…"; QRIS diganti`, built from the RPC's old and new values;
  - `Menambah|Mengubah|Menghapus linimasa "{tahun} · {teks…}"`;
  - `Mengubah urutan linimasa`.

**UI**

- `/admin/profil-gereja` (`situs:read`) is built from one generic `ProfilFormSection`: field configs, an optional photo, and one "Simpan". After a save, the form takes its values back from the response.
- Linimasa follows the Litbang pattern:
  - dnd-kit with keyboard support and Indonesian announcements;
  - optimistic order with rollback;
  - Simpan per item;
  - Hapus only with `situs:delete`.
- Persembahan is read-only without `situs_rekening:update` and says so. The QRIS picker is locked without `situs:update`.
- **Public site**:
  - Profil placeholders are gone. Pelayanan, Majelis, and Kegiatan stay placeholders until 11b.
  - Hidden when empty (§14.6):
    - on Beranda: the hero subtitle and photo, each hero info card, Sambutan, and the Persembahan band (shown only when all three account fields are set; the QRIS image only when present);
    - on Tentang Kami: Sejarah, Linimasa, Visi, and Misi;
    - on Kontak (and Beranda's Kunjungi Kami): each contact card, the WhatsApp button, and the Maps link;
    - in the footer: the social links.
  - The hero always shows. Its title falls back to "GKP Rangkasbitung".
  - Kontak with no data at all says "Informasi kontak belum tersedia."
  - `MapPlaceholder` is replaced by `MapLink`, a card that opens Google Maps in a new tab.
    - There is no iframe, because a share link can't be embedded and an embed loads Google tracking.
  - The hero section got `isolate`. Without it, the photo (negative z-index) would sit behind the band's own background.
  - Multi-line text uses `whitespace-pre-line`, never HTML.

**Verification (stage 11a)**

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass. `/admin/profil-gereja` and the nine API routes are in the route list, and `/tentang-kami` and `/kontak` are now ƒ.
- `pnpm test`: 220 tests, 33 files. New:
  - `image-processing.test.ts` (10):
    - sniffing by magic bytes;
    - PHP renamed to `.jpg`, SVG with `<script>`, over 5 MB, and a JPEG header glued onto garbage are refused;
    - EXIF, GPS, and Make are gone (no "Exif" bytes left);
    - an appended `<?php` payload is dropped;
    - 3000×1500 becomes 2000×1000, and small images aren't enlarged;
    - the EXIF orientation is applied, then stripped.
  - `profil-gereja.test.ts` (8): URL, phone, misi, and rekening validators, including lookalike hosts.
  - `api.test.ts` (6): the Content-Length and streamed body limits, and multipart parsing.
  - `site-content.test.ts` (6): empty fields hide their sections, the default hero title, the photo path guard, the wa.me link, and the Kebaktian Minggu times.
  - `profil-gereja-editor.test.tsx` (5):
    - read-only mode;
    - an editor without rekening access;
    - alt text required before any request;
    - one multipart request per section;
    - the all-or-none rekening check.
- `pnpm test:db`: 15 files, 445 tests. New `situs_profil_gereja.test.sql` (56):
  - the permission seed; the bucket settings, with no storage policy for `situs`;
  - the singletons;
  - every CHECK, including lookalike, userinfo, http, and `javascript:` URLs;
  - a path with no object is refused;
  - anon: no table access, exactly the public keys, and no bucket write;
  - viewer: read-only;
  - editor: may edit content; rekening refused both directly and through the RPC; no bucket write or list; no linimasa delete;
  - reorder, stale and valid;
  - the referenced-paths function;
  - admin's RPC returning old and new values;
  - the permission editor accepting `situs`.
- `pnpm test:integration`: 9 files, 123 tests. New `profil-gereja.test.ts` (18) covers every item on the stage's test list:
  - **Access**: 401 without a session; viewer 403 on every write, with nothing written.
  - **Upload validation**: PHP-as-.jpg, SVG, and over 5 MB → 400 with nothing uploaded; alt text required.
  - **Stored file**: a GPS JPEG is stored without metadata, under a random name, and is publicly readable; an appended payload is dropped.
  - **Replace and remove**:
    - replacing deletes the old object, while an alt-only change keeps it;
    - a simulated DB failure deletes the new object and leaves the row unchanged;
    - removing the photo deletes its object.
  - **Sweep**: respects the grace period and keeps referenced objects.
  - **Direct storage and REST**: anon and editor uploads and removes are refused; a REST path to a missing object is refused.
  - **Kontak / Sosial Media**: validation and normalization.
  - **Persembahan**:
    - editor through the route, REST, and the RPC: all refused;
    - admin saves, with old and new values in the log, and a QRIS PNG;
    - a partly filled account → 400.
  - **Linimasa**: add, edit, and reorder; a stale reorder is refused; editor delete → 403; admin delete works.
  - **Public read**: anon gets only the public fields.
- **Mutation checks**:
  - removing the rollback delete fails the DB-failure test;
  - removing the old-object delete fails 2 tests;
  - `.keepMetadata()` fails 2 unit tests and 1 integration test;
  - skipping the magic-byte gate fails the PHP/SVG test;
  - loosening the rekening RLS policy to `situs:update` fails 2 pgTAP tests. The policy was restored and the suite passes.
- **HTTP**, with `next build` + `next start` on :3107, using env overrides for the local stack only:
  - All public pages → 200.
  - An empty profile shows the default hero title and hides Sambutan, Persembahan, Kunjungi Kami, and the footer links.
  - Real cookie sessions through the proxy:
    - viewer multipart → 403, editor → 200;
    - a 6 MB body → 400 "Ukuran foto maksimal 5 MB.";
    - editor Persembahan → 403, admin → 200;
    - `/admin/profil-gereja` → 200 for viewer and editor.
  - Every filled field showed on Beranda, Tentang Kami, and Kontak: the wa.me link, the maps link, and Instagram only (YouTube was empty and hidden).
  - `/_next/image` for the hero → 200 image/jpeg.
  - A 2600×1400 JPEG with GPS was stored as 2000×1077 with no EXIF/XMP.

  The fixtures and objects were removed afterwards, and the normal build was rerun; no local URL is left in `.next`.

- **Not verified yet**: an actual browser (light/dark, 360px, keyboard-only). It matters most for:
  - `PhotoField` (a hidden file input behind a button, and the preview);
  - the canvas shrink for files over 4 MB, which jsdom can't run;
  - Linimasa pointer and touch dragging;
  - the new sidebar group heading;
  - the permission matrix with two more resources;
  - the hero with a real photo.
- The local database was reset once (`supabase db reset --local`) while 0029 was being written. It is now at 0029 with the seed.

### Stage 11b (Pelayanan, Majelis, Kegiatan + public loaders), 2026-09-30

**Before deploying to production**

- Push migration `0030_situs_pelayanan_majelis_kegiatan.sql` together with 0018–0029.

**Decisions approved before starting (plan and questions asked, not decided alone)**

- **Every write in this stage's three modules — including "Tambah" and reorder — needs `situs:update`, not `situs:create`.** Only "Hapus" needs `situs:delete`; "read" needs `situs:read`. This was the plan's explicit instruction and departs from Linimasa (stage 11a), which used `situs:create` for its insert. No `situs:create` grant is exercised anywhere in this stage's routes. Functionally identical for the seeded roles (editor has create+read+update either way), but a custom role with `situs:update` alone can now add/reorder Pelayanan, Majelis, and Kegiatan without `situs:create`.
- **Pelayanan icon list**: a fixed 10-key set in `lib/pelayanan-icons.ts` (HeartHandshake, Users, GraduationCap, BookOpen, Music2, Baby, HandHeart, Mic2, Coffee, UsersRound), kept in sync by hand with the `pelayanan_icon_check` constraint in 0030. The admin stores the key only; `MinistryGrid` (public) and the admin's icon `Select` both render from the same list.
- **Kegiatan's status is never a field in the add/edit dialog.** It only changes through the row's "Terbitkan" / "Tarik ke Draft" action (own PATCH endpoint, `{ status }` body), same idiom as Warta's header buttons — approved before starting.

**0030 migration**

- Three new tables, `pelayanan`, `majelis`, `kegiatan`, RLS keyed to `situs:{read,update,delete}` for authenticated (see permission mapping above) and a row-filtered anon `select` (`aktif = true` / `status = 'published'`), same shape as stage 4/8's `sort_order` convention (new rows: `max(sort_order) + 1`) for the two reorderable ones.
- `reorder_pelayanan(p_ids)` / `reorder_majelis(p_ids)`: identical contract to `reorder_profil_linimasa` (0029) — rejects an `ids` array that isn't exactly the current set, with the same "sudah berubah" message text per module.
- `enforce_situs_photo_paths` (0029) is reused on `majelis.foto_path` and `kegiatan.foto_path`; `touch_updated_at` is added to `kegiatan` only (Pelayanan/Majelis have no concurrency control, same as Litbang).
- `situs_referenced_photo_paths()` (0029) is `create or replace`d to `union` in `majelis.foto_path` and `kegiatan.foto_path`, so the photo-delete/sweep pipeline (`lib/situs-photos.ts`, stage 11a) covers all five photo-bearing tables without any change to that pipeline's own code.
- No new permission rows: `situs`/`situs_rekening` (0029) already cover this stage per the mapping above.

**Photo pipeline reuse**

- `lib/situs-photos.ts`: `SITUS_FOLDERS` gains `majelis` and `kegiatan`. New export `deletePhotoObject(path)`: unlike `savePhotoSlot`'s replace/remove flow (which checks `situs_referenced_photo_paths` before deleting the _old_ object, because the row being saved might still need it), a row **delete** has no surviving row that could reference that exact random path, so it deletes the object immediately, no referenced-paths check, and never throws (errors are logged and left for the next sweep).
- Majelis and Kegiatan photos go through the existing `savePhotoSlot` for add/edit (multipart, `withPhotoSlot`), and `deletePhotoObject` only on row delete.

**Routes (`lib/pelayanan-routes.ts`, `lib/majelis-routes.ts`, `lib/kegiatan-routes.ts`)**

- Pelayanan: `POST`, `PATCH /[id]` (two field-groups in one endpoint, same convention as Litbang: `{nama,deskripsi,jadwal,icon}` from "Simpan" or `{aktif}` alone from the checkbox), `DELETE /[id]`, `POST /reorder`. All JSON (no photo).
- Majelis: `POST` and `PATCH /[id]` are multipart (`nama`, `jabatan`, `foto`) via `savePhotoSlot`. **The Aktif toggle is its own endpoint, `PATCH /[id]/aktif` (JSON, `{aktif}`)** — a deliberate split from Litbang/Pelayanan's single-endpoint convention, because a photo-bearing PATCH must be multipart end-to-end, and forcing the checkbox's own one-field toggle through multipart (re-sending the current photo's alt text just to keep it unchanged) would be fragile on the client. `DELETE /[id]` removes the photo object too (`deletePhotoObject`). `POST /reorder`.
- Kegiatan: `POST` and `PATCH /[id]` are multipart (`judul`, `tanggal`, `waktu`, `tempat`, `deskripsi`, `foto`); new rows always start `draft`. `PATCH /[id]/status` (JSON, `{status}`) is Terbitkan/Tarik ke Draft. `DELETE /[id]` removes the photo object too. No reorder (brief §9.2 table pattern, not cards); the admin list loads whole and sorts/filters on the client like other bounded lists (brief §9.2), server-ordered newest-tanggal-first only as the unsorted default.
- **`waktu`'s Zod schema is not the JSON `timeSchema` peribadahan-routes.ts uses.** A multipart field is always a string (never `null`), so treating an empty string as "no time" must happen in a `.transform` _before_ the regex `.refine` runs, not via `.nullish()` on top of a regex-validated string (which still requires empty string to match the regex and 400s on "Waktu tidak valid."). Found by the integration test failing 400 on a blank waktu field; peribadahan-routes.ts's `timeSchema` doesn't have this bug because its JSON client always sends `jam: jam || null` explicitly, never `""`.
- Activity sentences, module `situs`: `Menambah/Mengubah/Menghapus pelayanan "…"`, `Mengaktifkan/Menonaktifkan pelayanan "…"`, `Mengubah urutan pelayanan`; same three for majelis; `Menambah/Mengubah/Menghapus kegiatan "…" (YYYY-MM-DD)` and `Mempublikasikan/Menarik kegiatan "…" (YYYY-MM-DD) ke draft` — the date is the **raw ISO date** in the sentence, matching Warta's own convention (`Membuat warta "…" (2025-11-30)`), not `formatDateLong`.
- Revalidation: each module's own `/admin/...` page, plus `/` (layout) for Pelayanan and Kegiatan (Beranda) and `/tentang-kami` (page) for Majelis — kept even though the public pages are already per-request dynamic (stage 9b/11a precedent).

**UI**

- `components/pelayanan/`: `pelayanan-manager` + `pelayanan-card` (drag-reorder cards, same dnd-kit pattern as Litbang) with a Jadwal text input and an icon `Select` added to the card; `add-pelayanan-dialog`.
- `components/majelis/`: same card-list shape, `majelis-card` embeds `PhotoField` (reused from 11a) inside the "Simpan" form, with its own `Aktif` checkbox wired to the `/aktif` endpoint; `add-majelis-dialog`.
- `components/kegiatan/`: `kegiatan-manager` (`DataTable`, Status facet, date-range filter on tanggal, sorting — mirrors `WartaListManager`), `kegiatan-dialog` (one dialog for both add and edit, keyed by `row?.id ?? "new"`, same remount convention as `MasterDataFormDialog`; DatePicker + time input + `PhotoField`), `kegiatan-status-badge` (mirrors `WartaStatusBadge`).
- **Both modules that gate Hapus on `situs:delete` separately from `situs:update`-gated Simpan/Tambah/reorder** (Pelayanan, Majelis, Kegiatan) show Simpan/Tambah without Hapus for an editor, and would show Hapus without Simpan for a hypothetical role with only `situs:delete` — this asymmetry doesn't exist in Litbang (single `warta:update` gate for both).
- **`components/data-table/row-actions.tsx`**: `RowAction.label` now accepts `string | ((row) => string)`, a small backward-compatible addition needed for Kegiatan's "Terbitkan" / "Tarik ke Draft" extra action, whose label depends on the row's own status (every other module's row actions use a fixed label).
- **Sidebar**: `nav.ts` adds Pelayanan, Majelis, Kegiatan to the "Konten Situs" group after Profil Gereja, each gated on `situs:read`; `sidebar-nav.tsx` maps their icons (HeartHandshake, UsersRound, Calendar).

**Public site (`lib/public-site.ts`, `lib/public/site-content.ts`)**

- Three new loaders, same `connection()` + row-filtered-again-in-the-query pattern as every stage 9b/11a public loader: `loadPublicPelayanan` (aktif, sort_order), `loadPublicMajelis` (aktif, sort_order), `loadPublicKegiatanMendatang` (status published, `tanggal >= today()` in WIB, order tanggal asc, `limit(3)`).
- `site-content.ts`'s `loadBerandaContent`/`loadTentangKamiContent` now call these instead of `placeholder-content.ts`, which is **deleted** (no callers left). A failed Pelayanan/Majelis/Kegiatan load falls back to an empty list (already logged by `public-site.ts`'s `failure()`), same stance as every other public loader failure.
- `(public)/page.tsx` and `(public)/tentang-kami/page.tsx`: the Pelayanan, Kegiatan, and Majelis sections are now wrapped in an empty-list check (`content.pelayanan.length > 0 && (...)`), matching brief §14.6 "section yang kosong disembunyikan" — they weren't before, because the placeholder data was never empty.

**Verification (stage 11b)**

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass. `/admin/pelayanan`, `/admin/majelis`, `/admin/kegiatan`, and the eleven new API routes are in the build's route list.
- `pnpm test`: 235 tests, 36 files. New: `pelayanan-manager.test.tsx` (4: keyboard reorder, Aktif toast, read-only, Hapus-without-Simpan), `majelis-manager.test.tsx` (4: the `/aktif` endpoint gets only `{aktif}`, multipart add with no photo, read-only, canWrite-without-canDelete), `kegiatan-manager.test.tsx` (4: multipart add starts draft, the row menu's label depends on status, Terbitkan calls the status endpoint, read-only). `site-content.test.ts` gained 3 tests for the Pelayanan/Majelis/Kegiatan mapping and its empty-load fallback.
- `pnpm test:db`: 16 files, 482 tests. New `pelayanan_majelis_kegiatan.test.sql` (37): the icon/status/foto-pairing constraints, a path with no storage object refused, anon sees only aktif/published rows and can't write, viewer reads but can't write, editor writes and reorders but can't delete, admin deletes, `situs_referenced_photo_paths` includes the surviving majelis/kegiatan photos.
- `pnpm test:integration`: 10 files, 132 tests. New `pelayanan-majelis-kegiatan.test.ts` (9): 401/403 on every route including reorder/aktif/status (delete specifically checked against editor, who lacks `situs:delete`); add/toggle/reorder/delete each log exactly one activity row; a bad icon key → 400; reorder rejects a stale list; Majelis and Kegiatan photo objects are deleted from storage on row delete; anon's REST read of a draft kegiatan returns `[]`.
  - Found and fixed during this pass: the multipart `waktu` field 400'd on blank input (see "waktu's Zod schema" above) — caught by the "adds as draft" test before any component code shipped with the same bug (`KegiatanDialog` always sends `waktu: ""` when the field is empty).
- Mutation checks were not run as a separate pass this stage (time budget); the pgTAP and integration suites above were written to fail without their matching route/RPC behavior (e.g. the reorder staleness checks, the delete-permission split, the photo-cleanup-on-delete assertions), consistent with the project's usual mutation-check intent.
- **Not verified yet**: an actual browser (light/dark, 360px, keyboard-only, pointer/touch drag on the two new card lists). No browser tool was available in this session, consistent with every prior stage's note. `next dev` was not started; `pnpm build` (production mode) was used instead to confirm the route tree and no compile-time regressions.

### Follow-up: Warta pages share the public template, 2026-09-30

- On request, `/warta` and `/warta/[slug]` now use the same template as Beranda, Tentang Kami, Jadwal Ibadah, and Kontak. This replaces 9c's choice to follow `docs/design/warta-detail.html`'s light header.
- `PublicHeader` is no longer route-dependent: the brand band from `md` up on every page, and the light bar below `md` (unchanged). It no longer needs `usePathname`, so it is a Server Component; `PublicNav`/`ThemeSwitcher` stay the client pieces.
- `PublicPageTitleBand` renders a `<header>`, takes a `ReactNode` breadcrumb, and has an optional `eyebrow` line.
  - `/warta`: breadcrumb "Beranda / Warta", title "Warta".
  - `/warta/[slug]`: the "Semua warta" back link sits in the breadcrumb slot, the date is the eyebrow, judul is the H1, and "Tema: …" is the description. The ToC rail and sections sit below in `PublicContainer`. Heading levels, ids, and text are unchanged, so `warta-public-view.test.tsx` passes untouched.
- `PublicPageHeader` (light title) is now used only by the public 404 page.
- Verified: typecheck, lint, `vitest run` (235 tests), and `next build` pass. Not checked in a browser.

### Follow-up: Select trigger showed the raw value instead of the label, 2026-10-01

**Root cause**: Base UI's `Select.Value` only resolves a selected item's label from `Select.Root`'s `items` (or `itemToStringLabel`) prop; it does not look at the popup's `Select.Item` children. Without `items`, it falls back to printing the raw value — a key (`smka`) or a UUID. This was already flagged but not fixed: stage 6's own note above ("Peribadahan's `Select`s (stage 6) don't pass `items`... this stage's selects do pass it") named the exact mechanism and was never applied retroactively.

**Fix, in the wrapper (`components/ui/select.tsx`), not per form**:

- `Select`'s `items` prop is now **required** and typed `ReadonlyArray<{ value; label: ReactNode }>` (exported as `SelectOption`), so a new call site can't compile without one.
- `SelectValue` reads those `items` from a context the wrapper provides and resolves the trigger's label itself: matched value → its label; `value == null` and not itself a listed option → the `placeholder`; anything else (a value no longer among the options, e.g. a deleted wilayah/tempat) → a literal "Tidak ditemukan", never the raw value.
- Fixed the 8 call sites that built a bare `<Select value={key}>` without `items`: `jemaat/jemaat-profile-form.tsx` (Jenis Kelamin, Status Keanggotaan, Wilayah, Hubungan), `keluarga/inline-hubungan-cell.tsx`, `keluarga/tambah-anggota-form.tsx`, `peribadahan/jadwal-dialog.tsx` (Jenis), `peribadahan/edit-jadwal-dialog.tsx` (Tempat, Wilayah), `pelayanan/pelayanan-card.tsx` and `pelayanan/add-pelayanan-dialog.tsx` (Ikon — label is the icon + text, same as the popup item), `sarana-dana/transaction-dialog.tsx` (Tipe).
- `data-table/pagination.tsx`'s page-size items were widened from the `10|20|50|100` literal union to `{ value: number; label: string }`, because `Select`'s tightened typing now ties `items`' value type to `value`/`onValueChange`, and `pageSize` is stored as a plain `number`.
- **Not touched, already correct**: `users/user-dialogs.tsx`'s `RoleSelect`, `data-table/faceted-filter.tsx`, and `data-table/pagination.tsx` already passed `items`. `shared/person-picker.tsx` and `shared/label-multi-select.tsx` (Combobox, not Select) already pass `items` + `itemToStringLabel` and render labels directly in their chips/options. `shared/keluarga-combobox.tsx` is an intentionally free-text combobox (brief §9.9) where the value _is_ the typed name, not a key. Table columns and badges across the app (status, tipe, role, modul, …) already went through label maps (`STATUS_KEANGGOTAAN_LABELS`, `TIPE_LABELS`, `moduleLabel`, …) — no raw-key leakage found there.
- Tests: `components/ui/select.test.tsx` (the wrapper itself — label after picking, label shown immediately for a pre-set value, "Tidak ditemukan" fallback for a stale value, placeholder when nothing is selected) and `jemaat/jemaat-profile-form.test.tsx` (a real consumer: an edit form opened with saved `jenisKelamin`/`statusKeanggotaan`/`wilayahId` shows labels immediately, a deleted wilayah id shows the fallback, picking a new option swaps the trigger's text).
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (242 tests), `pnpm build` all pass.

**Notes for future stages**: a `Select`'s options are always `{ value, label }` — pass `items` to `Select` (see `components/ui/select.tsx`'s `SelectOption`), never a bare `Select` with only `SelectItem` children. This is enforced by the type now, not just convention.

### Stage 11c (Pendeta), 2026-10-01

**Before deploying to production**

- Push migration `0031_situs_pendeta.sql` together with 0018–0030.

**Decisions approved before starting (plan and questions asked, not decided alone)**

- **Write permission mapping**: add/edit → `situs:update`, delete → `situs:delete`, read → `situs:read` — the explicit instruction for this stage, matching Kegiatan's convention (not Linimasa's `situs:create`-for-insert one, and not 11b's own stated-but-inapplicable-here distinction). No new permission rows: `situs`/`situs_rekening` (0029) already cover it.
- **Anon read is column-limited, not the 11b table-grant-plus-RLS-row-filter pattern**: `public_pendeta()` (a `security definer` function, same shape as `public_profil_gereja()`, 0029), not a direct `grant select ... to anon` with a `tampil = true` policy the way `pelayanan`/`majelis`/`kegiatan` do. This was the explicit instruction ("lewat view atau fungsi yang kolomnya dibatasi"), because `pendeta` has an audit-ish column (`created_at`) and a `tampil` column that the other three modules don't meaningfully have reason to hide (their own audit columns are already implicitly excluded by nobody calling them out). `anon` has zero privileges on `public.pendeta`; the table is reachable only through the function.
- **Sambutan's old `sambutan_nama`/`sambutan_jabatan`/`sambutan_foto_path`/`sambutan_foto_alt` columns are dropped in the same migration** that adds `sambutan_pendeta_id` (FK to `pendeta`, `on delete set null`), with any existing row's data moved into a new `pendeta` row first (a plpgsql `do` block, conditional on `sambutan_nama is not null`). In practice this is a no-op everywhere: the project has never been deployed (every stage's "before deploying to production" note says so), and `profil_gereja`'s row has always been all-null, including in `seed.sql`. The migration is still written generically (not seed-specific) so a local database that *was* hand-filled in doesn't lose that pastor's name/title/photo. **`tahun_mulai` for a moved-over row is set to the current year (Asia/Jakarta)**, the one thing that couldn't be carried over faithfully (it was never captured) without inventing a date; this is called out in the migration's own header comment and is expected to be corrected once, by hand, through the new `/admin/pendeta` form, if it ever actually fires outside a hand-filled local dev row.
- **No overlap with Majelis found, so nothing was reported/asked about**: `supabase/seed.sql` never seeds the `public.majelis` table (only `label_jemaat`'s unrelated "Majelis Jemaat" jemaat-label), and stage 11b's own progress notes confirm Majelis launched with no real data either. The instruction to "report and ask before deleting" a Majelis/pendeta overlap therefore never applied; Majelis itself is untouched.

**0031 migration**

- `private.current_year_jakarta()`: `extract(year from (now() at time zone 'Asia/Jakarta'))::int`, a small `private` helper (same schema/purpose as 0029's `is_situs_photo_path`/`enforce_situs_photo_paths`) shared by both of `pendeta`'s year CHECK constraints. Verified directly against the local stack (both the plain CHECK and a REST-level rejection) that a volatile/stable now()-based expression works fine in a table CHECK constraint in Postgres — it's evaluated at write time, which is exactly the brief's "tahun di masa depan ditolak" behavior, not a live-recomputed invariant; **no trigger fallback was needed.**
- `pendeta`: `nama`, `peran` (required text, ≤200), `tahun_mulai` (`between 1800 and current_year_jakarta()`), `tahun_selesai` (`null`, or `between tahun_mulai and current_year_jakarta()`), `foto_path`/`foto_alt` (same pairing + bucket-existence rules as every other `situs` photo column, via 0029's `enforce_situs_photo_paths` trigger), `keterangan` (optional, ≤500), `tampil` (default `true`). No `sort_order`: the brief is explicit that this list is never manually reordered, so there's no reorder RPC either — order is always the formula below.
- `public_pendeta()`: `security definer`, `stable`, returns exactly `id, nama, peran, tahun_mulai, tahun_selesai, foto_path, foto_alt, keterangan` (no `tampil`, no `created_at`) for `tampil = true` rows, pre-ordered `tahun_selesai desc nulls first, tahun_mulai desc, id` (currently serving first, then past pastors by end year, then start year, both descending — the brief's own words). The admin list loader uses the identical `order by` (via `.order(..., { nullsFirst: true })` in Supabase-js) so the CMS table's unsorted order matches the public one.
- `public_profil_gereja()` (0029, `create or replace`d here): the four `sambutan_*` keys are replaced by `sambutan_pendeta_nama`/`_peran`/`_foto_path`/`_foto_alt`, sourced from a `left join public.pendeta d on d.id = p.sambutan_pendeta_id` — **regardless of that pendeta's own `tampil`**, since picking someone for Sambutan is a deliberate, independent admin choice from whether they also appear on the Tentang Kami pendeta list.
- `situs_referenced_photo_paths()` (0029/0030, `create or replace`d here): `profil_gereja`'s own array drops `sambutan_foto_path` (column gone); a new `union select foto_path from public.pendeta where foto_path is not null` covers the new module, so `lib/situs-photos.ts`'s existing delete/sweep pipeline needs no code change — only `SITUS_FOLDERS` gained `"pendeta"`.
- RLS on `pendeta`: `select`/`insert`/`update` check `situs:read`/`situs:update`/`situs:update`, `delete` checks `situs:delete`, all `to authenticated`; `anon` has no table privileges at all (`revoke all ... from anon`, no anon policy), unlike 11b's three tables — this is the module's whole point per the plan above.

**Routes and data loading (`lib/pendeta.ts`, `lib/pendeta-routes.ts`)**

- `lib/pendeta.ts` (no `server-only`, like `lib/kegiatan.ts`/`lib/profil-gereja.ts`): the row type, `pendetaPeriode()` ("2019–sekarang" / "2010–2019"), `pendetaStatus()`/`PENDETA_STATUS_LABELS` (badge text), and `currentYearJakarta()` (client-safe mirror of the DB's `private.current_year_jakarta()`, built on the existing `today()` from `lib/dates.ts`) for the dialog's year-input bounds.
- `createPendeta`/`updatePendeta` are multipart (`withPhotoSlot`, `savePhotoSlot` into the new `"pendeta"` folder), same shape as `kegiatan-routes.ts`. `tahunSelesai` uses the same "empty string means null, not a regex 400" idiom as `kegiatan-routes.ts`'s `waktu` field, for the same reason (a multipart field is always a string). A `.refine` rejects `tahunSelesai < tahunMulai` client-schema-side, on top of the DB CHECK.
- `deletePendeta` removes the photo object (`deletePhotoObject`) the same way Majelis/Kegiatan do; `profil_gereja.sambutan_pendeta_id` needs no app-side handling at all — the FK's `on delete set null` does it, and `lib/pendeta-routes.ts` never has to know Sambutan exists. The admin's delete-confirmation warning about Sambutan going empty is purely client-side (the page already loads `profil_gereja.sambutan_pendeta_id` alongside the list and compares ids).
- Activity sentences follow the jemaat/master-data convention (name quoted): `Menambah pendeta "…"`, `Mengubah pendeta "…"` (or `"…" menjadi "…"` on rename), `Menghapus pendeta "…"`. Revalidates `/admin/pendeta`, `/` (layout — Beranda's Sambutan), and `/tentang-kami` (page).
- `updateSambutan` (`profil-gereja-routes.ts`) is no longer a `photoSection(...)` (no more photo slot on this section at all): a plain JSON `mutation` taking `{ sambutanTeks, pendetaId }`. `updateProfil()` gained an optional third `messages` parameter (reusing `dbError`'s own `DbErrorMessages` shape) so this one call site can turn a `23503` (an unknown `pendetaId`) into "Pendeta yang dipilih tidak ditemukan." instead of the generic "Data ini masih dipakai oleh data lain." `PhotoColumns` narrowed from three variants to two (`hero_foto_path` / `sejarah_foto_path`).
- `loadProfilGerejaAdmin()` now also loads the full `pendeta` list (via `pendeta-routes.ts`'s own `loadPendetaList`, reused rather than duplicated) for the Sambutan picker's options; `ProfilGerejaAdminData` gained a `pendeta` field.

**UI**

- `/admin/pendeta` (`components/pendeta/pendeta-manager.tsx`): `DataTable` (brief §9.2), no initial sort (rows already arrive in the brief's default order — no manual reordering, so unlike Litbang/Linimasa/Pelayanan/Majelis there's no dnd-kit card list here at all). Columns: a small photo/`InitialsAvatar` thumbnail (`helper.display`, no sort/facet), Nama (sortable, searchable), Peran (sortable, searchable), Periode (`helper.display`), Status (`helper.accessor` over a *computed* `pendetaStatus(row)` value — not a plain column key — so faceting has a real per-row value to facet on; a `facetOnly`-style plain `helper.display` can't be faceted, since TanStack's faceted-unique-values model reads `column.getValue()`, which a display column never populates).
- `components/pendeta/pendeta-dialog.tsx`: same remount-on-`row?.id` convention as `KegiatanDialog`. Tahun mulai/selesai are `type="number"` 4-digit inputs; a "Masih melayani" checkbox (default checked for a new row) clears and disables Tahun selesai, matching the brief exactly. The photo's alt text defaults to the current Nama value the first time a file is chosen, but only until the admin edits the alt text themselves (tracked with a small `altTouched` flag compared against the `PhotoField`'s own previous value, not a fragile "first choice" boolean) — after that, their own text is never overwritten by a later photo change.
- `components/profil-gereja/sambutan-section.tsx`: a bespoke section (not `ProfilFormSection`, which only knows text fields + one photo slot) with the free-text Teks sambutan and a `Select` (brief: "urutkan yang sedang melayani di atas") built from the admin page's already-loaded `pendeta` list, `{ nama} — {peran}` per option, plus a "Tidak ada" option to clear the pick. No live photo/peran preview beyond the select's own label text, since the brief only asked to "tampilkan nama + peran" in the picker itself.
- Public: `components/public/pendeta-photo.tsx` (`PublicImage`-style photo, but falling back to a large `InitialsAvatar` instead of the dashed placeholder box — brief §14.7's own explicit fallback rule, different from every other `situs` photo on the site) and `components/public/pendeta-grid.tsx` (`PendetaFeatured`: large cards, "Melayani sejak {tahun}", keterangan; `PendetaPastGrid`: a small-card grid, "{mulai}–{selesai}"). `/tentang-kami` renders "Pendeta Jemaat" then "Pendeta yang pernah melayani" (each hidden when empty) above "Majelis Jemaat", in that order, splitting `loadPublicPendeta()`'s already-ordered rows on `tahunSelesai === null` — the split itself doesn't re-sort, so each group keeps `public_pendeta()`'s order.
- Sidebar: `Pendeta` added to "Konten Situs" after Kegiatan (last, since it was added last), `situs:read`-gated, `UserRoundIcon`.

**Verification (stage 11c)**

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass; `/admin/pendeta` and its two API routes, plus `/api/admin/profil-gereja/sambutan`, show up in the build's route list.
- `pnpm test`: 244 tests, 38 files. `profil-gereja-editor.test.tsx` and `public/site-content.test.ts` updated for the new `ProfilGerejaRow`/`ProfilGerejaAdminData` shapes, plus two new `site-content.test.ts` cases (the melayani/pernah-melayani split keeps `public_pendeta()`'s order; Sambutan reads nama/peran/foto from the picked pendeta).
- `pnpm test:db`: 17 files, 510 tests. New `pendeta.test.sql` (28, covering every item on the stage's own test list): every year CHECK (future `tahun_mulai`, `tahun_mulai` before 1800, `tahun_selesai` before `tahun_mulai`, future `tahun_selesai`) rejected directly at the database; a photo without alt text, and a path with no storage object, both refused; `public_pendeta()`'s exact column set and its default order; anon reads only `tampil = true` rows through the function and gets `42501` on the table directly and on insert; viewer reads everything (`tampil` true and false) but can't write; editor adds/edits but can't delete; admin deletes a pendeta referenced by Sambutan and `profil_gereja.sambutan_pendeta_id` is confirmed `null` afterward, with `public_profil_gereja()` still callable and its `sambutan_pendeta_nama` now `null`; `situs_referenced_photo_paths()` includes a surviving pendeta photo. One existing test updated: `situs_profil_gereja.test.sql`'s "exactly the public fields" key list.
- `pnpm test:integration`: 11 files, 138 tests. New `pendeta.test.ts` (6), against the real local stack, covering the stage's test list end to end over real HTTP-shaped requests (not just SQL): 401/403 with nothing written; a future `tahunMulai`, a future `tahunSelesai`, and `tahunSelesai < tahunMulai` each rejected with 400 through the multipart route; add-with-photo/edit/delete, the photo object confirmed present then absent in `storage.objects` via the service client, and exactly one activity row per mutation (add, and a rename that includes the old→new name in the sentence); deleting a pendeta picked for Sambutan is followed by a direct service-client read of `profil_gereja.sambutan_pendeta_id` (`null`) and a direct `anon.rpc("public_profil_gereja")` call that still succeeds with a null pastor name; a bad `pendetaId` on the Sambutan route → 400 (`23503` mapped through the new `updateProfil` `messages` parameter); anon's `public_pendeta()` RPC excludes a `tampil = false` row a sibling test just created, and a direct `anon.from("pendeta").select("*")` gets `42501`.
- Also checked directly against the local stack, outside any test file, with plain `curl` against the REST API using only the anon key (brief's own "termasuk lewat Supabase REST langsung" wording): `rpc/public_pendeta` → `[]` on an empty table; `GET /pendeta` → `42501`; `POST /pendeta` → `42501`.
- Local development: Docker wasn't running at the start of this session; started, then `supabase start` was run for the first time in this session (a fresh reset, so every migration 0001–0031 was applied in order, including this stage's), `pnpm db:types` regenerated `src/types/database.ts` (a 31-line diff — new `pendeta` table, `profil_gereja`'s changed columns, `public_pendeta` — everything else byte-identical). `pnpm`/corepack itself couldn't resolve in this sandbox (a network signature-verification error unrelated to this project); every `pnpm <script>` in this stage's own commands column was run via the equivalent `node_modules/.bin/<tool>` directly instead (`tsc`, `eslint .`, `vitest run`, `next build`, and the local `supabase` CLI binary at `node_modules/.bin/supabase`, which is newer and config-compatible, unlike the Homebrew-installed one on `PATH`).
- **Not verified yet**: an actual browser (light/dark, 360px, keyboard-only use, and specifically the Tahun inputs, the "Masih melayani" checkbox interaction, the Sambutan `Select`, and the public pendeta cards/initials-avatar fallback). Consistent with every prior stage's note, a `next dev` for this folder was already running on :3000 (pre-existing, not started by this session), and Next 16 allows only one dev server per folder, so no new one was started and no request was made to it.

### Stage 11d (Komisi), 2026-10-01

**Before deploying to production**

- Push migration `0032_situs_komisi.sql` together with 0018–0031.

**Decisions approved before starting (plan and questions asked, not decided alone)**

- **Pelayanan (11b) and Komisi stay unrelated.** No `komisi_id` column was added to `pelayanan`; the brief gives Pelayanan no such link, and the explicit answer was to keep the two modules independent rather than extend a table outside this stage's scope.
- **Public nav order**: Beranda, Tentang Kami, **Komisi**, Jadwal Ibadah, Warta, Kontak — Komisi sits next to Tentang Kami (which also covers Majelis and Pendeta), not appended at the end.
- **The "ineligible member" question the task raised was already settled by the brief itself** (§14.8's own last bullet: keep the row, flag it in the admin, hide it from the public site) — not a genuine open question, so it wasn't put to a vote; implemented exactly as the brief states. Pointed out here per CLAUDE.md ("point out the conflict" when a prompt and the brief diverge).
- **CRUD permission mapping, as instructed**: `komisi` and `jabatan_komisi` use the full `situs:{create,read,update,delete}` split (insert → `situs:create`, not `situs:update` the way 11b/11c's inserts do) — the explicit instruction for this stage, and the first module where `situs:create` is actually exercised by a route (11b/11c's own notes flagged it as unused until now). Managing `komisi_anggota` (add, inline jabatan change, remove) needs `situs:update` **and** `warta:read` together, because members are jemaat rows and every church-content table is guarded by `warta` (brief §4); reading `komisi_anggota` needs `situs:read` **and** `warta:read` for the same reason.
- **The Penatua label id lives in data, not code**: a new one-row table `komisi_settings` (`pembina_label_id`, FK to `label_jemaat`, `on delete set null`) is the only place "Penatua" is named — the migration resolves or creates that label once (by name, generically, same pattern as 0031's Sambutan-pastor move), then every trigger and loader reads the id from this table. No app code compares a label's name to the literal string "Penatua".
- **Komisi's own reorder is "Naik"/"Turun" row actions on a DataTable, not a dnd-kit card list.** The brief's own instruction combines "§9.2 DataTable" with "urutan tampil diatur lewat pola reorder atomik" for this module specifically (unlike Litbang/Pelayanan/Majelis/Linimasa's card-list pattern) — implemented as two new `extra` row actions that swap the row with its neighbour in the server-sorted order and call `reorder_komisi` (identical atomic contract to the existing reorder RPCs). They operate on the unsorted (`sort_order`) order regardless of the table's current column sort, the same "unsorted = arrival order" convention stage 3 established.
- **`jabatan_komisi` keeps the plain master-data shape (no drag reorder)**: the task only asked for "nama, tunggal, urutan" to be manageable, not for manual reordering of this 5-row seeded list; new rows append at `max(sort_order) + 1` (stage 4's convention).

**0032 migration**

- `jabatan_komisi`: seeded Ketua/Wakil Ketua/Sekretaris/Bendahara (all `tunggal`) and Anggota (not), `nama` unique case-insensitively (`lower(nama)` index, a new table so no 0001–0017 case-sensitivity constraint to work around). RLS: select/insert/update/delete map to `situs:read/create/update/delete`.
- `komisi_settings`: singleton (`id = 1`), `pembina_label_id` nullable FK to `label_jemaat`. A `do $$ ... $$` block finds an existing "Penatua" label case-insensitively or creates one, then points the setting at it — written generically (not seed-specific), same reasoning as 0031's Sambutan move. No update policy at all (not editable through the app this stage; select needs `situs:read`).
- `komisi`: `nama` unique (`lower(nama)` index), `slug` unique + format-checked (`komisi_slug_format_check`), `deskripsi`/`periode`/photo pair/`pembina_jemaat_id` (FK `jemaat`, `set null`)/`tampil`/`sort_order`. Two triggers:
  - `enforce_komisi_slug_immutable`: any `slug` change on UPDATE is `22023` "Slug komisi tidak bisa diubah." (whatever writes it — the app, a future RPC, or a direct REST PATCH).
  - `enforce_komisi_pembina_label` (**security definer**, same reasoning as `enforce_situs_photo_paths`: a data-integrity invariant must hold regardless of the acting role's own `warta:read`/`situs:read`): a non-null `pembina_jemaat_id` must have a `jemaat_labels` row for the label named in `komisi_settings`, else `22023` "Pembina harus berlabel Penatua."
  - `reorder_komisi(p_ids)`: identical contract to `reorder_pelayanan`/`reorder_majelis` (0030).
- `komisi_anggota`: `(komisi_id, jemaat_id)` unique; `jabatan_id` **restrict** (brief's own wording); a denormalized `jabatan_tunggal` boolean kept in sync by `sync_komisi_anggota_jabatan_tunggal` (before insert/update of `jabatan_id`) and `cascade_jabatan_tunggal_change` (after update of `jabatan_komisi.tunggal`, propagating the flag to every row using that jabatan — raises `23505` itself if a komisi already holds that jabatan more than once when it's flipped to `tunggal`). A **partial unique index** `(komisi_id, jabatan_id) where jabatan_tunggal` is the actual "one tunggal jabatan per komisi" enforcement; a cross-table subquery in the index predicate isn't allowed, hence the denormalized column.
  - `enforce_komisi_anggota_status` (**security definer**, before insert/update of `jemaat_id`): the jemaat must be `sidi` or `anggota_penuh`, else `22023` "Anggota komisi harus berstatus Sidi atau Anggota Penuh." Checked at write time only — a later status change on `jemaat` doesn't touch this trigger at all (no trigger on `jemaat` itself), matching the brief's own "keep the row, flag/hide at read time" rule.
- `add_komisi_anggota(p_komisi_id, p_jemaat_id, p_jabatan_id)` / `update_komisi_anggota_jabatan(p_komisi_id, p_jemaat_id, p_jabatan_id)`: security invoker (RLS still applies as a backstop), pre-check every failure with the brief's own example wording (`format('Komisi ini sudah punya %s: %s.', jabatan.nama, existing_nama)`, `format('%s sudah menjadi anggota komisi ini.', nama)`) before the real constraints (the partial index, the unique pair) would otherwise raise a raw `23505`.
- `public_komisi_list()` / `public_komisi_detail(p_slug)`: `security definer`, `tampil = true` only; detail returns `pembina_nama` (name only) and `anggota` as `{nama, jabatan}` pairs ordered by jabatan `sort_order` then nama, filtered to `status_keanggotaan in ('sidi', 'anggota_penuh')` live — an ineligible member's row still exists in `komisi_anggota` but never appears here.
- `situs_referenced_photo_paths()` (0029/0030/0031, `create or replace`d again): `union`s in `komisi.foto_path`. `SITUS_FOLDERS` (`lib/situs-photos.ts`) gained `"komisi"`.

**Routes and data loading (`lib/komisi.ts`, `lib/komisi-routes.ts`)**

- `createKomisi`/`updateKomisi` are multipart (`withPhotoSlot`, `savePhotoSlot`), same shape as `kegiatan-routes.ts`/`pendeta-routes.ts`. The slug is computed server-side with the existing `slugify`/`randomSlugSuffix` from `lib/warta.ts` (one attempt, then up to 5 "-xxxx" retries on a `komisi_slug_key` collision specifically — a nama collision or anything else surfaces immediately), reusing warta's own §9.4 convention rather than inventing a second one.
- **`komisiError()`**: a small local helper, `dbError`'s generic "Data yang dikirim tidak valid." would otherwise swallow the two triggers' own hand-authored `22023` text (unlike an RPC, `rpcError` doesn't apply here since `komisi`'s writes are plain table operations) — forwards `22023` messages as-is, the same philosophy as `rpcError` for RPC-raised codes, since this text is hand-written by this migration, not raw Postgres detail.
- `addKomisiAnggota`/`updateKomisiAnggotaJabatan`/`removeKomisiAnggota`: `mutation({ permission: ["situs", "update"] })` plus an explicit `requireWartaRead(user)` check at the top of `run()` for the friendlier, consistent 403 (RLS enforces the same pair underneath regardless). Keyed by `(komisiId, jemaatId)` in the route params (`/api/admin/komisi/[id]/anggota/[jemaatId]`), matching Keluarga's `anggota/[jemaatId]` precedent rather than the join row's own id.
- **Mutation check caught during this stage**: `deleteKomisi` originally counted `komisi_anggota` rows **concurrently** with the `komisi` delete (`Promise.all`); since `komisi_anggota.komisi_id` cascades, the count query could race the cascade and read 0. Fixed by counting first, then deleting — caught by `tests/integration/komisi.test.ts`'s own activity-sentence assertion ("Menghapus komisi ... (1 anggota ikut terlepas)") failing with "(0 anggota ...)" before the fix.
- Activity sentences, module `situs`: `Menambah/Mengubah/Menghapus komisi "…"` (quoted, rename shows old → new, delete appends `" ({n} anggota ikut terlepas)"` when non-zero), `Mengubah urutan komisi`; `Menambah/Mengubah/Menghapus jabatan komisi "…"`; `Menambah "{nama}" sebagai {jabatan} komisi "{komisi}"`, `Mengubah jabatan "{nama}" di komisi "{komisi}" menjadi {jabatan}`, `Menghapus "{nama}" dari komisi "{komisi}"` — the brief's own example format (jabatan unquoted, nama/komisi quoted).
- Revalidation: `{ path: "/admin/komisi", type: "layout" }` (covers the list, the jabatan page, and `/admin/komisi/[id]`) plus `{ path: "/komisi", type: "layout" }` (covers the list and `/komisi/[slug]`).

**UI**

- `components/komisi/`: `komisi-manager.tsx` (DataTable: Nama/Pembina/Periode/Jumlah Anggota/Tampil, Naik/Turun `extra` row actions, same remount-on-`dialogRow?.id` dialog convention as every other module), `komisi-dialog.tsx` (multipart form; pembina field is a `PersonPicker` fed only the jemaat carrying the configured label), `jabatan-manager.tsx`/`jabatan-dialog.tsx` (plain master-data-shaped list, no photo), `komisi-detail-view.tsx` (header with photo/initials-avatar fallback, Edit/Hapus, a DataTable of members with an inline jabatan `Select` + "Simpan" cell and a status badge plus a "Tidak memenuhi syarat" badge when ineligible, `tambah-anggota-form.tsx` below it), `inline-jabatan-cell.tsx`, `tambah-anggota-form.tsx` (the `PersonPicker`'s `excludeIds` prop already does "not already a member of this komisi"; options are pre-filtered server-side to Sidi/Anggota Penuh).
- **Two write-permission flags, not one**, since this stage's RLS mapping gives `komisi`/`jabatan_komisi` separate `create`/`update` policies (unlike every prior `situs` module, where insert and update share one permission): `KomisiManager`/`JabatanManager` take `canCreate` (gates "Tambah …" and a fresh dialog's submit) and `canWrite` (gates row Edit/Naik/Turun and an existing row's dialog submit) separately; `KomisiDetailView` additionally takes `canManageAnggota` (`situs:update && warta:read`) distinct from `canWrite` (`situs:update` alone, for editing the komisi's own fields) and `canDelete` (`situs:delete`).
- Sidebar: `Komisi` added to "Konten Situs" after Pendeta (last, since it was added last), `situs:read`-gated, `ClipboardListIcon`.
- Public (`components/public/komisi-grid.tsx`, `(public)/komisi/page.tsx`, `(public)/komisi/[slug]/page.tsx`): the list is an `ActivityGrid`-shaped card grid; the detail page follows the warta-detail template (`PublicPageTitleBand` with a "← Semua komisi" breadcrumb link and periode as the eyebrow, `PublicContainer narrow`, a `PublicSection` for members) and groups members by jabatan client-side in `lib/public/site-content.ts`'s `loadKomisiDetailContent` — a simple fold over the already-ordered array (`public_komisi_detail` orders by jabatan `sort_order` then nama, so same-jabatan members are already contiguous), not a re-sort.
- Public nav (`lib/nav.ts` is the **admin** sidebar; `components/public/public-nav.tsx`'s `PUBLIC_NAV` is the one that changed): `Komisi` inserted after `Tentang Kami`, before `Jadwal Ibadah`, per the approved plan.

**Verification (stage 11d)**

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass (run via `node_modules/.bin/{tsc,eslint,next}` directly — `pnpm` itself fails closed in this sandbox with a corepack signature-verification error, same workaround stage 11c's own notes describe). `/admin/komisi`, `/admin/komisi/[id]`, `/admin/komisi/jabatan`, their seven API routes, and `/komisi`, `/komisi/[slug]` are all in the build's route list; no route-tree conflict from `[id]` coexisting with the `jabatan`/`reorder` static siblings (same shape as litbang-template's own `[id]` + `reorder`).
- `pnpm test`: 244 tests, 38 files — unchanged from stage 11c (this stage added no new component/unit tests; see "not verified yet" below).
- `pnpm test:db`: 18 files, 576 tests. New `komisi.test.sql` (66): `komisi_settings` resolves/creates the Penatua label; the seeded jabatan; nama uniqueness (case-sensitive and -insensitive) and the immutable-slug trigger on `komisi`; a pembina with the label passes, without it is rejected, no pembina at all passes; the photo pairing/existence checks; full RLS per role on all three tables (viewer read-only — including the "0 rows affected, not an exception" RLS-denial convention from `master_data.test.sql`/`sarana_dana.test.sql` — editor create+update but not delete, admin everything); `reorder_komisi` happy path and a stale list; the simpatisan/baptis_anak rejection; two Ketua (tunggal) rejected, two Anggota (not tunggal) accepted; the same jemaat twice in one komisi rejected, in two komisi accepted; `komisi_anggota`'s RLS needing `situs:read`/`situs:update` **and** `warta:read` together (a throwaway custom role with `situs:update` but no `warta:read` is rejected both by RLS directly and by `add_komisi_anggota`); the two RPCs' friendly duplicate/tunggal-conflict/not-found messages, including after moving a member out of the tunggal jabatan freeing it up again; jabatan delete-in-use (23503) vs. delete-when-unused; flipping a jabatan to `tunggal` while already held twice is rejected and leaves both the jabatan and every member row's denormalized flag unchanged; deleting a jemaat clears a `pembina_jemaat_id` reference and removes their `komisi_anggota` row (cascade); `public_komisi_list`/`public_komisi_detail`'s exact column/key set, an ineligible member (status changed after joining) excluded from the public response, an unknown slug and a `tampil = false` slug both `null`; anon refused on all four tables directly; `situs_referenced_photo_paths()` includes a surviving komisi photo.
- `pnpm test:integration`: 12 files, 148 tests. New `komisi.test.ts` (10): 401/403 with nothing written; create-with-pembina + rename, both logged, slug unchanged across the rename; a pembina without the label rejected with the trigger's own message surfacing through `komisiError`; atomic reorder plus a rejected stale list; a jabatan add/rename/delete-in-use(400)/delete-once-unused(200) sequence (delete calls made as `superadmin`, since `situs:delete` isn't an editor permission — caught by an initial 403 before this was corrected); the full member lifecycle (ineligible status rejected, tunggal conflict and duplicate-membership rejected with the brief's own example wording, inline jabatan change, removal) with one activity row each; a throwaway custom role (`situs:update`, no `warta:read`) and a viewer both refused on member management, with nothing written; deleting a jemaat clears their membership and a pembina reference; deleting a komisi removes its membership rows and logs the member count (this test caught the `deleteKomisi` race described above); anon's `public_komisi_list`/`public_komisi_detail` RPCs return the public shape only (no jemaat id or other jemaat fields in the JSON) while a direct `anon.from("komisi"|"komisi_anggota").select("*")` is refused with `42501`.
- Mutation check: the `deleteKomisi` race (counting members concurrently with the cascading delete instead of before it) was caught and fixed during this stage, confirmed by re-running the integration suite before and after.
- Local development: the local stack was already running (`supabase start`, migrations through 0031); `0032` was applied with `migration up --local` and `pnpm db:types` (run as `supabase gen types typescript --local --schema public`, via the local binary directly) regenerated `src/types/database.ts` — a 125-line diff, new tables/functions only, everything else byte-identical. `pnpm` itself is broken in this sandbox (corepack can't verify its own package signature); every `pnpm <script>` used in this stage's commands was run via the equivalent `node_modules/.bin/<tool>` instead, and `tests/integration/harness.ts`'s hardcoded `execSync("pnpm supabase status -o env")` was satisfied with a throwaway `pnpm` shim script on `PATH` (forwards only `pnpm supabase ...` to the local `supabase` binary) rather than editing the harness itself.
- **Not verified yet**:
  - an actual browser (light/dark, 360px, keyboard-only use) — consistent with every prior stage's note, no browser tool was available in this session;
  - no new component/unit tests were added this stage (the two new DataTable-based managers' dialog/photo/picker wiring and the new "Naik"/"Turun" extra-row-action reorder pattern are exercised only through typecheck/build/integration, not jsdom component tests the way `pendeta-manager`/`kegiatan-manager` got one);
  - **`src/components/public/hero.tsx` was found modified on disk at the end of this session, unrelated to any edit this session made** (git diff shows single-quote style instead of the project's double quotes, and the `InfoCard`/info-strip rendering — Kebaktian Minggu / Lokasi / Warta mingguan — removed from `Hero`, leaving `kebaktianMinggu`/`alamat` as unused parameters per eslint). This file was never opened or edited by this session's tools; it was left exactly as found, since it may be in-progress editor work happening outside this session (the environment is a live VS Code extension host) rather than something safe to silently revert. Worth a deliberate look before the next build/deploy, since as it stands the Beranda hero's info strip no longer renders.

### Follow-up: Jadwal Ibadah's cards redrawn to match the mockup, 2026-10-01

- `components/public/schedule-tabs.tsx` (Jadwal Ibadah's day tabs) rendered each day's services with the generic `ScheduleEntry` card shared with Warta's `ScheduleList` — a plain label/value `dl`, no resemblance to `docs/design/jadwal-ibadah.html`'s two-column layout (a large Jam/WIB time block beside the service). On request, built the mockup's layout for Jadwal Ibadah specifically, carrying every field the task asked for (Jam, Tempat, Tema, Pelayan Firman, Liturgos, DPA, Keterangan/Catatan, and the service type) rather than the mockup's own placeholder-trimmed subset.
- New `JadwalEntry` in `schedule-list.tsx`, used only by `ScheduleTabs`; `ScheduleEntry`/`ScheduleList` (Warta) untouched. Built on the existing `scheduleFields(row)` (brief §8's per-category layout, already filtering to filled fields) rather than hand-picking columns: Jam renders in its own time block (left column, `font-serif text-brand`, "WIB" below); the service type (`categoryName`) is the heading; every other filled field except Tema and the multiline Keterangan/Catatan renders as an inline `label: value` pair (Tempat, Wilayah, DPA, Pelayan Firman, Liturgos/Pelayan Liturgi, Pemusik, Bahan Alkitab — whichever the row's category layout includes and has data for); Tema and Keterangan/Catatan render as their own lines below, since they tend to be full sentences the inline row would cramp. The SMKA group table (unchanged `SmkaGroupTable`) still renders beneath.
- **On request, attendance counts are dropped from `JadwalEntry` entirely** (`scheduleFields(row)` filtered to drop any `Kehadiran …` label before splitting into inline/block fields) — Jadwal Ibadah is a schedule, not a report of past attendance, and `public_jadwal_pekan_ini` does return attendance for days already past within the Minggu–Sabtu week. `ScheduleEntry`/`ScheduleList` (Warta) are unaffected and still show attendance.
- **On request, a day's services are ordered by Jam, not the functions' own date/sort_order arrival order** — `ScheduleTabs` now sorts each day's row group by `jam` (string-compares `HH:MM:SS`, which sorts correctly) right before render, scoped to this component only; `groupByDate` itself, and Warta's `ScheduleList`, are untouched and still show the admin's manual entry order.
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm build` (via `node_modules/.bin/*` — `pnpm` itself is still broken in this sandbox, same corepack signature error as stage 11c/11d), and `vitest run schedule-tabs.test.tsx` all pass. Also rendered `JadwalEntry` directly in a throwaway RTL test (not committed) with every field filled, and `ScheduleTabs` with three same-day rows inserted out of time order, to confirm the markup, field exclusion, and the jam sort; not checked in an actual browser — the current week's local seed data has no service on today's default tab, and no browser-automation tool (`chromium-cli`, Playwright) was available in this session to switch tabs and screenshot.
