
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity_logs": {
                  Row: {
                    "activity": string,"created_at": string,"id": string,"ip_address": string | null,"module": string,"user_email": string | null,"user_id": string | null
                  }
                  Insert: {
                    "activity": string,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"module": string,"user_email"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "activity"?: string,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"module"?: string,"user_email"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"jemaat": {
                  Row: {
                    "alamat": string | null,"created_at": string,"hubungan_keluarga": string | null,"id": string,"jenis_kelamin": string | null,"keluarga_id": string | null,"nama": string,"no_hp": string | null,"nomor_anggota": string | null,"pekerjaan": string | null,"status_keanggotaan": string | null,"sudah_baptis": boolean,"sudah_sidi": boolean,"tanggal_lahir": string | null,"tanggal_masuk": string | null,"wilayah_id": string | null
                  }
                  Insert: {
                    "alamat"?: string | null,"created_at"?: string,"hubungan_keluarga"?: string | null,"id"?: string,"jenis_kelamin"?: string | null,"keluarga_id"?: string | null,"nama": string,"no_hp"?: string | null,"nomor_anggota"?: string | null,"pekerjaan"?: string | null,"status_keanggotaan"?: string | null,"sudah_baptis"?: boolean,"sudah_sidi"?: boolean,"tanggal_lahir"?: string | null,"tanggal_masuk"?: string | null,"wilayah_id"?: string | null
                  }
                  Update: {
                    "alamat"?: string | null,"created_at"?: string,"hubungan_keluarga"?: string | null,"id"?: string,"jenis_kelamin"?: string | null,"keluarga_id"?: string | null,"nama"?: string,"no_hp"?: string | null,"nomor_anggota"?: string | null,"pekerjaan"?: string | null,"status_keanggotaan"?: string | null,"sudah_baptis"?: boolean,"sudah_sidi"?: boolean,"tanggal_lahir"?: string | null,"tanggal_masuk"?: string | null,"wilayah_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "jemaat_keluarga_id_fkey"
      columns: ["keluarga_id"]
isOneToOne: false
      referencedRelation: "keluarga"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jemaat_wilayah_id_fkey"
      columns: ["wilayah_id"]
isOneToOne: false
      referencedRelation: "wilayah"
      referencedColumns: ["id"]
    }
                  ]
                },"jemaat_catatan_pastoral": {
                  Row: {
                    "created_at": string,"id": string,"isi": string,"jemaat_id": string,"jenis": string,"penulis_id": string | null,"penulis_nama": string | null,"tanggal": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"isi": string,"jemaat_id": string,"jenis": string,"penulis_id"?: string | null,"penulis_nama"?: string | null,"tanggal"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"isi"?: string,"jemaat_id"?: string,"jenis"?: string,"penulis_id"?: string | null,"penulis_nama"?: string | null,"tanggal"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jemaat_catatan_pastoral_jemaat_id_fkey"
      columns: ["jemaat_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    }
                  ]
                },"jemaat_labels": {
                  Row: {
                    "jemaat_id": string,"label_id": string
                  }
                  Insert: {
                    "jemaat_id": string,"label_id": string
                  }
                  Update: {
                    "jemaat_id"?: string,"label_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jemaat_labels_jemaat_id_fkey"
      columns: ["jemaat_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jemaat_labels_label_id_fkey"
      columns: ["label_id"]
isOneToOne: false
      referencedRelation: "label_jemaat"
      referencedColumns: ["id"]
    }
                  ]
                },"kegiatan": {
                  Row: {
                    "created_at": string,"deskripsi": string | null,"foto_alt": string | null,"foto_path": string | null,"id": string,"judul": string,"status": string,"tanggal": string,"tempat": string | null,"updated_at": string,"waktu": string | null
                  }
                  Insert: {
                    "created_at"?: string,"deskripsi"?: string | null,"foto_alt"?: string | null,"foto_path"?: string | null,"id"?: string,"judul": string,"status"?: string,"tanggal": string,"tempat"?: string | null,"updated_at"?: string,"waktu"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"deskripsi"?: string | null,"foto_alt"?: string | null,"foto_path"?: string | null,"id"?: string,"judul"?: string,"status"?: string,"tanggal"?: string,"tempat"?: string | null,"updated_at"?: string,"waktu"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"keluarga": {
                  Row: {
                    "created_at": string,"id": string,"nama": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"nama": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nama"?: string
                  }
                  Relationships: [
                    
                  ]
                },"label_jemaat": {
                  Row: {
                    "created_at": string,"id": string,"nama": string,"sort_order": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"nama": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nama"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"litbang_categories": {
                  Row: {
                    "active": boolean,"deskripsi": string | null,"id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"deskripsi"?: string | null,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"deskripsi"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"majelis": {
                  Row: {
                    "aktif": boolean,"created_at": string,"foto_alt": string | null,"foto_path": string | null,"id": string,"jabatan": string,"nama": string,"sort_order": number
                  }
                  Insert: {
                    "aktif"?: boolean,"created_at"?: string,"foto_alt"?: string | null,"foto_path"?: string | null,"id"?: string,"jabatan": string,"nama": string,"sort_order"?: number
                  }
                  Update: {
                    "aktif"?: boolean,"created_at"?: string,"foto_alt"?: string | null,"foto_path"?: string | null,"id"?: string,"jabatan"?: string,"nama"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"pelayanan": {
                  Row: {
                    "aktif": boolean,"created_at": string,"deskripsi": string | null,"icon": string,"id": string,"jadwal": string | null,"nama": string,"sort_order": number
                  }
                  Insert: {
                    "aktif"?: boolean,"created_at"?: string,"deskripsi"?: string | null,"icon": string,"id"?: string,"jadwal"?: string | null,"nama": string,"sort_order"?: number
                  }
                  Update: {
                    "aktif"?: boolean,"created_at"?: string,"deskripsi"?: string | null,"icon"?: string,"id"?: string,"jadwal"?: string | null,"nama"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"pendeta": {
                  Row: {
                    "created_at": string,"foto_alt": string | null,"foto_path": string | null,"id": string,"keterangan": string | null,"nama": string,"peran": string,"tahun_mulai": number,"tahun_selesai": number | null,"tampil": boolean
                  }
                  Insert: {
                    "created_at"?: string,"foto_alt"?: string | null,"foto_path"?: string | null,"id"?: string,"keterangan"?: string | null,"nama": string,"peran": string,"tahun_mulai": number,"tahun_selesai"?: number | null,"tampil"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"foto_alt"?: string | null,"foto_path"?: string | null,"id"?: string,"keterangan"?: string | null,"nama"?: string,"peran"?: string,"tahun_mulai"?: number,"tahun_selesai"?: number | null,"tampil"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"peribadahan_categories": {
                  Row: {
                    "id": string,"key": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "id"?: string,"key": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"key"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"peribadahan_items": {
                  Row: {
                    "bahan_alkitab": string | null,"catatan": string | null,"category_id": string,"created_at": string,"dpa": string | null,"id": string,"jam": string | null,"kehadiran_anak": number | null,"kehadiran_laki_laki": number | null,"kehadiran_perempuan": number | null,"liturgos_id": string | null,"pelayan_firman_id": string | null,"pemusik_id": string | null,"sort_order": number,"tanggal": string,"tema": string | null,"tempat_id": string | null,"updated_at": string,"wilayah_id": string | null
                  }
                  Insert: {
                    "bahan_alkitab"?: string | null,"catatan"?: string | null,"category_id": string,"created_at"?: string,"dpa"?: string | null,"id"?: string,"jam"?: string | null,"kehadiran_anak"?: number | null,"kehadiran_laki_laki"?: number | null,"kehadiran_perempuan"?: number | null,"liturgos_id"?: string | null,"pelayan_firman_id"?: string | null,"pemusik_id"?: string | null,"sort_order"?: number,"tanggal": string,"tema"?: string | null,"tempat_id"?: string | null,"updated_at"?: string,"wilayah_id"?: string | null
                  }
                  Update: {
                    "bahan_alkitab"?: string | null,"catatan"?: string | null,"category_id"?: string,"created_at"?: string,"dpa"?: string | null,"id"?: string,"jam"?: string | null,"kehadiran_anak"?: number | null,"kehadiran_laki_laki"?: number | null,"kehadiran_perempuan"?: number | null,"liturgos_id"?: string | null,"pelayan_firman_id"?: string | null,"pemusik_id"?: string | null,"sort_order"?: number,"tanggal"?: string,"tema"?: string | null,"tempat_id"?: string | null,"updated_at"?: string,"wilayah_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "peribadahan_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "peribadahan_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "peribadahan_items_liturgos_id_fkey"
      columns: ["liturgos_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "peribadahan_items_pelayan_firman_id_fkey"
      columns: ["pelayan_firman_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "peribadahan_items_pemusik_id_fkey"
      columns: ["pemusik_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "peribadahan_items_tempat_id_fkey"
      columns: ["tempat_id"]
isOneToOne: false
      referencedRelation: "tempat"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "peribadahan_items_wilayah_id_fkey"
      columns: ["wilayah_id"]
isOneToOne: false
      referencedRelation: "wilayah"
      referencedColumns: ["id"]
    }
                  ]
                },"peribadahan_smka_kelompok": {
                  Row: {
                    "id": string,"item_id": string,"kelompok": string,"laki_laki": number | null,"perempuan": number | null,"pf_id": string | null
                  }
                  Insert: {
                    "id"?: string,"item_id": string,"kelompok": string,"laki_laki"?: number | null,"perempuan"?: number | null,"pf_id"?: string | null
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"kelompok"?: string,"laki_laki"?: number | null,"perempuan"?: number | null,"pf_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "peribadahan_smka_kelompok_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "peribadahan_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "peribadahan_smka_kelompok_pf_id_fkey"
      columns: ["pf_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "action": string,"description": string | null,"id": string,"resource": string
                  }
                  Insert: {
                    "action": string,"description"?: string | null,"id"?: string,"resource": string
                  }
                  Update: {
                    "action"?: string,"description"?: string | null,"id"?: string,"resource"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profil_gereja": {
                  Row: {
                    "alamat": string | null,"email": string | null,"facebook_url": string | null,"hero_foto_alt": string | null,"hero_foto_path": string | null,"hero_judul": string | null,"hero_subjudul": string | null,"id": number,"instagram_url": string | null,"jam_sekretariat": string | null,"maps_url": string | null,"misi": (string)[],"sambutan_pendeta_id": string | null,"sambutan_teks": string | null,"sejarah": string | null,"sejarah_foto_alt": string | null,"sejarah_foto_path": string | null,"telepon": string | null,"updated_at": string,"visi": string | null,"youtube_url": string | null
                  }
                  Insert: {
                    "alamat"?: string | null,"email"?: string | null,"facebook_url"?: string | null,"hero_foto_alt"?: string | null,"hero_foto_path"?: string | null,"hero_judul"?: string | null,"hero_subjudul"?: string | null,"id"?: number,"instagram_url"?: string | null,"jam_sekretariat"?: string | null,"maps_url"?: string | null,"misi"?: (string)[],"sambutan_pendeta_id"?: string | null,"sambutan_teks"?: string | null,"sejarah"?: string | null,"sejarah_foto_alt"?: string | null,"sejarah_foto_path"?: string | null,"telepon"?: string | null,"updated_at"?: string,"visi"?: string | null,"youtube_url"?: string | null
                  }
                  Update: {
                    "alamat"?: string | null,"email"?: string | null,"facebook_url"?: string | null,"hero_foto_alt"?: string | null,"hero_foto_path"?: string | null,"hero_judul"?: string | null,"hero_subjudul"?: string | null,"id"?: number,"instagram_url"?: string | null,"jam_sekretariat"?: string | null,"maps_url"?: string | null,"misi"?: (string)[],"sambutan_pendeta_id"?: string | null,"sambutan_teks"?: string | null,"sejarah"?: string | null,"sejarah_foto_alt"?: string | null,"sejarah_foto_path"?: string | null,"telepon"?: string | null,"updated_at"?: string,"visi"?: string | null,"youtube_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profil_gereja_sambutan_pendeta_id_fkey"
      columns: ["sambutan_pendeta_id"]
isOneToOne: false
      referencedRelation: "pendeta"
      referencedColumns: ["id"]
    }
                  ]
                },"profil_gereja_linimasa": {
                  Row: {
                    "created_at": string,"id": string,"sort_order": number,"tahun": string,"teks": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"sort_order"?: number,"tahun": string,"teks": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"sort_order"?: number,"tahun"?: string,"teks"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profil_gereja_rekening": {
                  Row: {
                    "atas_nama": string | null,"id": number,"nama_bank": string | null,"nomor_rekening": string | null,"qris_foto_alt": string | null,"qris_foto_path": string | null,"updated_at": string
                  }
                  Insert: {
                    "atas_nama"?: string | null,"id"?: number,"nama_bank"?: string | null,"nomor_rekening"?: string | null,"qris_foto_alt"?: string | null,"qris_foto_path"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "atas_nama"?: string | null,"id"?: number,"nama_bank"?: string | null,"nomor_rekening"?: string | null,"qris_foto_alt"?: string | null,"qris_foto_path"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string | null,"full_name": string | null,"id": string,"jemaat_id": string | null
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"jemaat_id"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"jemaat_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_jemaat_id_fkey"
      columns: ["jemaat_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_id": string,"role_id": string
                  }
                  Insert: {
                    "permission_id": string,"role_id": string
                  }
                  Update: {
                    "permission_id"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_id_fkey"
      columns: ["permission_id"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"name": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sarana_dana_items": {
                  Row: {
                    "id": string,"keterangan": string | null,"key": string,"name": string,"saldo_awal": number,"updated_at": string
                  }
                  Insert: {
                    "id"?: string,"keterangan"?: string | null,"key": string,"name": string,"saldo_awal"?: number,"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"keterangan"?: string | null,"key"?: string,"name"?: string,"saldo_awal"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sarana_dana_transactions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"item_id": string,"jemaat_id": string | null,"jumlah": number,"keterangan": string | null,"tanggal": string,"tipe": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id": string,"jemaat_id"?: string | null,"jumlah": number,"keterangan"?: string | null,"tanggal": string,"tipe": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"jemaat_id"?: string | null,"jumlah"?: number,"keterangan"?: string | null,"tanggal"?: string,"tipe"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sarana_dana_transactions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "sarana_dana_balances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sarana_dana_transactions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "sarana_dana_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sarana_dana_transactions_jemaat_id_fkey"
      columns: ["jemaat_id"]
isOneToOne: false
      referencedRelation: "jemaat"
      referencedColumns: ["id"]
    }
                  ]
                },"tempat": {
                  Row: {
                    "created_at": string,"id": string,"keterangan": string | null,"nama": string,"sort_order": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"keterangan"?: string | null,"nama": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"keterangan"?: string | null,"nama"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "role_id": string,"user_id": string
                  }
                  Insert: {
                    "role_id": string,"user_id": string
                  }
                  Update: {
                    "role_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"warta": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"judul_kebaktian": string,"published_at": string | null,"renungan_isi": string | null,"renungan_judul": string | null,"renungan_kitab": string | null,"renungan_sumber": string | null,"slug": string,"status": string,"tanggal_kebaktian": string,"tema_kebaktian": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"judul_kebaktian": string,"published_at"?: string | null,"renungan_isi"?: string | null,"renungan_judul"?: string | null,"renungan_kitab"?: string | null,"renungan_sumber"?: string | null,"slug": string,"status"?: string,"tanggal_kebaktian": string,"tema_kebaktian"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"judul_kebaktian"?: string,"published_at"?: string | null,"renungan_isi"?: string | null,"renungan_judul"?: string | null,"renungan_kitab"?: string | null,"renungan_sumber"?: string | null,"slug"?: string,"status"?: string,"tanggal_kebaktian"?: string,"tema_kebaktian"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"warta_kesaksian_items": {
                  Row: {
                    "deskripsi": string | null,"id": string,"judul": string,"sort_order": number,"warta_id": string
                  }
                  Insert: {
                    "deskripsi"?: string | null,"id"?: string,"judul": string,"sort_order"?: number,"warta_id": string
                  }
                  Update: {
                    "deskripsi"?: string | null,"id"?: string,"judul"?: string,"sort_order"?: number,"warta_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "warta_kesaksian_items_warta_id_fkey"
      columns: ["warta_id"]
isOneToOne: false
      referencedRelation: "warta"
      referencedColumns: ["id"]
    }
                  ]
                },"warta_litbang_items": {
                  Row: {
                    "deskripsi": string | null,"id": string,"litbang_category_id": string | null,"name": string,"sort_order": number,"warta_id": string
                  }
                  Insert: {
                    "deskripsi"?: string | null,"id"?: string,"litbang_category_id"?: string | null,"name": string,"sort_order"?: number,"warta_id": string
                  }
                  Update: {
                    "deskripsi"?: string | null,"id"?: string,"litbang_category_id"?: string | null,"name"?: string,"sort_order"?: number,"warta_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "warta_litbang_items_litbang_category_id_fkey"
      columns: ["litbang_category_id"]
isOneToOne: false
      referencedRelation: "litbang_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "warta_litbang_items_warta_id_fkey"
      columns: ["warta_id"]
isOneToOne: false
      referencedRelation: "warta"
      referencedColumns: ["id"]
    }
                  ]
                },"wilayah": {
                  Row: {
                    "created_at": string,"id": string,"nama": string,"sort_order": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"nama": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nama"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "sarana_dana_balances": {
                  Row: {
                    "id": string | null,"keterangan": string | null,"key": string | null,"name": string | null,"saldo": number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "create_warta":
{ Args: { "p_judul_kebaktian": string,"p_renungan_isi"?: string,"p_renungan_judul"?: string,"p_renungan_kitab"?: string,"p_renungan_sumber"?: string,"p_slug": string,"p_tanggal_kebaktian": string,"p_tema_kebaktian"?: string }; Returns: string
                           },
"delete_keluarga":
{ Args: { "p_id": string }; Returns: undefined
                           },
"get_my_access":
{ Args: Record<PropertyKey, never>; Returns: {
              "action": string,"resource": string,"role_id": string,"role_name": string
            }[]
                           },
"has_permission":
{ Args: { "p_action": string,"p_resource": string,"p_user_id": string }; Returns: boolean
                           },
"link_user_jemaat":
{ Args: { "p_jemaat_id"?: string,"p_user_id": string }; Returns: undefined
                           },
"public_jadwal_mendatang":
{ Args: Record<PropertyKey, never>; Returns: {
              "bahan_alkitab": string,"category_key": string,"category_name": string,"dpa": string,"id": string,"jam": string,"liturgos_nama": string,"pelayan_firman_nama": string,"pemusik_nama": string,"sort_order": number,"tanggal": string,"tema": string,"tempat_nama": string,"wilayah_nama": string
            }[]
                           },
"public_jadwal_pekan_ini":
{ Args: Record<PropertyKey, never>; Returns: {
              "bahan_alkitab": string,"catatan": string,"category_key": string,"category_name": string,"dpa": string,"id": string,"jam": string,"kehadiran_anak": number,"kehadiran_laki_laki": number,"kehadiran_perempuan": number,"liturgos_nama": string,"pelayan_firman_nama": string,"pemusik_nama": string,"smka_kelompok": Json,"sort_order": number,"tanggal": string,"tema": string,"tempat_nama": string,"wilayah_nama": string
            }[]
                           },
"public_pendeta":
{ Args: Record<PropertyKey, never>; Returns: {
              "foto_alt": string,"foto_path": string,"id": string,"keterangan": string,"nama": string,"peran": string,"tahun_mulai": number,"tahun_selesai": number
            }[]
                           },
"public_profil_gereja":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"public_warta_finance":
{ Args: { "p_slug": string }; Returns: {
              "key": string,"name": string,"pemasukan": number,"pengeluaran": number,"saldo_akhir": number,"saldo_awal": number
            }[]
                           },
"public_warta_schedule":
{ Args: { "p_slug": string }; Returns: {
              "bahan_alkitab": string,"catatan": string,"category_key": string,"category_name": string,"dpa": string,"id": string,"jam": string,"kehadiran_anak": number,"kehadiran_laki_laki": number,"kehadiran_perempuan": number,"liturgos_nama": string,"pelayan_firman_nama": string,"pemusik_nama": string,"smka_kelompok": Json,"sort_order": number,"tanggal": string,"tema": string,"tempat_nama": string,"wilayah_nama": string
            }[]
                           },
"reorder_litbang_categories":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"reorder_majelis":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"reorder_pelayanan":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"reorder_profil_linimasa":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"replace_jemaat_labels":
{ Args: { "p_jemaat_id": string,"p_label_ids": (string)[] }; Returns: undefined
                           },
"sarana_dana_report":
{ Args: { "p_end": string,"p_start": string }; Returns: {
              "key": string,"name": string,"pemasukan": number,"pengeluaran": number,"saldo_akhir": number,"saldo_awal": number
            }[]
                           },
"save_jemaat":
{ Args: { "p_alamat"?: string,"p_hubungan_keluarga"?: string,"p_id"?: string,"p_jenis_kelamin"?: string,"p_keluarga_nama"?: string,"p_label_ids"?: (string)[],"p_nama": string,"p_no_hp"?: string,"p_nomor_anggota"?: string,"p_pekerjaan"?: string,"p_status_keanggotaan"?: string,"p_tanggal_lahir"?: string,"p_tanggal_masuk"?: string,"p_wilayah_id"?: string }; Returns: string
                           },
"search_activity_logs":
{ Args: { "p_search"?: string }; Returns: {
              "activity": string,
"created_at": string,
"id": string,
"ip_address": string | null,
"module": string,
"user_email": string | null,
"user_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "activity_logs"
        isOneToOne: false
        isSetofReturn: true
      } },
"search_peribadahan_item_ids":
{ Args: { "p_search": string }; Returns: {
              "id": string
            }[]
                           },
"set_jemaat_keluarga":
{ Args: { "p_hubungan_keluarga"?: string,"p_jemaat_id": string,"p_keluarga_id"?: string }; Returns: undefined
                           },
"set_role_permissions":
{ Args: { "p_permission_ids": (string)[],"p_role_id": string }; Returns: undefined
                           },
"set_role_ui_permissions":
{ Args: { "p_permission_ids": (string)[],"p_role_id": string }; Returns: undefined
                           },
"set_user_access":
{ Args: { "p_jemaat_id"?: string,"p_role_id"?: string,"p_user_id": string }; Returns: undefined
                           },
"set_user_role":
{ Args: { "p_role_id"?: string,"p_user_id": string }; Returns: undefined
                           },
"situs_referenced_photo_paths":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"update_peribadahan_item":
{ Args: { "p_bahan_alkitab"?: string,"p_catatan"?: string,"p_dpa"?: string,"p_id": string,"p_jam"?: string,"p_kehadiran_anak"?: number,"p_kehadiran_laki_laki"?: number,"p_kehadiran_perempuan"?: number,"p_liturgos_id"?: string,"p_pelayan_firman_id"?: string,"p_pemusik_id"?: string,"p_smka_kelompok"?: Json,"p_tema"?: string,"p_tempat_id"?: string,"p_wilayah_id"?: string }; Returns: undefined
                           },
"update_profil_gereja_rekening":
{ Args: { "p_atas_nama"?: string,"p_nama_bank"?: string,"p_nomor_rekening"?: string,"p_qris_foto_alt"?: string,"p_qris_foto_path"?: string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

