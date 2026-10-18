"""Stage 12b: how templates/warta/warta.docx was produced from the original
church template (the pre-12b warta.docx). Kept for review and reproducibility;
the app never runs it.

Only tags, placeholder text, and the stale static blocks change (the old
"Jadwal Kebaktian" list, contact and pastor lines, the April 2025 Kehadiran
figures, the PGI statement at the end); paragraph and run formatting, tables,
images, and the page layout are kept. The tag contract it writes is
docs/warta-template.md. Needs lxml. Usage:

    mkdir unpacked && cd unpacked && unzip -q ../warta-original.docx && cd ..
    python3 scripts/warta-template-rewrite.py unpacked   # edits word/document.xml + rels in place
    (cd unpacked && zip -X -r ../warta.docx .)
"""

import copy
import sys

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
XML_NS = "http://www.w3.org/XML/1998/namespace"


def q(tag):
    prefix, local = tag.split(":")
    assert prefix == "w"
    return "{%s}%s" % (W, local)


path = sys.argv[1] + "/word/document.xml"
parser = etree.XMLParser(remove_blank_text=False)
tree = etree.parse(path, parser)
root = tree.getroot()
body = root.find("w:body", NS)


def ptext(p):
    return "".join(t.text or "" for t in p.iter(q("w:t")))


def has_drawing(el):
    return any(True for _ in el.iter("{*}drawing", "{*}pict", "{*}AlternateContent"))


def unwrap(el):
    parent = el.getparent()
    idx = parent.index(el)
    for child in list(el):
        parent.insert(idx, child)
        idx += 1
    parent.remove(el)


def set_text(p, text):
    """Replaces a paragraph's text with `text`, keeping the first text run's formatting."""
    assert not has_drawing(p), "refusing to rewrite a paragraph with a drawing: %r" % ptext(p)
    for h in p.findall("w:hyperlink", NS):
        unwrap(h)
    for e in p.findall("w:proofErr", NS):
        p.remove(e)
    runs = [r for r in p.findall("w:r", NS)]
    text_runs = [r for r in runs if r.find("w:t", NS) is not None or r.find("w:tab", NS) is not None]
    if text_runs:
        carrier = text_runs[0]
        for r in runs:
            if r is not carrier:
                p.remove(r)
    else:
        carrier = etree.SubElement(p, q("w:r"))
        mark = p.find("w:pPr/w:rPr", NS)
        if mark is not None:
            rpr = copy.deepcopy(mark)
            rpr.tag = q("w:rPr")
            carrier.append(rpr)
    for child in list(carrier):
        if child.tag != q("w:rPr"):
            carrier.remove(child)
    t = etree.SubElement(carrier, q("w:t"))
    t.set("{%s}space" % XML_NS, "preserve")
    t.text = text
    return p


def rpr_of(run):
    rpr = run.find("w:rPr", NS)
    return copy.deepcopy(rpr) if rpr is not None else None


def set_runs(p, parts):
    """Like set_text, but one run per (text, rPr) part, so label and value keep their own formatting."""
    set_text(p, parts[0][0])
    carrier = p.findall("w:r", NS)[0]
    old = carrier.find("w:rPr", NS)
    if old is not None:
        carrier.remove(old)
    if parts[0][1] is not None:
        carrier.insert(0, copy.deepcopy(parts[0][1]))
    prev = carrier
    for text, rpr in parts[1:]:
        run = etree.Element(q("w:r"))
        if rpr is not None:
            run.append(copy.deepcopy(rpr))
        t = etree.SubElement(run, q("w:t"))
        t.set("{%s}space" % XML_NS, "preserve")
        t.text = text
        prev.addnext(run)
        prev = run
    return p


def clone_p(p, text):
    new = copy.deepcopy(p)
    for r in list(new.findall("w:r", NS)):
        if has_drawing(r):
            new.remove(r)
    return set_text(new, text)


def before(el, new):
    el.addprevious(new)
    return new


def after(el, new):
    el.addnext(new)
    return new


def remove(el):
    el.getparent().remove(el)


def paragraphs(container):
    return container.findall("w:p", NS)


def find_p(container, startswith, nth=0):
    hits = [p for p in paragraphs(container) if ptext(p).startswith(startswith)]
    assert len(hits) > nth, "paragraph not found: %r" % startswith
    return hits[nth]


def rows(tbl):
    return tbl.findall("w:tr", NS)


def cells(tr):
    return tr.findall("w:tc", NS)


