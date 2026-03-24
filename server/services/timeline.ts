/**
 * server/services/timeline.ts
 *
 * Supabase-backed case timeline service.
 * Gracefully returns empty results if the table does not yet exist.
 *
 * Required Supabase table (run in Supabase SQL editor):
 *
 *   CREATE TABLE IF NOT EXISTS timeline_events (
 *     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id     uuid NOT NULL,
 *     event_date  date NOT NULL,
 *     description text NOT NULL,
 *     created_at  timestamptz NOT NULL DEFAULT now()
 *   );
 *
 *   CREATE INDEX IF NOT EXISTS idx_timeline_events_user_id
 *     ON timeline_events (user_id, event_date ASC);
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface TimelineEvent {
  id: string;
  userId: string;
  eventDate: string;
  description: string;
  createdAt: string;
}

function mapEvent(r: any): TimelineEvent {
  return {
    id: r.id,
    userId: r.user_id,
    eventDate: r.event_date,
    description: r.description,
    createdAt: r.created_at,
  };
}

export async function listTimelineEvents(userId: string): Promise<TimelineEvent[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("timeline_events")
      .select("*")
      .eq("user_id", userId)
      .order("event_date", { ascending: true })
      .limit(100);
    if (error || !data) return [];
    return data.map(mapEvent);
  } catch {
    return [];
  }
}

export async function createTimelineEvent(
  userId: string,
  fields: { eventDate: string; description: string },
): Promise<TimelineEvent | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("timeline_events")
      .insert({
        user_id: userId,
        event_date: fields.eventDate,
        description: fields.description.slice(0, 500),
      })
      .select()
      .single();
    if (error || !data) return null;
    return mapEvent(data);
  } catch {
    return null;
  }
}

export async function deleteTimelineEvent(eventId: string, userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin
      .from("timeline_events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("[timeline] deleteTimelineEvent error:", err);
  }
}
