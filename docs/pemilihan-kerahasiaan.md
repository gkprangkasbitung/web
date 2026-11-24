# Kerahasiaan suara: Pemilihan Majelis Jemaat

Dokumen ini untuk panitia pemilihan dan majelis. Isinya: bagaimana aplikasi menjaga rahasia suara, apa yang dijamin, dan apa yang tidak bisa dijamin. Bagian terakhir berisi rincian teknis untuk pengembang.

## Ringkasnya

- Aplikasi mencatat **bahwa** seseorang sudah memilih, tetapi tidak pernah mencatat **siapa memilih siapa**.
- Lewat aplikasi, tidak ada orang yang bisa melihat pilihan seorang pemilih. Ini berlaku juga untuk super admin dan panitia. Yang bisa dilihat hanya jumlah suara.
- Ada dua batasan yang perlu diketahui dan dijaga oleh panitia:
  1. Orang yang memegang **akses langsung ke database** (pengelola proyek Supabase) secara teknis bisa mencocokkan suara dengan pemilihnya.
  2. **Hasil yang bisa dipantau saat pemungutan masih berjalan** bisa membuka pilihan seseorang, kalau diketahui siapa yang baru saja memilih.

## Cara suara disimpan

Bayangkan pemungutan suara di gedung gereja. Ada **daftar hadir** dan ada **kotak suara**. Aplikasi menyimpan keduanya secara terpisah.

**Daftar hadir** (`pemilihan_partisipasi`)
- Isinya: siapa yang sudah memilih, kapan, dan caranya.
- Caranya bisa "mandiri" (lewat Portal Jemaat) atau "dibantu" (panitia memasukkan formulir kertas). Untuk yang dibantu, tercatat juga panitia yang membantu dan nomor formulirnya.
- Tidak ada pilihan calon di dalamnya.

**Kotak suara** (`pemilihan_suara`)
- Isinya satu lembar untuk setiap nama yang dicentang: pemilihan yang mana, Penatua atau PPJ, dan calon yang dipilih.
- Tidak ada nama pemilih, tidak ada jam, dan tidak ada nomor urut.
- Setiap lembar diberi kode acak, jadi kodenya tidak menunjukkan urutan masuk.
- Lembar-lembar dari satu surat suara juga dimasukkan dengan urutan acak.

**Ketika seseorang memilih**, daftar hadir dan lembar-lembar suaranya ditulis dalam satu langkah. Kalau ada yang salah, misalnya jumlah pilihan kurang, tidak ada yang tercatat sama sekali. Satu orang hanya bisa tercatat satu kali di daftar hadir, walaupun ia menekan tombol kirim berkali-kali atau dari dua HP sekaligus.

## Yang dijamin

1. **Tidak ada akun yang bisa membuka daftar hadir atau kotak suara.** Ini berlaku untuk aplikasi, Portal Jemaat, dan akses data Supabase (API): super admin, panitia, jemaat, maupun kunci server aplikasi. Yang bisa diminta hanya ringkasan:
   - jumlah pemilih, jumlah yang sudah memilih, dan persentasenya;
   - jumlah yang mandiri dan yang dibantu, serta jumlah bantuan per panitia;
   - jumlah suara per calon.
2. **Tidak ada jejak yang menghubungkan lembar suara dengan pemilih.**
   - Tidak ada kolom yang menghubungkan keduanya.
   - Ada juga jejak tersembunyi: database biasanya meninggalkan "cap" nomor transaksi pada data yang dirujuk. Rancangan ini dibuat supaya memilih tidak meninggalkan cap itu pada data jemaat pemilih maupun data calon. Ini sudah diuji: setelah seseorang memilih, data jemaat dan data peserta yang bisa dibaca staf tidak berubah sedikit pun.
