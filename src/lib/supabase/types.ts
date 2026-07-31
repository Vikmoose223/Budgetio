// Hand-maintained to mirror supabase/migrations/*.sql.
// Keep in sync when the schema changes (or later generate with the Supabase CLI).

type Timestamp = string;

// Mirrors the check constraints in 0004_net_worth.sql.
export type AssetKind =
  | "pension"
  | "gemel"
  | "hishtalmut"
  | "brokerage"
  | "crypto"
  | "real_estate"
  | "cash"
  | "other";
export type LiabilityKind =
  | "mortgage"
  | "personal_loan"
  | "car_loan"
  | "credit_line"
  | "other";
export type Currency = "ILS" | "USD" | "EUR";
export type Market = "us" | "tase" | "crypto";
export type FundSource = "gemel" | "pension";

// Mirrors the check constraints in 0006_loan_types_and_prime.sql.
export type LoanType = "spitzer" | "grace" | "balloon" | "none";
export type RateType = "fixed" | "prime";

// Mirrors the check constraint in 0005_income_and_fixed.sql.
export type IncomeSource =
  | "salary"
  | "freelance"
  | "bonus"
  | "rent"
  | "investment"
  | "gift"
  | "refund"
  | "other";

export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; invite_code: string; month_start_day: number; prime_rate: number; created_at: Timestamp };
        Insert: { id?: string; name: string; invite_code?: string; month_start_day?: number; prime_rate?: number; created_at?: Timestamp };
        Update: { id?: string; name?: string; invite_code?: string; month_start_day?: number; prime_rate?: number; created_at?: Timestamp };
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
          monthly_goal: number;
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
          monthly_goal?: number;
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
          monthly_goal?: number;
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
          is_fixed: boolean;
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
          is_fixed?: boolean;
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
          is_fixed?: boolean;
          created_by?: string | null;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      // --- Income (migration 0005) ------------------------------------------
      incomes: {
        Row: {
          id: string;
          household_id: string;
          occurred_on: string;
          amount: number;
          source: IncomeSource;
          description: string | null;
          owner_profile_id: string | null;
          recurring: boolean;
          created_by: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          occurred_on: string;
          amount: number;
          source?: IncomeSource;
          description?: string | null;
          owner_profile_id?: string | null;
          recurring?: boolean;
          created_by?: string | null;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          occurred_on?: string;
          amount?: number;
          source?: IncomeSource;
          description?: string | null;
          owner_profile_id?: string | null;
          recurring?: boolean;
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
      // --- Net worth (migration 0004) ---------------------------------------
      asset_accounts: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          kind: AssetKind;
          owner_profile_id: string | null;
          currency: Currency;
          fund_id: number | null;
          fund_source: FundSource | null;
          notes: string | null;
          sort_order: number;
          archived: boolean;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          kind?: AssetKind;
          owner_profile_id?: string | null;
          currency?: Currency;
          fund_id?: number | null;
          fund_source?: FundSource | null;
          notes?: string | null;
          sort_order?: number;
          archived?: boolean;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          kind?: AssetKind;
          owner_profile_id?: string | null;
          currency?: Currency;
          fund_id?: number | null;
          fund_source?: FundSource | null;
          notes?: string | null;
          sort_order?: number;
          archived?: boolean;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      holdings: {
        Row: {
          id: string;
          account_id: string;
          symbol: string;
          quantity: number;
          market: Market;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          account_id: string;
          symbol: string;
          quantity?: number;
          market: Market;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          account_id?: string;
          symbol?: string;
          quantity?: number;
          market?: Market;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      valuations: {
        Row: {
          id: string;
          account_id: string;
          as_of: string;
          value: number;
          source: "manual" | "auto";
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          account_id: string;
          as_of: string;
          value: number;
          source?: "manual" | "auto";
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          account_id?: string;
          as_of?: string;
          value?: number;
          source?: "manual" | "auto";
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      account_flows: {
        Row: {
          id: string;
          account_id: string;
          occurred_on: string;
          amount: number;
          note: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          account_id: string;
          occurred_on: string;
          amount: number;
          note?: string | null;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          account_id?: string;
          occurred_on?: string;
          amount?: number;
          note?: string | null;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      liabilities: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          kind: LiabilityKind;
          owner_profile_id: string | null;
          currency: Currency;
          principal: number;
          annual_rate: number;
          term_months: number;
          start_date: string;
          payment_amount: number | null;
          linkage: "none" | "cpi";
          balance_override: number | null;
          balance_override_as_of: string | null;
          linked_asset_id: string | null;
          loan_type: LoanType;
          grace_months: number;
          capitalize_interest: boolean;
          rate_type: RateType;
          prime_margin: number;
          notes: string | null;
          sort_order: number;
          archived: boolean;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          kind?: LiabilityKind;
          owner_profile_id?: string | null;
          currency?: Currency;
          principal?: number;
          annual_rate?: number;
          term_months?: number;
          start_date?: string;
          payment_amount?: number | null;
          linkage?: "none" | "cpi";
          balance_override?: number | null;
          balance_override_as_of?: string | null;
          linked_asset_id?: string | null;
          loan_type?: LoanType;
          grace_months?: number;
          capitalize_interest?: boolean;
          rate_type?: RateType;
          prime_margin?: number;
          notes?: string | null;
          sort_order?: number;
          archived?: boolean;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          kind?: LiabilityKind;
          owner_profile_id?: string | null;
          currency?: Currency;
          principal?: number;
          annual_rate?: number;
          term_months?: number;
          start_date?: string;
          payment_amount?: number | null;
          linkage?: "none" | "cpi";
          balance_override?: number | null;
          balance_override_as_of?: string | null;
          linked_asset_id?: string | null;
          loan_type?: LoanType;
          grace_months?: number;
          capitalize_interest?: boolean;
          rate_type?: RateType;
          prime_margin?: number;
          notes?: string | null;
          sort_order?: number;
          archived?: boolean;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      price_cache: {
        Row: {
          symbol: string;
          market: Market;
          as_of: string;
          price: number;
          currency: string;
          fetched_at: Timestamp;
        };
        Insert: {
          symbol: string;
          market: Market;
          as_of: string;
          price: number;
          currency: string;
          fetched_at?: Timestamp;
        };
        Update: {
          symbol?: string;
          market?: Market;
          as_of?: string;
          price?: number;
          currency?: string;
          fetched_at?: Timestamp;
        };
        Relationships: [];
      };
      fund_yields_cache: {
        Row: {
          fund_id: number;
          source: FundSource;
          report_period: number;
          fund_name: string | null;
          managing_corp: string | null;
          monthly_yield: number | null;
          ytd_yield: number | null;
          avg_mgmt_fee: number | null;
          sharpe_ratio: number | null;
          fetched_at: Timestamp;
        };
        Insert: {
          fund_id: number;
          source: FundSource;
          report_period: number;
          fund_name?: string | null;
          managing_corp?: string | null;
          monthly_yield?: number | null;
          ytd_yield?: number | null;
          avg_mgmt_fee?: number | null;
          sharpe_ratio?: number | null;
          fetched_at?: Timestamp;
        };
        Update: {
          fund_id?: number;
          source?: FundSource;
          report_period?: number;
          fund_name?: string | null;
          managing_corp?: string | null;
          monthly_yield?: number | null;
          ytd_yield?: number | null;
          avg_mgmt_fee?: number | null;
          sharpe_ratio?: number | null;
          fetched_at?: Timestamp;
        };
        Relationships: [];
      };
      fx_rates: {
        Row: {
          base: string;
          quote: string;
          as_of: string;
          rate: number;
          fetched_at: Timestamp;
        };
        Insert: {
          base: string;
          quote: string;
          as_of: string;
          rate: number;
          fetched_at?: Timestamp;
        };
        Update: {
          base?: string;
          quote?: string;
          as_of?: string;
          rate?: number;
          fetched_at?: Timestamp;
        };
        Relationships: [];
      };
      cpi_index: {
        Row: { period: number; value: number; fetched_at: Timestamp };
        Insert: { period: number; value: number; fetched_at?: Timestamp };
        Update: { period?: number; value?: number; fetched_at?: Timestamp };
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
