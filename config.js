// Fill these in from your Supabase project (Project Settings -> API) to get
// real, shared, multi-user data. Leave them blank to run in local demo mode:
// the app still fully works, but data is only stored in this browser
// (localStorage) instead of a shared database.
export const SUPABASE_URL = "https://wijvvdxtanqopdkdaibd.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_7tu0L-N9yxEbfxN-BUNEow_3NGHARp7";

export const CHALLENGE = {
  minDays: 5,
  minMinutes: 45,
  cycleLabel: "Cycle 3",
  squads: ["Squad Iron", "Squad Tempo", "Squad Dawn"],
  sessionTypes: ["Weights", "Cardio", "Class", "Yoga", "Sport"],
  exclusionReasons: ["Not well", "Travelling", "Public holiday"],
};