3. **Suara bersifat final.** Suara yang sudah tercatat tidak bisa diubah atau dihapus, juga oleh pengelola database lewat perintah biasa.
4. **Pemilih tidak pernah ditunjukkan pilihannya lagi.** Tanda terima hanya berisi waktu suara tercatat, misalnya "Suara Anda tercatat pada …". Pemilih yang dibantu melihat "Suara Anda dicatat oleh panitia pada …".
5. **Log aktivitas tidak pernah memuat pilihan.** Yang tercatat hanya:
   - `Memberikan suara pada pemilihan "…"` untuk pemilih lewat portal;
   - `Membantu pemilih memberikan suara: {nama} (formulir {nomor})` untuk pemungutan yang dibantu;
   - pembuatan, impor peserta, pembukaan, penutupan, dan pengumuman pemilihan.
   - (sejak tahap 14b) perubahan dan penghapusan pemilihan draft, setiap baris impor yang diselesaikan panitia, serta menyalakan/mematikan "tampilkan hasil sementara di Portal Jemaat".
6. **Pesan kesalahan dan log server tidak memuat pilihan.**
   - Pesan seperti "Pilih minimal 10 calon Penatua" hanya menyebut jumlah, tidak menyebut nama calon.
   - Server aplikasi tidak menulis isi surat suara ke log.
7. **Aturan pemilihan diperiksa oleh database, bukan hanya oleh tampilan:**
   - Penatua minimal 10 dan maksimal 30, PPJ minimal 5 dan maksimal 15, tanpa aturan jenis kelamin;
   - setiap pilihan harus calon pada pemilihan itu, dan tidak boleh ada nama ganda dalam satu bagian;
   - orang yang sama boleh dipilih sebagai Penatua sekaligus PPJ;
   - jadwal dibuka dan ditutup;
   - hanya peserta yang terdaftar "dapat memilih".

   Daftar peserta tidak bisa diubah setelah pemilihan dibuka.

## Siapa melihat apa

| Siapa | Yang bisa dilihat |
|---|---|
| Pemilih (Portal Jemaat) | Daftar calon saat pemungutan dibuka. Apakah dan kapan ia sudah memilih. Hasil hanya kalau sudah diumumkan, atau kalau panitia menyalakan "tampilkan hasil saat berjalan". |
| Jemaat lain yang punya akun portal | Hasil, dengan aturan yang sama. |
| Panitia dengan izin `pemilihan:read` | Jumlah pemilih, yang sudah memilih, persentase, mandiri/dibantu, bantuan per panitia. Daftar peserta beserta alasan tidak dapat dipilih dan keterangan dari file impor (alasan dan keterangan tidak pernah tampil di Portal Jemaat). |
| Pemegang izin `pemilihan_hasil:read` | Jumlah suara per calon, **langsung dan kapan saja**, juga selama pemungutan berjalan. |
| Panitia di halaman "bantu memilih" (izin `pemilihan_bantu:create`) | Siapa yang belum memilih (untuk mencari pemilih yang akan dibantu), tanpa data jemaatnya sendiri. Halaman ini tidak menampilkan siapa sudah memilih apa, juga tidak menyimpan pilihan di peramban. |
| Super admin (Log Aktivitas) | Siapa memilih dan kapan, tetapi tidak apa yang dipilih. |

Mengetahui *siapa sudah memilih* sama dengan daftar hadir di tempat pemungutan suara: memang bukan rahasia. Yang rahasia adalah *apa yang dipilih*.

## Batasan yang tidak bisa dijamin aplikasi

### 1. Akses langsung ke database

Orang yang memegang akses langsung bisa mencocokkan suara dengan pemilihnya. Yang termasuk:
- pemilik atau anggota proyek Supabase yang bisa membuka dashboard atau SQL Editor;
- role sistem milik Supabase;
- siapa pun yang memegang salinan cadangan (backup) database.

Ini mudah dilakukan, bukan hanya kemungkinan di atas kertas. Database mencatat nomor transaksi pada setiap data yang ditulis. Daftar hadir dan lembar suara dari satu pemilih ditulis dalam satu langkah, jadi nomornya sama atau berdekatan, dan disimpan berurutan. Hal yang sama berlaku untuk backup dan catatan perubahan database.

Ini tidak bisa dihilangkan tanpa melepas jaminan "satu langkah" (tidak ada suara setengah tercatat). Karena itu, yang bisa dilakukan adalah **membatasi siapa yang memegang akses ini**.

### 2. Hasil yang dipantau saat pemungutan berjalan

