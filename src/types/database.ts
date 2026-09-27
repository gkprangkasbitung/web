
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
            "get_my_access":
{ Args: Record<PropertyKey, never>; Returns: {
              "action": string,"resource": string,"role_id": string,"role_name": string
            }[]
                           },
"has_permission":
{ Args: { "p_action": string,"p_resource": string,"p_user_id": string }; Returns: boolean
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

