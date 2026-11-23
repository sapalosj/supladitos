
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "branch_overrides": {
                  Row: {
                    "branch_id": string,"created_at": string,"id": string,"is_available": boolean | null,"menu_item_id": string | null,"price": number | null,"updated_at": string,"variant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"id"?: string,"is_available"?: boolean | null,"menu_item_id"?: string | null,"price"?: number | null,"updated_at"?: string,"variant_id"?: string | null
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"is_available"?: boolean | null,"menu_item_id"?: string | null,"price"?: number | null,"updated_at"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "branch_overrides_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_overrides_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_overrides_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "item_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"timezone"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "branch_id": string,"created_at": string,"id": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"day_closes": {
                  Row: {
                    "actual_cash": number,"branch_id": string,"business_date": string,"closed_at": string,"closed_by": string | null,"expected_cash": number,"gross_sales": number,"id": string,"notes": string | null,"order_count": number,"totals_by_method": NonNullable<Json>,"variance": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_cash": number,"branch_id"?: string,"business_date": string,"closed_at"?: string,"closed_by"?: string | null,"expected_cash": number,"gross_sales"?: number,"id"?: string,"notes"?: string | null,"order_count"?: number,"totals_by_method"?: NonNullable<Json>,"variance"?: never
                  }
                  Update: {
                    "actual_cash"?: number,"branch_id"?: string,"business_date"?: string,"closed_at"?: string,"closed_by"?: string | null,"expected_cash"?: number,"gross_sales"?: number,"id"?: string,"notes"?: string | null,"order_count"?: number,"totals_by_method"?: NonNullable<Json>,"variance"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "day_closes_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"discounts": {
                  Row: {
                    "branch_id": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"percent": number,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"percent": number,"sort_order"?: number
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"percent"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "discounts_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"item_modifier_groups": {
                  Row: {
                    "branch_id": string,"menu_item_id": string,"modifier_group_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string,"menu_item_id": string,"modifier_group_id": string,"sort_order"?: number
                  }
                  Update: {
                    "branch_id"?: string,"menu_item_id"?: string,"modifier_group_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_modifier_groups_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_modifier_groups_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_modifier_groups_modifier_group_id_fkey"
      columns: ["modifier_group_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"item_variants": {
                  Row: {
                    "branch_id": string,"created_at": string,"id": string,"menu_item_id": string,"name": string,"price": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"menu_item_id": string,"name": string,"price": number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"menu_item_id"?: string,"name"?: string,"price"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_variants_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_variants_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "branch_id": string,"category_id": string,"created_at": string,"description": string | null,"id": string,"is_available": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string,"category_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_available"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"category_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_available"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"modifier_groups": {
                  Row: {
                    "allow_quantity": boolean,"branch_id": string,"created_at": string,"id": string,"is_required": boolean,"max_select": number | null,"min_select": number,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_quantity"?: boolean,"branch_id"?: string,"created_at"?: string,"id"?: string,"is_required"?: boolean,"max_select"?: number | null,"min_select"?: number,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "allow_quantity"?: boolean,"branch_id"?: string,"created_at"?: string,"id"?: string,"is_required"?: boolean,"max_select"?: number | null,"min_select"?: number,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_groups_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"modifier_variant_prices": {
                  Row: {
                    "branch_id": string,"modifier_id": string,"price_delta": number,"variant_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string,"modifier_id": string,"price_delta": number,"variant_name": string
                  }
                  Update: {
                    "branch_id"?: string,"modifier_id"?: string,"price_delta"?: number,"variant_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifier_variant_prices_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modifier_variant_prices_modifier_id_fkey"
      columns: ["modifier_id"]
isOneToOne: false
      referencedRelation: "modifiers"
      referencedColumns: ["id"]
    }
                  ]
                },"modifiers": {
                  Row: {
                    "branch_id": string,"created_at": string,"id": string,"is_available": boolean,"modifier_group_id": string,"name": string,"price_delta": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"is_available"?: boolean,"modifier_group_id": string,"name": string,"price_delta"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"id"?: string,"is_available"?: boolean,"modifier_group_id"?: string,"name"?: string,"price_delta"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modifiers_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "modifiers_modifier_group_id_fkey"
      columns: ["modifier_group_id"]
isOneToOne: false
      referencedRelation: "modifier_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"order_item_modifiers": {
                  Row: {
                    "branch_id": string,"id": string,"modifier_id": string | null,"name_snapshot": string,"order_item_id": string,"price_delta": number,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"id": string,"modifier_id"?: string | null,"name_snapshot": string,"order_item_id": string,"price_delta": number,"quantity"?: number
                  }
                  Update: {
                    "branch_id"?: string,"id"?: string,"modifier_id"?: string | null,"name_snapshot"?: string,"order_item_id"?: string,"price_delta"?: number,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_item_modifiers_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_modifiers_modifier_id_fkey"
      columns: ["modifier_id"]
isOneToOne: false
      referencedRelation: "modifiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_modifiers_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "branch_id": string,"discount_amount": number,"discount_id": string | null,"discount_name": string | null,"discount_percent": number | null,"discount_quantity": number,"id": string,"item_name_snapshot": string,"line_total": number,"menu_item_id": string | null,"notes": string | null,"order_id": string,"quantity": number,"sort_order": number,"unit_price": number,"variant_id": string | null,"variant_name_snapshot": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"discount_amount"?: number,"discount_id"?: string | null,"discount_name"?: string | null,"discount_percent"?: number | null,"discount_quantity"?: number,"id": string,"item_name_snapshot": string,"line_total": number,"menu_item_id"?: string | null,"notes"?: string | null,"order_id": string,"quantity": number,"sort_order"?: number,"unit_price": number,"variant_id"?: string | null,"variant_name_snapshot"?: string | null
                  }
                  Update: {
                    "branch_id"?: string,"discount_amount"?: number,"discount_id"?: string | null,"discount_name"?: string | null,"discount_percent"?: number | null,"discount_quantity"?: number,"id"?: string,"item_name_snapshot"?: string,"line_total"?: number,"menu_item_id"?: string | null,"notes"?: string | null,"order_id"?: string,"quantity"?: number,"sort_order"?: number,"unit_price"?: number,"variant_id"?: string | null,"variant_name_snapshot"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_discount_id_fkey"
      columns: ["discount_id"]
isOneToOne: false
      referencedRelation: "discounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "item_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"order_number_counters": {
                  Row: {
                    "branch_id": string,"business_date": string,"last_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_date": string,"last_number"?: number
                  }
                  Update: {
                    "branch_id"?: string,"business_date"?: string,"last_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_number_counters_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "branch_id": string,"business_date": string,"computed_total": number | null,"created_at": string,"created_by": string | null,"customer_name": string | null,"discount_total": number,"id": string,"order_number": number,"order_type": Database["public"]['Enums']["order_type"],"price_mismatch": boolean,"status": Database["public"]['Enums']["order_status"],"status_changed_at": string | null,"subtotal": number,"synced_at": string,"total": number,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"business_date": string,"computed_total"?: number | null,"created_at"?: string,"created_by"?: string | null,"customer_name"?: string | null,"discount_total"?: number,"id": string,"order_number": number,"order_type"?: Database["public"]['Enums']["order_type"],"price_mismatch"?: boolean,"status"?: Database["public"]['Enums']["order_status"],"status_changed_at"?: string | null,"subtotal": number,"synced_at"?: string,"total": number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "branch_id"?: string,"business_date"?: string,"computed_total"?: number | null,"created_at"?: string,"created_by"?: string | null,"customer_name"?: string | null,"discount_total"?: number,"id"?: string,"order_number"?: number,"order_type"?: Database["public"]['Enums']["order_type"],"price_mismatch"?: boolean,"status"?: Database["public"]['Enums']["order_status"],"status_changed_at"?: string | null,"subtotal"?: number,"synced_at"?: string,"total"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"amount_received": number | null,"branch_id": string,"change_due": number | null,"created_at": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"amount_received"?: number | null,"branch_id": string,"change_due"?: number | null,"created_at"?: string,"id": string,"method": Database["public"]['Enums']["payment_method"],"order_id": string
                  }
                  Update: {
                    "amount"?: number,"amount_received"?: number | null,"branch_id"?: string,"change_due"?: number | null,"created_at"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"staff": {
                  Row: {
                    "branch_id": string,"created_at": string,"display_name": string | null,"id": string,"is_active": boolean,"role": Database["public"]['Enums']["staff_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"display_name"?: string | null,"id": string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["staff_role"]
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_active"?: boolean,"role"?: Database["public"]['Enums']["staff_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "auth_branch_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_is_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"auth_staff_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["staff_role"]
                           },
"branch_business_date":
{ Args: { "p_at"?: string,"p_branch_id": string }; Returns: string
                           },
"claim_order_number":
{ Args: { "p_branch_id": string,"p_business_date": string,"p_requested": number }; Returns: number
                           },
"last_order_number":
{ Args: { "p_business_date"?: string }; Returns: number
                           },
"line_discount_amount":
{ Args: { "p_percent": number,"p_quantity": number,"p_unit_price": number }; Returns: number
                           },
"pay_order":
{ Args: { "p_order_id": string,"p_payment": Json }; Returns: Json
                           },
"save_menu_item":
{ Args: { "p_item": Json }; Returns: string
                           },
"save_modifier_group":
{ Args: { "p_group": Json }; Returns: string
                           },
"set_order_discounts":
{ Args: { "p_discounts": Json,"p_order_id": string }; Returns: Json
                           },
"set_sort_order":
{ Args: { "p_ids": (string)[],"p_table": string }; Returns: undefined
                           },
"submit_order":
{ Args: { "p_order": Json }; Returns: Json
                           }
          }
          Enums: {
            "order_status": "new"|"preparing"|"done"|"voided","order_type": "dine_in"|"takeout","payment_method": "cash"|"gcash"|"maya","staff_role": "owner"|"manager"|"barista"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "order_status": ["new", "preparing", "done", "voided"],"order_type": ["dine_in", "takeout"],"payment_method": ["cash", "gcash", "maya"],"staff_role": ["owner", "manager", "barista"]
          }
        }
} as const