Pemegang izin `pemilihan_hasil:read` bisa melihat jumlah suara saat itu juga. Kalau ia membandingkan jumlah sebelum dan sesudah satu orang memilih, dan tahu siapa orang itu, isi surat suara orang itu terbaca. Contoh caranya tahu siapa: pemilih yang baru saja ia bantu, daftar "belum memilih", atau Log Aktivitas.

Panitia yang membantu pemilih memang sudah melihat formulir kertasnya. Tetapi celah ini juga berlaku untuk pemilih lewat portal.

### 3. "Tampilkan hasil saat berjalan" di Portal Jemaat

Kalau pengaturan ini dinyalakan, risiko di atas berlaku untuk semua jemaat yang punya akun portal. Contohnya: ketika baru satu suara masuk, hasil yang tampil sama persis dengan surat suara orang pertama. Pengaturan ini bisa dinyalakan dan dimatikan kapan saja.

### 4. Pemungutan suara dibantu

Panitia yang membantu melihat formulir kertas dan memasukkan pilihannya. Penyimpanan dan pemusnahan formulir kertas mengikuti tata tertib panitia, di luar aplikasi.

### 5. Perangkat dan lingkungan pemilih

Aplikasi tidak bisa mencegah orang lain melihat layar pemilih, HP yang dipinjam, atau akun yang dipakai bersama. Pilihan hanya tersimpan di peramban (browser) pemilih sampai dikirim; tidak ada draf yang disimpan di server.

### 6. Setelan log database

Setelan database Supabase saat ini tidak mencatat isi permintaan:
- pencatatan perintah hanya untuk perubahan struktur;
- nilai parameter tidak dicatat saat terjadi kesalahan;
- pgaudit mati.

Satu fitur, `auto_explain`, mencatat permintaan yang berjalan lebih dari 10 detik **beserta isinya**. Permintaan dari aplikasi dihentikan paling lama 8 detik, jadi tidak pernah sampai ke sana. Setelan-setelan ini tidak boleh diubah selama pemilihan (lihat `docs/deploy-checklist.md` §9).

## Rekomendasi untuk panitia dan majelis

1. **Batasi akses ke proyek Supabase** selama pemilihan dan selama backup masih menyimpan datanya. Catat siapa saja yang memegangnya.
2. **Berikan izin `pemilihan_hasil:read` ke sesedikit mungkin orang.** Role `panitia_pemilihan` memilikinya. Jangan menampilkan hasil sementara di layar umum selama pemungutan berjalan.
3. **Biarkan "tampilkan hasil saat berjalan" mati** sampai pemungutan ditutup. Untuk menampilkan hasil ke jemaat, umumkan pemilihan setelah ditutup.
4. **Jangan mengubah setelan log database** selama pemilihan.
5. **Atur dalam tata tertib** cara menyimpan dan memusnahkan formulir kertas pemungutan yang dibantu.
6. **Jangan menyebarkan Log Aktivitas** yang memuat waktu memilih selama pemungutan berjalan.

## Rincian teknis (untuk pengembang)

- **Migration:** `supabase/migrations/0038_pemilihan.sql`.
- **Tabel tersembunyi:** `pemilihan_suara` dan `pemilihan_partisipasi`.
  - RLS aktif tanpa policy.
  - Semua privilege dicabut dari `anon`, `authenticated`, dan `service_role` (`service_role` melewati RLS, jadi privilegenya juga harus dicabut).
  - Trigger menolak update, delete, dan truncate.
- **`pemilihan_suara`** tepat berisi `id` (`gen_random_uuid()`), `pemilihan_id`, `kontes`, dan `kandidat_jemaat_id`, tanpa index selain primary key.
- **Tanpa foreign key ke data orang.** Kedua tabel hanya punya foreign key ke `pemilihan` dan `pemilihan_kontes`, yang sama untuk setiap pemilih. Tidak ada foreign key ke `jemaat`, `pemilihan_peserta`, `profiles`, atau `auth.users`. Alasannya:
  - pemeriksaan foreign key mengunci baris yang dirujuk (`FOR KEY SHARE`), dan kuncinya meninggalkan id transaksi di kolom sistem `xmax`;
  - kolom sistem bisa di-select lewat REST oleh siapa pun yang boleh membaca tabelnya (viewer bisa membaca `jemaat?select=id,xmin,xmax`);
  - foreign key ke baris pemilih dan ke baris setiap calon akan membuka setiap surat suara bagi viewer.

  Satu-satunya baris lain yang dikunci saat memilih adalah baris `pemilihan` (`FOR SHARE`), supaya penutupan menunggu suara yang sedang masuk.
