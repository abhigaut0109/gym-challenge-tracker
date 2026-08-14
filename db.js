import { SUPABASE_URL, SUPABASE_ANON_KEY, CHALLENGE } from "./config.js";

export const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

let supabase = null;
let readyPromise = null;

function ready() {
  if (readyPromise) return readyPromise;
  if (DEMO_MODE) {
    readyPromise = Promise.resolve();
  } else {
    readyPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    });
  }
  return readyPromise;
}

// ---------------------------------------------------------------------------
// Local demo storage (used automatically when Supabase isn't configured)
// ---------------------------------------------------------------------------
const LS_KEY = "gc45_demo_v2";
const LS_CURRENT = "gc45_demo_current";

function uid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function seedDemoData() {
  const people = [
    ["riya@example.com", "Riya Sharma", "Squad Iron", true],
    ["vikram@example.com", "Vikram Rao", "Squad Iron", false],
    ["priya@example.com", "Priya Nair", "Squad Tempo", false],
    ["arjun@example.com", "Arjun Menon", "Squad Iron", false],
    ["sana@example.com", "Sana Qureshi", "Squad Dawn", false],
    ["meera@example.com", "Meera Iyer", "Squad Tempo", false],
    ["nikhil@example.com", "Nikhil Das", "Squad Dawn", false],
    ["kabir@example.com", "Kabir Shah", "Squad Tempo", false],
  ];
  const members = people.map(([email, name, squad, is_admin]) => ({
    id: uid(), email, password: "password123", name, squad, is_admin, created_at: new Date().toISOString(),
  }));
  const byEmail = Object.fromEntries(members.map((m) => [m.email, m.id]));

  const types = ["Weights", "Cardio", "Class", "Yoga", "Sport"];
  const thisMonday = mondayOf(new Date());
  const sessions = [];
  const patterns = {
    "riya@example.com": [50, 0, 55, 0, 0, 62, 0],
    "vikram@example.com": [55, 60, 48, 52, 53, 0, 0],
    "priya@example.com": [48, 50, 0, 46, 0, 55, 0],
    "arjun@example.com": [0, 0, 52, 0, 0, 0, 0],
    "sana@example.com": [45, 45, 45, 47, 0, 0, 50],
    "meera@example.com": [30, 0, 35, 0, 0, 0, 0],
    "nikhil@example.com": [50, 0, 0, 0, 0, 0, 0],
    "kabir@example.com": [60, 55, 0, 58, 0, 40, 0],
  };
  for (let w = 3; w >= 0; w--) {
    const monday = addDays(thisMonday, -7 * w);
    for (const [email, pattern] of Object.entries(patterns)) {
      pattern.forEach((mins, i) => {
        const date = addDays(monday, i);
        if (date > new Date()) return;
        if (mins > 0) {
          sessions.push({
            id: uid(),
            member_id: byEmail[email],
            session_date: isoDate(date),
            minutes: mins,
            type: types[(i + w) % types.length],
            note: null,
            created_at: date.toISOString(),
          });
        }
      });
    }
  }

  const exclusions = [
    {
      id: uid(), member_id: byEmail["nikhil@example.com"], reason: "Travelling",
      from_date: isoDate(addDays(thisMonday, 2)), to_date: isoDate(addDays(thisMonday, 3)),
      note: "Client visit, Pune", status: "PENDING", created_at: new Date().toISOString(),
    },
    {
      id: uid(), member_id: byEmail["riya@example.com"], reason: "Not well",
      from_date: isoDate(addDays(thisMonday, -18)), to_date: isoDate(addDays(thisMonday, -18)),
      note: null, status: "APPROVED", created_at: new Date().toISOString(),
    },
  ];

  const holidays = [
    { holiday_date: "2026-08-15", name: "Independence Day", tag: "national" },
    { holiday_date: "2026-08-26", name: "Janmashtami", tag: "regional" },
    { holiday_date: "2026-10-02", name: "Gandhi Jayanti", tag: "national" },
    { holiday_date: "2026-10-20", name: "Diwali", tag: "national" },
  ];

  return { members, sessions, exclusions, holidays };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* fall through to reseed */
  }
  const seeded = seedDemoData();
  saveLocal(seeded);
  return seeded;
}
function saveLocal(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function assertPassword(password) {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}
function stripPassword(m) {
  if (!m) return m;
  const { password, ...rest } = m;
  return rest;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signUp({ name, email, password, squad }) {
  await ready();
  email = email.trim().toLowerCase();
  assertPassword(password);
  if (!name.trim()) throw new Error("Enter your name.");

  if (DEMO_MODE) {
    const db = loadLocal();
    if (db.members.some((m) => m.email === email)) {
      throw new Error("An account with that email already exists — sign in instead.");
    }
    const member = {
      id: uid(), email, password, name: name.trim(), squad, is_admin: false, created_at: new Date().toISOString(),
    };
    db.members.push(member);
    saveLocal(db);
    localStorage.setItem(LS_CURRENT, member.id);
    return { member: stripPassword(member), needsConfirmation: false };
  }

  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { name: name.trim(), squad } },
  });
  if (error) throw error;
  if (!data.session) {
    // Email confirmation is still required on this Supabase project.
    return { member: null, needsConfirmation: true };
  }
  const member = await ensureMemberRow(data.user, { name: name.trim(), squad });
  return { member, needsConfirmation: false };
}

