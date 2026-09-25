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
      category_shelf_life_reference: {
        Row: {
          category: Database["public"]["Enums"]["food_category"]
          days: number
          note: string
          recommended_location: Database["public"]["Enums"]["storage_location"]
          source: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["food_category"]
          days: number
          note: string
          recommended_location: Database["public"]["Enums"]["storage_location"]
          source: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["food_category"]
          days?: number
          note?: string
          recommended_location?: Database["public"]["Enums"]["storage_location"]
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_icons: {
        Row: {
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          key: string
          label: string
          sort_order: number
        }
        Update: {
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      household_invitations: {
        Row: {
          created_at: string
          expires_at: string
          household_id: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["household_invitation_status"]
        }
        Insert: {
          created_at?: string
          expires_at?: string
          household_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["household_invitation_status"]
        }
        Update: {
          created_at?: string
          expires_at?: string
          household_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["household_invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "household_invitations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invite_attempts: {
        Row: {
          created_at: string
          id: number
          outcome: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          outcome: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          outcome?: string
          user_id?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          role: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          icon: string
          id: string
          kind: Database["public"]["Enums"]["household_kind"]
          member_limit: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          kind?: Database["public"]["Enums"]["household_kind"]
          member_limit?: number
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          kind?: Database["public"]["Enums"]["household_kind"]
          member_limit?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_icon_fk"
            columns: ["icon"]
            isOneToOne: false
            referencedRelation: "household_icons"
            referencedColumns: ["key"]
          },
        ]
      }
      inventory_events: {
        Row: {
          created_at: string
          household_id: string
          id: number
          item_id: string | null
          payload: Json
          quantity_used: number | null
          type: Database["public"]["Enums"]["inventory_event_type"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: never
          item_id?: string | null
          payload?: Json
          quantity_used?: number | null
          type: Database["public"]["Enums"]["inventory_event_type"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: never
          item_id?: string | null
          payload?: Json
          quantity_used?: number | null
          type?: Database["public"]["Enums"]["inventory_event_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_with_priority"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["food_category"]
          closed_out_at?: string | null
          created_at?: string
          created_by?: string | null
          date_kind?: Database["public"]["Enums"]["date_kind"] | null
          date_source?: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at?: string | null
          frozen_days?: number
          household_id: string
          id?: string
          initial_quantity: number
          limit_date?: string | null
          location?: Database["public"]["Enums"]["storage_location"]
          name: string
          notes?: string | null
          opened_at?: string | null
          product_id?: string | null
          remaining_quantity: number
          state?: Database["public"]["Enums"]["item_state"]
          thawed_at?: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["food_category"]
          closed_out_at?: string | null
          created_at?: string
          created_by?: string | null
          date_kind?: Database["public"]["Enums"]["date_kind"] | null
          date_source?: Database["public"]["Enums"]["date_source"] | null
          display_unit?: Database["public"]["Enums"]["measurement_unit"]
          frozen_at?: string | null
          frozen_days?: number
          household_id?: string
          id?: string
          initial_quantity?: number
          limit_date?: string | null
          location?: Database["public"]["Enums"]["storage_location"]
          name?: string
          notes?: string | null
          opened_at?: string | null
          product_id?: string | null
          remaining_quantity?: number
          state?: Database["public"]["Enums"]["item_state"]
          thawed_at?: string | null
          unit_family?: Database["public"]["Enums"]["unit_family"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      open_shelf_life_reference: {
        Row: {
          category_tag: string
          days: number
          note: string | null
          source: string
          updated_at: string
        }
        Insert: {
          category_tag: string
          days: number
          note?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          category_tag?: string
          days?: number
          note?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          categories_tags: string[] | null
          created_at: string
          data_source: string
          household_id: string | null
          id: string
          image_url: string | null
          name: string
          net_quantity: number | null
          off_payload: Json | null
          open_shelf_life_days: number | null
          unit_family: Database["public"]["Enums"]["unit_family"] | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          categories_tags?: string[] | null
          created_at?: string
          data_source?: string
          household_id?: string | null
          id?: string
          image_url?: string | null
          name: string
          net_quantity?: number | null
          off_payload?: Json | null
          open_shelf_life_days?: number | null
          unit_family?: Database["public"]["Enums"]["unit_family"] | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          categories_tags?: string[] | null
          created_at?: string
          data_source?: string
          household_id?: string | null
          id?: string
          image_url?: string | null
          name?: string
          net_quantity?: number | null
          off_payload?: Json | null
          open_shelf_life_days?: number | null
          unit_family?: Database["public"]["Enums"]["unit_family"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          created_at: string
          created_by: string | null
          display_unit: Database["public"]["Enums"]["measurement_unit"] | null
          household_id: string
          id: string
          is_purchased: boolean
          name: string
          product_id: string | null
          purchased_at: string | null
          quantity: number | null
          source: string
          unit_family: Database["public"]["Enums"]["unit_family"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_unit?: Database["public"]["Enums"]["measurement_unit"] | null
          household_id: string
          id?: string
          is_purchased?: boolean
          name: string
          product_id?: string | null
          purchased_at?: string | null
          quantity?: number | null
          source?: string
          unit_family?: Database["public"]["Enums"]["unit_family"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_unit?: Database["public"]["Enums"]["measurement_unit"] | null
          household_id?: string
          id?: string
          is_purchased?: boolean
          name?: string
          product_id?: string | null
          purchased_at?: string | null
          quantity?: number | null
          source?: string
          unit_family?: Database["public"]["Enums"]["unit_family"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          auto_add_to_shopping_list: boolean
          created_at: string
          digest_enabled: boolean
          digest_hour: number
          household_limit: number
          locale: string
          push_token: string | null
          push_token_updated_at: string | null
          timezone: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          auto_add_to_shopping_list?: boolean
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          household_limit?: number
          locale?: string
          push_token?: string | null
          push_token_updated_at?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          auto_add_to_shopping_list?: boolean
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          household_limit?: number
          locale?: string
          push_token?: string | null
          push_token_updated_at?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      inventory_with_priority: {
        Row: {
          category: Database["public"]["Enums"]["food_category"] | null
          closed_out_at: string | null
          created_at: string | null
          created_by: string | null
          date_from_label: string | null
          date_from_opening: string | null
          date_from_thaw: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          days_left: number | null
          display_unit: Database["public"]["Enums"]["measurement_unit"] | null
          effective_date_reason:
            | Database["public"]["Enums"]["effective_date_reason"]
            | null
          effective_date_source:
            | Database["public"]["Enums"]["date_source"]
            | null
          effective_limit_date: string | null
          frozen_at: string | null
          frozen_days: number | null
          household_id: string | null
          id: string | null
          initial_quantity: number | null
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"] | null
          name: string | null
          notes: string | null
          opened_at: string | null
          priority: Database["public"]["Enums"]["priority_group"] | null
          product_id: string | null
          remaining_quantity: number | null
          state: Database["public"]["Enums"]["item_state"] | null
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          created_at: string
          icon: string
          id: string
          kind: Database["public"]["Enums"]["household_kind"]
          member_limit: number
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      check_household_icon: { Args: { p_icon: string }; Returns: string }
      check_household_name: { Args: { p_name: string }; Returns: string }
      create_item: {
        Args: {
          p_category?: Database["public"]["Enums"]["food_category"]
          p_date_kind?: Database["public"]["Enums"]["date_kind"]
          p_date_source?: Database["public"]["Enums"]["date_source"]
          p_display_unit: Database["public"]["Enums"]["measurement_unit"]
          p_household_id: string
          p_limit_date?: string
          p_location?: Database["public"]["Enums"]["storage_location"]
          p_name: string
          p_notes?: string
          p_product_id?: string
          p_quantity: number
          p_unit_family: Database["public"]["Enums"]["unit_family"]
        }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_shared_household: {
        Args: { p_icon?: string; p_name: string }
        Returns: {
          created_at: string
          icon: string
          id: string
          kind: Database["public"]["Enums"]["household_kind"]
          member_limit: number
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      discard_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dominio_sintetico: { Args: never; Returns: string }
      expire_stale_invitations: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      finish_item: {
        Args: { p_item_id: string }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      freeze_item: {
        Args: { p_item_id: string }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      household_member_names: {
        Args: { p_household_id: string }
        Returns: {
          role: Database["public"]["Enums"]["household_role"]
          user_id: string
          username: string
        }[]
      }
      household_sent_invitations: {
        Args: { p_household_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          invitee_username: string
          responded_at: string
          status: Database["public"]["Enums"]["household_invitation_status"]
        }[]
      }
      invitation_status_es: {
        Args: {
          p_status: Database["public"]["Enums"]["household_invitation_status"]
        }
        Returns: string
      }
      invite_to_household: {
        Args: { p_household_id: string; p_username: string }
        Returns: {
          invitation_id: string
          message: string
          outcome: string
        }[]
      }
      is_household_member: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      leave_household: { Args: { p_household_id: string }; Returns: undefined }
      lock_household_limit: { Args: { p_user_id: string }; Returns: number }
      mi_correo: { Args: never; Returns: string }
      my_households: {
        Args: never
        Returns: {
          icon: string
          id: string
          kind: Database["public"]["Enums"]["household_kind"]
          member_count: number
          member_limit: number
          name: string
          role: Database["public"]["Enums"]["household_role"]
        }[]
      }
      my_pending_invitations: {
        Args: never
        Returns: {
          created_at: string
          expires_at: string
          household_icon: string
          household_id: string
          household_name: string
          id: string
          inviter_username: string
        }[]
      }
      open_item: {
        Args: { p_item_id: string }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_inventory_event: {
        Args: {
          p_item: Database["public"]["Tables"]["inventory_items"]["Row"]
          p_payload?: Json
          p_quantity_used?: number
          p_type: Database["public"]["Enums"]["inventory_event_type"]
        }
        Returns: undefined
      }
      reject_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      remove_household_member: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
      require_item: {
        Args: { p_item_id: string }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_owner_household: {
        Args: { p_household_id: string }
        Returns: string
      }
      require_shared_household_member: {
        Args: { p_household_id: string; p_lock?: boolean }
        Returns: Database["public"]["Enums"]["household_role"]
      }
      shelf_life_for_item: {
        Args: { p_item_id: string }
        Returns: {
          days: number
          origin: Database["public"]["Enums"]["shelf_life_origin"]
          recommended_location: Database["public"]["Enums"]["storage_location"]
        }[]
      }
      thaw_item: {
        Args: { p_item_id: string }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      today_for_user: { Args: never; Returns: string }
      transfer_household_ownership: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
      update_household: {
        Args: { p_household_id: string; p_icon?: string; p_name?: string }
        Returns: {
          created_at: string
          icon: string
          id: string
          kind: Database["public"]["Enums"]["household_kind"]
          member_limit: number
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      use_quantity: {
        Args: { p_amount: number; p_item_id: string }
        Returns: {
          category: Database["public"]["Enums"]["food_category"]
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          date_kind: Database["public"]["Enums"]["date_kind"] | null
          date_source: Database["public"]["Enums"]["date_source"] | null
          display_unit: Database["public"]["Enums"]["measurement_unit"]
          frozen_at: string | null
          frozen_days: number
          household_id: string
          id: string
          initial_quantity: number
          limit_date: string | null
          location: Database["public"]["Enums"]["storage_location"]
          name: string
          notes: string | null
          opened_at: string | null
          product_id: string | null
          remaining_quantity: number
          state: Database["public"]["Enums"]["item_state"]
          thawed_at: string | null
          unit_family: Database["public"]["Enums"]["unit_family"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      date_kind: "expiry" | "best_before"
      date_source:
        | "package"
        | "user"
        | "manufacturer"
        | "reference"
        | "estimate"
      effective_date_reason: "label" | "after_opening" | "after_thawing"
      food_category:
        | "frutas_verduras"
        | "carne"
        | "pescado"
        | "lacteos"
        | "panaderia"
        | "despensa"
        | "congelados"
        | "bebidas"
        | "dulces"
        | "otros"
      household_invitation_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "cancelled"
        | "expired"
      household_kind: "personal" | "shared"
      household_role: "owner" | "member"
      inventory_event_type:
        | "created"
        | "opened"
        | "quantity_used"
        | "frozen"
        | "thawed"
        | "finished"
        | "discarded"
        | "updated"
      item_state:
        | "closed"
        | "open"
        | "partially_consumed"
        | "frozen"
        | "thawed"
        | "finished"
        | "discarded"
      measurement_unit: "g" | "kg" | "ml" | "l" | "unit"
      priority_group:
        | "high"
        | "medium"
        | "low"
        | "undated"
        | "frozen"
        | "closed_out"
      shelf_life_origin: "producto" | "categoria"
      storage_location: "pantry" | "fridge" | "freezer" | "other"
      unit_family: "mass" | "volume" | "count"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      date_kind: ["expiry", "best_before"],
      date_source: ["package", "user", "manufacturer", "reference", "estimate"],
      effective_date_reason: ["label", "after_opening", "after_thawing"],
      food_category: [
        "frutas_verduras",
        "carne",
        "pescado",
        "lacteos",
        "panaderia",
        "despensa",
        "congelados",
        "bebidas",
        "dulces",
        "otros",
      ],
      household_invitation_status: [
        "pending",
        "accepted",
        "rejected",
        "cancelled",
        "expired",
      ],
      household_kind: ["personal", "shared"],
      household_role: ["owner", "member"],
      inventory_event_type: [
        "created",
        "opened",
        "quantity_used",
        "frozen",
        "thawed",
        "finished",
        "discarded",
        "updated",
      ],
      item_state: [
        "closed",
        "open",
        "partially_consumed",
        "frozen",
        "thawed",
        "finished",
        "discarded",
      ],
      measurement_unit: ["g", "kg", "ml", "l", "unit"],
      priority_group: [
        "high",
        "medium",
        "low",
        "undated",
        "frozen",
        "closed_out",
      ],
      shelf_life_origin: ["producto", "categoria"],
      storage_location: ["pantry", "fridge", "freezer", "other"],
      unit_family: ["mass", "volume", "count"],
    },
  },
} as const