def cell_text(tc, text):
    """Sets a cell to one paragraph holding `text` (extra paragraphs removed)."""
    ps = paragraphs(tc)
    set_text(ps[0], text)
    for extra in ps[1:]:
        tc.remove(extra)


def body_table_containing(text):
    for el in body:
        if el.tag == q("w:tbl") and text in "".join(t.text or "" for t in el.iter(q("w:t"))):
            return el
    raise AssertionError("table not found: %r" % text)


def body_p(startswith, nth=0):
    hits = [el for el in body if el.tag == q("w:p") and ptext(el).startswith(startswith)]
    assert len(hits) > nth, "body paragraph not found: %r" % startswith
    return hits[nth]


def next_el(el):
    return el.getnext()


def marker(template_p, tag):
    """A paragraph holding only a loop/condition tag (removed by paragraphLoop)."""
    return clone_p(template_p, tag)


def drop_vmerge(tc):
    pr = tc.find("w:tcPr", NS)
    if pr is not None:
        for vm in pr.findall("w:vMerge", NS):
            pr.remove(vm)


WAKTU = "{#waktu}, pkl. {waktu} WIB{/waktu}"

# ---------------------------------------------------------------------------
# Page 1, left column: jadwal rutin, kontak, pendeta, rekening (Profil Gereja/Pendeta)
# ---------------------------------------------------------------------------

top = body.find("w:tbl", NS)
left = cells(rows(top)[0])[0]
right = cells(rows(top)[0])[1]

p_name = find_p(left, "Kebaktian Minggu")
p_time = find_p(left, "Pukul 08.00 WIB")
p_blank_after_jadwal = find_p(left, "ALAMAT SEKRETARIAT").getprevious()
# Old static schedule (Kebaktian Anak ... Pemahaman Alkitab) goes; one loop replaces it.
el = p_time.getnext()
while el is not p_blank_after_jadwal:
    nxt = el.getnext()
    remove(el)
    el = nxt
set_text(p_name, "{nama}")
set_text(p_time, "{keterangan_waktu}")
before(p_name, marker(p_name, "{#gereja.jadwal_rutin}"))
after(p_time, marker(p_time, "{/gereja.jadwal_rutin}"))

p_alamat = find_p(left, "Jl. Sunan Kalijaga")
set_text(p_alamat, "{gereja.alamat}")

p_email = find_p(left, "Email.")
p_web = find_p(left, "Website:")
p_ig = find_p(left, "Instagram")
p_yt = find_p(left, "Kanal Youtube")
# Bold label, plain value: the formatting of "Instagram :" and "@gkprangkasbitung".
ig_runs = p_ig.findall("w:r", NS)
set_runs(p_email, [("{label}: ", rpr_of(ig_runs[0])), ("{nilai}", rpr_of(ig_runs[-1]))])
before(p_email, marker(p_email, "{#gereja.kontak}"))
after(p_email, marker(p_email, "{/gereja.kontak}"))
for p in (p_web, p_ig, p_yt):
    remove(p)

p_pdt1 = find_p(left, "Pdt. Robert")
p_hp1 = find_p(left, "No. HP: 0813")
p_pdt2 = find_p(left, "Pdt. Joshua")
p_hp2 = find_p(left, "No. HP: 0896")
set_text(p_pdt1, "{nama}")
set_text(p_hp1, "No. HP: {no_hp}")
before(p_pdt1, marker(p_pdt1, "{#gereja.pendeta}"))
before(p_hp1, marker(p_hp1, "{#no_hp}"))
after(p_hp1, marker(p_hp1, "{/no_hp}"))
after(p_hp1.getnext(), marker(p_hp1, "{/gereja.pendeta}"))
remove(p_pdt2)
remove(p_hp2)

p_bank = find_p(left, "REKENING BANK")
p_an = find_p(left, "a.n. GKP")
p_norek = find_p(left, "No. 163-")
set_text(p_bank, "REKENING {gereja.rekening.nama_bank} :")
set_text(p_an, "a.n. {gereja.rekening.atas_nama}")
set_text(p_norek, "No. {gereja.rekening.nomor_rekening}")
before(p_bank, marker(p_bank, "{#gereja.rekening.tampil}"))
after(p_norek, marker(p_norek, "{/gereja.rekening.tampil}"))

# ---------------------------------------------------------------------------
# Page 1, right column: informasi + renungan
# ---------------------------------------------------------------------------

