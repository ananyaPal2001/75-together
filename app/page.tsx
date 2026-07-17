"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { Challenge, createChallenge, getChallengeMembers, getDailyCheckins, getDayMedia, getJournalEntries, getMyChallenges, getTaskStatuses, joinChallenge, Member, removeChallenge, renameChallenge, saveJournal, savePreferredName, saveTaskStatus, submitDailyCheckin, uploadJournalMedia } from "../lib/data";

type View = "welcome" | "setup" | "dashboard" | "journal" | "summary";

const PROMPTS = [
  "What nearly made you give up today?",
  "My day today looked like...",
  "What are you quietly proud of today?",
  "What did discipline look like today?",
];

const TASK_KEYS = ["diet","workout-1","outdoor-workout","water","read","progress-photo"];

function isHeic(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type);
}

async function browserReadyImage(file: File) {
  if (!isHeic(file)) return file;
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

function todayISO() { return new Date().toLocaleDateString("en-CA"); }
function challengeDay(challenge: Challenge | null) {
  if (!challenge) return 1;
  const start = new Date(`${challenge.start_date}T00:00:00`);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.min(75, Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1));
}
function dateForDay(challenge: Challenge | null, day: number) {
  if (!challenge) return new Date();
  const date = new Date(`${challenge.start_date}T12:00:00`); date.setDate(date.getDate() + day - 1); return date;
}

function Brand() {
  return (
    <div className="brand" aria-label="Seventy Five">
      <span>Seventy Five</span>
      <small>A shared commitment</small>
    </div>
  );
}

function Avatar({ name, dark = false }: { name: string; dark?: boolean }) {
  return <span className={`avatar ${dark ? "dark" : ""}`}>{name[0]}</span>;
}

