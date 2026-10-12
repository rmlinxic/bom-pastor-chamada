export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          acao: string
          catequista_id: string | null
          created_at: string | null
          detalhes: Json | null
          id: string
        }
        Insert: {
          acao: string
          catequista_id?: string | null
          created_at?: string | null
          detalhes?: Json | null
          id?: string
        }
        Update: {
          acao?: string
          catequista_id?: string | null
          created_at?: string | null
          detalhes?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_catequista_id_fkey"
            columns: ["catequista_id"]
            isOneToOne: false
            referencedRelation: "catequistas"
            referencedColumns: ["id"]
          },
        ]
      }
      anos_catequeticos: {
        Row: {
          ano: number
          ativo: boolean | null
          encerrado_em: string | null
          id: string
          iniciado_em: string | null
          paroquia_id: string | null
        }
        Insert: {
          ano: number
          ativo?: boolean | null
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string | null
          paroquia_id?: string | null
        }
        Update: {
          ano?: number
          ativo?: boolean | null
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string | null
          paroquia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anos_catequeticos_paroquia_id_fkey"
            columns: ["paroquia_id"]
            isOneToOne: false
            referencedRelation: "paroquias"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          ano_catequetico: number | null
          created_at: string
          date: string
          id: string
          justification_reason: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          ano_catequetico?: number | null
          created_at?: string
          date: string
          id?: string
          justification_reason?: string | null
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          ano_catequetico?: number | null
          created_at?: string
          date?: string
          id?: string
          justification_reason?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      calendario_eventos: {
        Row: {
          created_at: string | null
          data: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          data: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          data?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      catequistas: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          etapa: string | null
          id: string
          is_coordenador: boolean
          monitorar_missas: boolean
          name: string
          paroquia_id: string | null
          password_hash: string
          role: string
          username: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          etapa?: string | null
          id?: string
          is_coordenador?: boolean
          monitorar_missas?: boolean
          name: string
          paroquia_id?: string | null
          password_hash: string
          role?: string
          username: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          etapa?: string | null
          id?: string
          is_coordenador?: boolean
          monitorar_missas?: boolean
          name?: string
          paroquia_id?: string | null
          password_hash?: string
          role?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "catequistas_paroquia_id_fkey"
            columns: ["paroquia_id"]
            isOneToOne: false
            referencedRelation: "paroquias"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_catequizando: {
        Row: {
          batismo: boolean
          crisma_padrinho: boolean
          endereco: boolean
          id: string
          primeira_comunhao: boolean
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batismo?: boolean
          crisma_padrinho?: boolean
          endereco?: boolean
          id?: string
          primeira_comunhao?: boolean
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batismo?: boolean
          crisma_padrinho?: boolean
          endereco?: boolean
          id?: string
          primeira_comunhao?: boolean
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_catequizando_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_attendance: {
        Row: {
          ano_catequetico: number | null
          created_at: string | null
          date: string
          id: string
          student_id: string | null
        }
        Insert: {
          ano_catequetico?: number | null
          created_at?: string | null
          date: string
          id?: string
          student_id?: string | null
        }
        Update: {
          ano_catequetico?: number | null
          created_at?: string | null
          date?: string
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mass_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      paroquias: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          catequista_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
          used: boolean
        }
        Insert: {
          catequista_id: string
          created_at?: string
          expires_at: string
          id?: string
          token: string
          used?: boolean
        }
        Update: {
          catequista_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_catequista_id_fkey"
            columns: ["catequista_id"]
            isOneToOne: false
            referencedRelation: "catequistas"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_justifications: {
        Row: {
          created_at: string
          date: string
          id: string
          paroquia_id: string | null
          paroquia_nome: string | null
          reason: string
          student_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          paroquia_id?: string | null
          paroquia_nome?: string | null
          reason: string
          student_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          paroquia_id?: string | null
          paroquia_nome?: string | null
          reason?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_justifications_paroquia_id_fkey"
            columns: ["paroquia_id"]
            isOneToOne: false
            referencedRelation: "paroquias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_justifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      promocoes_pendentes: {
        Row: {
          ano_catequetico: number
          created_at: string | null
          decidido_em: string | null
          decidido_por: string | null
          decisao: string | null
          destino_catequista_id: string | null
          destino_class_name: string | null
          faltas_nao_justificadas: number
          id: string
          meses_sem_missa: number
          paroquia_id: string | null
          score_faltas: number
          student_id: string | null
        }
        Insert: {
          ano_catequetico: number
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string | null
          destino_catequista_id?: string | null
          destino_class_name?: string | null
          faltas_nao_justificadas?: number
          id?: string
          meses_sem_missa?: number
          paroquia_id?: string | null
          score_faltas?: number
          student_id?: string | null
        }
        Update: {
          ano_catequetico?: number
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string | null
          destino_catequista_id?: string | null
          destino_class_name?: string | null
          faltas_nao_justificadas?: number
          id?: string
          meses_sem_missa?: number
          paroquia_id?: string | null
          score_faltas?: number
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promocoes_pendentes_destino_catequista_id_fkey"
            columns: ["destino_catequista_id"]
            isOneToOne: false
            referencedRelation: "catequistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocoes_pendentes_paroquia_id_fkey"
            columns: ["paroquia_id"]
            isOneToOne: false
            referencedRelation: "paroquias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocoes_pendentes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      public_justification_attempts: {
        Row: {
          attempts: number
          fingerprint: string
          hour_bucket: string
        }
        Insert: {
          attempts?: number
          fingerprint: string
          hour_bucket: string
        }
        Update: {
          attempts?: number
          fingerprint?: string
          hour_bucket?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          active: boolean
          ano_catequetico: number | null
          catequista_id: string | null
          class_name: string
          created_at: string
          id: string
          name: string
          parent_name: string
          paroquia_id: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          ano_catequetico?: number | null
          catequista_id?: string | null
          class_name: string
          created_at?: string
          id?: string
          name: string
          parent_name: string
          paroquia_id?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          ano_catequetico?: number | null
          catequista_id?: string | null
          class_name?: string
          created_at?: string
          id?: string
          name?: string
          parent_name?: string
          paroquia_id?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_catequista_id_fkey"
            columns: ["catequista_id"]
            isOneToOne: false
            referencedRelation: "catequistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_paroquia_id_fkey"
            columns: ["paroquia_id"]
            isOneToOne: false
            referencedRelation: "paroquias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_logins_suspeitos: {
        Row: {
          dia: string | null
          tentativas: number | null
          username: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_student: { Args: { p_student: string }; Returns: boolean }
      can_access_student_values: {
        Args: { p_class: string; p_parish: string; p_teacher: string }
        Returns: boolean
      }
      can_manage_parish: { Args: { p_parish: string }; Returns: boolean }
      can_read_catequista: { Args: { p_teacher: string }; Returns: boolean }
      can_view_parish: { Args: { p_parish: string }; Returns: boolean }
      cleanup_expired_tokens: { Args: never; Returns: undefined }
      current_catequista_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_coordinator: { Args: never; Returns: boolean }
      log_login_attempt: {
        Args: { p_ip?: string; p_success: boolean; p_username: string }
        Returns: undefined
      }
      reset_password_by_email: {
        Args: { p_email: string; p_new_password_hash: string }
        Returns: Json
      }
      student_belongs_to_parish: {
        Args: { p_parish: string; p_student: string }
        Returns: boolean
      }
      submit_public_justification: {
        Args: {
          date: string
          guardian_contact: string
          paroquia_id: string
          reason: string
          student_name: string
        }
        Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
