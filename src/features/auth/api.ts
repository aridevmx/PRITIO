import { supabase } from "@/lib/supabase";
import { mapProfile } from "@/lib/mappers";
import type { Profile, ProfileRow } from "@/types";

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapProfile(data as ProfileRow);
}

export async function upsertProfile(
  userId: string,
  data: { email?: string; full_name?: string; avatar_url?: string | null },
): Promise<Profile> {
  let email = data.email;
  if (email === undefined) {
    const existing = await fetchProfile(userId);
    email = existing?.email ?? "";
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, email, ...data }, { onConflict: "id" });

  if (error) throw error;

  const profile = await fetchProfile(userId);
  if (!profile) throw new Error("Profile not found after upsert");
  return profile;
}