info = right.find("w:tbl", NS)
r0, r1, r2 = rows(info)
cell_text(cells(r0)[0], "{informasi.hari}, {informasi.tanggal}")
cell_text(cells(r0)[1], "{informasi.judul}")
set_text(find_p(cells(r1)[0], "{informasi.tema}"), "{informasi.tema}")
ren = cells(r2)[0]
set_text(find_p(ren, "{renungan.judul}"), "{renungan.judul}")
set_text(find_p(ren, "{renungan.ayat}"), "{renungan.ayat}{#renungan.kitab} ({renungan.kitab}){/renungan.kitab}")
set_text(find_p(ren, "     {renungan.isi}"), "     {renungan.isi}")
set_text(find_p(ren, "({renungan.sumber})"), "{#renungan.sumber}({renungan.sumber}){/renungan.sumber}")

# ---------------------------------------------------------------------------
# I. Bidang Peribadahan: every category is a loop over its rows, hidden when empty
# ---------------------------------------------------------------------------

# Kebaktian Minggu, grouped by date; the per-row "Keterangan" column carries
# each row's catatan, so the old stand-alone catatan paragraph goes.
p_km = body_p("Kebaktian {informasi.jadwal.hari}")
t_km = next_el(p_km)
p_km_catatan = next_el(t_km)
p_km_blank = next_el(p_km_catatan)
assert ptext(p_km_catatan).strip().startswith("{peribadahan.kebaktian_umum.kebaktian_minggu.catatan}")
remove(p_km_catatan)
set_text(p_km, "Kebaktian {hari}, {tanggal}:")
c = cells(rows(t_km)[1])
cell_text(c[0], "{#baris}{waktu}")
cell_text(c[1], "{tempat}")
cell_text(c[2], "{pf}")
cell_text(c[3], "{liturgos}")
cell_text(c[4], "{keterangan}{/baris}")
before(p_km, marker(p_km_blank, "{#peribadahan.kebaktian_minggu}"))
after(p_km_blank, marker(p_km_blank, "{/peribadahan.kebaktian_minggu}"))

# Petugas Pelayan Pujian (Kebaktian Minggu rows: PNJ + Pemain Musik)
p_pp = body_p("Petugas Pelayan Pujian")
t_pp = next_el(p_pp)
p_pp_blank = next_el(t_pp)
c = cells(rows(t_pp)[1])
cell_text(c[0], "{#peribadahan.petugas_pujian.baris}{hari}, {tanggal}")
cell_text(c[1], "{waktu}")
cell_text(c[2], "{pnj}")
cell_text(c[3], "{pemusik}{/peribadahan.petugas_pujian.baris}")
before(p_pp, marker(p_pp_blank, "{#peribadahan.petugas_pujian.tampil}"))
after(p_pp_blank, marker(p_pp_blank, "{/peribadahan.petugas_pujian.tampil}"))

# SMKA: one heading + table per SMKA row
p_smka = body_p("Sekolah Minggu dan Kebaktian Anak")
t_smka = next_el(p_smka)
p_smka_blank = next_el(t_smka)
smka_rows = rows(t_smka)
head = paragraphs(cells(smka_rows[0])[1])
set_text(head[0], "{hari}, {tanggal}")
set_text(head[1], "{#waktu}Pkl. {waktu} WIB{/waktu}")
for tr, tag in zip(
    smka_rows[1:],
    [
        "{pf_batita}",
        "{pf_balita}",
        "{pf_kecil}",
        "{pf_tanggung}",
        "{pf_besar}",
        "{pf_tunas_remaja}",
        "{pelayan_liturgi}",
        "{pemusik}",
        "{bahan_alkitab}",
        "{tema}",
    ],
):
    cell_text(cells(tr)[1], tag)
before(p_smka, marker(p_smka_blank, "{#peribadahan.smka}"))
after(p_smka_blank, marker(p_smka_blank, "{/peribadahan.smka}"))

# KRT: grouped by date + time; the row loop spans the data row AND its Tema row.
p_krt = body_p("Kebaktian Rumah Tangga,")
t_krt = next_el(p_krt)
p_krt_blank = next_el(t_krt)
set_text(p_krt, "Kebaktian Rumah Tangga, {hari} {tanggal}" + WAKTU + " :")
krt_rows = rows(t_krt)
c = cells(krt_rows[1])
cell_text(c[0], "{#baris}{wilayah}")
cell_text(c[1], "{tempat}")
cell_text(c[2], "{pf}")
cell_text(c[3], "{liturgos}")
cell_text(c[4], "{dpa}")
cell_text(cells(krt_rows[2])[0], "Tema : {tema}{/baris}")
before(p_krt, marker(p_krt_blank, "{#peribadahan.krt}"))
after(p_krt_blank, marker(p_krt_blank, "{/peribadahan.krt}"))

