import * as db from "./db.js";
import { CHALLENGE } from "./config.js";

const root = document.getElementById("root");
const GREEN = "#2f6d4f", AMBER = "#e8b45c", PALE = "#a8d4bb", DARK = "#17160f";
const AVATAR_PAIRS = [
  ["#e4ece6", "#2f6d4f"], ["#f2e6cf", "#8a6420"], ["#e6e9f0", "#3d4a63"],
  ["#efe4e4", "#7a3f3f"], ["#e8ecdf", "#4e6321"],
];

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const state = {
  screen: "login",
  loading: true,
  error: "",
  info: "",
  currentMemberId: "",
  authView: "signin", // 'signin' | 'signup'
  signInEmail: "",
  signInPassword: "",
  joinName: "",
  joinEmail: "",
  joinPassword: "",
  joinSquad: CHALLENGE.squads[0],
  tab: "home",
  logOpen: false,
  editingSessionId: null,
  logDate: "",
  dur: CHALLENGE.minMinutes,
  types: [CHALLENGE.sessionTypes[0]],
  note: "",
  range: "This week",
  customFrom: "",
  customTo: "",
  homeRange: "This week",
  homeCustomFrom: "",
  homeCustomTo: "",
  squadFilter: "All squads",
  reason: CHALLENGE.exclusionReasons[0],
  excFrom: "",
  excTo: "",
  excNote: "",
  newMemberName: "",
  newMemberEmail: "",
  newMemberPassword: generatePassword(),
  newMemberSquad: CHALLENGE.squads[0],
  createdCredentials: null,
  members: [],
  sessions: [],
  exclusions: [],
  holidays: [],
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}
function monthsSpanned(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
}
function fmtShort(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonth(d) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtMins(n) {
  return `${n} min${n === 1 ? "" : "s"}`;
}
// Pixel height (not percentage — percentage heights through nested flex
// columns don't reliably resolve), color, and a trophy flag for a single
// day's bar in the personal bar chart. Amber under the valid-session
// threshold, green at or above it, plus a trophy for a standout day.
function barVisual(value, maxValue, maxPx) {
  const heightPx = value > 0 ? Math.max(3, Math.round((value / maxValue) * maxPx)) : 2;
  const color = value <= 0 ? "#e3e1da" : value < CHALLENGE.minMinutes ? AMBER : GREEN;
  const trophy = value > 60;
  return { heightPx, color, trophy };
}
function dowShort(d) {
  return d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}
function initialsOf(name) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase();
}
function avatarOf(index) {
  return AVATAR_PAIRS[index % AVATAR_PAIRS.length];
}
function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}
function dateList(from, to) {
  const out = [];
  let d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  let guard = 0;
  while (d <= end && guard < 400) {
    out.push(new Date(d));
    d = addDays(d, 1);
    guard++;
  }
  return out;
}
function challengeStart() {
  return parseISO(CHALLENGE.startDate);
}

// ---------------------------------------------------------------------------
// derived / business logic
// ---------------------------------------------------------------------------
function holidaySet() {
  return new Set(state.holidays.map((h) => h.holiday_date));
}
function isHoliday(iso) {
  return holidaySet().has(iso);
}
function isApprovedExclusion(memberId, iso) {
  return state.exclusions.some(
    (e) => e.member_id === memberId && e.status === "APPROVED" && iso >= e.from_date && iso <= e.to_date
  );
}
function isExcludedDay(memberId, iso) {
  return isHoliday(iso) || isApprovedExclusion(memberId, iso);
}
function dailyMinutesMap(memberId) {
  const map = {};
  for (const s of state.sessions) {
    if (s.member_id !== memberId) continue;
    map[s.session_date] = (map[s.session_date] || 0) + s.minutes;
  }
  return map;
}

// The base target (before personal exclusions) for a given calendar month:
// the full monthly target, except the challenge's first month, which is
// prorated from the kickoff date, and any month before the challenge
// started, which has no target at all.
function baseTargetForMonth(monthStart) {
  const start = challengeStart();
  const startMonth = startOfMonth(start);
  if (monthStart.getTime() < startMonth.getTime()) return 0;
  if (monthStart.getTime() > startMonth.getTime()) return CHALLENGE.monthlyTargetDays;
  const daysInMonth = endOfMonth(monthStart).getDate();
  const eligibleDays = daysInMonth - start.getDate() + 1;
  return Math.max(0, Math.ceil(CHALLENGE.monthlyTargetDays * eligibleDays / daysInMonth));
}

// The target shown in shared, member-agnostic captions: the base target
// minus public holidays (which apply to everyone), but not anyone's
// personal exclusions — those vary per member, so they're only reflected
// in that member's own effectiveTarget.
function sharedEffectiveTarget(monthStart) {
  const base = baseTargetForMonth(monthStart);
  const start = challengeStart();
  const monthEnd = endOfMonth(monthStart);
  let holidayCount = 0;
  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    if (date.getTime() < start.getTime()) continue;
    if (isHoliday(isoDate(date))) holidayCount++;
  }
  return Math.max(0, base - holidayCount);
}

// Progress toward the monthly challenge target for one calendar month.
function computeMonthProgress(memberId, monthStart) {
  const min = CHALLENGE.minMinutes;
  const start = challengeStart();
  const baseTarget = baseTargetForMonth(monthStart);
  const dm = dailyMinutesMap(memberId);
  const monthEnd = endOfMonth(monthStart);
  const totalDaysInMonth = monthEnd.getDate();
  let doneDays = 0, excusedCount = 0, personalExcusedCount = 0, totalMinutes = 0;
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    if (date.getTime() < start.getTime()) continue; // before the challenge existed
    const iso = isoDate(date);
    const mins = dm[iso] || 0;
    totalMinutes += mins;
    const holiday = isHoliday(iso);
    const excused = holiday || isApprovedExclusion(memberId, iso);
    if (excused) {
      excusedCount++;
      if (!holiday) personalExcusedCount++;
    } else if (mins >= min) {
      doneDays++;
    }
  }
  const effectiveTarget = Math.max(0, baseTarget - excusedCount);
  const won = baseTarget > 0 && doneDays >= effectiveTarget;
  return { doneDays, excusedCount, personalExcusedCount, baseTarget, effectiveTarget, totalMinutes, won, monthStart, monthEnd };
}

function computeStreak(memberId) {
  const today = todayDate();
  const startMonth = startOfMonth(challengeStart());
  let cursor = startOfMonth(today);
  if (today < endOfMonth(cursor)) cursor = addMonths(cursor, -1);
  let count = 0;
  while (count < 60 && cursor.getTime() >= startMonth.getTime()) {
    const view = computeMonthProgress(memberId, cursor);
    if (!view.won) break;
    count++;
    cursor = addMonths(cursor, -1);
  }
  return count;
}
function currentMonthSnapshot() {
  const monthStart = startOfMonth(todayDate());
  return state.members.map((m, i) => ({ member: m, index: i, view: computeMonthProgress(m.id, monthStart) }));
}
function computeRank(memberId) {
  const snap = currentMonthSnapshot();
  snap.sort((a, b) => (b.view.won - a.view.won) || (b.view.doneDays - a.view.doneDays) || (b.view.totalMinutes - a.view.totalMinutes));
  const idx = snap.findIndex((s) => s.member.id === memberId);
  return { rank: idx + 1, of: snap.length };
}
function hasWonCurrentMonth(memberId) {
  return computeMonthProgress(memberId, startOfMonth(todayDate())).won;
}

// Generic range resolver — used by both the Team Log filters and the Home
// dashboard's own range picker, each with their own bit of state.
function computeRangeBounds(rangeValue, customFrom, customTo) {
  const today = todayDate();
  switch (rangeValue) {
    case "This week":
      return { from: addDays(today, -6), to: today, label: "This week" };
    case "This month": {
      const from = startOfMonth(today);
      const end = endOfMonth(from);
      return { from, to: today < end ? today : end, label: "This month" };
    }
    case "This quarter": {
      const from = startOfQuarter(today);
      const end = endOfQuarter(from);
      return { from, to: today < end ? today : end, label: "This quarter" };
    }
    case "Full cycle":
      return { from: challengeStart(), to: today, label: "Full cycle" };
    case "Custom": {
      if (customFrom && customTo) return { from: parseISO(customFrom), to: parseISO(customTo), label: "Custom range" };
      return { from: addDays(today, -6), to: today, label: "Custom range" };
    }
    default:
      return { from: addDays(today, -6), to: today, label: "This week" };
  }
}
function rangeToDates() {
  return computeRangeBounds(state.range, state.customFrom, state.customTo);
}
function homeRangeToDates() {
  return computeRangeBounds(state.homeRange, state.homeCustomFrom, state.homeCustomTo);
}
function filteredMembers() {
  if (state.squadFilter === "All squads") return state.members;
  return state.members.filter((m) => m.squad === state.squadFilter);
}
function rowStatus(memberId, from, to) {
  const dates = dateList(from, to);
  const min = CHALLENGE.minMinutes;
  const dm = dailyMinutesMap(memberId);
  let cleared = 0, excused = 0, total = 0;
  for (const d of dates) {
    const iso = isoDate(d);
    const mins = dm[iso] || 0;
    total += mins;
    if (isExcludedDay(memberId, iso)) excused++;
    else if (mins >= min) cleared++;
  }
  if (dates.length <= 7) {
    return { total, cleared, excused, status: null };
  }
  const months = Math.max(1, monthsSpanned(from, to));
  const target = Math.max(0, CHALLENGE.monthlyTargetDays * months - excused);
  const ok = cleared >= target;
  const behind = cleared >= target - 2;
  return { total, cleared, excused, status: ok ? "CLEAR" : behind ? "CLOSE" : "BEHIND" };
}

// Bucket one member's minutes, by weekday, across a date range — used for
// the home dashboard's personal bar chart (works for any range length).
function weekdayBuckets(memberId, dates) {
  const dm = dailyMinutesMap(memberId);
  const totals = {};
  const order = [];
  for (const d of dates) {
    const key = dowShort(d);
    if (!(key in totals)) { totals[key] = 0; order.push(key); }
    totals[key] += dm[isoDate(d)] || 0;
  }
  return { totals, order };
}