export async function signIn({ email, password }) {
  await ready();
  email = email.trim().toLowerCase();

  if (DEMO_MODE) {
    const db = loadLocal();
    const member = db.members.find((m) => m.email === email);
    if (!member || member.password !== password) {
      throw new Error("Invalid email or password.");
    }
    localStorage.setItem(LS_CURRENT, member.id);
    return stripPassword(member);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return await ensureMemberRow(data.user);
}

export async function signOut() {
  await ready();
  if (DEMO_MODE) {
    localStorage.removeItem(LS_CURRENT);
    return;
  }
  await supabase.auth.signOut();
}

export async function getCurrentMember() {
  await ready();
  if (DEMO_MODE) {
    const id = localStorage.getItem(LS_CURRENT);
    if (!id) return null;
    const db = loadLocal();
    return stripPassword(db.members.find((m) => m.id === id)) || null;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return await ensureMemberRow(data.session.user);
}

// Creates the `members` row for a Supabase-Auth user the first time we see
// them signed in (covers both "confirmation disabled" signups and the
// first login after clicking an email confirmation link).
async function ensureMemberRow(user, fallback) {
  const { data: existing, error: selErr } = await supabase.from("members").select("*").eq("id", user.id).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const name = fallback?.name || user.user_metadata?.name || user.email.split("@")[0];
  const squad = fallback?.squad || user.user_metadata?.squad || CHALLENGE.squads[0];
  const { data, error } = await supabase
    .from("members")
    .insert({ id: user.id, email: user.email, name, squad, is_admin: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Lets an admin create an account for a friend without logging themselves
// out. Signing up on the main `supabase` client would replace the admin's
// own active session with the new user's — instead this uses a throwaway
// client with persistSession/autoRefreshToken off, so nothing here ever
// touches the admin's stored session. No service_role key involved; this
// only ever does what a normal signup does, just on the admin's behalf.
export async function adminCreateAccount({ name, email, password, squad }) {
  await ready();
  email = email.trim().toLowerCase();
  assertPassword(password);
  if (!name.trim()) throw new Error("Enter a name.");

  if (DEMO_MODE) {
    const db = loadLocal();
    if (db.members.some((m) => m.email === email)) {
      throw new Error("An account with that email already exists.");
    }
    const member = {
      id: uid(), email, password, name: name.trim(), squad, is_admin: false, created_at: new Date().toISOString(),
    };
    db.members.push(member);
    saveLocal(db);
    return stripPassword(member);
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await tempClient.auth.signUp({
    email, password, options: { data: { name: name.trim(), squad } },
  });
  if (error) throw error;
  if (!data.session) {
    throw new Error(
      "Account created, but this Supabase project still requires email confirmation. " +
      "Turn that off in Authentication → Providers → Email so accounts you create here can sign in immediately."
    );
  }
  const { data: memberRow, error: insErr } = await tempClient
    .from("members")
    .insert({ id: data.user.id, email: data.user.email, name: name.trim(), squad, is_admin: false })
    .select()
    .single();
  if (insErr) throw insErr;
  return memberRow;
}

// ---------------------------------------------------------------------------
// Public data API
// ---------------------------------------------------------------------------

export async function listMembers() {
  await ready();
  if (DEMO_MODE) return loadLocal().members.map(stripPassword);
  const { data, error } = await supabase.from("members").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function logSession({ memberId, date, minutes, type, note }) {
  await ready();
  if (DEMO_MODE) {
    const db = loadLocal();
    const session = {
      id: uid(), member_id: memberId, session_date: date, minutes, type,
      note: note || null, created_at: new Date().toISOString(),
    };
    db.sessions.push(session);
    saveLocal(db);
    return session;
  }
  const { data, error } = await supabase
    .from("sessions")
    .insert({ member_id: memberId, session_date: date, minutes, type, note: note || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listSessions() {
  await ready();
  if (DEMO_MODE) return [...loadLocal().sessions];
  const { data, error } = await supabase.from("sessions").select("*");
  if (error) throw error;
  return data;
}

export async function updateSession(id, { date, minutes, type, note }) {
  await ready();
  if (DEMO_MODE) {
    const db = loadLocal();
    const s = db.sessions.find((ss) => ss.id === id);
    if (!s) throw new Error("Session not found.");
    s.session_date = date;
    s.minutes = minutes;
    s.type = type;
    s.note = note || null;
    saveLocal(db);
    return s;
  }
  const { data, error } = await supabase
    .from("sessions")
    .update({ session_date: date, minutes, type, note: note || null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSession(id) {
  await ready();
  if (DEMO_MODE) {
    const db = loadLocal();
    db.sessions = db.sessions.filter((s) => s.id !== id);
    saveLocal(db);
    return;
  }
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function requestExclusion({ memberId, reason, from, to, note }) {
  await ready();
  if (DEMO_MODE) {
    const db = loadLocal();
    const exclusion = {
      id: uid(), member_id: memberId, reason, from_date: from, to_date: to,
      note: note || null, status: "PENDING", created_at: new Date().toISOString(),
    };
    db.exclusions.push(exclusion);
    saveLocal(db);
    return exclusion;
  }
  const { data, error } = await supabase
    .from("exclusions")
    .insert({ member_id: memberId, reason, from_date: from, to_date: to, note: note || null, status: "PENDING" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listExclusions() {
  await ready();
  if (DEMO_MODE) return [...loadLocal().exclusions];
  const { data, error } = await supabase.from("exclusions").select("*");
  if (error) throw error;
  return data;
}

export async function setExclusionStatus(id, status) {
  await ready();
  if (DEMO_MODE) {
    const db = loadLocal();
    const ex = db.exclusions.find((e) => e.id === id);
    if (ex) ex.status = status;
    saveLocal(db);
    return ex;
  }
  const { data, error } = await supabase.from("exclusions").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function removeExclusion(id) {
  await ready();
  if (DEMO_MODE) {
    const db = loadLocal();
    db.exclusions = db.exclusions.filter((e) => e.id !== id);
    saveLocal(db);
    return;
  }
  const { error } = await supabase.from("exclusions").delete().eq("id", id);
  if (error) throw error;
}

export async function setMemberAdmin(id, isAdmin) {
  await ready();
  if (DEMO_MODE) {
    const db = loadLocal();
    const m = db.members.find((mm) => mm.id === id);
    if (m) m.is_admin = isAdmin;
    saveLocal(db);
    return stripPassword(m);
  }
  const { data, error } = await supabase.from("members").update({ is_admin: isAdmin }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function listHolidays() {
  await ready();
  if (DEMO_MODE) return [...loadLocal().holidays];
  const { data, error } = await supabase.from("holidays").select("*").order("holiday_date");
  if (error) throw error;
  return data;
}

export async function resetDemoData() {
  await ready();
  if (DEMO_MODE) {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_CURRENT);
    return;
  }
  await supabase.from("sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("exclusions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