# PA, Lansia, Perempuan, Pria, Pemuda Remaja: one heading + table per row.
for heading, key, name in [
    ("Pemahaman Alkitab,", "pemahaman_alkitab", "Pemahaman Alkitab"),
    ("Kebaktian Lansia,", "kebaktian_lansia", "Kebaktian Lansia"),
    ("Kebaktian Perempuan,", "kebaktian_perempuan", "Kebaktian Perempuan"),
    ("Kebaktian Pria,", "kebaktian_pria", "Kebaktian Pria"),
    ("Kebaktian Pemuda Remaja,", "kebaktian_pemuda_remaja", "Kebaktian Pemuda Remaja"),
]:
    p_h = body_p(heading)
    t_h = next_el(p_h)
    p_blank = next_el(t_h)
    assert ptext(p_blank) == "", heading
    set_text(p_h, name + ", {hari} {tanggal}" + WAKTU + " :")
    data, tema = rows(t_h)[1], rows(t_h)[2]
    c = cells(data)
    cell_text(c[0], "{tempat}")
    cell_text(c[1], "{pf}")
    cell_text(c[2], "{liturgos}")
    cell_text(c[3], "{dpa}")
    cell_text(cells(tema)[0], "Tema : {tema}")
    before(p_h, marker(p_blank, "{#peribadahan.%s}" % key))
    after(p_blank, marker(p_blank, "{/peribadahan.%s}" % key))

# Doa Pagi: heading once, one line per row.
p_dp = body_p("Doa Pagi")
p_dp_line = next_el(p_dp)
p_dp_blank = next_el(p_dp_line)
set_text(p_dp_line, "{hari}, {tanggal}" + WAKTU + "{#tempat} di {tempat}{/tempat}")
before(p_dp, marker(p_dp_blank, "{#peribadahan.doa_pagi.tampil}"))
before(p_dp_line, marker(p_dp_blank, "{#peribadahan.doa_pagi.baris}"))
after(p_dp_line, marker(p_dp_blank, "{/peribadahan.doa_pagi.baris}"))
after(p_dp_blank, marker(p_dp_blank, "{/peribadahan.doa_pagi.tampil}"))

# ---------------------------------------------------------------------------
# II. Bidang Litbang: one loop over the warta's own cards
# ---------------------------------------------------------------------------

p_lit_h = body_p("Katekisasi Dasar")
p_lit_body = next_el(p_lit_h)
p_lit_blank = next_el(p_lit_body)
assert ptext(p_lit_blank) == ""
el = p_lit_blank.getnext()
while not ptext(el).startswith("III. BIDANG"):
    nxt = el.getnext()
    remove(el)
    el = nxt
set_text(p_lit_h, "{nama}")  # the paragraph carries Word's own list numbering
set_text(p_lit_body, "{deskripsi}")
before(p_lit_h, marker(p_lit_blank, "{#litbang}"))
after(p_lit_blank, marker(p_lit_blank, "{/litbang}"))

# ---------------------------------------------------------------------------
# III. Bidang Sarana dan Dana
# ---------------------------------------------------------------------------

t_sd = body_table_containing("1. Kas Jemaat")
sd = rows(t_sd)


def kas_block(start, key):
    base = "sarana_dana." + key
    saldo_awal, _, pen, _, peng, total, akhir = sd[start + 2 : start + 9]
    c = cells(saldo_awal)
    cell_text(c[1], "SALDO AWAL pada tgl. {%s.saldo_awal_tanggal}" % base)
    cell_text(c[2], "{%s.saldo_awal}" % base)
    c = cells(pen)
    cell_text(c[0], "{#%s.penerimaan}{tanggal}" % base)
    cell_text(c[1], "{keterangan}")
    cell_text(c[2], "{jumlah}{/%s.penerimaan}" % base)
    c = cells(peng)
    cell_text(c[0], "{#%s.pengeluaran}{tanggal}" % base)
    cell_text(c[1], "{keterangan}")
    cell_text(c[3], "{jumlah}{/%s.pengeluaran}" % base)
    c = cells(total)
    cell_text(c[2], "{%s.total_penerimaan}" % base)
    cell_text(c[3], "{%s.total_pengeluaran}" % base)
    c = cells(akhir)
    cell_text(c[1], "SALDO AKHIR (Saldo Awal + Penerimaan - Pengeluaran) tgl. {%s.saldo_akhir_tanggal}" % base)
    cell_text(c[3], "{%s.saldo_akhir}" % base)


kas_block(0, "kas_jemaat")
kas_block(9, "kas_sarana_prasarana")

