// Hand-maintained to mirror supabase/migrations/*.sql.
// Keep in sync when the schema changes (or later generate with the Supabase CLI).

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; invite_code: string; created_at: Timestamp };
        Insert: { id?: string; name: string; invite_code?: string; created_at?: Timestamp };
        Update: { id?: string; name?: string; invite_code?: string; created_at?: Timestamp };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; household_id: string | null; display_name: string | null; created_at: Timestamp };
        Insert: { id: string; household_id?: string | null; display_name?: string | null; created_at?: Timestamp };
        Update: { id?: string; household_id?: string | null; display_name?: string | null; created_at?: Timestamp };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          icon: string | null;
          color: string | null;
          kind: "expense" | "saving";
          sort_order: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          kind?: "expense" | "saving";
          sort_order?: number;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          icon?: string | null;
          color?: string | null;
          kind?: "expense" | "saving";
          sort_order?: number;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      budget_goals: {
        Row: {
          id: string;
          household_id: string;
          category_id: string;
          month: string;
          target_amount: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id: string;
          month: string;
          target_amount?: number;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          category_id?: string;
          month?: string;
          target_amount?: number;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          category_id: string | null;
          occurred_on: string;
          amount: number;
          description: string | null;
          merchant: string | null;
          source: "manual" | "import";
          external_id: string | null;
          created_by: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id?: string | null;
          occurred_on: string;
          amount: number;
          description?: string | null;
          merchant?: string | null;
          source?: "manual" | "import";
          external_id?: string | null;
          created_by?: string | null;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          category_id?: string | null;
          occurred_on?: string;
          amount?: number;
          description?: string | null;
          merchant?: string | null;
          source?: "manual" | "import";
          external_id?: string | null;
          created_by?: string | null;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      category_rules: {
        Row: {
          id: string;
          household_id: string;
          keyword: string;
          category_id: string;
          hit_count: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          keyword: string;
          category_id: string;
          hit_count?: number;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          keyword?: string;
          category_id?: string;
          hit_count?: number;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          household_id: string;
          filename: string | null;
          status: "pending" | "approved" | "discarded";
          created_by: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          filename?: string | null;
          status?: "pending" | "approved" | "discarded";
          created_by?: string | null;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          filename?: string | null;
          status?: "pending" | "approved" | "discarded";
          created_by?: string | null;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_household_id: { Args: Record<string, never>; Returns: string };
      create_household: { Args: { p_name: string }; Returns: string };
      join_household: { Args: { p_invite_code: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
