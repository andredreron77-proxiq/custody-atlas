import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface AttorneyProfile {
  id: string;
  user_id: string;
  firm_name: string | null;
  bar_number: string | null;
  bar_state: string | null;
  practice_states: string[] | null;
  bio: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AttorneyClientConnection {
  id: string;
  attorney_user_id: string;
  client_user_id: string | null;
  invite_email: string;
  case_id: string | null;
  status: string;
  accepted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AttorneyClientConnectionView extends AttorneyClientConnection {
  client_display_name: string | null;
  client_email: string | null;
  case_title: string | null;
}

export interface AttorneyClientCaseBrief {
  case: Record<string, unknown> | null;
  caseIntelligence: Record<string, unknown> | null;
  caseTimelineEvents: Record<string, unknown>[];
  documents: Record<string, unknown>[];
}

function mapAttorneyProfile(row: any): AttorneyProfile {
  return {
    id: row.id,
    user_id: row.user_id,
    firm_name: row.firm_name ?? null,
    bar_number: row.bar_number ?? null,
    bar_state: row.bar_state ?? null,
    practice_states: Array.isArray(row.practice_states) ? row.practice_states : null,
    bio: row.bio ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function mapConnection(row: any): AttorneyClientConnection {
  return {
    id: row.id,
    attorney_user_id: row.attorney_user_id,
    client_user_id: row.client_user_id ?? null,
    invite_email: row.invite_email,
    case_id: row.case_id ?? null,
    status: row.status,
    accepted_at: row.accepted_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function getAttorneyProfile(userId: string): Promise<AttorneyProfile | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("attorney_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapAttorneyProfile(data);
}

export async function upsertAttorneyProfile(
  userId: string,
  data: {
    firmName?: string;
    barNumber?: string;
    barState?: string;
    practiceStates?: string[];
    bio?: string;
  },
): Promise<AttorneyProfile | null> {
  if (!supabaseAdmin) return null;

  const payload = {
    user_id: userId,
    firm_name: data.firmName?.trim() || null,
    bar_number: data.barNumber?.trim() || null,
    bar_state: data.barState?.trim() || null,
    practice_states: Array.isArray(data.practiceStates) ? data.practiceStates : null,
    bio: data.bio?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabaseAdmin
    .from("attorney_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error || !saved) return null;
  return mapAttorneyProfile(saved);
}

export async function inviteClient(
  attorneyUserId: string,
  inviteEmail: string,
  caseId?: string,
): Promise<AttorneyClientConnection | null> {
  if (!supabaseAdmin) return null;

  const payload = {
    attorney_user_id: attorneyUserId,
    invite_email: inviteEmail.trim().toLowerCase(),
    case_id: caseId ?? null,
    status: "pending",
  };

  const { data, error } = await supabaseAdmin
    .from("attorney_client_connections")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) return null;
  return mapConnection(data);
}

export async function getAttorneyClients(
  attorneyUserId: string,
): Promise<AttorneyClientConnectionView[]> {
  if (!supabaseAdmin) return [];

  const { data: connections, error } = await supabaseAdmin
    .from("attorney_client_connections")
    .select("*")
    .eq("attorney_user_id", attorneyUserId)
    .neq("status", "revoked")
    .order("created_at", { ascending: false });

  if (error || !connections) return [];

  const clientIds = Array.from(
    new Set(
      connections
        .map((row: any) => row.client_user_id)
        .filter((value: unknown): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const caseIds = Array.from(
    new Set(
      connections
        .map((row: any) => row.case_id)
        .filter((value: unknown): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const profileMap = new Map<string, any>();
  if (clientIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("id, display_name")
      .in("id", clientIds);

    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, profile);
    }
  }

  const emailMap = new Map<string, string | null>();
  for (const clientId of clientIds) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(clientId);
      emailMap.set(clientId, data.user?.email ?? null);
    } catch {
      emailMap.set(clientId, null);
    }
  }

  const caseMap = new Map<string, any>();
  if (caseIds.length > 0) {
    const { data: cases } = await supabaseAdmin
      .from("cases")
      .select("id, title")
      .in("id", caseIds);

    for (const caseRow of cases ?? []) {
      caseMap.set(caseRow.id, caseRow);
    }
  }

  return connections.map((row: any) => {
    const base = mapConnection(row);
    const profile = base.client_user_id ? profileMap.get(base.client_user_id) : null;
    const caseRow = base.case_id ? caseMap.get(base.case_id) : null;

    return {
      ...base,
      client_display_name: profile?.display_name ?? null,
      client_email: base.client_user_id ? emailMap.get(base.client_user_id) ?? null : base.invite_email,
      case_title: caseRow?.title ?? null,
    };
  });
}

export async function getClientCaseData(
  attorneyUserId: string,
  clientUserId: string,
): Promise<AttorneyClientCaseBrief | null> {
  if (!supabaseAdmin) return null;

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("attorney_client_connections")
    .select("*")
    .eq("attorney_user_id", attorneyUserId)
    .eq("client_user_id", clientUserId)
    .eq("status", "active")
    .maybeSingle();

  if (connectionError || !connection) return null;

  const connectionCaseId = connection.case_id ?? null;

  let caseRow: Record<string, unknown> | null = null;
  if (connectionCaseId) {
    const { data } = await supabaseAdmin
      .from("cases")
      .select("*")
      .eq("id", connectionCaseId)
      .eq("user_id", clientUserId)
      .maybeSingle();
    caseRow = (data as Record<string, unknown> | null) ?? null;
  } else {
    const { data } = await supabaseAdmin
      .from("cases")
      .select("*")
      .eq("user_id", clientUserId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    caseRow = (data as Record<string, unknown> | null) ?? null;
  }

  if (!caseRow || typeof caseRow.id !== "string") return null;
  const resolvedCaseId = caseRow.id;

  const [
    caseIntelligenceResult,
    timelineEventsResult,
    documentsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("case_intelligence")
      .select("*")
      .eq("case_id", resolvedCaseId)
      .eq("user_id", clientUserId)
      .maybeSingle(),
    supabaseAdmin
      .from("case_timeline_events")
      .select("*")
      .eq("case_id", resolvedCaseId)
      .eq("user_id", clientUserId)
      .order("event_date", { ascending: true }),
    supabaseAdmin
      .from("documents")
      .select("*")
      .eq("case_id", resolvedCaseId)
      .eq("user_id", clientUserId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    case: caseRow,
    caseIntelligence: (caseIntelligenceResult.data as Record<string, unknown> | null) ?? null,
    caseTimelineEvents: (timelineEventsResult.data as Record<string, unknown>[] | null) ?? [],
    documents: (documentsResult.data as Record<string, unknown>[] | null) ?? [],
  };
}

export async function acceptConnection(
  connectionId: string,
  clientUserId: string,
): Promise<AttorneyClientConnection | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("attorney_client_connections")
    .update({
      status: "active",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("client_user_id", clientUserId)
    .select("*")
    .single();

  if (error || !data) return null;
  return mapConnection(data);
}

export async function revokeConnection(
  connectionId: string,
  userId: string,
): Promise<AttorneyClientConnection | null> {
  if (!supabaseAdmin) return null;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("attorney_client_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  if (existingError || !existing) return null;

  const canRevoke =
    existing.attorney_user_id === userId || existing.client_user_id === userId;

  if (!canRevoke) return null;

  const { data, error } = await supabaseAdmin
    .from("attorney_client_connections")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .select("*")
    .single();

  if (error || !data) return null;
  return mapConnection(data);
}
