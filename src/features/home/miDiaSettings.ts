import { supabase } from "@/lib/supabase";
import type { Workspace } from "@/types";

export interface MiDiaSchedule {
  startTime: string;     // HH:MM format, e.g., "06:00"
  resetTime: string;     // HH:MM format, e.g., "00:00"
  timezone: string;      // IANA timezone, e.g., "America/Mexico_City"
}

export interface MiDiaSettings {
  workspaceId: string;
  schedule: MiDiaSchedule;
}

/** Default Mi Día schedule */
export const DEFAULT_MI_DIA_SCHEDULE: MiDiaSchedule = {
  startTime: "06:00",
  resetTime: "00:00",
  timezone: "America/Mexico_City",
};

/** Get Mi Día schedule for a workspace */
export async function fetchMiDiaSchedule(workspaceId: string): Promise<MiDiaSchedule> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("my_day_start_time, my_day_reset_time, my_day_timezone")
    .eq("id", workspaceId)
    .single();

  if (error) {
    console.warn("[miDiaSettings] Failed to fetch schedule, using defaults:", error);
    return DEFAULT_MI_DIA_SCHEDULE;
  }

  return {
    startTime: data.my_day_start_time ?? DEFAULT_MI_DIA_SCHEDULE.startTime,
    resetTime: data.my_day_reset_time ?? DEFAULT_MI_DIA_SCHEDULE.resetTime,
    timezone: data.my_day_timezone ?? DEFAULT_MI_DIA_SCHEDULE.timezone,
  };
}

/** Update Mi Día schedule for a workspace */
export async function updateMiDiaSchedule(
  workspaceId: string,
  schedule: Partial<MiDiaSchedule>
): Promise<MiDiaSchedule> {
  const payload: Record<string, string> = {};
  if (schedule.startTime !== undefined) payload.my_day_start_time = schedule.startTime;
  if (schedule.resetTime !== undefined) payload.my_day_reset_time = schedule.resetTime;
  if (schedule.timezone !== undefined) payload.my_day_timezone = schedule.timezone;

  const { data, error } = await supabase
    .from("workspaces")
    .update(payload)
    .eq("id", workspaceId)
    .select("my_day_start_time, my_day_reset_time, my_day_timezone")
    .single();

  if (error) throw error;

  return {
    startTime: data.my_day_start_time ?? DEFAULT_MI_DIA_SCHEDULE.startTime,
    resetTime: data.my_day_reset_time ?? DEFAULT_MI_DIA_SCHEDULE.resetTime,
    timezone: data.my_day_timezone ?? DEFAULT_MI_DIA_SCHEDULE.timezone,
  };
}

/** Get the "today" date string for Mi día based on workspace schedule */
export function getMiDiaToday(workspace: Workspace | null): string {
  if (!workspace) {
    // Fallback to local midnight
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const tz = workspace.myDayTimezone ?? "America/Mexico_City";
  const resetTime = workspace.myDayResetTime ?? "00:00";
  const [resetHour, resetMinute] = resetTime.split(":").map(Number);

  // Get current time in workspace timezone
  const now = new Date();
  const tzDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  
  // Check if we've passed the reset time
  const currentHour = tzDate.getHours();
  const currentMinute = tzDate.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  const resetTimeMinutes = resetHour * 60 + resetMinute;

  // If current time is before reset time, "today" is actually yesterday
  let targetDate = tzDate;
  if (currentTimeMinutes < resetTimeMinutes) {
    targetDate = new Date(tzDate);
    targetDate.setDate(targetDate.getDate() - 1);
  }

  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Check if a given myDayDate belongs to "today" in Mi día */
export function isMyDayToday(myDayDate: string | null, workspace: Workspace | null): boolean {
  if (!myDayDate) return false;
  const today = getMiDiaToday(workspace);
  return myDayDate === today;
}

/** Get the start of day date for Mi día suggestions */
export function getMiDiaStartOfDay(workspace: Workspace | null): Date {
  if (!workspace) {
    return new Date();
  }

  const tz = workspace.myDayTimezone ?? "America/Mexico_City";
  const startTime = workspace.myDayStartTime ?? "06:00";
  const [startHour, startMinute] = startTime.split(":").map(Number);

  // Get current time in workspace timezone
  const now = new Date();
  const tzDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  
  // Set to start of day at the configured start time
  const startOfDay = new Date(tzDate);
  startOfDay.setHours(startHour, startMinute, 0, 0);

  // If current time is before start time, start of day is yesterday
  const currentHour = tzDate.getHours();
  const currentMinute = tzDate.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  const startTimeMinutes = startHour * 60 + startMinute;

  if (currentTimeMinutes < startTimeMinutes) {
    startOfDay.setDate(startOfDay.getDate() - 1);
  }

  return startOfDay;
}