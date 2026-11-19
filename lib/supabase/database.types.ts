export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      add_on_prices: {
        Row: {
          add_on_key: string
          amount_cents: number
          currency: string
        }
        Insert: {
          add_on_key: string
          amount_cents: number
          currency: string
        }
        Update: {
          add_on_key?: string
          amount_cents?: number
          currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "add_on_prices_add_on_key_fkey"
            columns: ["add_on_key"]
            isOneToOne: false
            referencedRelation: "add_ons"
            referencedColumns: ["key"]
          },
        ]
      }
      add_on_services: {
        Row: {
          add_on_key: string
          service: string
        }
        Insert: {
          add_on_key: string
          service: string
        }
        Update: {
          add_on_key?: string
          service?: string
        }
        Relationships: [
          {
            foreignKeyName: "add_on_services_add_on_key_fkey"
            columns: ["add_on_key"]
            isOneToOne: false
            referencedRelation: "add_ons"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "add_on_services_service_fkey"
            columns: ["service"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["key"]
          },
        ]
      }
      add_ons: {
        Row: {
          active: boolean
          key: string
          position: number
        }
        Insert: {
          active?: boolean
          key: string
          position: number
        }
        Update: {
          active?: boolean
          key?: string
          position?: number
        }
        Relationships: []
      }
      card_fee_prices: {
        Row: {
          amount_cents: number
          currency: string
          fee_key: string
        }
        Insert: {
          amount_cents: number
          currency: string
          fee_key: string
        }
        Update: {
          amount_cents?: number
          currency?: string
          fee_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_fee_prices_fee_key_fkey"
            columns: ["fee_key"]
            isOneToOne: false
            referencedRelation: "card_fees"
            referencedColumns: ["key"]
          },
        ]
      }
      card_fees: {
        Row: {
          key: string
        }
        Insert: {
          key: string
        }
        Update: {
          key?: string
        }
        Relationships: []
      }
      card_photos: {
        Row: {
          byte_size: number
          card_id: string
          content_type: string
          created_at: string
          id: string
          object_key: string | null
        }
        Insert: {
          byte_size: number
          card_id: string
          content_type: string
          created_at?: string
          id?: string
          object_key?: string | null
        }
        Update: {
          byte_size?: number
          card_id?: string
          content_type?: string
          created_at?: string
          id?: string
          object_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_photos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "order_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_set_external_refs: {
        Row: {
          created_at: string
          external_id: string
          language: string | null
          set_id: string
          source: string
        }
        Insert: {
          created_at?: string
          external_id: string
          language?: string | null
          set_id: string
          source: string
        }
        Update: {
          created_at?: string
          external_id?: string
          language?: string | null
          set_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_set_external_refs_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      card_sets: {
        Row: {
          category: string
          code: string | null
          created_at: string
          id: string
          language: string
          name: string
          release_year: number | null
          series: string | null
          total_cards: number | null
          updated_at: string
        }
        Insert: {
          category: string
          code?: string | null
          created_at?: string
          id?: string
          language?: string
          name: string
          release_year?: number | null
          series?: string | null
          total_cards?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string | null
          created_at?: string
          id?: string
          language?: string
          name?: string
          release_year?: number | null
          series?: string | null
          total_cards?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_sets_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      catalog_cards: {
        Row: {
          card_number: string
          created_at: string
          external_id: string | null
          external_source: string | null
          id: string
          merged_into: string | null
          name: string
          number_key: string | null
          rarity: string | null
          set_id: string
          updated_at: string
          variant: string | null
        }
        Insert: {
          card_number: string
          created_at?: string
          external_id?: string | null
          external_source?: string | null
          id?: string
          merged_into?: string | null
          name: string
          number_key?: string | null
          rarity?: string | null
          set_id: string
          updated_at?: string
          variant?: string | null
        }
        Update: {
          card_number?: string
          created_at?: string
          external_id?: string | null
          external_source?: string | null
          id?: string
          merged_into?: string | null
          name?: string
          number_key?: string | null
          rarity?: string | null
          set_id?: string
          updated_at?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_cards_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "catalog_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_cards_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          active: boolean
          key: string
          kind: string
          position: number
        }
        Insert: {
          active?: boolean
          key: string
          kind: string
          position: number
        }
        Update: {
          active?: boolean
          key?: string
          kind?: string
          position?: number
        }
        Relationships: []
      }
      graded_copies: {
        Row: {
          autograph_authentication: string | null
          autograph_grade: string | null
          card_authentication: string | null
          card_grade: string | null
          catalog_card_id: string
          cert_number: string
          created_at: string
          finalized_at: string | null
          id: string
          order_card_id: string | null
          published_at: string | null
          service: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          autograph_authentication?: string | null
          autograph_grade?: string | null
          card_authentication?: string | null
          card_grade?: string | null
          catalog_card_id: string
          cert_number: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          order_card_id?: string | null
          published_at?: string | null
          service: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          autograph_authentication?: string | null
          autograph_grade?: string | null
          card_authentication?: string | null
          card_grade?: string | null
          catalog_card_id?: string
          cert_number?: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          order_card_id?: string | null
          published_at?: string | null
          service?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graded_copies_autograph_grade_fkey"
            columns: ["autograph_grade"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "graded_copies_card_grade_fkey"
            columns: ["card_grade"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "graded_copies_catalog_card_id_fkey"
            columns: ["catalog_card_id"]
            isOneToOne: false
            referencedRelation: "catalog_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graded_copies_order_card_id_fkey"
            columns: ["order_card_id"]
            isOneToOne: false
            referencedRelation: "order_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graded_copies_service_fkey"
            columns: ["service"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["key"]
          },
        ]
      }
      grades: {
        Row: {
          key: string
          position: number
          value: number
        }
        Insert: {
          key: string
          position: number
          value: number
        }
        Update: {
          key?: string
          position?: number
          value?: number
        }
        Relationships: []
      }
      order_card_add_ons: {
        Row: {
          add_on_key: string
          card_id: string
          price_cents: number | null
        }
        Insert: {
          add_on_key: string
          card_id: string
          price_cents?: number | null
        }
        Update: {
          add_on_key?: string
          card_id?: string
          price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_card_add_ons_add_on_key_fkey"
            columns: ["add_on_key"]
            isOneToOne: false
            referencedRelation: "add_ons"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "order_card_add_ons_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "order_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      order_cards: {
        Row: {
          brand: string | null
          card_number: string | null
          catalog_ref: string | null
          created_at: string
          declared_value_cents: number | null
          id: string
          identification_cents: number | null
          identified_by: string
          language: string | null
          name: string | null
          numbered: boolean
          order_id: string
          position: number
          price_cents: number | null
          release_year: number | null
          service: string | null
          set_name: string | null
          signed: boolean
          surface: string | null
          tier_key: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          card_number?: string | null
          catalog_ref?: string | null
          created_at?: string
          declared_value_cents?: number | null
          id?: string
          identification_cents?: number | null
          identified_by?: string
          language?: string | null
          name?: string | null
          numbered?: boolean
          order_id: string
          position: number
          price_cents?: number | null
          release_year?: number | null
          service?: string | null
          set_name?: string | null
          signed?: boolean
          surface?: string | null
          tier_key?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          card_number?: string | null
          catalog_ref?: string | null
          created_at?: string
          declared_value_cents?: number | null
          id?: string
          identification_cents?: number | null
          identified_by?: string
          language?: string | null
          name?: string | null
          numbered?: boolean
          order_id?: string
          position?: number
          price_cents?: number | null
          release_year?: number | null
          service?: string | null
          set_name?: string | null
          signed?: boolean
          surface?: string | null
          tier_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_cards_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cards_service_fkey"
            columns: ["service"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "order_cards_tier_key_fkey"
            columns: ["tier_key"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["key"]
          },
        ]
      }
      order_status_log: {
        Row: {
          actor: string
          actor_user_id: string | null
          created_at: string
          from_status: string | null
          id: number
          order_id: string
          to_status: string
        }
        Insert: {
          actor: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          order_id: string
          to_status: string
        }
        Update: {
          actor?: string
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_log_from_status_fkey"
            columns: ["from_status"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "order_status_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_log_to_status_fkey"
            columns: ["to_status"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["key"]
          },
        ]
      }
      order_statuses: {
        Row: {
          key: string
          position: number
        }
        Insert: {
          key: string
          position: number
        }
        Update: {
          key?: string
          position?: number
        }
        Relationships: []
      }
      order_transitions: {
        Row: {
          actor: string
          from_status: string | null
          to_status: string
        }
        Insert: {
          actor: string
          from_status?: string | null
          to_status: string
        }
        Update: {
          actor?: string
          from_status?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_transitions_from_status_fkey"
            columns: ["from_status"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "order_transitions_to_status_fkey"
            columns: ["to_status"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["key"]
          },
        ]
      }
      orders: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_line: string | null
          address_postcode: string | null
          contact_first_name: string | null
          contact_last_name: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          declared_value_total_cents: number | null
          id: string
          inbound_cents: number | null
          inbound_insurance_confirmed: boolean
          inbound_insurance_confirmed_at: string | null
          reference: string
          return_cents: number | null
          shipping_method: string | null
          status: string
          submitted_at: string | null
          subtotal_cents: number | null
          terms_accepted_at: string | null
          terms_version: string | null
          total_cents: number | null
          turnaround_days: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line?: string | null
          address_postcode?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          declared_value_total_cents?: number | null
          id?: string
          inbound_cents?: number | null
          inbound_insurance_confirmed?: boolean
          inbound_insurance_confirmed_at?: string | null
          reference?: string
          return_cents?: number | null
          shipping_method?: string | null
          status?: string
          submitted_at?: string | null
          subtotal_cents?: number | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          total_cents?: number | null
          turnaround_days?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line?: string | null
          address_postcode?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          declared_value_total_cents?: number | null
          id?: string
          inbound_cents?: number | null
          inbound_insurance_confirmed?: boolean
          inbound_insurance_confirmed_at?: string | null
          reference?: string
          return_cents?: number | null
          shipping_method?: string | null
          status?: string
          submitted_at?: string | null
          subtotal_cents?: number | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          total_cents?: number | null
          turnaround_days?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["key"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          order_id: string
          outcome: string | null
          provider: string
          provider_reference: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          id?: string
          order_id: string
          outcome?: string | null
          provider: string
          provider_reference: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          outcome?: string | null
          provider?: string
          provider_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string
          key: string
        }
        Insert: {
          description: string
          key: string
        }
        Update: {
          description?: string
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_key: string
        }
        Insert: {
          permission_key: string
          role_key: string
        }
        Update: {
          permission_key?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          key: string
          label: string
        }
        Insert: {
          key: string
          label: string
        }
        Update: {
          key?: string
          label?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          key: string
          position: number
          requires_signed: boolean
        }
        Insert: {
          active?: boolean
          key: string
          position: number
          requires_signed?: boolean
        }
        Update: {
          active?: boolean
          key?: string
          position?: number
          requires_signed?: boolean
        }
        Relationships: []
      }
      shipping_zone_countries: {
        Row: {
          country_code: string
          zone_key: string
        }
        Insert: {
          country_code: string
          zone_key: string
        }
        Update: {
          country_code?: string
          zone_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zone_countries_zone_key_fkey"
            columns: ["zone_key"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["key"]
          },
        ]
      }
      shipping_zone_prices: {
        Row: {
          currency: string
          inbound_cents: number
          return_cents: number
          zone_key: string
        }
        Insert: {
          currency: string
          inbound_cents: number
          return_cents: number
          zone_key: string
        }
        Update: {
          currency?: string
          inbound_cents?: number
          return_cents?: number
          zone_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zone_prices_zone_key_fkey"
            columns: ["zone_key"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["key"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          key: string
          position: number
        }
        Insert: {
          key: string
          position: number
        }
        Update: {
          key?: string
          position?: number
        }
        Relationships: []
      }
      tier_prices: {
        Row: {
          amount_cents: number
          currency: string
          max_declared_value_cents: number | null
          tier_key: string
        }
        Insert: {
          amount_cents: number
          currency: string
          max_declared_value_cents?: number | null
          tier_key: string
        }
        Update: {
          amount_cents?: number
          currency?: string
          max_declared_value_cents?: number | null
          tier_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_prices_tier_key_fkey"
            columns: ["tier_key"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["key"]
          },
        ]
      }
      tiers: {
        Row: {
          active: boolean
          key: string
          position: number
          service: string
          turnaround_days: number
        }
        Insert: {
          active?: boolean
          key: string
          position: number
          service: string
          turnaround_days: number
        }
        Update: {
          active?: boolean
          key?: string
          position?: number
          service?: string
          turnaround_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "tiers_service_fkey"
            columns: ["service"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["key"]
          },
        ]
      }
      user_roles: {
        Row: {
          role_key: string
          user_id: string
        }
        Insert: {
          role_key: string
          user_id: string
        }
        Update: {
          role_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_order: { Args: { p_reference: string }; Returns: undefined }
      card_number_key: { Args: { p: string }; Returns: string }
      complete_photo_deletions: {
        Args: { p_keys: string[] }
        Returns: undefined
      }
      expire_stale_drafts: { Args: never; Returns: number }
      list_photo_deletions: { Args: { p_limit: number }; Returns: string[] }
      pop_card: {
        Args: { p_card: string }
        Returns: {
          authentic_count: number
          autograph_counts: Json
          autograph_total: number
          card_number: string
          category: string
          grade_counts: Json
          id: string
          kind: string
          language: string
          name: string
          rarity: string
          release_year: number
          series: string
          set_code: string
          set_id: string
          set_name: string
          total: number
          variant: string
        }[]
      }
      pop_categories: {
        Args: never
        Returns: {
          key: string
          kind: string
          set_count: number
          total: number
        }[]
      }
      pop_category_sets: {
        Args: { p_category: string }
        Returns: {
          card_count: number
          code: string
          id: string
          language: string
          name: string
          release_year: number
          series: string
          total: number
        }[]
      }
      pop_certificate: {
        Args: { p_cert: string }
        Returns: {
          autograph_authentication: string
          autograph_grade: string
          card_authentication: string
          card_grade: string
          card_id: string
          card_name: string
          card_number: string
          card_total: number
          category: string
          cert_number: string
          graded_higher: number
          language: string
          published_at: string
          release_year: number
          service: string
          set_id: string
          set_name: string
          status: string
          variant: string
        }[]
      }
      pop_grades: {
        Args: never
        Returns: {
          key: string
          value: number
        }[]
      }
      pop_recent_copies: {
        Args: { p_limit: number }
        Returns: {
          card_grade: string
          card_id: string
          card_name: string
          card_number: string
          category: string
          cert_number: string
          published_at: string
          rarity: string
          release_year: number
          set_name: string
          variant: string
        }[]
      }
      pop_resolve_card: { Args: { p_card: string }; Returns: string }
      pop_set: {
        Args: { p_set: string }
        Returns: {
          category: string
          code: string
          id: string
          kind: string
          language: string
          name: string
          release_year: number
          series: string
          total_cards: number
        }[]
      }
      pop_set_cards: {
        Args: { p_set: string }
        Returns: {
          authentic_count: number
          autograph_counts: Json
          autograph_total: number
          card_number: string
          grade_counts: Json
          id: string
          name: string
          total: number
          variant: string
        }[]
      }
      prepare_account_deletion: { Args: { p_user_id: string }; Returns: string }
      quote_order: { Args: never; Returns: Json }
      record_payment_failure: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_order_id: string
          p_provider: string
          p_provider_reference: string
        }
        Returns: undefined
      }
      record_payment_success: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_order_id: string
          p_provider: string
          p_provider_reference: string
        }
        Returns: string
      }
      submit_order: { Args: { p_terms_version: string }; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

