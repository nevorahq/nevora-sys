export interface BookingHostProfile {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  booking_page_id: string;
  user_id: string;
  membership_id: string;
  host_slug: string;
  display_name: string;
  public_title: string | null;
  public_bio: string | null;
  avatar_url: string | null;
  timezone: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Публично-безопасное представление хоста (без internal IDs). */
export interface PublicHostProfile {
  slug: string;
  displayName: string;
  publicTitle: string | null;
  publicBio: string | null;
  avatarUrl: string | null;
}