- **Fungsi:** `portal.berikan_suara`, `public.berikan_suara_dibantu`, `portal.pemilihan_aktif_saya`, `portal.kandidat`, `portal.hasil_pemilihan`, `public.hasil_partisipasi`, `public.hasil_suara`.
  - Tahap 14b (`supabase/migrations/0040_pemilihan_panitia.sql`) menambah fungsi untuk halaman panitia: `impor_peserta_pemilihan`, `perbarui_baris_impor`, `pemilihan_ringkasan`, `pemilihan_pencatat`, `pemilihan_daftar_jemaat`, `pemilihan_peserta_akun`, `pemilihan_jemaat_akun`, `pemilihan_kandidat_admin`, `pemilihan_untuk_bantu`, `pemilihan_belum_memilih`. Yang membaca daftar hadir hanya `pemilihan_ringkasan` (jumlah) dan `pemilihan_belum_memilih` (nama yang belum memilih, khusus `pemilihan_bantu:create`, hanya saat dibuka). Tidak ada yang membaca kotak suara selain `hasil_suara` yang sudah ada.
  - Tabel baru `pemilihan_impor_baris` (hasil impor peserta) tidak terhubung ke daftar hadir maupun kotak suara, dan tidak bisa diubah setelah pemilihan dibuka.
  - Semuanya `security definer` dengan `search_path` kosong.
  - Semua penulisan lewat `private.pemilihan_catat_suara`.
  - Kode error stabil `PM001`–`PM011` didaftar di kepala migration dan di `src/lib/pemilihan/types.ts`.
- **Hal yang tetap bisa dikorelasikan dengan akses database langsung:** `xmin` daftar hadir dan lembar suara (transaksi yang sama atau subtransaksinya), urutan fisik penyimpanan, WAL, dan backup. Role `postgres`, `supabase_admin`, `supabase_read_only_user`, dan `supabase_etl_admin` bisa membaca kedua tabel itu.
- **Log server:** `src/lib/pemilihan` tidak pernah menulis input ke console, dan error database yang tidak dikenal dicatat dengan kodenya saja. Setelan Postgres yang diandalkan:
  - `log_statement = ddl`, `log_min_duration_statement = -1`, `log_parameter_max_length_on_error = 0`, `pgaudit.log = none`;
  - `statement_timeout` untuk `authenticated` 8 detik, di bawah `auto_explain.log_min_duration` 10 detik.

  Sudah diperiksa di stack lokal: baris `ERROR` untuk penolakan suara hanya memuat pesan (misalnya "Pilih minimal 10 calon …"), dan `STATEMENT` dari PostgREST hanya memuat placeholder `$1`.

  Satu hal yang perlu diwaspadai: Postgres menulis isi baris di `DETAIL` kalau sebuah constraint dilanggar. Karena itu `private.pemilihan_catat_suara` memeriksa semuanya sebelum menulis, sehingga insert ke `pemilihan_suara` tidak bisa gagal karena constraint.
- **Test:**
  - `supabase/tests/database/pemilihan.test.sql`: bentuk tabel, hak akses, aturan, hasil, dan log.
  - `supabase/tests/database/pemilihan_panitia.test.sql` dan `tests/integration/pemilihan-panitia.test.ts` (tahap 14b): impor, pembukaan, bantu memilih, hak akses fungsi panitia, dan log tanpa pilihan.
  - `tests/integration/pemilihan.test.ts`: lewat REST sungguhan, mencakup penolakan akses langsung untuk semua akun, `xmin`/`xmax` yang tidak berubah setelah memilih, lima panggilan serentak, serta log dan console tanpa pilihan.
  - Uji mutasi: menambah foreign key `pemilihan_suara.kandidat_jemaat_id → jemaat` langsung menggagalkan test `xmax` dan test katalog.
