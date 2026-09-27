# Rebuild brief: GKP Rangkasbitung website and admin panel

## 1. Goal

You are rebuilding the public website and the admin panel of **GKP Rangkasbitung**, a church congregation in Rangkasbitung, Indonesia. The current app is in daily use by church staff and volunteers, many of them non-technical. The rebuild gets a **completely new visual design**, but it must keep **every feature, business rule, and permission in this brief**, and it must stay **compatible with the existing Supabase database**, which already holds real congregation, schedule, and finance data.

Ground rules:

- This brief is the functional spec. Where it describes behavior, build that behavior, not a simplified version. If something is unclear, ask before dropping it.
- Never invent church facts, member data, schedules, or money figures. Where real content is missing (for example the public "Tentang Kami" page), use clearly marked placeholders with `TODO` comments.
- All user-facing text is **Bahasa Indonesia**. Reuse the Indonesian labels quoted in this brief.
- The old repo's `supabase/migrations/` folder (files `0001` to `0017`) is provided with this brief. If it isn't, stop and ask for it.
- Build module by module. After each module, run the type check and the production build, and walk through the relevant acceptance checks in section 13.

## 2. Design direction

Mood: minimalist, calm, and content-first. Built for non-technical staff, so clarity beats decoration.

- Palette (define as CSS variables and map them into Tailwind/shadcn tokens):
  | Token | Light | Dark |
  |---|---|---|
  | background | #FAFAF9 | #0C0A09 |
  | surface (card, sidebar, topbar) | #FFFFFF | #1C1917 |
  | border | #E7E5E4 | #292524 |
  | foreground | #1C1917 | #FAFAF9 |
  | muted-foreground | #57534E | #A8A29E |
  | accent (primary buttons, active states) | #1F4D3F | #7FB5A3 (with dark text on accent fills) |
  | destructive (Hapus, Pengeluaran) | #B42318 | #F97066 |
  Verify every text/background pair against WCAG AA in both themes.