// ---------------------------------------------------------------------------
// data loading
// ---------------------------------------------------------------------------
async function loadAll() {
  const [members, sessions, exclusions, holidays] = await Promise.all([
    db.listMembers(), db.listSessions(), db.listExclusions(), db.listHolidays(),
  ]);
  state.members = members;
  state.sessions = sessions;
  state.exclusions = exclusions;
  state.holidays = holidays;
}
async function boot() {
  try {
    const me = await db.getCurrentMember();
    await loadAll();
    if (me) {
      state.currentMemberId = me.id;
      if (!state.members.some((m) => m.id === me.id)) state.members.push(me);
      state.screen = "app";
    }
  } catch (e) {
    state.error = "Couldn't load data: " + (e.message || e);
  }
  state.loading = false;
  render();
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
function render() {
  if (state.loading) {
    root.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;color:rgba(23,22,15,.4);font-family:'IBM Plex Mono',monospace;font-size:13px">Loading…</div>`;
    return;
  }
  root.innerHTML = state.screen === "login" ? renderLogin() : renderApp();
}

function heroIllustration() {
  return `
  <svg viewBox="0 0 420 300" style="width:100%;max-width:400px;height:auto" xmlns="http://www.w3.org/2000/svg">
    <circle cx="300" cy="90" r="130" fill="#7fd6a2" opacity="0.08"/>
    <circle cx="300" cy="90" r="90" fill="none" stroke="#7fd6a2" stroke-opacity="0.25" stroke-width="1.5"/>
    <path d="M60 190 A150 150 0 0 1 210 60" fill="none" stroke="#e8b45c" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 10"/>
    <g transform="translate(90,150)">
      <rect x="-4" y="-46" width="8" height="92" rx="4" fill="#f2f0eb"/>
      <rect x="-70" y="-38" width="26" height="76" rx="9" fill="#7fd6a2"/>
      <rect x="-84" y="-24" width="14" height="48" rx="6" fill="#7fd6a2" opacity="0.7"/>
      <rect x="44" y="-38" width="26" height="76" rx="9" fill="#7fd6a2"/>
      <rect x="70" y="-24" width="14" height="48" rx="6" fill="#7fd6a2" opacity="0.7"/>
    </g>
    <circle cx="230" cy="60" r="5" fill="#e8b45c"/>
    <circle cx="255" cy="45" r="3" fill="#7fd6a2"/>
    <circle cx="205" cy="35" r="3" fill="#e8b45c" opacity="0.6"/>
  </svg>`;
}

function renderLogin() {
  const banner = state.error ? `<div style="margin-bottom:14px;padding:10px 13px;border-radius:9px;background:rgba(232,92,92,.12);color:#a33;font-size:12.5px">${esc(state.error)}</div>` : "";
  const info = state.info ? `<div style="margin-bottom:14px;padding:10px 13px;border-radius:9px;background:rgba(47,109,79,.1);color:${GREEN};font-size:12.5px">${esc(state.info)}</div>` : "";
  const demoHint = db.DEMO_MODE ? `<p style="margin:0;font-size:11.5px;color:rgba(23,22,15,.4);font-family:'IBM Plex Mono',monospace">Local demo — try riya@example.com / password123 (admin), or sign up your own.</p>` : "";
  return `
<div style="min-height:100vh;display:grid;grid-template-columns:1.05fr .95fr;background:#f2f0eb">
  <div style="padding:48px 56px;display:flex;flex-direction:column;justify-content:space-between;background:${DARK};color:#f2f0eb;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:26px;height:26px;border-radius:7px;background:#7fd6a2"></div>
      <span style="font:600 15px/1 'Archivo',sans-serif;letter-spacing:.02em">45×${CHALLENGE.monthlyTargetDays}</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:auto 0">
      ${heroIllustration()}
      <h1 style="margin:8px 0 0;font:600 44px/1.08 'Archivo',sans-serif;letter-spacing:-.02em">Show up.<br>Together.</h1>
      <p style="margin:0;max-width:400px;font-size:15px;line-height:1.6;color:rgba(242,240,235,.66);text-wrap:pretty">The friend-group workout challenge — log it, track it, and win it together.</p>
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:center;padding:40px">
    <div style="width:100%;max-width:352px;display:flex;flex-direction:column;gap:20px">
      ${banner}${info}
      ${state.authView === "signup" ? renderSignUpForm() : renderSignInForm()}
      ${demoHint}
      <p style="margin:2px 0 0;font-size:12px;color:rgba(23,22,15,.42);line-height:1.55">Everything you log is visible to the whole group. That's the point.</p>
    </div>
  </div>
</div>`;
}
function renderSignInForm() {
  return `
<div>
  <h2 style="margin:0 0 6px;font:600 24px/1.2 'Archivo',sans-serif;letter-spacing:-.01em">Sign in</h2>
  <p style="margin:0;font-size:13.5px;color:rgba(23,22,15,.52)">Welcome back.</p>
</div>
<label style="display:flex;flex-direction:column;gap:7px">
  <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Email</span>
  <input type="email" data-bind="signInEmail" value="${esc(state.signInEmail)}" placeholder="you@example.com" style="height:44px;padding:0 13px;border:1px solid rgba(23,22,15,.16);border-radius:9px;background:#fff;font-size:14px;outline:none">
</label>
<label style="display:flex;flex-direction:column;gap:7px">
  <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Password</span>
  <input type="password" data-bind="signInPassword" value="${esc(state.signInPassword)}" placeholder="••••••••" style="height:44px;padding:0 13px;border:1px solid rgba(23,22,15,.16);border-radius:9px;background:#fff;font-size:14px;outline:none">
</label>
<button data-action="submit-signin" style="height:46px;border:0;border-radius:9px;background:#17160f;color:#f2f0eb;font-weight:600;font-size:14.5px;cursor:pointer;letter-spacing:.01em">Sign in</button>
<button data-action="show-signup" style="height:38px;border:0;background:none;color:#2f6d4f;font-size:12.5px;font-weight:500;cursor:pointer">New here? Create an account</button>`;
}
function renderSignUpForm() {
  const squadOptions = CHALLENGE.squads.map((s) => `<option ${s === state.joinSquad ? "selected" : ""}>${esc(s)}</option>`).join("");
  return `
<div>
  <h2 style="margin:0 0 6px;font:600 24px/1.2 'Archivo',sans-serif;letter-spacing:-.01em">Create an account</h2>
  <p style="margin:0;font-size:13.5px;color:rgba(23,22,15,.52)">Just you and your friends — no company sign-on needed.</p>
</div>
<label style="display:flex;flex-direction:column;gap:7px">
  <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Your name</span>
  <input data-bind="joinName" value="${esc(state.joinName)}" placeholder="Full name" style="height:44px;padding:0 13px;border:1px solid rgba(23,22,15,.16);border-radius:9px;background:#fff;font-size:14px;outline:none">
</label>
<label style="display:flex;flex-direction:column;gap:7px">
  <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Email</span>
  <input type="email" data-bind="joinEmail" value="${esc(state.joinEmail)}" placeholder="you@example.com" style="height:44px;padding:0 13px;border:1px solid rgba(23,22,15,.16);border-radius:9px;background:#fff;font-size:14px;outline:none">
</label>
<label style="display:flex;flex-direction:column;gap:7px">
  <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Password <span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(23,22,15,.35)">at least 8 characters</span></span>
  <input type="password" data-bind="joinPassword" value="${esc(state.joinPassword)}" placeholder="••••••••" style="height:44px;padding:0 13px;border:1px solid rgba(23,22,15,.16);border-radius:9px;background:#fff;font-size:14px;outline:none">
</label>
<label style="display:flex;flex-direction:column;gap:7px">
  <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Squad</span>
  <select data-bind="joinSquad" style="height:44px;padding:0 13px;border:1px solid rgba(23,22,15,.16);border-radius:9px;background:#fff;font-size:14px;outline:none">${squadOptions}</select>
</label>
<button data-action="submit-signup" style="height:46px;border:0;border-radius:9px;background:#17160f;color:#f2f0eb;font-weight:600;font-size:14.5px;cursor:pointer">Create account & enter</button>
<button data-action="show-signin" style="height:38px;border:0;background:none;color:rgba(23,22,15,.5);font-size:12.5px;cursor:pointer">Already have an account? Sign in</button>`;
}

function currentMember() {
  return state.members.find((m) => m.id === state.currentMemberId);
}

function renderApp() {
  const me = currentMember();
  if (!me) return renderLogin();
  if (state.tab === "admin" && !me.is_admin) state.tab = "home";
  const today = todayDate();
  const view = computeMonthProgress(me.id, startOfMonth(today));
  const pendingCount = state.exclusions.filter((e) => e.status === "PENDING").length;

  const navDefs = [
    { key: "home", label: "My dashboard", dot: "#7fd6a2" },
    { key: "team", label: "Team log", dot: "#8ab4e8" },
    { key: "exclusions", label: "Exclusions", dot: "#e8b45c", badge: state.exclusions.filter((e) => e.member_id === me.id && e.status === "PENDING").length || null },
    ...(me.is_admin ? [{ key: "admin", label: "Admin", dot: "#c9a3e0", badge: pendingCount || null }] : []),
  ];
  const nav = navDefs.map((n) => `
    <button data-action="switch-tab" data-tab="${n.key}" style="display:flex;align-items:center;gap:10px;width:100%;height:36px;padding:0 10px;border:0;border-radius:8px;cursor:pointer;font-size:13.5px;text-align:left;background:${state.tab === n.key ? "rgba(242,240,235,.12)" : "transparent"};color:${state.tab === n.key ? "#f2f0eb" : "rgba(242,240,235,.62)"};font-weight:${state.tab === n.key ? "600" : "400"}">
      <span style="width:7px;height:7px;border-radius:50%;background:${n.dot};flex:none"></span>
      <span>${esc(n.label)}</span>
      ${n.badge ? `<span style="margin-left:auto;font:600 10px/1 'IBM Plex Mono',monospace;padding:3px 6px;border-radius:20px;background:#e8b45c;color:#17160f">${n.badge}</span>` : ""}
    </button>`).join("");

  const [avBg, avFg] = avatarOf(state.members.findIndex((m) => m.id === me.id));

  const titles = {
    home: [`This month · ${esc(CHALLENGE.cycleLabel)}`, `Hey ${esc(me.name.split(" ")[0])} — keep the month honest`],
    team: ["Group attendance", "Team log"],
    exclusions: ["Sick · travel · holidays", "Exclusions"],
    admin: ["Challenge owner tools", "Admin"],
  };

  let body;
  if (state.tab === "home") body = renderHome(me, view);
  else if (state.tab === "team") body = renderTeam(me);
  else if (state.tab === "exclusions") body = renderExclusions(me);
  else body = renderAdmin();

  return `
<div style="min-height:100vh;display:grid;grid-template-columns:236px 1fr;background:#f2f0eb">
  <aside style="background:${DARK};color:#f2f0eb;padding:22px 16px;display:flex;flex-direction:column;gap:26px;position:sticky;top:0;height:100vh">
    <div style="display:flex;align-items:center;gap:9px;padding:0 8px">
      <div style="width:24px;height:24px;border-radius:7px;background:#7fd6a2"></div>
      <span style="font:600 14.5px/1 'Archivo',sans-serif;letter-spacing:.02em">45×${CHALLENGE.monthlyTargetDays}</span>
    </div>
    <nav style="display:flex;flex-direction:column;gap:3px">${nav}</nav>
    <button data-action="open-log" style="height:40px;border:0;border-radius:9px;background:#7fd6a2;color:#17160f;font-weight:600;font-size:13.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
      <span style="font-size:16px;line-height:1">+</span> Log a session
    </button>
    <div style="margin-top:auto;padding:12px;border-radius:11px;background:rgba(242,240,235,.06);display:flex;flex-direction:column;gap:9px">
      <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(242,240,235,.42);font-weight:600">This month${view.won ? " · 🏆" : ""}</div>
      <div style="display:flex;align-items:baseline;gap:6px;font-family:'IBM Plex Mono',monospace">
        <span style="font-size:24px;font-weight:600">${view.doneDays}</span><span style="font-size:13px;color:rgba(242,240,235,.45)">/ ${view.effectiveTarget} days</span>
      </div>
      <div style="height:5px;border-radius:3px;background:rgba(242,240,235,.14);overflow:hidden"><div style="height:100%;width:${Math.min(100, Math.round((view.doneDays / Math.max(1, view.effectiveTarget)) * 100))}%;background:#7fd6a2"></div></div>
      <div style="font-size:11.5px;color:rgba(242,240,235,.55)">${view.won ? "Challenge cleared. Anything more is bonus." : (view.effectiveTarget - view.doneDays) + " more to win the month"}</div>
    </div>
    <div style="display:flex;align-items:center;gap:9px;padding:8px;border-top:1px solid rgba(242,240,235,.1)">
      <div style="width:28px;height:28px;border-radius:50%;background:${avBg};color:${avFg};display:flex;align-items:center;justify-content:center;font:600 11px 'IBM Plex Mono',monospace">${initialsOf(me.name)}</div>
      <div style="line-height:1.25"><div style="font-size:12.5px;font-weight:500">${esc(me.name)}</div><div style="font-size:10.5px;color:rgba(242,240,235,.42)">${esc(me.email)}</div></div>
      <button data-action="logout" style="margin-left:auto;background:none;border:0;color:rgba(242,240,235,.4);font-size:11px;cursor:pointer">Logout</button>
    </div>
  </aside>
  <main style="padding:30px 36px 56px;max-width:1180px">
    <header style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:26px;flex-wrap:wrap">
      <div>
        <div style="font:500 11px/1 'IBM Plex Mono',monospace;letter-spacing:.11em;text-transform:uppercase;color:rgba(23,22,15,.45);margin-bottom:9px">${titles[state.tab][0]}</div>
        <h1 style="margin:0;font:600 30px/1.12 'Archivo',sans-serif;letter-spacing:-.02em">${titles[state.tab][1]}</h1>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="display:flex;align-items:center;gap:7px;height:36px;padding:0 12px;border-radius:8px;background:#fff;border:1px solid rgba(23,22,15,.1);font-size:12.5px;color:rgba(23,22,15,.6)">
          <span style="width:6px;height:6px;border-radius:50%;background:#7fd6a2"></span>${fmtShort(addDays(today, -6))} – ${fmtShort(today)}
        </div>
        <button data-action="open-log" style="height:36px;padding:0 14px;border:0;border-radius:8px;background:#17160f;color:#f2f0eb;font-weight:600;font-size:13px;cursor:pointer">Log session</button>
      </div>
    </header>
    ${body}
  </main>
</div>
${state.logOpen ? renderLogModal(view, me) : ""}`;
}

function computeFeed() {
  const items = [];
  for (const s of state.sessions) {
    const m = state.members.find((mm) => mm.id === s.member_id);
    if (!m) continue;
    const valid = s.minutes >= CHALLENGE.minMinutes;
    items.push({ ts: s.created_at, name: m.name, action: `logged ${fmtMins(s.minutes)}`, meta: `${s.type}${s.note ? " · " + s.note : ""} · ${s.session_date}`, tag: valid ? "Valid" : "Short" });
  }
  for (const e of state.exclusions) {
    const m = state.members.find((mm) => mm.id === e.member_id);
    if (!m) continue;
    items.push({ ts: e.created_at, name: m.name, action: `requested ${e.reason.toLowerCase()}`, meta: `${e.from_date}${e.to_date !== e.from_date ? " – " + e.to_date : ""}${e.note ? " · " + e.note : ""}`, tag: e.status === "APPROVED" ? "Excused" : e.status === "DECLINED" ? "Declined" : "Pending" });
  }
  items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return items.slice(0, 8);
}
function computeFlags() {
  const flags = [];
  for (const s of state.sessions) {
    const m = state.members.find((mm) => mm.id === s.member_id);
    if (!m) continue;
    if (s.minutes >= 100) flags.push({ name: m.name, what: `logged ${fmtMins(s.minutes)} — unusually long session`, when: s.session_date });
    const created = new Date(s.created_at);
    const logged = parseISO(s.session_date);
    if ((created - logged) / 86400000 > 7) flags.push({ name: m.name, what: `logged for ${s.session_date}, more than 7 days after the fact`, when: isoDate(created) });
  }
  return flags.slice(-10).reverse();
}

function renderHome(me, view) {
  const rank = computeRank(me.id);
  const snap = currentMonthSnapshot();
  const monthlyMinutesAll = snap.reduce((a, s) => a + s.view.totalMinutes, 0);
  const groupMedian = state.members.length ? Math.round(monthlyMinutesAll / state.members.length) : 0;
  const streak = computeStreak(me.id);

  const { from: hFrom, to: hTo, label: hLabel } = homeRangeToDates();
  const hDates = dateList(hFrom, hTo);
  const { totals: bucketTotals, order: bucketOrder } = weekdayBuckets(me.id, hDates);
  const rangeTotalMinutes = Object.values(bucketTotals).reduce((a, b) => a + b, 0);
  const dm = dailyMinutesMap(me.id);
  const daysWithSessions = hDates.filter((d) => (dm[isoDate(d)] || 0) > 0).length;
  const avgRange = daysWithSessions ? Math.round(rangeTotalMinutes / daysWithSessions) : 0;
  const longestRange = Math.max(0, ...hDates.map((d) => dm[isoDate(d)] || 0));
  const maxBucket = Math.max(1, ...Object.values(bucketTotals));

  const trophyBanner = view.won ? `
  <div style="background:linear-gradient(135deg, rgba(232,180,92,.2), rgba(232,180,92,.06));border:1px solid rgba(232,180,92,.4);border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px">
    <span style="font-size:34px;line-height:1">🏆</span>
    <div><div style="font:600 16px/1.2 'Archivo',sans-serif;color:#8a6420">Challenge cleared for ${fmtMonth(view.monthStart)}!</div><div style="font-size:12.5px;color:rgba(23,22,15,.55);margin-top:3px">${view.doneDays} valid days logged. Anything more from here is a victory lap.</div></div>
  </div>` : "";

  const kpis = [
    { label: "Days logged", value: `${view.doneDays}/${view.effectiveTarget}`, unit: "this month", note: view.won ? "Challenge cleared 🏆" : (view.effectiveTarget - view.doneDays) + " more to win the month", color: view.won ? GREEN : DARK },
    { label: "Minutes", value: view.totalMinutes, unit: "min", note: `Group median ${groupMedian} min this month`, color: DARK },
    { label: "Streak", value: streak, unit: "months", note: streak ? "Keep it going" : "Win this month to start one", color: GREEN },
    { label: "Rank", value: "#" + rank.rank, unit: "of " + rank.of, note: "This month's standings", color: AMBER },
  ];
  const kpiHtml = kpis.map((k) => `
    <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:13px;padding:16px 17px;display:flex;flex-direction:column;gap:11px">
      <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.45);font-weight:600">${k.label}</div>
      <div style="display:flex;align-items:baseline;gap:6px;font-family:'IBM Plex Mono',monospace">
        <span style="font-size:30px;font-weight:600;letter-spacing:-.02em;color:${k.color}">${k.value}</span>
        <span style="font-size:13px;color:rgba(23,22,15,.4)">${k.unit}</span>
      </div>
      <div style="font-size:12px;color:rgba(23,22,15,.5)">${esc(k.note)}</div>
    </div>`).join("");

  const homeRanges = ["This week", "This month", "This quarter", "Full cycle", "Custom"].map((r) => `
    <button data-action="set-home-range" data-range="${r}" style="height:26px;padding:0 10px;border-radius:20px;cursor:pointer;font-size:11.5px;font-weight:${state.homeRange === r ? "600" : "400"};border:1px solid ${state.homeRange === r ? "transparent" : "rgba(23,22,15,.15)"};background:${state.homeRange === r ? "#17160f" : "#fff"};color:${state.homeRange === r ? "#f7f6f2" : "rgba(23,22,15,.7)"}">${r}</button>`).join("");

  const barsHtml = bucketOrder.map((k) => {
    const v = bucketTotals[k];
    const bar = barVisual(v, maxBucket, 90);
    return `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
      ${bar.trophy ? `<span style="font-size:14px;line-height:1">🏆</span>` : ""}
      <span style="font:600 10.5px 'IBM Plex Mono',monospace;color:${bar.trophy ? GREEN : "rgba(23,22,15,.5)"}">${v}</span>
      <div style="width:100%;height:${bar.heightPx}px;border-radius:7px 7px 3px 3px;background:${bar.color}"></div>
      <span style="font-size:10.5px;font-weight:600;color:rgba(23,22,15,.4)">${k}</span>
    </div>`;
  }).join("");

  const mySessions = state.sessions.filter((s) => s.member_id === me.id).sort((a, b) => b.session_date.localeCompare(a.session_date) || new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  const mySessionsHtml = mySessions.map((s) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(23,22,15,.07)">
      <span style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:rgba(23,22,15,.45);width:64px;flex:none">${fmtShort(parseISO(s.session_date))}</span>
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:500">${fmtMins(s.minutes)} <span style="font-weight:400;color:rgba(23,22,15,.55)">· ${esc(s.type)}</span></div>
        ${s.note ? `<div style="font-size:11.5px;color:rgba(23,22,15,.42);margin-top:2px">${esc(s.note)}</div>` : ""}
      </div>
      <span style="font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.05em;padding:3px 7px;border-radius:20px;background:${s.minutes >= CHALLENGE.minMinutes ? "#e4ece6" : "#eceae4"};color:${s.minutes >= CHALLENGE.minMinutes ? GREEN : "rgba(23,22,15,.5)"};flex:none">${s.minutes >= CHALLENGE.minMinutes ? "VALID" : "SHORT"}</span>
      <button data-action="edit-session" data-id="${s.id}" style="background:none;border:1px solid rgba(23,22,15,.16);border-radius:6px;height:26px;padding:0 9px;font-size:11px;cursor:pointer;flex:none">Edit</button>
      <button data-action="delete-session" data-id="${s.id}" style="background:none;border:0;color:rgba(23,22,15,.35);font-size:11px;cursor:pointer;flex:none">Delete</button>
    </div>`).join("") || `<div style="padding:14px 0;color:rgba(23,22,15,.4);font-size:13px">Nothing logged yet — hit "Log a session" to start.</div>`;

  const won = snap.filter((s) => s.view.won).length;
  const onExclusion = snap.filter((s) => !s.view.won && s.view.personalExcusedCount > 0).length;
  const behind = snap.filter((s) => !s.view.won && s.view.personalExcusedCount === 0 && (s.view.effectiveTarget - s.view.doneDays) > 3).length;
  const closeToTarget = Math.max(0, snap.length - won - onExclusion - behind);
  const pct = snap.length ? Math.round((won / snap.length) * 100) : 0;
  const pulseBars = [
    { label: `Cleared ${view.effectiveTarget} days`, value: won, color: "#7fd6a2" },
    { label: "Close, 3 or fewer to go", value: closeToTarget, color: PALE },
    { label: "Behind pace", value: behind, color: AMBER },
    { label: "On exclusion", value: onExclusion, color: "rgba(242,240,235,.3)" },
  ].map((b) => ({ ...b, pct: snap.length ? Math.round((b.value / snap.length) * 100) + "%" : "0%" }));

  const nudges = snap.filter((s) => !s.view.won && s.view.personalExcusedCount === 0).slice(0, 3).map((s) => s.member.name.split(" ")[0]);

  const feed = computeFeed();
  const feedHtml = feed.map((f, i) => {
    const [bg, fg] = avatarOf(i);
    const tagColors = f.tag === "Short" ? ["#eceae4", "rgba(23,22,15,.5)"] : f.tag === "Excused" ? ["rgba(232,180,92,.18)", "#8a6420"] : f.tag === "Declined" ? ["#eceae4", "rgba(23,22,15,.4)"] : f.tag === "Pending" ? ["rgba(232,180,92,.18)", "#8a6420"] : ["#e4ece6", GREEN];
    return `
    <div style="display:flex;align-items:center;gap:13px;padding:11px 0;border-top:1px solid rgba(23,22,15,.07)">
      <div style="width:32px;height:32px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font:600 11px 'IBM Plex Mono',monospace;flex:none">${initialsOf(f.name)}</div>
      <div style="min-width:0">
        <div style="font-size:13.5px;font-weight:500">${esc(f.name)} <span style="font-weight:400;color:rgba(23,22,15,.55)">${esc(f.action)}</span></div>
        <div style="font-size:11.5px;color:rgba(23,22,15,.42);font-family:'IBM Plex Mono',monospace;margin-top:2px">${esc(f.meta)}</div>
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
        <span style="font:500 11px 'IBM Plex Mono',monospace;padding:4px 8px;border-radius:20px;background:${tagColors[0]};color:${tagColors[1]}">${f.tag}</span>
        <span style="font-size:11.5px;color:rgba(23,22,15,.35)">${timeAgo(f.ts)}</span>
      </div>
    </div>`;
  }).join("") || `<div style="padding:20px 0;color:rgba(23,22,15,.4);font-size:13px">Nobody's logged anything yet. Be first.</div>`;

  return `
<div style="display:flex;flex-direction:column;gap:20px">
  ${trophyBanner}
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">${kpiHtml}</div>
  <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:16px">
    <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <h3 style="margin:0;font:600 15px/1 'Archivo',sans-serif">${esc(hLabel)}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${homeRanges}</div>
      </div>
      ${state.homeRange === "Custom" ? `
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:14px">
        <input type="date" data-bind="homeCustomFrom" value="${esc(state.homeCustomFrom)}" max="${isoDate(todayDate())}" style="height:30px;padding:0 8px;border:1px solid rgba(23,22,15,.14);border-radius:7px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:11.5px">
        <span style="color:rgba(23,22,15,.35);font-size:12px">to</span>
        <input type="date" data-bind="homeCustomTo" value="${esc(state.homeCustomTo)}" max="${isoDate(todayDate())}" style="height:30px;padding:0 8px;border:1px solid rgba(23,22,15,.14);border-radius:7px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:11.5px">
        <button data-action="apply-home-range" style="height:30px;padding:0 10px;border:0;border-radius:7px;background:#17160f;color:#fff;font-size:11.5px;cursor:pointer">Apply</button>
      </div>` : ""}
      <div style="font:600 26px 'IBM Plex Mono',monospace;color:${DARK};margin-bottom:14px">${rangeTotalMinutes} <span style="font-size:13px;font-weight:500;color:rgba(23,22,15,.45)">min total</span></div>
      <div style="display:flex;align-items:flex-end;gap:10px">${barsHtml}</div>
      <div style="margin-top:16px;padding-top:15px;border-top:1px solid rgba(23,22,15,.08);display:flex;gap:20px;font-size:12px;color:rgba(23,22,15,.5)">
        <span>Streak <strong style="font-family:'IBM Plex Mono',monospace;color:#17160f">${streak} months</strong></span>
        <span>Avg session <strong style="font-family:'IBM Plex Mono',monospace;color:#17160f">${avgRange} min</strong></span>
        <span>Longest day <strong style="font-family:'IBM Plex Mono',monospace;color:#17160f">${longestRange} min</strong></span>
      </div>
    </div>
    <div style="background:${DARK};color:#f2f0eb;border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;gap:16px">
      <h3 style="margin:0;font:600 15px/1 'Archivo',sans-serif">Team pulse</h3>
      <div>
        <div style="display:flex;align-items:baseline;gap:7px;font-family:'IBM Plex Mono',monospace">
          <span style="font-size:38px;font-weight:600;letter-spacing:-.03em;color:#7fd6a2">${pct}%</span>
          <span style="font-size:14px;color:rgba(242,240,235,.5)">on track</span>
        </div>
        <div style="font-size:12.5px;color:rgba(242,240,235,.55);margin-top:6px">${won} of ${snap.length} teammates have cleared ${view.effectiveTarget} days this month.</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${pulseBars.map((b) => `
        <div style="display:flex;flex-direction:column;gap:5px">
          <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:rgba(242,240,235,.7)">${b.label}</span><span style="font-family:'IBM Plex Mono',monospace;color:rgba(242,240,235,.5)">${b.value}</span></div>
          <div style="height:6px;border-radius:3px;background:rgba(242,240,235,.12);overflow:hidden"><div style="height:100%;width:${b.pct};background:${b.color}"></div></div>
        </div>`).join("")}
      </div>
      ${nudges.length ? `<div style="margin-top:auto;padding:12px 13px;border-radius:10px;background:rgba(232,180,92,.14);border:1px solid rgba(232,180,92,.3)">
        <div style="font-size:12px;font-weight:600;color:#e8b45c;margin-bottom:4px">Nudge queue · ${nudges.length}</div>
        <div style="font-size:12px;color:rgba(242,240,235,.6);line-height:1.5">${esc(nudges.join(", "))} ${nudges.length > 1 ? "are" : "is"} behind pace.</div>
      </div>` : ""}
    </div>
  </div>
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
    <h3 style="margin:0 0 4px;font:600 15px/1 'Archivo',sans-serif">Your recent sessions</h3>
    <p style="margin:0 0 6px;font-size:12.5px;color:rgba(23,22,15,.45)">Made a mistake or logged a duplicate? Edit or delete it here.</p>
    <div style="display:flex;flex-direction:column">${mySessionsHtml}</div>
  </div>
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
      <h3 style="margin:0;font:600 15px/1 'Archivo',sans-serif">Latest from the floor</h3>
      <button data-action="switch-tab" data-tab="team" style="background:none;border:0;font-size:12.5px;color:#2f6d4f;cursor:pointer;font-weight:500">See full log →</button>
    </div>
    <div style="display:flex;flex-direction:column">${feedHtml}</div>
  </div>
</div>`;
}

function renderTeam(me) {
  const { from, to, label } = rangeToDates();
  const dates = dateList(from, to);
  const showDayGrid = dates.length <= 7;
  const min = CHALLENGE.minMinutes;
  const members = filteredMembers();
  const sharedTarget = sharedEffectiveTarget(startOfMonth(todayDate()));

  const ranges = ["This week", "This month", "This quarter", "Full cycle", "Custom"].map((r) => `
    <button data-action="set-range" data-range="${r}" style="height:30px;padding:0 12px;border-radius:20px;cursor:pointer;font-size:12.5px;font-weight:${state.range === r ? "600" : "400"};border:1px solid ${state.range === r ? "transparent" : "rgba(23,22,15,.15)"};background:${state.range === r ? "#17160f" : "#fff"};color:${state.range === r ? "#f7f6f2" : "rgba(23,22,15,.7)"}">${r}</button>`).join("");
  const squadOptions = ["All squads", ...CHALLENGE.squads].map((s) => `<option ${s === state.squadFilter ? "selected" : ""}>${esc(s)}</option>`).join("");

  const rows = members.map((m, i) => {
    const [bg, fg] = avatarOf(i);
    const dm = dailyMinutesMap(m.id);
    const st = rowStatus(m.id, from, to);
    const won = hasWonCurrentMonth(m.id);
    let dayCells = "";
    if (showDayGrid) {
      dayCells = dates.map((d) => {
        const iso = isoDate(d);
        const mins = dm[iso] || 0;
        const excused = isExcludedDay(m.id, iso);
        if (excused) return `<div title="${fmtShort(d)} — excused" style="height:34px;border-radius:7px;background:rgba(232,180,92,.2);color:#8a6420;display:flex;align-items:center;justify-content:center;font:600 11.5px 'IBM Plex Mono',monospace">EX</div>`;
        if (mins >= min) return `<div title="${fmtShort(d)} — ${fmtMins(mins)}" style="height:34px;border-radius:7px;background:${GREEN};color:#fff;display:flex;align-items:center;justify-content:center;font:600 11.5px 'IBM Plex Mono',monospace">${mins}</div>`;
        if (mins > 0) return `<div title="${fmtShort(d)} — ${fmtMins(mins)} (under ${min})" style="height:34px;border-radius:7px;background:${PALE};color:#1e4633;display:flex;align-items:center;justify-content:center;font:600 11.5px 'IBM Plex Mono',monospace">${mins}</div>`;
        return `<div title="${fmtShort(d)} — no session" style="height:34px;border-radius:7px;background:#eceae4"></div>`;
      }).join("");
    }
    const statusBadge = st.status === null
      ? `<span style="font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.05em;padding:4px 7px;border-radius:20px;background:#f0efeb;color:rgba(23,22,15,.35)">—</span>`
      : `<span style="font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.05em;padding:4px 7px;border-radius:20px;background:${st.status === "CLEAR" ? "#e4ece6" : st.status === "CLOSE" ? "rgba(232,180,92,.18)" : "#eceae4"};color:${st.status === "CLEAR" ? GREEN : st.status === "CLOSE" ? "#8a6420" : "rgba(23,22,15,.5)"}">${st.status}</span>`;
    return `
    <div style="display:grid;grid-template-columns:210px ${showDayGrid ? "repeat(" + dates.length + ",1fr)" : "1fr"} 96px 74px;gap:6px;align-items:center;padding:5px 0;border-top:1px solid rgba(23,22,15,.06)">
      <div style="display:flex;align-items:center;gap:10px;min-width:0">
        <div style="width:28px;height:28px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font:600 10.5px 'IBM Plex Mono',monospace;flex:none">${initialsOf(m.name)}</div>
        <div style="min-width:0"><div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.name)}${m.id === me.id ? " (you)" : ""}${won ? " 🏆" : ""}</div><div style="font-size:10.5px;color:rgba(23,22,15,.4)">${esc(m.squad)}</div></div>
      </div>
      ${showDayGrid ? dayCells : `<div style="font-size:12px;color:rgba(23,22,15,.45)">${st.cleared} days cleared · ${st.excused} excused</div>`}
      <div style="text-align:right;font:600 12.5px 'IBM Plex Mono',monospace">${st.total}</div>
      <div style="text-align:right">${statusBadge}</div>
    </div>`;
  }).join("");

  const dowHeadsHtml = showDayGrid ? dates.map((d) => {
    const dow = dowShort(d);
    return `<div style="text-align:center;font:600 10.5px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:rgba(23,22,15,.45)">${dow.slice(0, 3)} ${d.getDate()}</div>`;
  }).join("") : `<div style="font:600 10.5px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:rgba(23,22,15,.4)">SUMMARY</div>`;

  const barTotals = {};
  const barOrder = [];
  for (const m of members) {
    const dm = dailyMinutesMap(m.id);
    for (const d of dates) {
      const key = dowShort(d);
      if (!(key in barTotals)) { barTotals[key] = 0; barOrder.push(key); }
      barTotals[key] += dm[isoDate(d)] || 0;
    }
  }
  const maxBar = Math.max(1, ...Object.values(barTotals));
  const dayBars = barOrder.map((k) => {
    const heightPx = barTotals[k] > 0 ? Math.max(3, Math.round((barTotals[k] / maxBar) * 90)) : 2;
    return `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px">
      <span style="font:600 10.5px 'IBM Plex Mono',monospace;color:rgba(23,22,15,.5)">${barTotals[k]}</span>
      <div style="width:100%;height:${heightPx}px;border-radius:7px 7px 3px 3px;background:#a8d4bb"></div>
      <span style="font-size:10.5px;font-weight:600;color:rgba(23,22,15,.4)">${k}</span>
    </div>`;
  }).join("");

  const squadStats = CHALLENGE.squads.map((sq) => {
    const squadMembers = state.members.filter((m) => m.squad === sq);
    const monthStart = startOfMonth(todayDate());
    const snaps = squadMembers.map((m) => computeMonthProgress(m.id, monthStart));
    const clearedPct = squadMembers.length ? Math.round((snaps.filter((v) => v.won).length / squadMembers.length) * 100) : 0;
    const mins = snaps.reduce((a, v) => a + v.totalMinutes, 0);
    return { name: sq, pct: clearedPct, mins };
  }).sort((a, b) => b.pct - a.pct);
  const squadsHtml = squadStats.map((s, i) => `
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:22px;font:600 13px 'IBM Plex Mono',monospace;color:rgba(23,22,15,.35)">${i + 1}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span style="font-weight:500">${esc(s.name)}</span><span style="font-family:'IBM Plex Mono',monospace;color:rgba(23,22,15,.5)">${s.pct}%</span></div>
        <div style="height:8px;border-radius:4px;background:#eceae4;overflow:hidden"><div style="height:100%;width:${s.pct}%;background:${i === 0 ? GREEN : i === 1 ? PALE : AMBER}"></div></div>
      </div>
      <div style="font:500 11px 'IBM Plex Mono',monospace;color:rgba(23,22,15,.4);width:72px;text-align:right">${s.mins} min</div>
    </div>`).join("");

  return `
<div style="display:flex;flex-direction:column;gap:18px">
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:12px;padding:12px 14px">
    ${ranges}
    <div style="display:flex;align-items:center;gap:7px;margin-left:auto;flex-wrap:wrap">
      ${state.range === "Custom" ? `
      <input type="date" data-bind="customFrom" value="${esc(state.customFrom)}" max="${isoDate(todayDate())}" style="height:32px;padding:0 9px;border:1px solid rgba(23,22,15,.14);border-radius:7px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:12px">
      <span style="color:rgba(23,22,15,.35);font-size:12px">to</span>
      <input type="date" data-bind="customTo" value="${esc(state.customTo)}" max="${isoDate(todayDate())}" style="height:32px;padding:0 9px;border:1px solid rgba(23,22,15,.14);border-radius:7px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:12px">
      <button data-action="apply-custom-range" style="height:32px;padding:0 10px;border:0;border-radius:7px;background:#17160f;color:#fff;font-size:12px;cursor:pointer">Apply</button>` : ""}
      <select data-bind="squadFilter" style="height:32px;padding:0 8px;border:1px solid rgba(23,22,15,.14);border-radius:7px;background:#fff;font-size:12.5px">${squadOptions}</select>
      <button data-action="export-csv" style="height:32px;padding:0 12px;border:1px solid rgba(23,22,15,.16);border-radius:7px;background:#fff;font-size:12.5px;cursor:pointer">Export CSV</button>
    </div>
  </div>
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px;overflow:auto">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
      <div>
        <h3 style="margin:0 0 4px;font:600 15px/1 'Archivo',sans-serif">Who went, when, how long</h3>
        <p style="margin:0;font-size:12.5px;color:rgba(23,22,15,.45)">Minutes per day · ${esc(label)} (${fmtShort(from)} – ${fmtShort(to)})</p>
      </div>
      <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:rgba(23,22,15,.45)">
        <span style="display:flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:${GREEN}"></span>${min}+ min</span>
        <span style="display:flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:${PALE}"></span>short</span>
        <span style="display:flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:${AMBER}"></span>excused</span>
        <span style="display:flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:#eceae4"></span>missed</span>
      </div>
    </div>
    <div style="min-width:${showDayGrid ? "820px" : "560px"};display:flex;flex-direction:column;gap:6px">
      <div style="display:grid;grid-template-columns:210px ${showDayGrid ? "repeat(" + dates.length + ",1fr)" : "1fr"} 96px 74px;gap:6px;align-items:center;padding:0 0 6px">
        <div></div>${dowHeadsHtml}
        <div style="text-align:right;font:600 10.5px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:rgba(23,22,15,.4)">MINUTES</div>
        <div style="text-align:right;font:600 10.5px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:rgba(23,22,15,.4)">STATUS</div>
      </div>
      ${rows || `<div style="padding:20px 0;color:rgba(23,22,15,.4);font-size:13px">No members in this squad.</div>`}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
      <h3 style="margin:0 0 4px;font:600 15px/1 'Archivo',sans-serif">Minutes by day</h3>
      <p style="margin:0 0 18px;font-size:12.5px;color:rgba(23,22,15,.45)">Whole group · ${esc(label)}</p>
      <div style="display:flex;align-items:flex-end;gap:12px">${dayBars}</div>
    </div>
    <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
      <h3 style="margin:0 0 4px;font:600 15px/1 'Archivo',sans-serif">Squad standings</h3>
      <p style="margin:0 0 16px;font-size:12.5px;color:rgba(23,22,15,.45)">Compliance = members who've cleared ${sharedTarget} days this month</p>
      <div style="display:flex;flex-direction:column;gap:12px">${squadsHtml}</div>
    </div>
  </div>
</div>`;
}

function renderExclusions(me) {
  const sharedTarget = sharedEffectiveTarget(startOfMonth(todayDate()));
  const reasons = CHALLENGE.exclusionReasons.map((r) => `
    <button data-action="set-reason" data-reason="${esc(r)}" style="height:30px;padding:0 12px;border-radius:20px;cursor:pointer;font-size:12.5px;font-weight:${state.reason === r ? "600" : "400"};border:1px solid ${state.reason === r ? "transparent" : "rgba(23,22,15,.15)"};background:${state.reason === r ? "#17160f" : "#fff"};color:${state.reason === r ? "#f7f6f2" : "rgba(23,22,15,.7)"}">${esc(r)}</button>`).join("");

  const myExc = state.exclusions.filter((e) => e.member_id === me.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const myExcHtml = myExc.map((e) => {
    const colors = e.status === "APPROVED" ? ["#e4ece6", GREEN, GREEN] : e.status === "DECLINED" ? ["#eceae4", "rgba(23,22,15,.5)", "rgba(23,22,15,.3)"] : ["rgba(232,180,92,.18)", "#8a6420", AMBER];
    const days = Math.round((parseISO(e.to_date) - parseISO(e.from_date)) / 86400000) + 1;
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid rgba(23,22,15,.07)">
      <span style="width:8px;height:8px;border-radius:50%;background:${colors[2]};flex:none"></span>
      <div><div style="font-size:13.5px;font-weight:500">${esc(e.reason)}</div><div style="font-size:11.5px;color:rgba(23,22,15,.45);font-family:'IBM Plex Mono',monospace;margin-top:2px">${e.from_date}${e.to_date !== e.from_date ? " – " + e.to_date : ""} · ${days} day${days > 1 ? "s" : ""}</div></div>
      <span style="margin-left:auto;font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.05em;padding:4px 8px;border-radius:20px;background:${colors[0]};color:${colors[1]}">${e.status}</span>
      ${e.status === "PENDING" ? `<button data-action="remove-exclusion" data-id="${e.id}" style="background:none;border:0;color:rgba(23,22,15,.35);font-size:11px;cursor:pointer;margin-left:8px">Cancel</button>` : ""}
    </div>`;
  }).join("") || `<div style="padding:14px 0;color:rgba(23,22,15,.4);font-size:13px">No exclusion requests yet.</div>`;

  const holidaysHtml = [...state.holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)).map((h) => `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid rgba(23,22,15,.07);font-size:13px">
      <span style="font-family:'IBM Plex Mono',monospace;color:rgba(23,22,15,.5);width:96px">${fmtShort(parseISO(h.holiday_date))}</span>
      <span>${esc(h.name)}</span>
      <span style="margin-left:auto;font-size:11.5px;color:rgba(23,22,15,.38)">${esc(h.tag)}</span>
    </div>`).join("");

  return `
<div style="display:grid;grid-template-columns:1fr 1.15fr;gap:16px;align-items:start">
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:22px">
    <h3 style="margin:0 0 4px;font:600 15px/1 'Archivo',sans-serif">Request an exclusion</h3>
    <p style="margin:0 0 18px;font-size:12.5px;color:rgba(23,22,15,.5);line-height:1.55">Sick days, travel and declared holidays don't count against your ${sharedTarget} for the month. Public holidays are auto-excluded for everyone.</p>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600;margin-bottom:8px">Reason</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${reasons}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="display:flex;flex-direction:column;gap:7px"><span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">From</span><input type="date" data-bind="excFrom" value="${esc(state.excFrom)}" style="height:40px;padding:0 11px;border:1px solid rgba(23,22,15,.14);border-radius:8px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:13px"></label>
        <label style="display:flex;flex-direction:column;gap:7px"><span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">To</span><input type="date" data-bind="excTo" value="${esc(state.excTo)}" style="height:40px;padding:0 11px;border:1px solid rgba(23,22,15,.14);border-radius:8px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:13px"></label>
      </div>
      <label style="display:flex;flex-direction:column;gap:7px"><span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Note to the group</span><textarea data-bind="excNote" rows="3" placeholder="Client visit in Pune — back Friday." style="padding:10px 11px;border:1px solid rgba(23,22,15,.14);border-radius:8px;background:#fff;font-size:13px;resize:vertical">${esc(state.excNote)}</textarea></label>
      <button data-action="submit-exclusion" style="height:42px;border:0;border-radius:9px;background:#17160f;color:#f2f0eb;font-weight:600;font-size:13.5px;cursor:pointer">Submit for approval</button>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
      <h3 style="margin:0 0 14px;font:600 15px/1 'Archivo',sans-serif">Your exclusions this cycle</h3>
      <div style="display:flex;flex-direction:column">${myExcHtml}</div>
    </div>
    <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
      <h3 style="margin:0 0 4px;font:600 15px/1 'Archivo',sans-serif">Auto-excluded dates</h3>
      <p style="margin:0 0 14px;font-size:12.5px;color:rgba(23,22,15,.45)">Nobody needs to log on these.</p>
      <div style="display:flex;flex-direction:column">${holidaysHtml}</div>
    </div>
  </div>
</div>`;
}

function renderAdmin() {
  const snap = currentMonthSnapshot();
  const compliance = snap.length ? Math.round((snap.filter((s) => s.view.won).length / snap.length) * 100) : 0;
  const pending = state.exclusions.filter((e) => e.status === "PENDING").sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const totalMinutes = state.sessions.reduce((a, s) => a + s.minutes, 0);

  const adminStats = [
    { label: "Group compliance", value: compliance + "%", note: "This month, " + snap.length + " members", color: GREEN },
    { label: "Pending approvals", value: pending.length, note: pending.length ? "Oldest waiting " + Math.max(0, Math.floor((Date.now() - new Date(pending[0].created_at)) / 86400000)) + " days" : "All caught up", color: AMBER },
    { label: "Total minutes", value: totalMinutes.toLocaleString(), note: "Cycle to date, " + state.members.length + " members", color: DARK },
  ];
  const statsHtml = adminStats.map((a) => `
    <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:13px;padding:16px 18px">
      <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.45);font-weight:600;margin-bottom:10px">${a.label}</div>
      <div style="font:600 28px 'IBM Plex Mono',monospace;letter-spacing:-.02em;color:${a.color}">${a.value}</div>
      <div style="font-size:12px;color:rgba(23,22,15,.5);margin-top:8px">${esc(a.note)}</div>
    </div>`).join("");

  const pendingHtml = pending.map((p, i) => {
    const m = state.members.find((mm) => mm.id === p.member_id);
    const [bg, fg] = avatarOf(i + 2);
    return `
    <div style="display:flex;align-items:center;gap:13px;padding:12px 0;border-top:1px solid rgba(23,22,15,.07)">
      <div style="width:30px;height:30px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font:600 11px 'IBM Plex Mono',monospace;flex:none">${initialsOf(m ? m.name : "??")}</div>
      <div><div style="font-size:13.5px;font-weight:500">${esc(m ? m.name : p.member_id)} · <span style="font-weight:400;color:rgba(23,22,15,.55)">${esc(p.reason)}</span></div><div style="font-size:11.5px;color:rgba(23,22,15,.45);font-family:'IBM Plex Mono',monospace;margin-top:2px">${p.from_date}${p.to_date !== p.from_date ? " – " + p.to_date : ""}${p.note ? " · " + esc(p.note) : ""}</div></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button data-action="decline-exclusion" data-id="${p.id}" style="height:32px;padding:0 12px;border:1px solid rgba(23,22,15,.16);border-radius:7px;background:#fff;font-size:12.5px;cursor:pointer">Decline</button>
        <button data-action="approve-exclusion" data-id="${p.id}" style="height:32px;padding:0 12px;border:0;border-radius:7px;background:#2f6d4f;color:#fff;font-size:12.5px;font-weight:600;cursor:pointer">Approve</button>
      </div>
    </div>`;
  }).join("") || `<div style="padding:14px 0;color:rgba(23,22,15,.4);font-size:13px">Nothing pending.</div>`;

  const flags = computeFlags();
  const flagsHtml = flags.map((f) => `
    <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid rgba(23,22,15,.07);font-size:13px">
      <span style="width:8px;height:8px;border-radius:50%;background:${AMBER};flex:none"></span>
      <span style="font-weight:500">${esc(f.name)}</span>
      <span style="color:rgba(23,22,15,.55)">${esc(f.what)}</span>
      <span style="margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:rgba(23,22,15,.4)">${f.when}</span>
    </div>`).join("") || `<div style="padding:14px 0;color:rgba(23,22,15,.4);font-size:13px">No flags right now.</div>`;

  const membersHtml = state.members.map((m, i) => {
    const [bg, fg] = avatarOf(i);
    const total = state.sessions.filter((s) => s.member_id === m.id).length;
    const won = hasWonCurrentMonth(m.id);
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid rgba(23,22,15,.07);font-size:13px">
      <div style="width:26px;height:26px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font:600 10px 'IBM Plex Mono',monospace;flex:none">${initialsOf(m.name)}</div>
      <span style="font-weight:500">${esc(m.name)}${won ? " 🏆" : ""}</span>
      <span style="color:rgba(23,22,15,.45);font-size:11.5px">${esc(m.email)}</span>
      <span style="color:rgba(23,22,15,.4)">${esc(m.squad)}</span>
      <span style="color:rgba(23,22,15,.4)">${total} sessions</span>
      ${m.is_admin ? `<span style="font:600 10px 'IBM Plex Mono',monospace;padding:3px 7px;border-radius:20px;background:#efe4f2;color:#7a4a8a">ADMIN</span>` : ""}
      <button data-action="toggle-admin" data-id="${esc(m.id)}" style="margin-left:auto;background:none;border:1px solid rgba(23,22,15,.16);border-radius:7px;height:28px;padding:0 10px;font-size:11.5px;cursor:pointer">${m.is_admin ? "Remove admin" : "Make admin"}</button>
    </div>`;
  }).join("");

  const squadOptions = CHALLENGE.squads.map((s) => `<option ${s === state.newMemberSquad ? "selected" : ""}>${esc(s)}</option>`).join("");
  const createdPanel = state.createdCredentials ? `
    <div style="margin-bottom:14px;padding:12px 14px;border-radius:10px;background:rgba(47,109,79,.08);border:1px solid rgba(47,109,79,.25);display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div>
        <div style="font-size:12.5px;font-weight:600;color:${GREEN};margin-bottom:6px">Account created — share these with them:</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;line-height:1.7">Email: <strong>${esc(state.createdCredentials.email)}</strong><br>Password: <strong>${esc(state.createdCredentials.password)}</strong></div>
      </div>
      <button data-action="dismiss-credentials" style="background:none;border:0;color:rgba(23,22,15,.4);font-size:12px;cursor:pointer;flex:none">Dismiss</button>
    </div>` : "";

  return `
<div style="display:flex;flex-direction:column;gap:16px">
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${statsHtml}</div>
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
    <h3 style="margin:0 0 4px;font:600 15px/1 'Archivo',sans-serif">Create an account for a friend</h3>
    <p style="margin:0 0 16px;font-size:12.5px;color:rgba(23,22,15,.5);line-height:1.55">Set them up directly and share the credentials — they can change the password later if they want. You stay signed in as yourself the whole time.</p>
    ${createdPanel}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <label style="display:flex;flex-direction:column;gap:7px"><span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Name</span><input data-bind="newMemberName" value="${esc(state.newMemberName)}" placeholder="Full name" style="height:40px;padding:0 11px;border:1px solid rgba(23,22,15,.14);border-radius:8px;background:#fff;font-size:13px"></label>
      <label style="display:flex;flex-direction:column;gap:7px"><span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Squad</span><select data-bind="newMemberSquad" style="height:40px;padding:0 11px;border:1px solid rgba(23,22,15,.14);border-radius:8px;background:#fff;font-size:13px">${squadOptions}</select></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <label style="display:flex;flex-direction:column;gap:7px"><span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Email</span><input type="email" data-bind="newMemberEmail" value="${esc(state.newMemberEmail)}" placeholder="friend@example.com" style="height:40px;padding:0 11px;border:1px solid rgba(23,22,15,.14);border-radius:8px;background:#fff;font-size:13px"></label>
      <label style="display:flex;flex-direction:column;gap:7px"><span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Password <span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(23,22,15,.35)">auto-generated, editable</span></span><input data-bind="newMemberPassword" value="${esc(state.newMemberPassword)}" style="height:40px;padding:0 11px;border:1px solid rgba(23,22,15,.14);border-radius:8px;background:#fff;font-size:13px;font-family:'IBM Plex Mono',monospace"></label>
    </div>
    <div style="display:flex;gap:9px">
      <button data-action="admin-create-account" style="height:42px;padding:0 16px;border:0;border-radius:9px;background:#17160f;color:#f2f0eb;font-weight:600;font-size:13.5px;cursor:pointer">Create account</button>
      <button data-action="regenerate-password" style="height:42px;padding:0 14px;border:1px solid rgba(23,22,15,.16);border-radius:9px;background:#fff;font-size:12.5px;cursor:pointer">New password</button>
    </div>
  </div>
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
    <h3 style="margin:0 0 14px;font:600 15px/1 'Archivo',sans-serif">Pending approvals</h3>
    <div style="display:flex;flex-direction:column">${pendingHtml}</div>
  </div>
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
      <h3 style="margin:0;font:600 15px/1 'Archivo',sans-serif">Flagged entries</h3>
      <span style="font-size:12px;color:rgba(23,22,15,.45)">Auto-flagged: unusual duration, or logged more than 7 days after the fact</span>
    </div>
    <div style="display:flex;flex-direction:column">${flagsHtml}</div>
  </div>
  <div style="background:#fff;border:1px solid rgba(23,22,15,.09);border-radius:14px;padding:20px 22px">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
      <h3 style="margin:0;font:600 15px/1 'Archivo',sans-serif">Members · ${state.members.length}</h3>
      ${db.DEMO_MODE ? `<button data-action="reset-demo" style="background:none;border:1px solid rgba(23,22,15,.16);border-radius:7px;height:30px;padding:0 12px;font-size:12px;cursor:pointer">Reset demo data</button>` : ""}
    </div>
    <div style="display:flex;flex-direction:column">${membersHtml}</div>
  </div>
</div>`;
}

function renderLogModal(view, me) {
  const min = CHALLENGE.minMinutes, max = CHALLENGE.maxMinutes;
  const durColor = state.dur >= min ? GREEN : AMBER;
  const today = todayDate();
  const minDate = isoDate(addDays(today, -6));
  const maxDate = isoDate(today);
  const isEditing = !!state.editingSessionId;
  const presetValues = [30, 45, 60, 90, 120].filter((d) => d <= max);
  const presets = presetValues.map((d) => `
    <button data-action="set-dur-preset" data-dur="${d}" style="flex:1;height:32px;border-radius:8px;cursor:pointer;font-size:12.5px;font-family:'IBM Plex Mono',monospace;font-weight:${state.dur === d ? "600" : "400"};border:1px solid ${state.dur === d ? "transparent" : "rgba(23,22,15,.14)"};background:${state.dur === d ? "#17160f" : "#fff"};color:${state.dur === d ? "#f7f6f2" : "rgba(23,22,15,.7)"}">${d} min</button>`).join("");
  const types = CHALLENGE.sessionTypes.map((t) => {
    const active = state.types.includes(t);
    return `<button data-action="toggle-type" data-type="${esc(t)}" style="height:30px;padding:0 12px;border-radius:20px;cursor:pointer;font-size:12.5px;font-weight:${active ? "600" : "400"};border:1px solid ${active ? "transparent" : "rgba(23,22,15,.15)"};background:${active ? GREEN : "#fff"};color:${active ? "#fff" : "rgba(23,22,15,.7)"}">${esc(t)}</button>`;
  }).join("");
  const nextDay = Math.min(view.effectiveTarget, view.doneDays + 1);

  return `
<div data-action="close-log" style="position:fixed;inset:0;background:rgba(23,22,15,.5);display:flex;align-items:center;justify-content:center;padding:30px;z-index:40">
  <div data-action="stop" style="width:100%;max-width:452px;background:#f7f6f2;border-radius:16px;padding:24px 26px 26px;animation:fadeUp .18s ease both;box-shadow:0 24px 60px rgba(23,22,15,.3);max-height:90vh;overflow:auto">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px">
      <div>
        <h3 style="margin:0 0 4px;font:600 20px/1.2 'Archivo',sans-serif;letter-spacing:-.01em">${isEditing ? "Edit session" : "Log a session"}</h3>
        <p style="margin:0;font-size:12.5px;color:rgba(23,22,15,.5)">You can backdate up to 7 days — no future dates.</p>
      </div>
      <button data-action="close-log" style="width:30px;height:30px;border:0;border-radius:8px;background:rgba(23,22,15,.06);cursor:pointer;font-size:15px;color:rgba(23,22,15,.5)">×</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <label style="display:flex;flex-direction:column;gap:8px">
        <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Date</span>
        <input type="date" data-bind="logDate" value="${esc(state.logDate)}" min="${minDate}" max="${maxDate}" style="height:40px;padding:0 12px;border:1px solid rgba(23,22,15,.14);border-radius:9px;background:#fff;font-family:'IBM Plex Mono',monospace;font-size:13.5px;outline:none">
      </label>
      <div>
        <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600;margin-bottom:9px">Duration <span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(23,22,15,.35)">up to ${max} min</span></div>
        <div style="background:#fff;border:1px solid rgba(23,22,15,.1);border-radius:12px;padding:16px 18px">
          <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:12px;font-family:'IBM Plex Mono',monospace">
            <span id="logDurValue" style="font-size:38px;font-weight:600;letter-spacing:-.03em;color:${durColor}">${state.dur}</span>
            <span style="font-size:14px;color:rgba(23,22,15,.45)">minutes</span>
            <span id="logDurVerdict" style="margin-left:auto;font-size:11.5px;font-weight:500;color:${durColor}">${state.dur >= min ? "counts as a valid day" : "under " + min + " min — won't count"}</span>
          </div>
          <input id="logDurSlider" type="range" min="10" max="${max}" step="5" value="${state.dur}" style="width:100%;accent-color:#2f6d4f">
          <div style="display:flex;gap:7px;margin-top:12px">${presets}</div>
        </div>
      </div>
      <div>
        <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600;margin-bottom:9px">What did you do <span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(23,22,15,.35)">pick one or more</span></div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">${types}</div>
      </div>
      <label style="display:flex;flex-direction:column;gap:8px">
        <span style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:rgba(23,22,15,.5);font-weight:600">Note <span style="font-weight:400;text-transform:none;letter-spacing:0;color:rgba(23,22,15,.35)">optional, visible to all</span></span>
        <input data-bind="note" value="${esc(state.note)}" placeholder="Leg day. Regret everything." style="height:40px;padding:0 12px;border:1px solid rgba(23,22,15,.14);border-radius:9px;background:#fff;font-size:13.5px;outline:none">
      </label>
      ${!isEditing ? `<div style="display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:10px;background:rgba(47,109,79,.08)">
        <span style="width:8px;height:8px;border-radius:50%;background:#2f6d4f"></span>
        <span style="font-size:12.5px;color:rgba(23,22,15,.65)">This will be day <strong>${nextDay}</strong> of ${view.effectiveTarget} this month.</span>
      </div>` : ""}
      <div style="display:flex;gap:9px">
        ${isEditing ? `<button data-action="delete-session" data-id="${state.editingSessionId}" style="flex:none;height:44px;padding:0 16px;border:1px solid rgba(200,80,80,.35);border-radius:10px;background:#fff;color:#a33;font-size:13.5px;cursor:pointer">Delete</button>` : ""}
        <button data-action="close-log" style="flex:none;height:44px;padding:0 16px;border:1px solid rgba(23,22,15,.16);border-radius:10px;background:#fff;font-size:13.5px;cursor:pointer">Cancel</button>
        <button data-action="submit-log" style="flex:1;height:44px;border:0;border-radius:10px;background:#17160f;color:#f2f0eb;font-weight:600;font-size:14px;cursor:pointer">${isEditing ? "Save changes" : "Mark attendance"}</button>
      </div>
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
function exportCsv() {
  const { from, to, label } = rangeToDates();
  const dates = dateList(from, to);
  const members = filteredMembers();
  const rows = [["Name", "Squad", "Date", "Minutes", "Type", "Note", "Status"]];
  for (const m of members) {
    const dm = dailyMinutesMap(m.id);
    for (const d of dates) {
      const iso = isoDate(d);
      const mins = dm[iso] || 0;
      const excused = isExcludedDay(m.id, iso);
      const daySessions = state.sessions.filter((s) => s.member_id === m.id && s.session_date === iso);
      if (mins === 0 && !excused) continue;
      const types = daySessions.map((s) => s.type).join(" / ") || "";
      const notes = daySessions.map((s) => s.note).filter(Boolean).join(" | ");
      const status = excused ? "EXCUSED" : mins >= CHALLENGE.minMinutes ? "VALID" : "SHORT";
      rows.push([m.name, m.squad, iso, mins, types, notes, status]);
    }
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `45x${CHALLENGE.monthlyTargetDays}-team-log-${label.replace(/\s+/g, "-").toLowerCase()}-${isoDate(todayDate())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// event wiring
// ---------------------------------------------------------------------------
async function withErrorHandling(fn) {
  try {
    await fn();
  } catch (e) {
    state.error = e.message || String(e);
    render();
  }
}

function resetLogForm() {
  state.dur = CHALLENGE.minMinutes;
  state.types = [CHALLENGE.sessionTypes[0]];
  state.note = "";
  state.logDate = isoDate(todayDate());
  state.editingSessionId = null;
}

root.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  if (action === "stop") {
    ev.stopPropagation();
    return;
  }
  if (action === "close-log") {
    state.logOpen = false;
    render();
    return;
  }
  if (action === "open-log") {
    resetLogForm();
    state.logOpen = true;
    render();
    return;
  }
  if (action === "edit-session") {
    const s = state.sessions.find((ss) => ss.id === el.dataset.id);
    if (!s) return;
    state.editingSessionId = s.id;
    state.logDate = s.session_date;
    state.dur = s.minutes;
    state.types = s.type ? s.type.split(",").map((t) => t.trim()).filter(Boolean) : [CHALLENGE.sessionTypes[0]];
    state.note = s.note || "";
    state.logOpen = true;
    render();
    return;
  }
  if (action === "delete-session") {
    if (!confirm("Delete this session? This can't be undone.")) return;
    await withErrorHandling(async () => {
      await db.deleteSession(el.dataset.id);
      state.logOpen = false;
      state.editingSessionId = null;
      await loadAll();
      render();
    });
    return;
  }
  if (action === "switch-tab") {
    state.tab = el.dataset.tab;
    render();
    return;
  }
  if (action === "set-dur-preset") {
    state.dur = Number(el.dataset.dur);
    render();
    return;
  }
  if (action === "toggle-type") {
    const t = el.dataset.type;
    if (state.types.includes(t)) {
      if (state.types.length > 1) state.types = state.types.filter((x) => x !== t);
    } else {
      state.types = [...state.types, t];
    }
    render();
    return;
  }
  if (action === "set-range") {
    state.range = el.dataset.range;
    render();
    return;
  }
  if (action === "apply-custom-range") {
    render();
    return;
  }
  if (action === "set-home-range") {
    state.homeRange = el.dataset.range;
    render();
    return;
  }
  if (action === "apply-home-range") {
    render();
    return;
  }
  if (action === "set-reason") {
    state.reason = el.dataset.reason;
    render();
    return;
  }
  if (action === "show-signup") {
    state.authView = "signup";
    state.error = "";
    state.info = "";
    render();
    return;
  }
  if (action === "show-signin") {
    state.authView = "signin";
    state.error = "";
    state.info = "";
    render();
    return;
  }
  if (action === "logout") {
    await withErrorHandling(async () => {
      await db.signOut();
      state.currentMemberId = "";
      state.screen = "login";
      state.tab = "home";
      state.authView = "signin";
      state.signInPassword = "";
      render();
    });
    return;
  }

  if (action === "submit-signin") {
    const email = state.signInEmail.trim();
    if (!email || !state.signInPassword) {
      state.error = "Enter your email and password.";
      render();
      return;
    }
    await withErrorHandling(async () => {
      const member = await db.signIn({ email, password: state.signInPassword });
      state.error = "";
      state.info = "";
      state.signInPassword = "";
      state.currentMemberId = member.id;
      state.screen = "app";
      state.tab = "home";
      await loadAll();
      render();
    });
    return;
  }
  if (action === "submit-signup") {
    if (!state.joinName.trim() || !state.joinEmail.trim()) {
      state.error = "Enter your name and email.";
      render();
      return;
    }
    if (state.joinPassword.length < 8) {
      state.error = "Password must be at least 8 characters.";
      render();
      return;
    }
    await withErrorHandling(async () => {
      const { member, needsConfirmation } = await db.signUp({
        name: state.joinName, email: state.joinEmail, password: state.joinPassword, squad: state.joinSquad,
      });
      state.error = "";
      state.joinPassword = "";
      if (needsConfirmation) {
        state.info = "Account created — check your email to confirm it, then sign in.";
        state.authView = "signin";
        state.signInEmail = state.joinEmail;
      } else {
        state.info = "";
        state.currentMemberId = member.id;
        state.screen = "app";
        state.tab = "home";
        await loadAll();
      }
      render();
    });
    return;
  }
  if (action === "submit-log") {
    const minDate = isoDate(addDays(todayDate(), -6));
    const maxDate = isoDate(todayDate());
    if (!state.logDate || state.logDate < minDate || state.logDate > maxDate) {
      state.error = "Pick a date within the last 7 days (no future dates).";
      render();
      return;
    }
    if (!state.types.length) {
      state.error = "Pick at least one type.";
      render();
      return;
    }
    await withErrorHandling(async () => {
      const payload = { date: state.logDate, minutes: state.dur, type: state.types.join(", "), note: state.note.trim() };
      if (state.editingSessionId) {
        await db.updateSession(state.editingSessionId, payload);
      } else {
        await db.logSession({ memberId: state.currentMemberId, ...payload });
      }
      state.logOpen = false;
      state.editingSessionId = null;
      state.note = "";
      state.tab = "home";
      state.error = "";
      await loadAll();
      render();
    });
    return;
  }
  if (action === "submit-exclusion") {
    if (!state.excFrom || !state.excTo) {
      state.error = "Pick a from and to date.";
      render();
      return;
    }
    await withErrorHandling(async () => {
      await db.requestExclusion({ memberId: state.currentMemberId, reason: state.reason, from: state.excFrom, to: state.excTo, note: state.excNote.trim() });
      state.excFrom = "";
      state.excTo = "";
      state.excNote = "";
      state.error = "";
      await loadAll();
      render();
    });
    return;
  }
  if (action === "remove-exclusion") {
    await withErrorHandling(async () => {
      await db.removeExclusion(el.dataset.id);
      await loadAll();
      render();
    });
    return;
  }
  if (action === "approve-exclusion" || action === "decline-exclusion") {
    await withErrorHandling(async () => {
      await db.setExclusionStatus(el.dataset.id, action === "approve-exclusion" ? "APPROVED" : "DECLINED");
      await loadAll();
      render();
    });
    return;
  }
  if (action === "toggle-admin") {
    await withErrorHandling(async () => {
      const m = state.members.find((mm) => mm.id === el.dataset.id);
      await db.setMemberAdmin(el.dataset.id, !m.is_admin);
      await loadAll();
      render();
    });
    return;
  }
  if (action === "admin-create-account") {
    if (!state.newMemberName.trim() || !state.newMemberEmail.trim()) {
      state.error = "Enter a name and email.";
      render();
      return;
    }
    if (state.newMemberPassword.length < 8) {
      state.error = "Password must be at least 8 characters.";
      render();
      return;
    }
    await withErrorHandling(async () => {
      const created = await db.adminCreateAccount({
        name: state.newMemberName.trim(), email: state.newMemberEmail.trim(),
        password: state.newMemberPassword, squad: state.newMemberSquad,
      });
      state.error = "";
      state.createdCredentials = { email: created.email, password: state.newMemberPassword };
      state.newMemberName = "";
      state.newMemberEmail = "";
      state.newMemberPassword = generatePassword();
      await loadAll();
      render();
    });
    return;
  }
  if (action === "regenerate-password") {
    state.newMemberPassword = generatePassword();
    render();
    return;
  }
  if (action === "dismiss-credentials") {
    state.createdCredentials = null;
    render();
    return;
  }
  if (action === "reset-demo") {
    if (!confirm("Reset all demo data back to the seeded sample? This can't be undone.")) return;
    await withErrorHandling(async () => {
      await db.resetDemoData();
      state.currentMemberId = "";
      state.screen = "login";
      state.tab = "home";
      await loadAll();
      render();
    });
    return;
  }
  if (action === "export-csv") {
    exportCsv();
    return;
  }
});

root.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.id === "logDurSlider") {
    state.dur = Number(el.value);
    const min = CHALLENGE.minMinutes;
    const durColor = state.dur >= min ? GREEN : AMBER;
    const valueEl = document.getElementById("logDurValue");
    const verdictEl = document.getElementById("logDurVerdict");
    if (valueEl) { valueEl.textContent = state.dur; valueEl.style.color = durColor; }
    if (verdictEl) { verdictEl.textContent = state.dur >= min ? "counts as a valid day" : "under " + min + " min — won't count"; verdictEl.style.color = durColor; }
    root.querySelectorAll("[data-action='set-dur-preset']").forEach((btn) => {
      const active = Number(btn.dataset.dur) === state.dur;
      btn.style.fontWeight = active ? "600" : "400";
      btn.style.border = active ? "1px solid transparent" : "1px solid rgba(23,22,15,.14)";
      btn.style.background = active ? "#17160f" : "#fff";
      btn.style.color = active ? "#f7f6f2" : "rgba(23,22,15,.7)";
    });
    return;
  }
  const bind = el.dataset.bind;
  if (bind) state[bind] = el.value;
});
root.addEventListener("change", (ev) => {
  const el = ev.target;
  const bind = el.dataset.bind;
  if (!bind) return;
  state[bind] = el.value;
  if (bind === "squadFilter" || bind === "joinSquad") render();
});

boot();
