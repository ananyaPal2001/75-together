import { getSupabase } from "./supabase";

export type Challenge = {
  id: string;
  name: string;
  invite_code: string;
  start_date: string;
  end_date: string;
};

export type Member = { user_id: string; role: "owner" | "partner"; display_name: string };

function db() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured yet.");
  return client;
}

export async function createChallenge(name: string, startDate: string) {
  const { data, error } = await db().rpc("create_challenge", {
    challenge_name: name,
    challenge_start: startDate,
  });
  if (error) throw error;
  return data as Challenge;
}

export async function joinChallenge(inviteCode: string) {
  const { data, error } = await db().rpc("join_challenge", {
    supplied_code: inviteCode.trim().toUpperCase(),
  });
  if (error) throw error;
  return data as Challenge;
}

export async function getMyChallenges() {
  const { data, error } = await db()
    .from("challenge_members")
    .select("challenges(id,name,invite_code,start_date,end_date)")
    .eq("status", "accepted")
    .order("joined_at", { ascending: false });
  if (error) throw error;
  const today = new Date().toLocaleDateString("en-CA");
  return data
    .map((row) => row.challenges as unknown as Challenge | null)
    .filter((challenge): challenge is Challenge => Boolean(challenge && challenge.end_date >= today));
}

export async function getMyChallenge() {
  return (await getMyChallenges())[0] ?? null;
}

export async function savePreferredName(displayName: string) {
  const client = db();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sign in before saving your name.");
  const { error } = await client.from("profiles").upsert({ id: auth.user.id, display_name: displayName.trim() });
  if (error) throw error;
}

export async function getChallengeMembers(challengeId: string) {
  const client = db();
  const { data: membership, error: memberError } = await client.from("challenge_members")
    .select("user_id,role").eq("challenge_id", challengeId).eq("status", "accepted");
  if (memberError) throw memberError;
  const ids = membership.map((member) => member.user_id);
  const { data: profiles, error: profileError } = await client.from("profiles")
    .select("id,display_name").in("id", ids);
  if (profileError) throw profileError;
  return membership.map((member) => ({
    ...member,
    display_name: profiles.find((profile) => profile.id === member.user_id)?.display_name || (member.role === "owner" ? "Challenge owner" : "Your partner"),
  })) as Member[];
}

export async function renameChallenge(challengeId: string, name: string) {
  const { data, error } = await db().from("challenges").update({ name: name.trim() }).eq("id", challengeId).select().single();
  if (error) throw error;
  return data as Challenge;
}

export async function getTaskStatuses(challengeId: string, dayNumber?: number) {
  let query = db().from("daily_task_status")
    .select("user_id,day_number,task_key,is_complete,progress_value")
    .eq("challenge_id", challengeId);
  if (dayNumber) query = query.eq("day_number", dayNumber);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getJournalEntries(challengeId: string, dayNumber: number) {
  const { data, error } = await db().from("journal_entries")
    .select("user_id,body,published_at")
    .eq("challenge_id", challengeId).eq("day_number", dayNumber);
  if (error) throw error;
  return data;
}

export async function getDayMedia(challengeId: string, dayNumber: number) {
  const client = db();
  const { data, error } = await client.from("journal_media")
    .select("user_id,storage_path,media_type").eq("challenge_id",challengeId).eq("day_number",dayNumber);
  if (error) throw error;
  return Promise.all(data.map(async (item) => {
    const { data: signed } = await client.storage.from("journal-media").createSignedUrl(item.storage_path,3600);
    return { ...item, url:signed?.signedUrl ?? "" };
  }));
}

export async function getDailyCheckins(challengeId: string) {
  const { data, error } = await db().from("daily_checkins").select("user_id,day_number,submitted_at").eq("challenge_id",challengeId);
  if (error) throw error;
  return data;
}

export async function submitDailyCheckin(challengeId: string, dayNumber: number) {
  const { data, error } = await db().from("daily_checkins").upsert({ challenge_id:challengeId,day_number:dayNumber }, { onConflict:"challenge_id,user_id,day_number" }).select().single();
  if (error) throw error;
  return data;
}

export async function saveTaskStatus(challengeId: string, dayNumber: number, taskKey: string, complete: boolean, progressValue = complete ? 10 : 0) {
  const { error } = await db().from("daily_task_status").upsert({
    challenge_id: challengeId,
    day_number: dayNumber,
    task_key: taskKey,
    is_complete: complete,
    progress_value: progressValue,
    completed_at: complete ? new Date().toISOString() : null,
  }, { onConflict: "challenge_id,user_id,day_number,task_key" });
  if (error) throw error;
}

export async function saveJournal(challengeId: string, dayNumber: number, body: string) {
  const { data, error } = await db().from("journal_entries").upsert({
    challenge_id: challengeId,
    day_number: dayNumber,
    body,
    published_at: new Date().toISOString(),
  }, { onConflict: "challenge_id,user_id,day_number" }).select().single();
  if (error) throw error;
  return data;
}

export async function uploadJournalMedia(challengeId: string, dayNumber: number, file: File) {
  const client = db();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sign in before uploading media.");
  if (!file.type.startsWith("image/")) throw new Error("Only image uploads are supported.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${challengeId}/${auth.user.id}/day-${dayNumber}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await client.storage.from("journal-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { error } = await client.from("journal_media").insert({
    challenge_id: challengeId,
    day_number: dayNumber,
    storage_path: path,
    media_type: file.type,
    file_size: file.size,
  });
  if (error) throw error;
  return path;
}