- Type: Geist for UI, Geist Mono for No. Anggota, slugs, IP addresses, and tabular figures.
- Shape: radius 8px (inputs, buttons), 12px (cards, dialogs). Cards use a 1px border and no heavy shadows. No gradients and no emoji.
- Density: 4px spacing scale, 32px page padding on desktop and 16px on mobile, 36px control height, table rows around 48px, divider lines only (no zebra stripes).
- Badges: pill-shaped, tinted background with dark text, and always carrying a text label.
- Admin shell: fixed 248px sidebar (brand at top, menu per section 9.1, account menu at bottom), 64px top bar (theme switcher; menu button on mobile). Page header = title + one-line description + primary action on the right.
- Public home: simple top header, a hero with the church name and the service schedule for this week, a card for the latest warta, then TODO placeholder sections.
- Reference mockup: [[link artifact CMS Admin Minimalis]](https://claude.ai/artifact/GxcFfdAC4ZF6QNs8JeWD57). Use it for the visual language only. The menu, labels, and features follow this brief.

Requirements that apply whatever the look:

- Light and dark mode, both first-class, with a theme switcher offering "Terang", "Gelap", "Sistem" (default "Sistem"). Define all colors as design tokens or CSS variables.
- Responsive down to 360px wide. On small screens the admin sidebar becomes a slide-over menu.
- Accessibility: semantic HTML, full keyboard navigation, visible focus, WCAG AA contrast, `aria-label` on icon-only buttons, `prefers-reduced-motion` respected, and color never the only signal (status badges always carry text).
- Every destructive action asks for confirmation in a dialog that names the record and states the consequence. Buttons say what they do ("Hapus", "Batal").
- Feedback: a success or error toast after every mutation; plain-language inline form errors; skeletons while content loads, spinners only on buttons that are working; never a blank screen.
- Empty states: one friendly line plus the primary action.
- Tables: numbers, amounts, and dates right-aligned with tabular figures.
- Formats: dates in `id-ID` (long: "Minggu, 14 September 2025"; short: "14 September 2025"); timestamps in WIB (Asia/Jakarta), for example "14 Sep 2025, 09.30 WIB"; money in IDR without decimals, for example "Rp 1.500.000".

## 3. Stack and hard constraints

Hard constraints:

- **Supabase** (Postgres, Auth, Row Level Security) on the **existing project**. Copy migrations `0001` to `0017` into the new repo unchanged. Never rename, drop, or recreate existing tables, columns, functions, views, or policies. Any schema change goes in a new, additive migration (`0018` and up).
- Check permissions **on the server for every page and every mutation**, and keep RLS enabled on every table. A hidden button is never the security boundary.
- The service-role key is **server-only**. Use it only to invite and delete auth users, and for the narrowly scoped server-side reads described in section 12, item 1.
- Regenerate database types from the live project (`supabase gen types typescript`).

Environment variables (reuse the current values):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-only
```

Recommended stack (what the current app uses; keep it unless there's a reason not to):

- Next.js App Router with TypeScript in strict mode. Server Components by default; client components only where interactivity needs them. `@supabase/ssr` cookie sessions, refreshed in middleware.
- Tailwind CSS with an accessible headless component library (currently shadcn/ui on Base UI), lucide icons, `sonner` toasts, `next-themes`.
- TanStack Table for data tables, `@dnd-kit` for drag-and-drop ordering, pnpm.

## 4. Roles and permissions

Permissions are `resource:action` pairs with actions `create`, `read`, `update`, `delete`. Resources in use: `warta`, `users`, `roles`, `activity_log`. (`announcements` and `content` exist in the database from an early version; no screen uses them. Keep them and ignore them.)

A quirk to preserve: **every church-content module is guarded by the `warta` resource**, not by its own resource. That covers Warta, Peribadahan, Litbang, Sarana & Dana, Tempat, Wilayah, Data Jemaat, Keluarga, Label Jemaat, and pastoral notes. The existing RLS policies depend on it.

Seeded roles and what they can do:

| Role | warta | users | roles | activity_log |
|---|---|---|---|---|
| super_admin | create, read, update, delete | create, read, update, delete | create, read, update, delete | read |
| admin | create, read, update, delete | none | read | none |
| editor | create, read, update | none | none | none |
| viewer | read | none | none | none |

What each permission unlocks:

- `warta:read` shows all content modules. Without `warta:update` they are read-only: edit dialogs open as "Lihat" views with disabled fields, and add and delete controls are hidden.
- `warta:create` allows "Buat Warta Baru". `warta:update` allows every other content edit, including publishing warta and writing pastoral notes. `warta:delete` allows deleting a warta.
- `users:*` is the Pengguna module, super_admin only by design (reassigning roles is privilege-sensitive).
- `roles:read` shows Roles & Permissions; `roles:create` and `roles:delete` add and remove roles.
- `activity_log:read` shows Log Aktivitas (super_admin only).
- Dashboard and Profil Saya are open to every signed-in user.

Server helpers to recreate:

- `getAuthenticatedUser()` verifies the session with Supabase Auth (not just the cookie) and loads the profile, roles, and the union of their permissions. Cache it per request.
- `requirePermission(resource, action)` for pages: redirect to `/admin?error=forbidden` when missing.
- `requirePermissionApi(resource, action)` for route handlers and actions: 401 without a session, 403 without the permission.
- RLS uses the existing Postgres function `has_permission(user_id, resource, action)`.

## 5. Database reference (already exists)

All ids are `uuid` (`gen_random_uuid()`). "Set null" and "cascade" describe the `on delete` behavior.

Accounts and access

- `profiles`: `id` (= `auth.users.id`), `email`, `full_name`, `avatar_url`, `jemaat_id` (nullable, unique, FK `jemaat`, set null), `created_at`. A trigger inserts the row when a user signs up or is invited (copying `full_name` from user metadata) and keeps `email` in sync.
- `roles` (`name` unique, `description`), `permissions` (`resource` + `action`, unique pair), `role_permissions`, `user_roles`.

Warta (weekly bulletin)

- `warta`: `slug` (unique), `status` (`draft` or `published`, default `draft`), `tanggal_kebaktian` (date), `judul_kebaktian`, `tema_kebaktian`, `renungan_judul`, `renungan_kitab`, `renungan_isi`, `renungan_sumber`, `created_by`, `published_at`, `created_at`, `updated_at`.
- `warta_litbang_items`: a warta's own copy of the Litbang cards: `warta_id` (cascade), `litbang_category_id` (set null), `name`, `deskripsi`, `sort_order`.
- `warta_kesaksian_items`: `warta_id` (cascade), `judul`, `deskripsi`, `sort_order`.

Peribadahan (worship schedule)

- `peribadahan_categories`: `key` (unique), `name`, `sort_order`; 9 seeded rows (section 9.5).
- `peribadahan_items`: `category_id` (restrict), `tanggal` (date), `jam` (time), `tempat_id`, `wilayah_id`, `pelayan_firman_id`, `liturgos_id`, `pemusik_id` (all set null), `tema`, `dpa`, `catatan`, `kehadiran_laki_laki`, `kehadiran_perempuan`, `kehadiran_anak` (integers), `bahan_alkitab`, `sort_order`, `created_at`, `updated_at`.
- `peribadahan_smka_kelompok`: `item_id` (cascade), `kelompok` (one of `batita`, `balita`, `kecil`, `tanggung`, `besar`, `tunas_remaja`, `guru_sekolah_minggu`, `orang_tua`), `pf_id` (jemaat, set null), `laki_laki`, `perempuan`; unique `(item_id, kelompok)`.

Master data

- `tempat`: `nama`, `keterangan`, `sort_order`. `wilayah`: `nama`, `sort_order`. `label_jemaat`: `nama` (unique), `sort_order`. `jemaat_labels`: `jemaat_id` + `label_id` (both cascade).

Congregation

- `jemaat`: `nama`, `nomor_anggota` (unique), `jenis_kelamin` (`laki_laki` or `perempuan`), `status_keanggotaan` (`simpatisan`, `baptis_anak`, `sidi`, or `anggota_penuh`), `wilayah_id` (set null), `pekerjaan`, `alamat`, `no_hp`, `tanggal_lahir`, `tanggal_masuk`, `keluarga_id` (set null), `hubungan_keluarga` (text), `sudah_baptis` and `sudah_sidi` (legacy booleans, unused; keep them), `created_at`.
- `keluarga`: `nama` (unique).
- `jemaat_catatan_pastoral`: `jemaat_id` (cascade), `jenis`, `tanggal` (default today), `penulis_id`, `penulis_nama`, `isi`, `created_at`.

Litbang (program template)

- `litbang_categories`: `name`, `deskripsi`, `active` (default true), `sort_order`, `updated_at`.

Sarana & Dana (finance)

- `sarana_dana_items`: `key` (unique), `name`, `saldo_awal` (opening balance), `keterangan`, `updated_at`. Seeded: `kas_jemaat` "Kas Jemaat", `kas_sarana_prasarana` "Kas Sarana dan Prasarana", `persembahan_bulanan` "Persembahan Bulanan".
- `sarana_dana_transactions`: `item_id` (cascade), `tanggal`, `tipe` (`masuk` or `keluar`), `jumlah` (numeric, at least 0), `keterangan`, `jemaat_id` (set null), `created_by`, `created_at`.
- View `sarana_dana_balances`: `id`, `key`, `name`, `keterangan`, and `saldo` = `saldo_awal` + sum of `masuk` − sum of `keluar`.

Audit

- `activity_logs`: `user_id`, `user_email`, `module`, `activity`, `ip_address`, `created_at`. Append-only: users may insert rows for themselves, and there are no update or delete policies.

RLS today:

- Anonymous read: published `warta` with their Litbang and Kesaksian rows; `peribadahan_categories`, `peribadahan_items`, `peribadahan_smka_kelompok`, `tempat`, `wilayah`, `jemaat`, `label_jemaat`, `jemaat_labels`, `keluarga`, `sarana_dana_items`, `sarana_dana_transactions`, `sarana_dana_balances`. This exposes personal data; section 12, item 1 says how to tighten it.
- `warta:read` is required for draft warta, `litbang_categories`, and pastoral notes.
- Writes need `warta:update` on every content table (`warta:create` also works for inserting a warta and its snapshot rows); deleting a warta needs `warta:delete`.
- RBAC tables need `roles:*`. `user_roles`, and other people's `profiles`, need `users:*`; everyone can read and update their own profile.
- `activity_logs`: insert own rows; reading needs `activity_log:read`.

## 6. Authentication

- `/login` ("Masuk Admin", "Khusus untuk pengurus dan admin GKP Rangkasbitung."): email and password, button "Masuk". Errors: "Email dan password wajib diisi.", "Email atau password salah." After login, go to `?next=` only if it starts with `/admin` (no open redirects), otherwise to `/admin`. A signed-in visitor to `/login` is redirected the same way. Logs "Login".
- Middleware refreshes the session cookie on every request and sends any `/admin` request without a session to `/login?next={path}`.
- Invitations come from the Pengguna module: the server calls `auth.admin.inviteUserByEmail` with metadata `full_name` and `redirectTo` set to `{origin}/auth/callback?next=/auth/set-password`.
- `/auth/callback` exchanges the `code` for a session, then redirects to `next` (default `/admin`), or to `/login` on failure.
- `/auth/set-password` ("Atur Password", "Selamat datang, {email}. Buat password untuk akun kamu."): requires a session; new password and confirmation, at least 8 characters and matching; button "Simpan Password"; then `/admin`.
- "Keluar" in the account menu logs "Logout", signs out, and returns to `/login`.

## 7. Activity log

Every successful mutation in every module writes one `activity_logs` row right after it succeeds:

- `module`: `auth`, `akun`, `warta`, `peribadahan`, `litbang`, `sarana_dana`, `tempat`, `wilayah`, `jemaat`, `label_jemaat`, `users`, or `roles` (Keluarga changes log under `jemaat`).
- `activity`: a short Indonesian sentence that names the record, for example `Membuat warta "Minggu Adven I" (2025-11-30)`, `Mempublikasikan warta "…"`, `Menambah jadwal Kebaktian Minggu tanggal 2025-11-30`, `Menghapus catatan pastoral untuk "…"`, `Mengundang pengguna "…"`.
- `user_id`, `user_email`, and `ip_address` (the first entry of `x-forwarded-for`, else `x-real-ip`).
- A logging failure goes to the server console and never breaks the action.
- Display labels: auth "Autentikasi", akun "Akun Saya", warta "Warta", peribadahan "Peribadahan", litbang "Litbang", sarana_dana "Sarana & Dana", tempat "Tempat", wilayah "Wilayah", jemaat "Jemaat", label_jemaat "Label Jemaat", users "Pengguna", roles "Roles & Permissions".

## 8. Public website

Shell: a header with "GKP Rangkasbitung" and links "Beranda" (`/`), "Tentang Kami", "Jadwal Ibadah", "Warta", "Kontak", plus the theme switcher; a footer "© {year} GKP Rangkasbitung."; `lang="id"`; page titles use the template "{page} | GKP Rangkasbitung".

Beranda, Tentang Kami, Jadwal Ibadah, and Kontak are placeholders today. Design real layouts for them, filled with clearly marked `TODO` placeholder content. Optionally, Jadwal Ibadah can list the coming week's `peribadahan_items`.

`/warta`: published warta only, newest `tanggal_kebaktian` first, each with date, judul, and tema, linking to `/warta/[slug]`. Empty: "Belum ada warta yang diterbitkan."

`/warta/[slug]`: published only (404 otherwise). Sections, in order:

1. Header: tanggal kebaktian (long date), judul kebaktian, tema.
2. "Renungan", only if it has a judul or isi: judul, kitab, isi (keep line breaks), "Sumber: …".
3. "Bidang Peribadahan": every `peribadahan_items` row dated from `tanggal_kebaktian` through `tanggal_kebaktian` + 6 days (the service week, Minggu–Sabtu), ordered by date then `sort_order`, with the range shown. Each row shows its category name and only the fields that are filled: Waktu, Tempat, Wilayah, DPA, Tema, Pelayan Firman, Liturgos (labelled "Pelayan Liturgi" for SMKA), Pemusik and Bahan Alkitab (SMKA only), Kehadiran Laki-laki, Kehadiran Perempuan, Kehadiran Anak-anak, then catatan. SMKA rows add a small table (Kelompok, PF, L, P) listing only the groups that have data.
4. "Bidang Litbang", if any: a numbered list of this warta's Litbang rows, name and deskripsi (keep line breaks).
5. "Bidang Sarana dan Dana": the finance report for the **previous** week, `tanggal_kebaktian` − 7 through − 1 days, with the range shown. For each Sarana & Dana item: Saldo Awal, Pemasukan, Pengeluaran, Saldo Akhir (formula in section 9.7).
6. "Bidang Kesaksian dan Keesaan", if any: each item's judul and deskripsi.

## 9. Admin panel

### 9.1 Shell

- A sidebar with the brand "GKP Rangkasbitung" and these entries, in this order, each shown only when permitted: Dashboard, Warta, Peribadahan (sub-entries: one per category, by `sort_order`), Litbang, Sarana & Dana (sub-entries: one per item), Tempat, Wilayah, Data Jemaat, Keluarga, Label Jemaat, Pengguna, Roles & Permissions, Log Aktivitas. Mark the active entry; an active sub-entry does not also mark its parent.
- An account menu at the bottom of the sidebar: initials avatar, name (or email), role names ("Tanpa role" if none). Its dropdown shows the email, "Profil Saya", and "Keluar".
- A top bar with the theme switcher, and the menu button on small screens.
- Don't rebuild the prototype page "Peribadahan (Baru)" at `/admin/peribadahan-lengkap`. It only demonstrated the table pattern with placeholder data.

### 9.2 Table pattern (every admin list)

Build this once and reuse it:

- Sorting: sortable headers are buttons that cycle ascending → descending → unsorted. Only the active column shows a direction indicator.
- Column search: free-text columns get a small search control in the header that opens a popover with one input, filtering that column only (case-insensitive "contains").
- Faceted filters: categorical columns get a multi-select filter in a toolbar above the table. Its options are the distinct values actually present, each with its row count. The trigger shows how many values are selected. A "Reset" button appears while any filter is active and clears them all.
- Filters combine with AND, and with sorting.
- Pagination under the table: "Tampilkan [10 | 20 | 50 | 100] per halaman" (default 10), "{from}–{to} dari {total} {noun}" counted over the filtered rows, previous and next. Changing the page size returns to page 1.
- Row actions sit in a "⋯" menu at the end of the row, revealed on hover or focus on desktop and always visible on touch: "Edit" ("Lihat" for read-only users) and "Hapus" (confirmation dialog). Some modules add more, noted below.
- Empty state spanning the table: "Belum ada {item}." plus the add action. When filters hide every row: "Tidak ada {item} yang cocok dengan filter ini." plus "Reset filter".
- Loading: for bounded lists (master data, jemaat, keluarga, users, a Sarana & Dana ledger, peribadahan) load every row that matches the server-side pre-filters and sort, filter, and paginate on the client, so facet counts are right. Log Aktivitas grows without limit, so it stays server-paginated.

### 9.3 Dashboard (`/admin`)

"Dashboard", "Selamat datang, {name or email}.", the user's role names, and their permission count. You may add read-only, permission-aware summaries (this week's services, the latest warta and its status, current Sarana & Dana balances). If the URL has `?error=forbidden`, show a short notice that the user has no access to the page they tried to open.

### 9.4 Warta

List `/admin/warta` (`warta:read`), newest first: Tanggal (sortable), Judul (sortable, searchable), Status (badge "Published" or "Draft", facet), and row actions "Edit" (opens the editor) and "Hapus" (`warta:delete`; confirm `Hapus "{judul}"?` with "Semua data Litbang dan Kesaksian khusus warta ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan."). A date-range filter on tanggal kebaktian. Button "Buat Warta Baru" (`warta:create`).

Create `/admin/warta/new` (`warta:create`):

- "Informasi": Tanggal Kebaktian (required), Judul Kebaktian (required), Tema Kebaktian. "Renungan": Judul Renungan, Kitab Renungan (placeholder "Mis. Mazmur 23:1-6"), Isi Renungan (multi-line), Sumber Renungan. A note under the form: "Bidang Peribadahan, Litbang, Sarana & Dana, dan Kesaksian dapat diisi setelah warta dibuat."
- Slug: `slugify("{tanggal_kebaktian}-{judul_kebaktian}")` (lowercase, strip diacritics, each run of other characters becomes "-", trim dashes). If it's taken, append "-" and 4 random base-36 characters (up to 5 attempts). The slug never changes afterwards.
- Save as `draft` with `created_by`.
- Snapshot the Litbang template: copy every `litbang_categories` row with `active = true` (name, deskripsi, sort_order, and its id as `litbang_category_id`) into `warta_litbang_items`. If this fails, report "Warta dibuat, tapi gagal menyalin Litbang: …".
- Toast "Warta berhasil dibuat" and open the editor.

Editor `/admin/warta/[id]` (`warta:read`; editing needs `warta:update`). The title is the judul, the subtitle the date. Header actions: "Terbitkan" / "Tarik ke Draft" (`warta:update`; publishing sets `published_at` to now, unpublishing clears it; toasts "Warta diterbitkan" / "Warta ditarik ke draft") and "Hapus Warta" (`warta:delete`; confirm, then back to the list). Sections:

1. Informasi & Renungan: the create form's fields, prefilled, with "Simpan Informasi & Renungan"; saving updates `updated_at`.
2. Bidang Peribadahan: the service week (`tanggal_kebaktian` through + 6 days), with the range and "(Minggu-Sabtu)" shown. These are the **same rows** as the Peribadahan module (never a copy), so edits show up in both places. Same add, edit, and delete as section 9.5; here "Tambah Jadwal" lets the user pick any date inside the service week (default: the kebaktian date). A plain paginated list is enough; no sorting needed.
3. Bidang Litbang: this warta's own cards. Each card's deskripsi is editable, with "Simpan"; the name is fixed. Changes affect only this warta, never the template or other warta.
4. Bidang Sarana dan Dana: the previous week (`tanggal_kebaktian` − 7 through − 1), with the range and "(Minggu-Sabtu sebelum tanggal kebaktian)" shown. One tab per Sarana & Dana item; each tab shows four figures (Saldo Awal, Pemasukan, Pengeluaran, Saldo Akhir) and that item's transactions within the range, with the same add, edit, and delete as section 9.7. They are the same rows, so they sync both ways.
5. Bidang Kesaksian dan Keesaan: an open-ended list for this warta. Each item has Judul (required) and Deskripsi, edited in place with "Simpan" and removed with "Hapus" (confirm). An add form closes the list ("Tambah Item Baru": Judul, Deskripsi, "Tambah"); new items go last.

Read-only users see every section with disabled inputs and no action buttons.

### 9.5 Peribadahan (worship schedule)

One table of schedule rows (`peribadahan_items`), each with a category and a date. It's live, shared data: the Peribadahan pages and every warta read and write the same rows.

Categories and their fields (an unknown key uses the `umum` layout):

| key | Name | Fields besides Tanggal | Attendance | Notes field |
|---|---|---|---|---|
| umum | Kebaktian Minggu | Waktu, Tempat, Pelayan Firman, Liturgos | L, P, Anak | "Keterangan" |
| smka | Kebaktian SMKA | Waktu, Tema, Pelayan Liturgi, Pemusik, Bahan Alkitab, group grid | per group | none |
| krt | Kebaktian Rumah Tangga | Waktu, Tempat, Wilayah, DPA, Tema, Pelayan Firman, Liturgos | L, P, Anak | "Catatan" |
| pa | Pemahaman Alkitab | Waktu, Tempat, DPA, Tema, Pelayan Firman, Liturgos | L, P, Anak | "Catatan" |
| lansia | Kebaktian Lansia | Waktu, Tempat, DPA, Tema, Pelayan Firman, Liturgos | L, P | "Catatan" |
| perempuan | Kebaktian Perempuan | Waktu, Tempat, DPA, Tema, Pelayan Firman, Liturgos | P | "Catatan" |
| pria | Kebaktian Pria | Waktu, Tempat, DPA, Tema, Pelayan Firman, Liturgos | L | "Catatan" |
| doa_pagi | Doa Pagi | Waktu, Tempat | L, P, Anak | "Catatan" |
| pemuda_remaja | Kebaktian Pemuda Remaja | Waktu, Tempat, DPA, Tema, Pelayan Firman, Liturgos | L, P | "Catatan" |

Field details: "Waktu" is a time input (`jam`); "Tempat" and "Wilayah" are selects over their master lists; "Dasar Pemahaman Alkitab (DPA)" and "Tema" are text; attendance fields are "Jumlah Kehadiran (Laki-laki / Perempuan / Anak-anak)", integers of at least 0. For SMKA, "Pelayan Liturgi" is stored in `liturgos_id`.

SMKA group grid: 8 fixed rows, saved together with the item and upserted by (item, group). "Kelas Batita", "Kelas Balita", "Kelas Kecil", "Kelas Tanggung", "Kelas Besar", and "Kelas Tunas Remaja" each have PF (a person) plus L and P counts; "Guru Sekolah Minggu" and "Orang Tua" have only L and P.

Person pickers (Pelayan Firman, Liturgos, Pemusik, PF, and elsewhere in the app) are a searchable combobox over all jemaat. Typing matches the name **or any of the person's labels** (typing "Liturgos" lists everyone labelled Liturgos), and each option shows the person's labels.

Pages:

- `/admin/peribadahan` (all categories, newest date first): Tanggal (long date, sortable), Waktu (sortable), Jenis (category name, searchable), Ringkasan (Tempat · Wilayah · Tema · DPA joined, searchable), row actions. Toolbar: Wilayah and Tempat facets across all categories, a server-side search over tema, DPA, catatan, and bahan alkitab ("Cari tema/DPA/catatan..."), and a date-range filter.
- `/admin/peribadahan/[key]` (one category): Tanggal, Waktu, then that category's own columns (Tempat, Wilayah, DPA, Tema, Pelayan Firman, Liturgos, as applicable; SMKA shows Tema, Liturgos, Pemusik, Bahan Alkitab). The Tempat and Wilayah facets appear only when the category has those fields.

Actions:

- "Tambah Jadwal" dialog: Tanggal (default next Sunday, or today when today is Sunday; inside a warta, see 9.4), Jenis (hidden on a single-category page), Waktu. The new row gets `sort_order` = the number of rows already on that date. Toast: "Baris ditambahkan - lengkapi detailnya lewat menu Edit".
- An edit dialog with every field of that row's category (SMKA includes its grid) and "Simpan"; saving updates `updated_at`.
- "Hapus" with a confirmation naming "{category} · {long date}".

### 9.6 Litbang template (`/admin/litbang`)

A reorderable list of program cards that seeds new warta.

- Each card: a drag handle (mouse and keyboard; the new order is saved as `sort_order` = position), a Name input, an "Aktif" checkbox, a Deskripsi textarea, "Simpan", and "Hapus" (confirm). The textarea placeholder reads "Tulis deskripsi bebas, mis." followed by two example bullets: "• Katekisasi Dasar setiap Sabtu di Ruang Konsistori pkl. 17.00 WIB" and "• Katekisasi Lanjutan setiap Jumat di Ruang Konsistori pkl. 17.00 WIB".
- Inactive cards look de-emphasised. Toggling shows "Diaktifkan - akan ikut ke warta baru" or "Dinonaktifkan - dilewati saat warta baru dibuat".
- "Tambah Litbang" dialog: Nama (required), Deskripsi; the card goes last.
- Only active cards are copied into a warta, and only when that warta is created. Later template changes never touch existing warta.

### 9.7 Sarana & Dana (finance)

Three fixed items; there is no add or delete for items.

- Overview `/admin/sarana-dana`: Nama, Saldo Saat Ini (from `sarana_dana_balances`, IDR, right-aligned), Keterangan. Row actions: "Edit" (a dialog that edits Keterangan only) and "Lihat Transaksi" (opens the ledger).
- Ledger `/admin/sarana-dana/[key]`: the item name as title; a "Saldo Saat Ini" figure; an inline "Saldo Awal" number field with "Simpan" (`warta:update`); a server-side date-range filter; then the transactions table:
  - Tanggal (sortable), Tipe (badge "Pemasukan" or "Pengeluaran", sortable), Jumlah (sortable; "+" or "−" prefix, expenses in the error color, right-aligned), Jemaat (**Persembahan Bulanan only**, searchable), Keterangan (sortable, searchable), and row actions "Edit" and "Hapus" (confirm `Hapus transaksi {amount} pada {date}?`).
  - "Tambah Transaksi" dialog: Tanggal (default today); Tipe, a select of Pemasukan or Pengeluaran (for Persembahan Bulanan, the fixed text "Pemasukan (tetap)" instead); Jemaat, optional and searchable (Persembahan Bulanan only); Jumlah (digits only, shown with thousand separators such as "1.000.000"); Keterangan. The edit dialog has the same fields and resets to the saved values each time it opens.
- Server rules: Persembahan Bulanan transactions are always `masuk`; `jemaat_id` is kept only for Persembahan Bulanan and forced to null for other items, on create and on update; `jumlah` must be a number of at least 0.
- Current balance: `saldo_awal` + sum of `masuk` − sum of `keluar` (read it from the view).
- Report for a range from `start` to `end`, per item: Saldo Awal = `saldo_awal` + the net of every transaction dated before `start`; Pemasukan = sum of `masuk` in range; Pengeluaran = sum of `keluar` in range; Saldo Akhir = Saldo Awal + Pemasukan − Pengeluaran.

### 9.8 Master data: Tempat, Wilayah, Label Jemaat

All three share one shape: the table pattern, an add dialog, an edit dialog titled with the record name, and delete with confirmation. New rows go last (`sort_order` = current count), and the default order is `sort_order`.

- Tempat (`/admin/tempat`): Nama (required, sortable, searchable), Keterangan (placeholder "Alamat/keterangan", sortable, searchable). Used by Peribadahan. Confirm: `Hapus tempat "{nama}"?`
- Wilayah (`/admin/wilayah`): Nama. Used by Kebaktian Rumah Tangga and by jemaat profiles.
- Label Jemaat (`/admin/label-jemaat`): "Nama Label" (unique; placeholder "Mis. Pendeta"). Labels attach to jemaat (many-to-many) and power the person-picker search.

Deleting a Tempat or Wilayah clears references to it; deleting a label removes its assignments.

### 9.9 Data Jemaat (`/admin/jemaat`)

- Header "Data Jemaat" with "{n} jiwa · {m} keluarga"; actions "Ekspor CSV" and "Tambah Jemaat" (`warta:update`).
- Table: No. Anggota (monospace), Nama (initials avatar plus name; sortable, searchable), Keluarga (searchable), Wilayah (facet), Status (badge, facet), Kontak (searchable). Row actions: "Edit" (opens the detail page; "Lihat" for read-only users) and "Hapus" (confirm `Hapus {nama}?`).
- Status badges read Simpatisan, Baptis Anak, Sidi, Anggota Penuh. Give them distinct styles (for example Simpatisan outlined in the accent, Baptis Anak tinted, Sidi and Anggota Penuh neutral) and always show the text.
- Initials avatar: the initials of the first and last word of the name, on a background chosen deterministically from the name out of a small, calm palette.
- CSV export: columns No. Anggota, Nama, Keluarga, Wilayah, Status (label), Kontak; UTF-8 with a BOM so Excel shows the characters correctly; file name `data-jemaat-YYYY-MM-DD.csv`. It exports **every row matching the current search and filters**, not only the visible page.
- Profile fields (add dialog and detail page): Nama (required), No. Anggota (unique; placeholder "mis. RB-0142"), Jenis Kelamin (Laki-laki, Perempuan), Status Keanggotaan, Wilayah, Pekerjaan, Alamat, Nomor HP/WA (digits only), Tanggal Lahir, Tanggal Masuk, Nama Keluarga (a searchable combobox of existing keluarga; empty result: "Tidak ditemukan - buat dulu di halaman Keluarga"), Hubungan dalam Keluarga (fixed list: Kepala Keluarga, Istri, Anak, Orang Tua, Kerabat Lain), Label (multi-select; if none exist: "Belum ada label - buat di halaman Label Jemaat.").
- The family is submitted by **name**: the server finds an existing `keluarga` case-insensitively or creates it, and an empty name clears the link. Labels are saved as a whole set, replacing all previous assignments.
- Detail page `/admin/jemaat/[id]`: back link "Kembali ke daftar jemaat"; a header with No. Anggota, Nama, status badge, wilayah badge, a family chip linking to the family page, and the labels; actions "Hapus" (confirm "Catatan pastoral milik jemaat ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.", then back to the list) and "Simpan Perubahan". Sections:
  - "Profil": the profile fields.
  - "Anggota Keluarga": the other members of the same family (name linking to their page, hubungan, status badge); empty: "Belum ada anggota keluarga lain yang tercatat."
  - "Catatan Pastoral" (internal only): Tanggal (right-aligned), Jenis (badge), Penulis, Isi (wraps), with "Edit" (dialog) and "Hapus" (confirm "Hapus catatan ini?"); newest first, paginated; empty: "Belum ada catatan pastoral." An add form below it: Jenis (placeholder "Jenis (mis. Kunjungan)", required), Tanggal (default today), Isi (placeholder "Hasil kunjungan, pergumulan keluarga, kebutuhan diakonia...", required), "Simpan Catatan". The server sets the author: `penulis_id`, and `penulis_nama` from the user's full name or email.
- Deleting a jemaat removes their pastoral notes and label assignments and clears every reference to them elsewhere (schedule roles, SMKA PF, linked account, offering entries).

### 9.10 Keluarga (`/admin/keluarga`)

- Header "Keluarga" with "{n} kartu keluarga. Setiap jemaat bisa dikaitkan ke satu keluarga dengan hubungannya masing-masing - atur relasinya di halaman detail keluarga." Button "Tambah Keluarga": "Nama Keluarga" (placeholder "mis. Kel. Saragih"). Names are unique, compared case-insensitively ("Nama keluarga sudah digunakan").
- Table: Nama Keluarga (sortable, searchable), Jumlah Anggota (sortable, right-aligned), Anggota (member names separated by commas, searchable). Row actions "Edit" (opens the detail page) and "Hapus".
- Deleting a family keeps its members but detaches them (clears `keluarga_id` and `hubungan_keluarga`). When it has members, the confirmation says: "Anggota yang masih tercatat di keluarga ini akan dilepas (tidak ikut terhapus), dan hubungan keluarganya dikosongkan. Tindakan ini tidak bisa dibatalkan."
- Detail `/admin/keluarga/[id]`: back link "Kembali ke daftar keluarga"; title and "{n} anggota"; "Ubah Nama" (dialog, same uniqueness rule) and "Hapus". Members table: No. Anggota, Nama (links to the jemaat), Wilayah, Status, Kontak, Hubungan Keluarga (an inline select with "Simpan", enabled only after a change), and the row action "Keluarkan" (after a confirmation, removes the person from the family and clears their hubungan). Below it, "Tambah Anggota": a searchable picker of jemaat not already in this family, Hubungan Keluarga, and "Tambahkan".

### 9.11 Pengguna (`/admin/users`, super_admin)

- "Undang Pengguna" dialog: Email (required), Nama Lengkap, Role (a single role or "Tidak ada"), Jemaat (link to a jemaat or "Tidak ada"), button "Kirim Undangan", toast "Undangan terkirim". If the invite works but the role or jemaat step fails, say so explicitly ("Pengguna diundang, tapi gagal set role: …").
- Table: Nama (initials avatar; sortable, searchable), Email (sortable, searchable), Role (badge, facet), Jemaat (searchable). Row actions:
  - "Edit" / "Lihat": a dialog with Role and Jemaat selects and "Simpan". Changing the role replaces all of the user's roles with the chosen one (one role per user in the UI). A jemaat can be linked to at most one account.
  - "Hapus": not offered on your own row, and the server refuses it too ("Tidak bisa menghapus akun sendiri"). Confirm `Hapus akun {email}?` with "Akun ini tidak akan bisa login lagi. Riwayat warta yang pernah dibuat akun ini tetap tersimpan. Tindakan ini tidak bisa dibatalkan." It deletes the auth user; profile and role rows cascade.

### 9.12 Roles & Permissions (`/admin/roles`)

- A grid of roles sorted by name, each with its description and one badge per permission (`resource:action`).
- "Tambah Role" (`roles:create`): Nama Role (required, unique), Deskripsi.
- "Hapus" (`roles:delete`), confirming "Pengguna dengan role ini akan kehilangan seluruh permission-nya. Tindakan ini tidak bisa dibatalkan."
- There is currently no way to change a role's permissions in the UI (see section 12).

### 9.13 Log Aktivitas (`/admin/log-aktivitas`, `activity_log:read`)

- An explanation line: activity is recorded automatically for every change in the admin (who, what, and from where) and can't be edited or deleted.
- Columns: Waktu (WIB, right-aligned, sortable), Pengguna (email), Modul (badge with the display label, sortable), Aktivitas, IP.
- Filters: text search over activity and email ("Cari aktivitas atau email..."), a date range (the end date counts through 23:59:59), and a Modul dropdown. Newest first by default.
- Server-side filtering and pagination, because the table has no upper bound.

### 9.14 Profil Saya (`/admin/akun`)

- "Informasi Akun": the email, role badges ("Tanpa role" if none), and an editable "Nama Lengkap" with "Simpan" (an empty value saves as null).
- "Ganti Password": new password and confirmation (at least 8 characters, matching), button "Ganti Password".
- Both log under module `akun`.

## 10. API shape

If you keep route handlers: REST-style under `/api/admin/...` and `/api/account/...`, JSON in and out, `{ data }` on success, `{ error }` with 400, 401, 403, or 404 on failure, and 207 when the main write succeeded but a follow-up write failed (label assignment, Litbang snapshot, invite role or jemaat link, SMKA groups). Each handler checks permission, validates, writes, logs the activity, and responds. Server Actions are fine too, with the same checks and messages.

Current endpoints, for reference:

- `/api/admin/warta` GET, POST · `/[id]` GET, PATCH (fields or `status`), DELETE · `/[id]/kesaksian` POST · `/[id]/kesaksian/[itemId]` PATCH, DELETE · `/[id]/litbang/[itemId]` PATCH (deskripsi)
- `/api/admin/peribadahan` GET (`?tanggal=`), POST · `/[id]` PATCH (fields plus an optional `smka_kelompok` array), DELETE
- `/api/admin/litbang-template` POST · `/[id]` PATCH (name, deskripsi, active), DELETE · `/reorder` POST `{ ids }`
- `/api/admin/sarana-dana/[id]` PATCH (saldo_awal, keterangan) · `/[id]/transactions` POST · `/[id]/transactions/[transactionId]` PATCH, DELETE
- `/api/admin/tempat`, `/wilayah`, `/label-jemaat` GET, POST · `/[id]` PATCH, DELETE
- `/api/admin/jemaat` GET (`?q=&wilayah=&status=`, used by the CSV export), POST · `/[id]` PATCH, DELETE · `/[id]/catatan-pastoral` POST · `/[id]/catatan-pastoral/[catatanId]` PATCH, DELETE
- `/api/admin/keluarga` POST · `/[id]` PATCH (rename), DELETE
- `/api/admin/users` POST (invite) · `/[id]` DELETE · `/[id]/role` PATCH `{ roleId }` · `/[id]/jemaat` PATCH `{ jemaatId }` (null unlinks)
- `/api/admin/roles` GET, POST · `/[id]` PATCH, DELETE
- `/api/account/profile` PATCH `{ full_name }` · `/api/account/password` POST `{ password, confirm }`

## 11. Rules that cut across modules

- Dates are stored as `YYYY-MM-DD`. Add and subtract days on the calendar date itself (treated as a UTC date), never through local time.
- "Today" is always the current date in Asia/Jakarta. A plain UTC date is still yesterday until 07:00 WIB (see section 12, item 10).
- Service week = `tanggal_kebaktian` through + 6 days. Finance week = − 7 through − 1 days.
- "Next Sunday" = today if today is Sunday, otherwise the coming Sunday.
- Money inputs strip everything except digits while typing, show `id-ID` thousand separators, and store a number. Phone inputs keep digits only.
- Ordered lists append new rows with `sort_order` = current count (tempat, wilayah, labels, Litbang cards, Kesaksian items, and peribadahan rows per date).
- Peribadahan rows and Sarana & Dana transactions are never copied into a warta; a warta reads them by date range. Litbang is the only per-warta copy.
- Deleting a warta deletes only its own Litbang and Kesaksian rows.
- Unique values: `warta.slug`, `keluarga.nama` (checked case-insensitively in the app), `label_jemaat.nama`, `jemaat.nomor_anggota`, `profiles.jemaat_id`, `roles.name`, category and item `key`s, and SMKA `(item, kelompok)`.
- After any mutation, refresh the affected data so every open view shows it.
- Read-only mode (no `warta:update`): the same screens, with inputs disabled and no add, edit, or delete controls.

## 12. Known issues to fix during the rebuild

1. **Personal data is readable by anyone (high priority).** RLS allows anonymous `select` on `jemaat` (phone numbers, addresses, birth dates, occupations), `keluarga`, and `sarana_dana_transactions` (including `jemaat_id`, that is, who gave how much). The anon key ships to every browser, so anyone can read these tables through the Supabase REST API. In a new additive migration, limit these tables to signed-in users with `warta:read`, and give the public site only what it shows:
   - the service week's schedule with people's **names only**, through a `security definer` Postgres function (for example `public_warta_schedule(start date, end date)`) or a narrow view; and
   - the finance report as **aggregates only** (per item: Saldo Awal, Pemasukan, Pengeluaran, Saldo Akhir), through a similar function, or a server-only service-role read that never returns individual rows.

   Then verify with the anon key that `jemaat` and individual transactions can't be read, and that `/warta/[slug]` still renders completely.
2. The CSV export must follow the current table filters and search.
3. Add a permission editor to Roles & Permissions (a grid of roles by `resource:action` checkboxes, requiring `roles:update`), and stop super_admin from removing its own `roles:*` or `users:*` access.
4. Replace the public placeholder pages (Beranda, Tentang Kami, Jadwal Ibadah, Kontak) with real layouts and marked placeholder content.
5. Inside a warta, "Tambah Jadwal" should accept any date in the service week, not only the kebaktian date.
6. Multi-step writes aren't atomic today (role reassignment deletes then inserts, label replacement, and invite plus role plus jemaat link). Move them into Postgres functions called through RPC.
7. The admin Warta list currently defaults to oldest first. Make it newest first, as Peribadahan, the ledgers, and the activity log already are.
8. Show a clear notice after a `?error=forbidden` redirect.
9. Leave the unused `announcements` and `content` resources and the `sudah_baptis` and `sudah_sidi` columns in the database, and keep them out of the UI.
10. Default dates are computed in UTC today: "today" comes from `new Date().toISOString().slice(0, 10)`, and the "next Sunday" helper mixes the browser's local weekday with a UTC date. So between 00:00 and 07:00 WIB, the default dates in "Tambah Transaksi" and the pastoral note form (and the CSV file name) are yesterday, and "Tambah Jadwal" pre-fills a Saturday. Compute every default date in Asia/Jakarta.

## 13. Acceptance checks

1. As viewer: every content module is visible and read-only; Pengguna, Roles & Permissions, and Log Aktivitas are hidden; opening `/admin/users` directly redirects with the forbidden notice; the matching API calls return 403.
2. As editor: can create and edit a warta but can't delete it. As admin: everything in content, no Pengguna. As super_admin: everything.
3. Creating a warta copies only the active Litbang cards. Editing that warta's Litbang changes neither the template nor other warta. Deactivating a card leaves existing warta untouched.
4. A peribadahan row added inside a warta appears on `/admin/peribadahan` and on its category page, and the reverse.
5. The public warta page shows the service week's schedule and the previous week's finance report, and the four figures per item match the formula in 9.7.
6. Persembahan Bulanan stays `masuk` even if a request sends `keluar`, and stores the chosen jemaat. For other items `jemaat_id` is always null and the Jemaat column is hidden.
7. Editing an SMKA row saves all 8 groups; the public page lists only the groups with data.
8. Facet counts match the data; Wilayah plus Status narrows with AND; "Reset" clears everything; sorting keeps the filters.
9. The CSV export matches the filtered rows and opens correctly in Excel.
10. Deleting a family keeps its members but clears their family and hubungan.
11. Deleting a jemaat removes their pastoral notes, and schedules that referenced them show an empty field instead of failing.
12. Nobody can delete their own account.
13. The invite flow works end to end: the email arrives, the link lands on "Atur Password", and the new user reaches `/admin` with the assigned role.
14. Every mutation adds an activity log row with the right module, an Indonesian sentence, the email, and the IP.
15. `/login?next=https://example.com` ends on `/admin`, not the external site.
16. Light, dark, and system themes all work; the admin works at 360px wide and with the keyboard alone; every delete asks for confirmation.
17. After fix 12.1: the anon key can't read `jemaat` or individual transactions, and `/warta/[slug]` still renders fully.
18. At 05:00 WIB on a Sunday, "Tambah Jadwal" defaults to that Sunday, and "Tambah Transaksi" and a new pastoral note default to that same day.
