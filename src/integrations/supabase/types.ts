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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      // --- Almoxá Agenda ---
      providers: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          display_name: string;
          headline: string | null;
          contact_email: string | null;
          phone: string | null;
          timezone: string;
          calendar_token: string;
          slot_interval_minutes: number;
          min_notice_minutes: number;
          max_days_ahead: number;
          buffer_minutes: number;
          reminder_hours: number;
          accepting: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          display_name: string;
          headline?: string | null;
          contact_email?: string | null;
          phone?: string | null;
          timezone?: string;
          calendar_token?: string;
          slot_interval_minutes?: number;
          min_notice_minutes?: number;
          max_days_ahead?: number;
          buffer_minutes?: number;
          reminder_hours?: number;
          accepting?: boolean;
          created_at?: string;
        };
        Update: {
          slug?: string;
          display_name?: string;
          headline?: string | null;
          contact_email?: string | null;
          phone?: string | null;
          timezone?: string;
          calendar_token?: string;
          slot_interval_minutes?: number;
          min_notice_minutes?: number;
          max_days_ahead?: number;
          buffer_minutes?: number;
          reminder_hours?: number;
          accepting?: boolean;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          provider_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price_cents: number | null;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          name: string;
          description?: string | null;
          duration_minutes: number;
          price_cents?: number | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price_cents?: number | null;
          active?: boolean;
          sort_order?: number;
        };
        // O supabase-js resolve `select("… , providers ( … )")` a partir daqui.
        // Sem estas entradas, todo join volta como SelectQueryError.
        Relationships: [
          {
            foreignKeyName: "services_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_rules: {
        Row: {
          id: string;
          provider_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
        };
        Update: {
          weekday?: number;
          starts_at?: string;
          ends_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_rules_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_blocks: {
        Row: {
          id: string;
          provider_id: string;
          starts_at: string;
          ends_at: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          starts_at: string;
          ends_at: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          starts_at?: string;
          ends_at?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "availability_blocks_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          provider_id: string;
          service_id: string;
          client_name: string;
          client_email: string;
          client_phone: string | null;
          notes: string | null;
          starts_at: string;
          ends_at: string;
          status: AppointmentStatus;
          manage_token: string;
          confirmation_sent_at: string | null;
          reminder_sent_at: string | null;
          cancelled_at: string | null;
          cancelled_by: CancelledBy | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          service_id: string;
          client_name: string;
          client_email: string;
          client_phone?: string | null;
          notes?: string | null;
          starts_at: string;
          ends_at: string;
          status?: AppointmentStatus;
          manage_token?: string;
          confirmation_sent_at?: string | null;
          reminder_sent_at?: string | null;
        };
        Update: {
          status?: AppointmentStatus;
          notes?: string | null;
          confirmation_sent_at?: string | null;
          reminder_sent_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: CancelledBy | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_quota: {
        Row: { ip: string; janela: string; usos: number };
        Insert: { ip: string; janela: string; usos?: number };
        Update: { usos?: number };
        Relationships: [];
      };
      movements: {
        Row: {
          commission_rate: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          product_id: string
          production_batch_id: string | null
          quantity: number
          reverses_id: string | null
          reversed_at: string | null
          sold_by: string | null
          source: string
          triggered_by_movement_id: string | null
          unit_cost: number
          unit_price: number
          user_id: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          product_id: string
          production_batch_id?: string | null
          quantity: number
          reverses_id?: string | null
          reversed_at?: string | null
          sold_by?: string | null
          source?: string
          triggered_by_movement_id?: string | null
          unit_cost?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          product_id?: string
          production_batch_id?: string | null
          quantity?: number
          reverses_id?: string | null
          reversed_at?: string | null
          sold_by?: string | null
          source?: string
          triggered_by_movement_id?: string | null
          unit_cost?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: true
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_triggered_by_movement_id_fkey"
            columns: ["triggered_by_movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          is_ingredient: boolean
          name: string
          notes: string | null
          purchase_price: number
          quantity: number
          sale_price: number
          sku: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ingredient?: boolean
          name: string
          notes?: string | null
          purchase_price?: number
          quantity?: number
          sale_price?: number
          sku: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ingredient?: boolean
          name?: string
          notes?: string | null
          purchase_price?: number
          quantity?: number
          sale_price?: number
          sku?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
          unit: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          quantity: number
          unit?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          commission_rate: number
          role: Database["public"]["Enums"]["app_role"]
          store_owner_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          commission_rate?: number
          role?: Database["public"]["Enums"]["app_role"]
          store_owner_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          commission_rate?: number
          role?: Database["public"]["Enums"]["app_role"]
          store_owner_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      // --- Almoxá Agenda ---
      consume_booking_quota: {
        Args: { _ip: string; _teto?: number };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_onisciente: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      current_store_owner: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      store_products: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          sku: string
          quantity: number
          sale_price: number
        }[]
      }
      store_members: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string
        }[]
      }
      operating_store: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      enter_store: {
        Args: { _store_owner_id: string }
        Returns: undefined
      }
      leave_store: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      current_context: {
        Args: Record<PropertyKey, never>
        Returns: {
          store_owner_id: string | null
          store_email: string | null
          entered: boolean
        }[]
      }
      store_team: {
        Args: { _since?: string | null }
        Returns: {
          id: string
          email: string
          commission_rate: number
          sold_total: number
          commission_total: number
          sales_count: number
        }[]
      }
      set_commission_rate: {
        Args: { _member_id: string; _rate: number }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "onisciente" | "admin" | "comissionado"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["onisciente", "admin", "comissionado"],
    },
  },
} as const

// ---------------------------------------------------------------------------
// Almoxá Agenda
// ---------------------------------------------------------------------------
// Os status vivem como CHECK no Postgres, não como enum, então o `gen types`
// os traz só como `string`. Estreitar aqui é o que faz o TypeScript recusar
// um status inventado antes de o banco recusar.
export type AppointmentStatus = "confirmado" | "cancelado" | "concluido";
export type CancelledBy = "cliente" | "prestador";

export type Provider = Tables<"providers">;
export type Service = Tables<"services">;
export type AvailabilityRule = Tables<"availability_rules">;
export type AvailabilityBlock = Tables<"availability_blocks">;
export type Appointment = Tables<"appointments">;
