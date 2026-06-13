export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          status: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: string | null;
          phone: string | null;
          position: string | null;
          department: string | null;
          avatar_url: string | null;
          metadata: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: string | null;
          phone?: string | null;
          position?: string | null;
          department?: string | null;
          avatar_url?: string | null;
          metadata?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: string;
          status: string;
          display_name: string | null;
          position: string | null;
          department: string | null;
          permissions: Json;
          invited_by: string | null;
          invited_at: string | null;
          deactivated_at: string | null;
          last_seen_at: string | null;
          metadata: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: string;
          status?: string;
          display_name?: string | null;
          position?: string | null;
          department?: string | null;
          permissions?: Json;
          invited_by?: string | null;
          invited_at?: string | null;
          deactivated_at?: string | null;
          last_seen_at?: string | null;
          metadata?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_members"]["Insert"]>;
      };
      clients: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          type: string | null;
          document: string | null;
          email: string | null;
          phone: string | null;
          status: string | null;
          owner: string | null;
          segment: string | null;
          pending: string | null;
          next_action: string | null;
          notes: string | null;
          archived_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          type?: string | null;
          document?: string | null;
          email?: string | null;
          phone?: string | null;
          status?: string | null;
          owner?: string | null;
          segment?: string | null;
          pending?: string | null;
          next_action?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
      };
      activity_logs: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string | null;
          actor_user_id: string | null;
          module: string;
          entity_type: string;
          action: string;
          entity_id: string | null;
          title: string | null;
          description: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id?: string | null;
          actor_user_id?: string | null;
          module: string;
          entity_type: string;
          action: string;
          entity_id?: string | null;
          title?: string | null;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["activity_logs"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
