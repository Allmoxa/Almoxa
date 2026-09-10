/**
 * Tipos do banco da Agenda.
 *
 * Escrito à mão a partir de supabase/migrations/20260909100000_agenda_inicial.sql
 * e conferido campo a campo contra o schema publicado pelo PostgREST do projeto
 * em uso. Para regerar a partir do banco:
 *
 *   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
 *
 * Mantenha as duas pontas juntas: mexeu na migration, mexa aqui.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppointmentStatus = "confirmado" | "cancelado" | "concluido";
export type CancelledBy = "cliente" | "prestador";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
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
    };
    Views: Record<never, never>;
    Functions: {
      consume_booking_quota: {
        Args: { _ip: string; _teto?: number };
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicTables = Database["public"]["Tables"];

export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"];

export type Provider = Tables<"providers">;
export type Service = Tables<"services">;
export type AvailabilityRule = Tables<"availability_rules">;
export type AvailabilityBlock = Tables<"availability_blocks">;
export type Appointment = Tables<"appointments">;