# Persembahan Bulanan: names only, two per row (left/right), date on the first row of each date.
c = cells(sd[21])
cell_text(c[0], "{#sarana_dana.persembahan_bulanan}{tanggal}")
cell_text(c[1], "{no_kiri}")
cell_text(c[2], "{nama_kiri}")
cell_text(c[3], "{no_kanan}")
cell_text(c[4], "{nama_kanan}{/sarana_dana.persembahan_bulanan}")

# ---------------------------------------------------------------------------
# IV. Kesaksian dan Keesaan
# ---------------------------------------------------------------------------

set_text(body_p("{#kesaksian_keesaan.cards}"), "{#kesaksian}")
set_text(body_p("{index}. {title}"), "{nomor}. {judul}")
set_text(body_p("{description}"), "{deskripsi}")
set_text(body_p("{/kesaksian_keesaan.cards}"), "{/kesaksian}")

# ---------------------------------------------------------------------------
# Bahan Bacaan dan Nyanyian (warta fields + warta_pujian)
# ---------------------------------------------------------------------------

set_text(body_p("PUKUL 08.00 WIB"), "{#bacaan.pukul}PUKUL {bacaan.pukul}{/bacaan.pukul}")
t_bb = body_table_containing("TATA KEBAKTIAN")
bb = rows(t_bb)
cell_text(cells(bb[0])[1], "{informasi.tanggal}")
cell_text(cells(bb[1])[0], "{informasi.judul}")
for tr, tag in zip(bb[2:6], ["tata_kebaktian", "nas_pembimbing", "pembacaan_alkitab", "pembacaan_mazmur"]):
    cell_text(cells(tr)[1], "{bacaan.%s}" % tag)
cell_text(cells(bb[7])[0], "{informasi.tema}")
c = cells(bb[9])
cell_text(c[0], "{#bacaan.pujian}{buku}")
cell_text(c[1], "{nomor}{/bacaan.pujian}")
for tr in bb[10:]:
    t_bb.remove(tr)

# ---------------------------------------------------------------------------
# Kehadiran (finance week), replacing the April 2025 figures
# ---------------------------------------------------------------------------

p_kh = body_p("KEHADIRAN")
t_kh = next_el(p_kh)
kh = rows(t_kh)
heading_row, detail_row = kh[0], kh[6]
c = cells(heading_row)
cell_text(c[0], "{#kehadiran.layanan}{judul}, {hari} {tanggal}" + WAKTU + " :")
cell_text(c[1], "{total}")
c = cells(detail_row)
for tc in c:
    drop_vmerge(tc)
cell_text(c[0], "{#baris}{label}")
cell_text(c[1], "{rincian}")
cell_text(c[2], "{/baris}")
# The outer loop closes in its own row, so the inner row loop never swallows it.
closing_row = copy.deepcopy(detail_row)
cell_text(cells(closing_row)[0], "")
cell_text(cells(closing_row)[1], "")
cell_text(cells(closing_row)[2], "{/kehadiran.layanan}")
for tr in kh[1:]:
    if tr is not detail_row:
        t_kh.remove(tr)
detail_row.addnext(closing_row)

blank = p_kh.getprevious()
assert ptext(blank) == ""
before(p_kh, marker(blank, "{#kehadiran.tampil}"))
closing = after(t_kh, marker(blank, "{/kehadiran.tampil}"))
# The body must still end with a paragraph once the markers are gone.
after(closing, clone_p(blank, ""))

# ---------------------------------------------------------------------------
# The old PGI statement (Pemilu 2024) at the end of the document goes.
# ---------------------------------------------------------------------------

el = body_p("P MPH PGI")
while el is not None and el.tag == q("w:p"):
    nxt = el.getnext()
    assert not has_drawing(el)
    remove(el)
    el = nxt
assert el is not None and el.tag == q("w:sectPr")

tree.write(path, xml_declaration=True, encoding="UTF-8", standalone=True)
print("ok")

# The two static hyperlinks (old email/website) were unwrapped above; drop
# their now-unused relationships so the template carries no hyperlink at all.
rels_path = sys.argv[1] + "/word/_rels/document.xml.rels"
rels = etree.parse(rels_path)
doc_xml = open(path, encoding="utf-8").read()
for rel in list(rels.getroot()):
    if rel.get("Type", "").endswith("/hyperlink") and ('r:id="%s"' % rel.get("Id")) not in doc_xml:
        rels.getroot().remove(rel)
rels.write(rels_path, xml_declaration=True, encoding="UTF-8", standalone=True)
print("rels ok")