function AccountMenu({ session, me, partner, onProfileChange, onNewChallenge, onSignOut }: { session: Session | null; me?: Member; partner?: Member; onProfileChange: () => void; onNewChallenge: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const update = async () => { if (!name.trim()) return; await savePreferredName(name); setSaved(true); onProfileChange(); setTimeout(() => setSaved(false), 1500); };
  const displayName = me?.display_name ?? session?.user.user_metadata?.full_name ?? session?.user.email?.split("@")[0] ?? "You";
  return <div className="profile-wrap" ref={wrap}>
    <button className={`profile-pill ${open?"menu-active":""}`} onClick={() => { setName(displayName); setOpen((value) => !value); }}><span className="avatar-stack"><Avatar name={displayName} />{partner && <Avatar name={partner.display_name} dark />}</span>{displayName}{partner ? ` & ${partner.display_name}` : ""}<span>⌄</span></button>
    {open && <div className="profile-menu">
      <div className="profile-menu-head"><Avatar name={displayName} /><div><strong>{displayName}</strong><span>{session?.user.email}</span></div></div>
      <label>Preferred name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button className="save-profile" onClick={update}>{saved ? "Saved ✓" : "Save preferred name"}</button>
      <div className="profile-menu-actions"><button onClick={() => { setOpen(false); onNewChallenge(); }}>Start another challenge</button><button onClick={onSignOut}>Sign out</button></div>
    </div>}
  </div>;
}

function Welcome({ onContinue, session, onSignOut }: { onContinue: () => void; session: Session | null; onSignOut: () => void }) {
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const signInEmail = async () => {
    const supabase = getSupabase();
    if (!supabase) return setAuthMessage("Supabase connection is being configured.");
    if (!email.trim()) return setAuthMessage("Enter your email address first.");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
    setAuthMessage(error ? error.message : "Check your inbox for the sign-in link.");
  };
  return (
    <main className="welcome-shell">
      <header className="simple-header"><Brand />{session ? <AccountMenu session={session} onProfileChange={() => undefined} onNewChallenge={onContinue} onSignOut={onSignOut} /> : <span className="private-pill">Private by design</span>}</header>
      <section className="welcome-grid">
        <div className="welcome-copy">
          <p className="eyebrow">75 days. Two people. One promise.</p>
          <h1>Show up for yourself.<br /><em>Together.</em></h1>
          <p className="lede">A quiet place to track the hard days, celebrate the small wins, and keep every memory you make along the way.</p>
          {session ? <button className="primary-btn" onClick={onContinue}>Continue as {session.user.user_metadata?.full_name ?? session.user.email?.split("@")[0]} <span>→</span></button> : isSupabaseConfigured ? <div className="auth-box">
            <p className="signin-title">Sign in with a private email link</p>
            <div className="email-signin"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /><button onClick={signInEmail}>Send link</button></div>
            {authMessage && <p className="auth-message">{authMessage}</p>}
          </div> : <button className="primary-btn" onClick={onContinue}>Explore the prototype <span>→</span></button>}
          <p className="tiny">By continuing, you agree to be honest—with yourself and each other.</p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="paper-note note-one"><span>Day 01</span><strong>The promise</strong><p>“We start, even if we’re not ready.”</p></div>
          <div className="paper-note note-two"><span>Day 75</span><strong>The becoming</strong><p>“Look how far we came.”</p></div>
          <svg className="journey-line journey-curve" viewBox="0 0 600 560" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 286 210 C 405 125, 555 175, 474 274 C 410 352, 185 224, 207 344 C 220 417, 292 408, 334 344" />
            <circle cx="286" cy="210" r="7" />
            <circle cx="405" cy="166" r="6" />
            <circle cx="490" cy="232" r="6" />
            <circle cx="342" cy="302" r="6" />
            <circle cx="213" cy="339" r="6" />
            <circle cx="258" cy="397" r="6" />
            <circle cx="334" cy="344" r="7" />
          </svg>
          <p className="script-line">one day at a time</p>
        </div>
      </section>
    </main>
  );
}

function Setup({ onDone, session, onSignOut }: { onDone: (challenge?: Challenge) => void; session: Session | null; onSignOut: () => void }) {
  const inviteFromUrl = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("invite")?.toUpperCase() ?? "";
  const [mode, setMode] = useState<"create" | "join">(inviteFromUrl ? "join" : "create");
  const [start, setStart] = useState(todayISO());
  const [name, setName] = useState("Our 75 Day Challenge");
  const [preferredName, setPreferredName] = useState(session?.user.user_metadata?.full_name ?? session?.user.email?.split("@")[0] ?? "");
  const [code, setCode] = useState(inviteFromUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useMemo(() => {
    const date = new Date(`${start}T12:00:00`);
    date.setDate(date.getDate() + 74);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }, [start]);
  const submit = async () => {
    if (!session || !isSupabaseConfigured) return onDone();
    setBusy(true); setError("");
    try {
      if (!preferredName.trim()) throw new Error("Tell us what you would like your friend to call you.");
      await savePreferredName(preferredName);
      onDone(mode === "create" ? await createChallenge(name, start) : await joinChallenge(code));
    }
    catch (e) {
      const failure = e as { message?: string; details?: string; hint?: string };
      setError([failure?.message, failure?.details, failure?.hint].filter(Boolean).join(" · ") || "Something went wrong.");
    }
    finally { setBusy(false); }
  };
  return (
    <main className="setup-shell">
      <header className="simple-header"><Brand /><AccountMenu session={session} onProfileChange={() => undefined} onNewChallenge={() => undefined} onSignOut={onSignOut} /></header>
      <section className="setup-card">
        <p className="eyebrow">Welcome</p>
        <h1>How will your journey begin?</h1>
        <div className="mode-tabs">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Create a challenge</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>Join a friend</button>
        </div>
        <div className="form-stack name-step"><label>Your preferred name<input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="What should your friend call you?" /></label></div>
        {mode === "create" ? (
          <div className="form-stack">
            <label>Challenge name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="date-row">
              <label>Starting on<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label>Finishing on<div className="computed-date">{end}</div></label>
            </div>
            <div className="rules-preview"><span>Official daily commitments</span><strong>5 rules · every day · no missed days</strong><small>Two workouts are tracked separately inside the workout rule.</small></div>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-btn" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create our challenge"} <span>→</span></button>
          </div>
        ) : (
          <div className="form-stack join-box">
            <label>Invitation code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. BLOOM75" /></label>
            <p>Paste the invitation code your friend sent you. Their dates and commitments will appear before you accept.</p>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-btn" disabled={busy} onClick={submit}>{busy ? "Finding…" : "Find challenge"} <span>→</span></button>
          </div>
        )}
      </section>
    </main>
  );
}

function ProgressRing({ value, coral = false }: { value: number; coral?: boolean }) {
  return <span className={`ring ${coral ? "coral" : ""}`} style={{ "--value": `${value * 3.6}deg` } as React.CSSProperties}><b>{value}%</b></span>;
}

function Dashboard({ onOpenJournal, challenge, challenges, members, session, onNewChallenge, onChallengeChange, onChallengeRemoved, onProfileChange, onSignOut }: { onOpenJournal: (day: number) => void; challenge: Challenge | null; challenges: Challenge[]; members: Member[]; session: Session | null; onNewChallenge: () => void; onChallengeChange: (challenge: Challenge) => void; onChallengeRemoved: (challengeId:string) => void; onProfileChange: () => void; onSignOut: () => void }) {
  const currentDay = challengeDay(challenge);
  const [rows, setRows] = useState<Array<{user_id:string;day_number:number;task_key:string;is_complete:boolean;progress_value:number}>>([]);
  const [checkins, setCheckins] = useState<Array<{user_id:string;day_number:number;submitted_at:string}>>([]);
  const [celebrating, setCelebrating] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(challenge?.name ?? "");
  const [copied, setCopied] = useState(false);
  const [userId, setUserId] = useState(session?.user.id ?? "");
  const [removingId, setRemovingId] = useState("");
  const [challengeMessage, setChallengeMessage] = useState("");
  useEffect(() => {
    if (!challenge || !isSupabaseConfigured) return;
    setUserId(session?.user.id ?? "");
    getTaskStatuses(challenge.id).then(setRows).catch(() => undefined);
    getDailyCheckins(challenge.id).then(setCheckins).catch(() => undefined);
  }, [challenge, session?.user.id]);
  const mine = TASK_KEYS.map((key) => Boolean(rows.find((row) => row.user_id === userId && row.day_number === currentDay && row.task_key === key)?.is_complete));
  const me = members.find((member) => member.user_id === userId) ?? members[0];
  const partner = members.find((member) => member.user_id !== userId);
  const completed = Number(mine[0]) + Number(mine[1] && mine[2]) + Number(mine[3]) + Number(mine[4]) + Number(mine[5]);
  const partnerChecks = partner ? TASK_KEYS.map((key) => rows.some((row) => row.user_id === partner.user_id && row.day_number === currentDay && row.task_key === key && row.is_complete)) : [];
  const partnerCompleted = partner ? Number(partnerChecks[0]) + Number(partnerChecks[1] && partnerChecks[2]) + Number(partnerChecks[3]) + Number(partnerChecks[4]) + Number(partnerChecks[5]) : 0;
  const waterGlasses = Number(rows.find((row) => row.user_id === userId && row.day_number === currentDay && row.task_key === "water")?.progress_value ?? 0);
  const toggle = async (i: number) => {
    if (!challenge) return;
    const next = !mine[i];
    setRows((old) => [...old.filter((row) => !(row.user_id === userId && row.day_number === currentDay && row.task_key === TASK_KEYS[i])), {user_id:userId,day_number:currentDay,task_key:TASK_KEYS[i],is_complete:next,progress_value:next?10:0}]);
    try { await saveTaskStatus(challenge.id, currentDay, TASK_KEYS[i], next); }
    catch (error) {
  console.error("Diet update failed:", error);

  const message =
    error instanceof Error
      ? error.message
      : JSON.stringify(error);

  setCheckinMessage(`Could not save checklist: ${message}`);
  getTaskStatuses(challenge.id).then(setRows);
}
  };
  const changeWater = async (nextValue: number) => {
    if (!challenge) return;
    const value = Math.max(0, Math.min(10, nextValue));
    setRows((old) => [...old.filter((row) => !(row.user_id === userId && row.day_number === currentDay && row.task_key === "water")), {user_id:userId,day_number:currentDay,task_key:"water",is_complete:value===10,progress_value:value}]);
    try { await saveTaskStatus(challenge.id,currentDay,"water",value===10,value); }
    catch { getTaskStatuses(challenge.id).then(setRows); }
  };
  const saveName = async () => { if (!challenge || !draftName.trim()) return; const updated = await renameChallenge(challenge.id, draftName); onChallengeChange(updated); setEditingName(false); };
  const copyInvite = async () => { if (!challenge) return; await navigator.clipboard.writeText(challenge.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const copyInviteLink = async () => { if (!challenge) return; const link = `${window.location.href}/?invite=${challenge.invite_code}`; await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const today = dateForDay(challenge, currentDay);
  const progress = Math.round(currentDay / 75 * 100);
  const finishDay = async () => {
    if (!challenge) return;
    if (completed < 5) { setCheckinMessage(`Complete ${5-completed} remaining ${5-completed===1?"rule":"rules"} before calling it a day.`); return; }
    try {
      const saved = await submitDailyCheckin(challenge.id,currentDay);
      setCheckins((old) => [...old.filter((entry) => !(entry.user_id===userId&&entry.day_number===currentDay)), saved]);
      setCheckinMessage(""); setCelebrating(true);
    } catch (error) { setCheckinMessage(error instanceof Error ? error.message : "Could not finish today’s check-in."); }
  };
  const removeFromList = async (item:Challenge) => {
    const confirmed = window.confirm(`Remove “${item.name}”?\n\nIf you created it, this permanently deletes it for both participants. If you joined it, you will leave the challenge.`);
    if (!confirmed) return;
    setRemovingId(item.id); setChallengeMessage("");
    try { const result=await removeChallenge(item.id); onChallengeRemoved(item.id); setChallengeMessage(result==="deleted"?"Challenge deleted.":"You left the challenge."); }
    catch(error) { setChallengeMessage(error instanceof Error?error.message:"Could not remove this challenge."); }
    finally { setRemovingId(""); }
  };
  return (
    <main className="dashboard-shell">
      <header className="app-header">
        <Brand />
        <nav><button className="active">Journey</button><button onClick={() => onOpenJournal(currentDay)}>Journal</button></nav>
        <AccountMenu session={session} me={me} partner={partner} onProfileChange={onProfileChange} onNewChallenge={onNewChallenge} onSignOut={onSignOut} />
      </header>
      <section className="challenge-toolbar">
        <div className="challenge-identity"><span className="challenge-flourish" aria-hidden="true">✦</span><div><small>Current challenge</small>{editingName ? <span className="challenge-edit"><input value={draftName} onChange={(e) => setDraftName(e.target.value)} /><button onClick={saveName}>Save</button></span> : <span className="challenge-title"><strong>{challenge?.name}</strong><button aria-label="Rename challenge" title="Rename challenge" onClick={() => { setDraftName(challenge?.name ?? ""); setEditingName(true); }}>✎</button></span>}</div></div>
        <div className="invite-code"><span>Friend joins with</span><b>{challenge?.invite_code}</b><button onClick={copyInvite}>Copy code</button><button onClick={copyInviteLink}>{copied ? "Copied ✓" : "Copy invite link"}</button></div>
        <button className="new-challenge" onClick={onNewChallenge}>＋ Start another challenge</button>
      </section>
      <section className="challenge-switcher" aria-label="My ongoing challenges">
        <div className="challenge-switcher-heading"><div><small>Your commitments</small><h2>My ongoing challenges</h2></div><span>{challenges.length} active</span></div>
        <div className="challenge-list">{challenges.map((item)=>{ const active=item.id===challenge?.id; const dayNumber=challengeDay(item); return <div className="challenge-list-item" key={item.id}><button className={`challenge-select ${active?"selected":""}`} onClick={()=>onChallengeChange(item)}><span className="challenge-list-mark">{active?"✓":"→"}</span><span><strong>{item.name}</strong><small>{new Date(`${item.start_date}T12:00:00`).toLocaleDateString("en-IN",{day:"numeric",month:"short"})} – {new Date(`${item.end_date}T12:00:00`).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</small></span><b>{item.start_date>todayISO()?"Upcoming":`Day ${dayNumber}`}</b></button><button className="challenge-remove" disabled={removingId===item.id} onClick={()=>removeFromList(item)} aria-label={`Remove ${item.name}`} title="Remove challenge">{removingId===item.id?"…":"×"}</button></div>;})}</div>
        {challengeMessage&&<p className="challenge-message">{challengeMessage}</p>}
      </section>
      <section className="dashboard-grid">
        <div className="main-column">
          <div className="hero-row">
            <section className="day-hero">
              <h1>Day {currentDay} <i>of</i> 75</h1>
              <p>{75-currentDay} days to become who you said you would.</p>
              <div className="overall-progress"><strong>{progress}% complete</strong><span><i style={{width:`${progress}%`}} /></span></div>
            </section>
            <section className="friend-card">
              <div><Avatar name={me?.display_name ?? "You"} /><p><strong>{me?.display_name ?? "You"}</strong><span>{completed} of 5 rules complete</span></p><ProgressRing value={Math.round(completed / 5 * 100)} coral /></div>
              {partner ? <div><Avatar name={partner.display_name} dark /><p><strong>{partner.display_name}</strong><span>{partnerCompleted} of 5 rules complete</span></p><ProgressRing value={Math.round(partnerCompleted / 5 * 100)} /></div> : <div className="waiting-partner"><span>Waiting for your friend to join with <b>{challenge?.invite_code}</b></span></div>}
            </section>
          </div>
          <section className="calendar-card">
            <div className="calendar-grid">
              {Array.from({ length: 75 }, (_, i) => i + 1).map((day) => {
                const myDone = checkins.some((entry) => entry.user_id===userId&&entry.day_number===day);
                const partnerDone = partner ? checkins.some((entry) => entry.user_id===partner.user_id&&entry.day_number===day) : false;
                const missedByBoth = day < currentDay && !myDone && !partnerDone;
                return <button key={day} disabled={day>currentDay} aria-label={day>currentDay?`Day ${day}, locked until its date`:`Open day ${day}`} onClick={() => onOpenJournal(day)} className={`${day === currentDay ? "today" : ""} ${day < currentDay ? "past" : ""} ${missedByBoth?"missed":""}`}>
                  <span>{day}</span>
                  {missedByBoth ? <small className="missed-mark">×</small> : day <= currentDay && <small><i className={myDone ? "" : "empty-dot"} /><i className={partnerDone ? "dark-dot" : "empty-dot"} /></small>}
                  {day === currentDay && <em>Today</em>}
                </button>;
              })}
            </div>
            <div className="calendar-legend"><span><i /><i className="dark-dot" /> Both submitted</span><span><i className="mine-dot" /><i className="empty-dot" /> Only one submitted</span><span className="missed-legend">× &nbsp; Past day: neither submitted</span></div>
          </section>
        </div>
        <aside className="side-column">
          <section className="checklist-card">
            <div className="card-heading"><div><p>Today · Day {currentDay}</p><small>{today.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</small></div><span className="leaf">⌁</span></div>
            <div className="task-list">
              <button type="button" onClick={() => toggle(0)} className={mine[0] ? "done" : ""} aria-pressed={mine[0]}><i>{mine[0] ? "✓" : ""}</i><span><b>Follow a diet</b><small>No cheat meals or alcohol</small></span></button>
              <div className={`task-rule workout-rule ${mine[1]&&mine[2]?"done":""}`}><i>{mine[1]&&mine[2]?"✓":""}</i><span><b>Two 45-minute workouts</b><small>One workout must be outdoors</small><span className="workout-checks"><button onClick={() => toggle(1)} className={mine[1]?"selected":""}>{mine[1]?"✓ ":""}General</button><button onClick={() => toggle(2)} className={mine[2]?"selected":""}>{mine[2]?"✓ ":""}Outdoor</button></span></span></div>
              <div className={`task-rule water-rule ${mine[3]?"done":""}`}><i>{mine[3]?"✓":""}</i><span><b>Drink one gallon of water</b><small>{waterGlasses}/10 glasses · approximately 3.8 L</small><span className="water-progress"><button onClick={() => changeWater(waterGlasses-1)} aria-label="Remove one glass">−</button><span className="water-track">{Array.from({length:10},(_,i)=><i key={i} className={i<waterGlasses?"filled":""} />)}</span><button onClick={() => changeWater(waterGlasses+1)} aria-label="Add one glass">＋</button></span></span></div>
              <button onClick={() => toggle(4)} className={mine[4] ? "done" : ""}><i>{mine[4] ? "✓" : ""}</i><span><b>Read 10 pages</b><small>A nonfiction or personal-development book</small></span></button>
              <button onClick={() => toggle(5)} className={mine[5] ? "done" : ""}><i>{mine[5] ? "✓" : ""}</i><span><b>Take a progress photo</b><small>One photograph every day</small></span></button>
            </div>
            {checkinMessage && <p className="checkin-message">{checkinMessage}</p>}
            <button className="primary-btn" onClick={finishDay}>Let’s call it a day! <span>→</span></button>
          </section>
          <button className="journal-teaser" onClick={() => onOpenJournal(currentDay)}>
            <span className="teaser-photo">☀</span><div><em>Day {currentDay}, in your words.</em><p>Add a note or memory</p></div><b>＋</b>
          </button>
        </aside>
      </section>
      {celebrating && <div className="celebration-backdrop" onClick={() => setCelebrating(false)}><section className="celebration-sheet" onClick={(e) => e.stopPropagation()}><button className="celebration-close" onClick={() => setCelebrating(false)}>×</button><span className="celebration-mark">✓</span><p className="eyebrow">Day {currentDay} complete</p><h2>Congratulations,<br />you showed up.</h2><p>Both discipline and memory are built one ordinary day at a time.</p><button className="primary-btn" onClick={() => { setCelebrating(false); onOpenJournal(currentDay); }}>Add today’s memory <span>→</span></button></section></div>}
    </main>
  );
}

function DaySummary({ day, challenge, members, session, onBack, onProfileChange, onNewChallenge, onSignOut }: { day:number; challenge:Challenge|null; members:Member[]; session:Session|null; onBack:()=>void; onProfileChange:()=>void; onNewChallenge:()=>void; onSignOut:()=>void }) {
  const [tasks,setTasks] = useState<Array<{user_id:string;task_key:string;is_complete:boolean;progress_value:number}>>([]);
  const [entries,setEntries] = useState<Array<{user_id:string;body:string;published_at:string|null}>>([]);
  const [media,setMedia] = useState<Array<{user_id:string;media_type:string;url:string}>>([]);
  useEffect(() => {
    if (!challenge) return;
    Promise.all([getTaskStatuses(challenge.id,day),getJournalEntries(challenge.id,day),getDayMedia(challenge.id,day)])
      .then(([taskRows,journalRows,mediaRows]) => { setTasks(taskRows); setEntries(journalRows); setMedia(mediaRows); }).catch(() => undefined);
  },[challenge,day]);
  const userId = session?.user.id ?? "";
  const me = members.find((member)=>member.user_id===userId) ?? members[0];
  const partner = members.find((member)=>member.user_id!==userId);
  const summaryDate = dateForDay(challenge,day);
  const ruleStatus = (memberId:string) => {
    const done = (key:string) => tasks.some((task)=>task.user_id===memberId&&task.task_key===key&&task.is_complete);
    return [
      ["Diet followed",done("diet")],
      ["Two workouts completed",done("workout-1")&&done("outdoor-workout")],
      ["One gallon of water",done("water")],
      ["10 pages read",done("read")],
      ["Progress photo taken",done("progress-photo")],
    ] as Array<[string,boolean]>;
  };
  return <main className="summary-shell">
    <header className="app-header"><Brand /><button className="back-btn" onClick={onBack}>← Back to journey</button><AccountMenu session={session} me={me} partner={partner} onProfileChange={onProfileChange} onNewChallenge={onNewChallenge} onSignOut={onSignOut} /></header>
    <section className="summary-layout"><div className="summary-heading"><p className="eyebrow">Past day · Read only</p><h1>Day {day} together</h1><span>{summaryDate.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span></div>
      <div className="summary-people">{[me,partner].filter(Boolean).map((member,index)=> member && <article className="summary-person" key={member.user_id}><div className="entry-author"><Avatar name={member.display_name} dark={index===1}/><div><strong>{member.display_name}</strong><span>Daily record</span></div></div><div className="summary-rules">{ruleStatus(member.user_id).map(([label,done])=><div className={done?"complete":"incomplete"} key={label}><i>{done?"✓":"—"}</i><span>{label}</span></div>)}</div><div className="summary-photo-feed">{media.filter((item)=>item.user_id===member.user_id).map((item,index)=><img key={item.url} className="summary-media" src={item.url} alt={`${member.display_name}'s day ${day} memory ${index+1}`}/>)}</div><blockquote>{entries.find((entry)=>entry.user_id===member.user_id)?.body || "No journal reflection was added for this day."}</blockquote></article>)}</div>
    </section>
  </main>;
}

function Journal({ day, onBack, challenge, members, userId, session, onProfileChange, onNewChallenge, onSignOut, registerSave }: { day: number; onBack: () => void; challenge: Challenge | null; members: Member[]; userId: string; session: Session | null; onProfileChange: () => void; onNewChallenge: () => void; onSignOut: () => void; registerSave: (save: (() => Promise<void>) | null) => void }) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([]);
  const [publishedPhotos, setPublishedPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const me = members.find((member) => member.user_id === userId) ?? members[0];
  const partner = members.find((member) => member.user_id !== userId);
  const journalDate = dateForDay(challenge, day);
  useEffect(() => {
    if (!challenge || !isSupabaseConfigured) return;
    Promise.all([getJournalEntries(challenge.id, day),getDayMedia(challenge.id,day)]).then(([entries,media]) => {
      const own = entries.find((entry) => entry.user_id === userId);
      if (own) setText(own.body);
      setPublishedPhotos(media.filter((item)=>item.user_id===userId).map((item)=>item.url));
    }).catch(() => undefined);
  }, [challenge, day, userId]);
  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file)=>file.type.startsWith("image/") || isHeic(file));
    event.target.value = "";
    if (!files.length) return;
    setSaved("Preparing photos…");
    try {
      const ready = await Promise.all(files.map(browserReadyImage));
      setPhotos((current)=>[...current,...ready.map((file)=>({file,url:URL.createObjectURL(file)}))]);
      setSaved(ready.some((file,index)=>file !== files[index]) ? "HEIC photo converted and ready to publish." : "");
    } catch {
      setSaved("One of the selected HEIC photos could not be converted. Please try another photo.");
    }
  };
  const removePhoto = (url:string) => setPhotos((current)=>{ const target=current.find((photo)=>photo.url===url); if(target) URL.revokeObjectURL(target.url); return current.filter((photo)=>photo.url!==url); });
  const publish = async () => {
    if (!challenge || !isSupabaseConfigured) return setSaved("Prototype entry saved for this visit.");
    setSaving(true); setSaved("");
    try {
      await saveJournal(challenge.id, day, text);
      for (const photo of photos) await uploadJournalMedia(challenge.id, day, photo.file);
      const refreshed = await getDayMedia(challenge.id,day);
      setPublishedPhotos(refreshed.filter((item)=>item.user_id===userId).map((item)=>item.url));
      photos.forEach((photo)=>URL.revokeObjectURL(photo.url)); setPhotos([]);
      setSaved("Memory and photos published to your shared feed.");
    }
    catch (e) { setSaved(e instanceof Error ? e.message : "Could not publish this memory."); }
    finally { setSaving(false); }
  };
  registerSave(publish);
  return (
    <main className="journal-shell">
      <header className="app-header"><Brand /><button className="back-btn" onClick={onBack}>← Back to journey</button><AccountMenu session={session} me={me} partner={partner} onProfileChange={onProfileChange} onNewChallenge={onNewChallenge} onSignOut={onSignOut} /></header>
      <section className="journal-layout">
        <div className="journal-title"><p>Day {day} of 75</p><h1>{PROMPTS[day % PROMPTS.length]}</h1><span>{journalDate.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span></div>
        <div className="journal-columns">
          <article className="entry-paper">
            <div className="entry-author"><Avatar name={me?.display_name ?? "You"} /><div><strong>{me?.display_name ?? "Your"}’s entry</strong><span>Edited just now</span></div></div>
            {(publishedPhotos.length>0||photos.length>0) && <div className="photo-feed" aria-label="Day photo feed">{publishedPhotos.map((url,index)=><figure className="photo-tile published" key={url}><img src={url} alt={`Published memory ${index+1}`}/><figcaption>Published</figcaption></figure>)}{photos.map((photo,index)=><figure className="photo-tile" key={photo.url}><img src={photo.url} alt={`New memory ${index+1}`}/><button type="button" onClick={()=>removePhoto(photo.url)} aria-label={`Remove photo ${index+1}`}>×</button><figcaption>Ready to publish</figcaption></figure>)}</div>}
            <label className="photo-drop photo-picker">
              <b>＋</b><span>Add photos to today’s feed</span><small>Select several JPEG, PNG, WebP, HEIC, or HEIF images</small>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={pickPhoto} />
            </label>
            <label className="writing-label">Today’s reflection<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={PROMPTS[day % PROMPTS.length]} /></label>
            {saved && <p className="save-message">{saved}</p>}
            <div className="entry-actions"><button className="secondary-btn">Save draft</button><button className="primary-btn" disabled={saving} onClick={publish}>{saving ? "Publishing…" : "Publish memory"} <span>→</span></button></div>
          </article>
          <aside className="journal-aside">
            <section className="partner-entry">{partner ? <><div className="entry-author"><Avatar name={partner.display_name} dark /><div><strong>{partner.display_name}’s entry</strong><span>Shared with you</span></div></div><blockquote>Their reflection will appear here once published.</blockquote></> : <><p className="eyebrow">Your shared journal</p><blockquote>Invite your friend to see their memories beside yours.</blockquote></>}</section>
            <section className="day-summary"><p>Day {day} summary</p><div><span>{me?.display_name ?? "You"}</span><strong>— / 5</strong></div>{partner && <div><span>{partner.display_name}</span><strong>— / 5</strong></div>}<small>Both checklists remain editable until midnight.</small></section>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("welcome");
  const [day, setDay] = useState(18);
  const [session, setSession] = useState<Session | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const saveBeforeLeave = useRef<(() => Promise<void>) | null>(null);
  const navigate = (next: View, replace = false) => {
    setView(next);
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ view: next }, "", window.location.href);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    window.history.replaceState({ view: "welcome" }, "", window.location.href);
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || !isSupabaseConfigured) return;
    getMyChallenges().then((items) => {
      setChallenges(items);
      if (items[0]) { setChallenge(items[0]); navigate("dashboard"); }
    }).catch(() => undefined);
  }, [session]);
  useEffect(() => {
    if (!challenge) return;
    getChallengeMembers(challenge.id).then(setMembers).catch(() => setMembers([]));
  }, [challenge]);
  useEffect(() => {
    const handleBack = async (event: PopStateEvent) => {
      const target = (event.state?.view as View | undefined) ?? "welcome";
      if (view === "dashboard" || view === "journal") {
        const shouldLeave = window.confirm(view === "journal" ? "Save your journal changes and go back?" : "Your checklist changes are saved. Return to the sign-in page?");
        if (!shouldLeave) { window.history.go(1); return; }
        if (saveBeforeLeave.current) await saveBeforeLeave.current();
      }
      setView(target);
      window.scrollTo(0,0);
    };
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, [view]);
  useEffect(() => { if (view !== "journal") saveBeforeLeave.current = null; }, [view]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (view === "journal") event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [view]);
  const refreshMembers = () => { if (challenge) getChallengeMembers(challenge.id).then(setMembers).catch(() => undefined); };
  const signOut = async () => { await getSupabase()?.auth.signOut(); setSession(null); setChallenge(null); setChallenges([]); setMembers([]); navigate("welcome", true); };
  const refreshChallenges = async (preferred?:Challenge) => { const items=await getMyChallenges(); setChallenges(items); if(preferred) setChallenge(preferred); else if(!challenge&&items[0]) setChallenge(items[0]); };
  const openJournal = (selected: number) => { setDay(selected); navigate(selected < challengeDay(challenge) ? "summary" : "journal"); };
  const challengeRemoved = (challengeId:string) => { const remaining=challenges.filter((item)=>item.id!==challengeId); setChallenges(remaining); if(challenge?.id===challengeId) { setChallenge(remaining[0]??null); if(!remaining[0]) navigate("setup"); } };
  if (view === "welcome") return <Welcome session={session} onSignOut={signOut} onContinue={() => navigate("setup")} />;
  if (view === "setup") return <Setup session={session} onSignOut={signOut} onDone={(created) => { if (created) { setChallenge(created); refreshChallenges(created).catch(()=>undefined); } navigate("dashboard"); }} />;
  if (view === "summary") return <DaySummary challenge={challenge} members={members} session={session} day={day} onProfileChange={refreshMembers} onSignOut={signOut} onNewChallenge={() => { setChallenge(null); navigate("setup"); }} onBack={() => window.history.back()} />;
  if (view === "journal") return <Journal challenge={challenge} members={members} userId={session?.user.id ?? ""} session={session} onProfileChange={refreshMembers} onSignOut={signOut} onNewChallenge={() => { setChallenge(null); navigate("setup"); }} registerSave={(save) => { saveBeforeLeave.current = save; }} day={day} onBack={() => window.history.back()} />;
  return <Dashboard challenge={challenge} challenges={challenges} members={members} session={session} onProfileChange={refreshMembers} onSignOut={signOut} onChallengeChange={setChallenge} onChallengeRemoved={challengeRemoved} onNewChallenge={() => navigate("setup")} onOpenJournal={openJournal} />;
}
