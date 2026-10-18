# Template Warta (.docx)

File template: `templates/warta/warta.docx`. Dari file inilah tombol **"Unduh Warta (.docx)"** (di dialog **"Pratinjau Warta"** pada editor warta) membuat dokumen warta. Template memakai sintaks [docxtemplater](https://docxtemplater.com/docs/tag-types/): teks di dalam kurung kurawal `{…}` adalah **tag** yang diganti dengan data warta.

Dokumen ini adalah kontrak tag. Daftar tag di bawah sama persis dengan skema di `src/lib/warta-docx.ts` (`wartaDocxSchema`). Sebuah test (`src/lib/warta-docx.test.ts`) mengekstrak semua tag dari `warta.docx` lalu membandingkannya dengan skema itu, ke dua arah. Jadi tag yang salah ketik, atau data yang tidak dipakai template, langsung ketahuan.

## Aturan untuk admin yang mengedit template di Word

1. **Jangan ada spasi di dalam `{}`.** Tulis `{informasi.judul}`, bukan `{ informasi.judul}` atau `{informasi. judul}`.
2. **Jangan hapus tag pembuka atau penutup loop.** Setiap `{#nama}` harus punya pasangan `{/nama}` dengan nama yang **sama persis**, dan urutannya harus bersarang dengan benar (yang dibuka terakhir ditutup lebih dulu).
3. **Tag pembuka/penutup yang berdiri di paragrafnya sendiri** (mis. `{#peribadahan.smka}`) akan hilang dari hasil cetak bersama paragrafnya. Biarkan tetap di paragrafnya sendiri. Jangan gabungkan dengan teks lain.
4. **Loop di baris tabel**: tag pembuka ada di sel pertama dan tag penutup di sel terakhir baris yang diulang. Kalau menambah kolom, sisipkan kolom **di antara** keduanya.
5. **Format (tebal, miring, ukuran huruf) diambil dari tag-nya.** Untuk mengubah tampilan sebuah isian, format seluruh tag-nya, termasuk `{` dan `}`.
6. **Jangan memakai tag `{@…}`** (XML mentah). Tag seperti ini tidak dipakai dan tidak didukung.
7. **Jangan menambah tag baru** yang tidak ada di daftar ini. Tag yang tidak dikenal akan kosong di hasil cetak (dan tercatat di log server), dan test akan gagal sampai skemanya ikut diubah oleh developer.
8. Gambar logo dan QRIS di template adalah gambar tetap. Kalau QRIS atau logo berganti, ganti gambarnya langsung di Word.
9. Nomor heading Bidang Peribadahan dan Litbang (1., 2., …) dibuat otomatis oleh Word (penomoran daftar). Karena itu bagian yang kosong tidak meninggalkan nomor yang loncat.
10. Setelah mengedit, simpan tetap sebagai `.docx`, lalu jalankan `pnpm test` (developer) sebelum di-commit.

## Cara kerja tag

| Bentuk | Arti |
|---|---|
| `{a.b}` | Isi teks. Karakter `<`, `&`, `"` aman. Baris baru di data menjadi pindah baris di Word. |
| `{#daftar}…{/daftar}` | Ulangi isi di antaranya untuk setiap baris data. Daftar kosong berarti bagian itu hilang. |
| `{#bendera}…{/bendera}` | Tampilkan isi hanya kalau bendera bernilai *true* (atau teksnya tidak kosong). |
| Di dalam loop | Tag ditulis tanpa awalan (`{tempat}`, bukan `{peribadahan.krt.baris.tempat}`). Kalau tidak ditemukan di baris itu, nilainya dicari di tingkat luar. |

Semua isian berupa teks dan tidak pernah `null`. Data yang kosong dicetak sebagai teks kosong. Tanggal memakai kalender Asia/Jakarta dengan nama hari/bulan Indonesia. Uang ditulis tanpa "Rp" (judul kolom sudah memuatnya), dengan pemisah ribuan titik.

## Daftar tag

### `informasi`: kepala warta

| Tag | Arti | Contoh |
|---|---|---|
| `{informasi.hari}` | Hari tanggal kebaktian | `Minggu` |
| `{informasi.tanggal}` | Tanggal kebaktian | `4 Oktober 2026` |
| `{informasi.judul}` | Judul Kebaktian | `Minggu XVIII sesudah Pentakosta` |
| `{informasi.tema}` | Tema Kebaktian | `Hidup dalam kasih` |

### `renungan`

| Tag | Arti | Contoh |
|---|---|---|
| `{renungan.judul}` | Judul Renungan | `Kasih yang sabar` |
| `{renungan.ayat}` | Ayat Renungan (bisa beberapa baris) | `Kasih itu sabar; kasih itu murah hati…` |
| `{renungan.kitab}` | Kitab Renungan | `1 Korintus 13:4-7` |
| `{renungan.isi}` | Isi Renungan (bisa beberapa paragraf) | |
| `{renungan.sumber}` | Sumber Renungan | `Renungan Harian` |

Di template, `{#renungan.kitab} ({renungan.kitab}){/renungan.kitab}` dan `{#renungan.sumber}({renungan.sumber}){/renungan.sumber}` mencegah tanda kurung kosong kalau isiannya kosong.

### `gereja`: kolom kiri halaman 1 (Profil Gereja dan Pendeta)

| Tag | Arti | Contoh |
|---|---|---|
| `{#gereja.jadwal_rutin}` … `{/gereja.jadwal_rutin}` | Jadwal rutin (Profil Gereja → Jadwal Rutin), berurutan | |
| ↳ `{nama}` | Nama kebaktian | `Kebaktian Minggu` |
| ↳ `{keterangan_waktu}` | Keterangan waktu | `Minggu, pkl. 08.00 WIB` |
| `{gereja.alamat}` | Alamat sekretariat | `Jl. Contoh No. 1, Rangkasbitung` |
| `{#gereja.kontak}` … `{/gereja.kontak}` | Kontak yang terisi saja, berurutan: Telp. Sekretariat, WhatsApp, Email, Jam Sekretariat, Website, Instagram, YouTube, Facebook | |
| ↳ `{label}` | Nama kontak | `Website` |
| ↳ `{nilai}` | Isinya. Alamat web dicetak tanpa `https://`. Hanya alamat http(s) yang dicetak. | `www.example.org` |
| `{#gereja.pendeta}` … `{/gereja.pendeta}` | Pendeta yang sedang melayani dan "Tampilkan di warta" | |
| ↳ `{nama}` | Nama pendeta | `Pdt. Contoh` |
| ↳ `{#no_hp}` … `{no_hp}` … `{/no_hp}` | No. HP (baris ini hilang kalau kosong) | `0812 3456 7890` |
| `{#gereja.rekening.tampil}` … `{/gereja.rekening.tampil}` | Bagian rekening, tampil kalau ada isinya | |
| `{gereja.rekening.nama_bank}` | Nama bank | `Bank Contoh` |
| `{gereja.rekening.atas_nama}` | Atas nama | `GKP Rangkasbitung` |
| `{gereja.rekening.nomor_rekening}` | Nomor rekening | `123-00-0000000-0` |

### `peribadahan`: I. Bidang Peribadahan (minggu kebaktian: tanggal kebaktian s.d. +6 hari)

Setiap kategori adalah loop atas baris jadwal kategori itu (urut tanggal, lalu urutan). Kategori tanpa jadwal hilang seluruhnya, termasuk judul dan tabelnya. Di setiap baris, `{hari}` = `Rabu`, `{tanggal}` = `7 Oktober 2026`, `{waktu}` = `19.00` (kosong kalau Waktu belum diisi; potongan `, pkl. … WIB` ikut hilang).

| Tag | Arti |
|---|---|
| `{#peribadahan.kebaktian_minggu}` … `{/peribadahan.kebaktian_minggu}` | Kebaktian Minggu, **dikelompokkan per tanggal**: `{hari}`, `{tanggal}` |
| ↳ `{#baris}` … `{/baris}` (baris tabel) | Satu baris per jam: `{waktu}`, `{tempat}`, `{pf}` (Pelayan Firman), `{liturgos}`, `{keterangan}` (kolom Keterangan dari jadwal) |
| `{#peribadahan.petugas_pujian.tampil}` … `{/peribadahan.petugas_pujian.tampil}` | Bagian "Petugas Pelayan Pujian", tampil kalau ada Kebaktian Minggu |
| ↳ `{#peribadahan.petugas_pujian.baris}` … `{/peribadahan.petugas_pujian.baris}` (baris tabel) | `{hari}`, `{tanggal}`, `{waktu}`, `{pnj}` (Pemandu Nyanyian Jemaat), `{pemusik}` (Pemain Musik) |
| `{#peribadahan.smka}` … `{/peribadahan.smka}` | Satu judul + tabel per Kebaktian SMKA: `{hari}`, `{tanggal}`, `{waktu}`, `{pf_batita}`, `{pf_balita}`, `{pf_kecil}`, `{pf_tanggung}`, `{pf_besar}`, `{pf_tunas_remaja}`, `{pelayan_liturgi}`, `{pemusik}`, `{bahan_alkitab}`, `{tema}` |
| `{#peribadahan.krt}` … `{/peribadahan.krt}` | Kebaktian Rumah Tangga, **dikelompokkan per tanggal + jam**: `{hari}`, `{tanggal}`, `{waktu}` |
| ↳ `{#baris}` … `{/baris}` (dua baris tabel: data + Tema) | Satu per wilayah: `{wilayah}`, `{tempat}`, `{pf}`, `{liturgos}`, `{dpa}`, `{tema}` |
| `{#peribadahan.pemahaman_alkitab}` … `{/…}` | Satu judul + tabel per jadwal: `{hari}`, `{tanggal}`, `{waktu}`, `{tempat}`, `{pf}`, `{liturgos}`, `{dpa}`, `{tema}` |
| `{#peribadahan.kebaktian_lansia}` … `{/…}` | sama seperti Pemahaman Alkitab |
| `{#peribadahan.kebaktian_perempuan}` … `{/…}` | sama |
| `{#peribadahan.kebaktian_pria}` … `{/…}` | sama |
| `{#peribadahan.kebaktian_pemuda_remaja}` … `{/…}` | sama |
| `{#peribadahan.doa_pagi.tampil}` … `{/peribadahan.doa_pagi.tampil}` | Bagian Doa Pagi |
| ↳ `{#peribadahan.doa_pagi.baris}` … `{/peribadahan.doa_pagi.baris}` | Satu baris per jadwal: `{hari}`, `{tanggal}`, `{waktu}`, `{tempat}` |

Kategori dengan kunci yang tidak dikenal memakai tata letak Kebaktian Minggu (brief §9.5).

### `litbang`: II. Bidang Litbang

| Tag | Arti | Contoh |
|---|---|---|
| `{#litbang}` … `{/litbang}` | Kartu Litbang milik warta ini, berurutan | |
| ↳ `{nama}` | Nama (nomornya otomatis dari Word) | `Katekisasi` |
| ↳ `{deskripsi}` | Deskripsi (bisa beberapa baris) | `Setiap Sabtu pkl. 17.00 WIB` |

### `sarana_dana`: III. Bidang Sarana dan Dana (minggu keuangan: −7 s.d. −1 hari)

Angka Saldo Awal, Jumlah Penerimaan, Jumlah Pengeluaran, dan Saldo Akhir **diambil langsung dari fungsi laporan inti** (`sarana_dana_report`), yaitu fungsi yang sama dengan halaman publik dan editor warta.

Untuk `kas_jemaat` dan `kas_sarana_prasarana`:

| Tag | Arti | Contoh |
|---|---|---|
| `{sarana_dana.kas_jemaat.saldo_awal_tanggal}` | Tanggal awal minggu keuangan | `27 September 2026` |
| `{sarana_dana.kas_jemaat.saldo_awal}` | Saldo Awal | `1.000.000` |
| `{#sarana_dana.kas_jemaat.penerimaan}` … `{/…}` (baris tabel) | Setiap pemasukan di rentang, urut tanggal: `{tanggal}` (`27 Sep`), `{keterangan}`, `{jumlah}` (`500.000`) | |
| `{#sarana_dana.kas_jemaat.pengeluaran}` … `{/…}` (baris tabel) | Setiap pengeluaran, kolom sama | |
| `{sarana_dana.kas_jemaat.total_penerimaan}` | Jumlah Penerimaan | `750.000` |
| `{sarana_dana.kas_jemaat.total_pengeluaran}` | Jumlah Pengeluaran | `250.000` |
| `{sarana_dana.kas_jemaat.saldo_akhir_tanggal}` | Tanggal akhir minggu keuangan | `3 Oktober 2026` |
| `{sarana_dana.kas_jemaat.saldo_akhir}` | Saldo Akhir. Negatif ditulis `−200`. | `1.500.000` |

Persembahan Bulanan **hanya nama, tidak pernah nominal**. Transaksi tanpa jemaat ditulis `NN`. Dua nama per baris (kiri/kanan), bernomor urut. Tanggal hanya muncul di baris pertama setiap tanggal.

| Tag | Arti | Contoh |
|---|---|---|
| `{#sarana_dana.persembahan_bulanan}` … `{/…}` (baris tabel) | | |
| ↳ `{tanggal}` | Tanggal (kosong di baris lanjutan) | `27 Sep` |
| ↳ `{no_kiri}`, `{nama_kiri}` | Nomor dan nama kiri | `1`, `Budi Santoso` |
| ↳ `{no_kanan}`, `{nama_kanan}` | Nomor dan nama kanan (kosong kalau jumlah nama ganjil) | `2`, `NN` |

### `kesaksian`: IV. Bidang Kesaksian dan Keesaan

| Tag | Arti | Contoh |
|---|---|---|
| `{#kesaksian}` … `{/kesaksian}` | Item kesaksian, berurutan | |
| ↳ `{nomor}` | Nomor urut | `1` |
| ↳ `{judul}` | Judul | `Diakonia` |
| ↳ `{deskripsi}` | Deskripsi (bisa beberapa baris) | |

### `bacaan`: Bahan Bacaan dan Nyanyian

| Tag | Arti | Contoh |
|---|---|---|
| `{bacaan.pukul}` | Jam Kebaktian Minggu pada tanggal kebaktian | `08.00 WIB dan 11.00 WIB` |
| `{bacaan.tata_kebaktian}` | Tata Kebaktian | `GKP` |
| `{bacaan.nas_pembimbing}` | Nas Pembimbing | `Mazmur 133:1` |
| `{bacaan.pembacaan_alkitab}` | Pembacaan Alkitab | `Yohanes 15:9-17` |
| `{bacaan.pembacaan_mazmur}` | Pembacaan Mazmur | `Mazmur 23` |
| `{#bacaan.pujian}` … `{/bacaan.pujian}` (baris tabel) | Daftar Pujian, berurutan | |
| ↳ `{buku}` | Nama buku. Kosong untuk "Lainnya". | `Kidung Jemaat` |
| ↳ `{nomor}` | Nomor lagu dan bait/ayat | `12 : 1-3` |

Tanggal, judul, dan tema di tabel ini memakai `{informasi.tanggal}`, `{informasi.judul}`, `{informasi.tema}`.

### `kehadiran`: Kehadiran (minggu keuangan)

Setiap jadwal Peribadahan di minggu keuangan yang punya data kehadiran.

| Tag | Arti | Contoh |
|---|---|---|
| `{#kehadiran.tampil}` … `{/kehadiran.tampil}` | Bagian Kehadiran, hilang kalau tidak ada data | |
| `{#kehadiran.layanan}` … `{/kehadiran.layanan}` (baris tabel) | Satu blok per jadwal | |
| ↳ `{judul}` | Nama kategori | `Kebaktian Minggu` |
| ↳ `{hari}`, `{tanggal}`, `{waktu}` | Hari, tanggal, jam | `Minggu`, `27 September 2026`, `08.00` |
| ↳ `{total}` | Total kehadiran jadwal itu (L + P + Anak + Online, atau jumlah semua kelompok SMKA) | `188` |
| ↳ `{#baris}` … `{/baris}` (baris tabel) | Rincian: `{label}` dan `{rincian}` | `Onsite` / `L : 90 orang, P : 87 orang, A : 4 orang`; `` / `Online : 7 orang`; untuk SMKA `Kelas Batita` / `L : 3 orang, P : 2 orang`; untuk KRT label = wilayah |

## Yang tidak berasal dari data

- Logo GKP dan gambar QRIS adalah gambar tetap di template. Mengganti QRIS dari Profil Gereja secara otomatis butuh modul gambar docxtemplater (berbayar), jadi belum dilakukan.
- Teks tetap seperti "WARTA JEMAAT", "GEREJA KRISTEN PASUNDAN", ucapan selamat datang, dan "MAJELIS JEMAAT MENGUCAPKAN TERIMA KASIH…" ada langsung di template.
- Template tidak memuat hyperlink. Alamat web dicetak sebagai teks, dan hanya alamat http(s).
