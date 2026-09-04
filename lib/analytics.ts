// ─────────────────────────────────────────────────────────────────────────────
// Analytics — derives real history, trends and priorities from the activity log.
//
// The product stores only CURRENT facility state, but activity_log records every
// status transition with an ISO timestamp. We reconstruct history by starting
// from the present and replaying transitions backwards.
//
// Honesty rule: nothing here invents data. Where the log does not reach back far
// enough we carry the earliest known value backwards and report `coverage` so the
// UI can say how much of the window is observed rather than assumed.
// ─────────────────────────────────────────────────────────────────────────────

export type RAG = "green" | "amber" | "red" | "na";

export interface FacState {
  internet: RAG; bio: RAG; printing: RAG;
  bandwidth: string; requiredBandwidth: string;
  issue: string; notes: string; ts: string;
}

export interface LogEntry {
  id: string;
  facility: string;
  field: string;
  oldVal: string;
  newVal: string;
  type: string;
  ts: string;
  /** ISO timestamp injected from the DB row (`updated_at`). */
  at?: string;
}

export interface DowntimeRec {
  id: string; facility: string; field: string;
  startTs: string; endTs: string; durationMin: number; resolvedBy: string;
}

export const SERVICES = ["internet", "bio", "printing"] as const;
export type Service = typeof SERVICES[number];
export const SERVICE_LABEL: Record<Service, string> = {
  internet: "Internet", bio: "Biometric", printing: "Printing",
};

const RAG_SET = new Set(["green", "amber", "red", "na"]);
const isRag = (v: string): v is RAG => RAG_SET.has(v);

/** Worst-of the three services decides the facility's overall state. */
export function overallOf(s: FacState): RAG {
  const v = [s.internet, s.bio, s.printing];
  if (v.includes("red")) return "red";
  if (v.includes("amber")) return "amber";
  if (v.every(x => x === "na")) return "na";
  return "green";
}

/** Severity ordering — higher is worse. Drives every sort in the product. */
export const severity: Record<RAG, number> = { red: 3, amber: 2, na: 1, green: 0 };

function entryTime(e: LogEntry): number {
  if (e.at) { const t = Date.parse(e.at); if (!Number.isNaN(t)) return t; }
  const t = Date.parse(e.ts);
  return Number.isNaN(t) ? 0 : t;
}

/** Status transitions only, newest first, with a usable timestamp. */
export function statusTransitions(log: LogEntry[]): (LogEntry & { time: number })[] {
  return log
    .filter(e => (SERVICES as readonly string[]).includes(e.field) && isRag(e.newVal) && isRag(e.oldVal))
    .map(e => ({ ...e, time: entryTime(e) }))
    .filter(e => e.time > 0)
    .sort((a, b) => b.time - a.time);
}

export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };

export interface HealthPoint {
  /** Midnight at the end of the day this point summarises. */
  t: number;
  /** Share of facilities fully operational, 0..1 */
  health: number;
  green: number; amber: number; red: number; na: number;
  /** Per-service operational share, 0..1 */
  svc: Record<Service, number>;
}

export interface HistoryResult {
  points: HealthPoint[];
  /** 0..1 — how much of the window the log actually observes. */
  coverage: number;
  /** Oldest transition we could see, or null when the log is empty. */
  observedFrom: number | null;
}

/**
 * Reconstruct daily estate health for the last `days` days by replaying
 * transitions backwards from the current state.
 */
export function reconstructHistory(
  facilities: { name: string; cat: string }[],
  state: Record<string, FacState>,
  log: LogEntry[],
  days = 14,
  defaults: () => FacState = () => ({
    internet:"green", bio:"green", printing:"green",
    bandwidth:"", requiredBandwidth:"", issue:"", notes:"", ts:"",
  }),
): HistoryResult {
  const tx = statusTransitions(log);
  const now = Date.now();

  // Working copy of "state as at cursor time", seeded with the present.
  const cur: Record<string, Record<Service, RAG>> = {};
  for (const f of facilities) {
    const s = state[f.name] ?? defaults();
    cur[f.name] = { internet: s.internet, bio: s.bio, printing: s.printing };
  }

  const sample = (): Omit<HealthPoint, "t"> => {
    let g = 0, a = 0, r = 0, n = 0;
    const svcOk: Record<Service, number> = { internet: 0, bio: 0, printing: 0 };
    for (const f of facilities) {
      const c = cur[f.name];
      if (!c) continue;
      for (const sv of SERVICES) if (c[sv] === "green") svcOk[sv]++;
      const v = [c.internet, c.bio, c.printing];
      if (v.includes("red")) r++;
      else if (v.includes("amber")) a++;
      else if (v.every(x => x === "na")) n++;
      else g++;
    }
    const total = facilities.length || 1;
    return {
      health: g / total, green: g, amber: a, red: r, na: n,
      svc: {
        internet: svcOk.internet / total,
        bio: svcOk.bio / total,
        printing: svcOk.printing / total,
      },
    };
  };

  const points: HealthPoint[] = [];
  let ti = 0; // cursor into `tx` (already newest-first)

  // Walk day boundaries backwards: today, yesterday, ...
  for (let d = 0; d < days; d++) {
    const dayEnd = d === 0 ? now : startOfDay(new Date(now - (d - 1) * 864e5)).getTime();
    // Undo every transition that happened after this boundary.
    while (ti < tx.length && tx[ti].time >= dayEnd) {
      const e = tx[ti];
      const rec = cur[e.facility];
      if (rec && (SERVICES as readonly string[]).includes(e.field)) {
        rec[e.field as Service] = e.oldVal as RAG;
      }
      ti++;
    }
    points.push({ t: dayEnd, ...sample() });
  }

  points.reverse(); // oldest → newest, natural reading order for charts

  const oldest = tx.length ? tx[tx.length - 1].time : null;
  const windowStart = now - days * 864e5;
  const coverage = oldest === null
    ? 0
    : Math.max(0, Math.min(1, (now - Math.max(oldest, windowStart)) / (days * 864e5)));

  return { points, coverage, observedFrom: oldest };
}

export interface AttentionItem {
  facility: string;
  cat: string;
  status: RAG;
  /** Human reason this is on the list, e.g. "Internet down". */
  reason: string;
  /** Services currently not green. */
  failing: { service: Service; status: RAG }[];
  /** ms since the current problem began, null when unknown. */
  since: number | null;
  /** Status flips in the trailing window — repeated flapping is its own signal. */
  flips: number;
  /** Current bandwidth as a share of required, null when not supplied. */
  bwRatio: number | null;
  issue: string;
  /** Composite rank; higher sorts first. */
  score: number;
}

/**
 * Rank what needs attention. Severity dominates, then how long it has been
 * broken, then how often it has flipped, then bandwidth deficit.
 */
export function attentionQueue(
  facilities: { name: string; cat: string }[],
  state: Record<string, FacState>,
  log: LogEntry[],
  windowDays = 7,
): AttentionItem[] {
  const tx = statusTransitions(log);
  const since = Date.now() - windowDays * 864e5;
  const out: AttentionItem[] = [];

  for (const f of facilities) {
    const s = state[f.name];
    if (!s) continue;
    const status = overallOf(s);
    if (status === "green") continue;

    const failing = SERVICES
      .filter(sv => s[sv] !== "green" && s[sv] !== "na")
      .map(sv => ({ service: sv, status: s[sv] }));
    if (status === "na" && failing.length === 0) continue;

    const mine = tx.filter(e => e.facility === f.name);
    const flips = mine.filter(e => e.time >= since).length;

    // When did the current problem start? The newest transition INTO a bad state
    // on a service that is still bad.
    let onsetAt: number | null = null;
    for (const sv of failing.map(x => x.service)) {
      const t = mine.find(e => e.field === sv && e.newVal === s[sv]);
      if (t && (onsetAt === null || t.time < onsetAt)) onsetAt = t.time;
    }

    const cur = parseFloat((s.bandwidth || "").replace(/[^0-9.]/g, ""));
    const req = parseFloat((s.requiredBandwidth || "").replace(/[^0-9.]/g, ""));
    const bwRatio = cur > 0 && req > 0 ? cur / req : null;

    const worst = failing.length
      ? failing.reduce((w, x) => (severity[x.status] > severity[w.status] ? x : w))
      : null;
    const reason = worst
      ? `${SERVICE_LABEL[worst.service]} ${worst.status === "red" ? "down" : "degraded"}`
      : "Status not configured";

    const ageHours = onsetAt ? (Date.now() - onsetAt) / 36e5 : 0;
    const score =
      severity[status] * 1000 +
      Math.min(ageHours, 168) * 3 +
      flips * 25 +
      (bwRatio !== null && bwRatio < 1 ? (1 - bwRatio) * 60 : 0) +
      failing.length * 15;

    out.push({
      facility: f.name, cat: f.cat, status, reason, failing,
      since: onsetAt, flips, bwRatio, issue: s.issue || "", score,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

export interface ChangeSummary {
  recovered: number;
  degraded: number;
  events: { facility: string; service: Service; from: RAG; to: RAG; time: number; improved: boolean }[];
}

/** Transitions inside the trailing window, split by direction. */
export function changesSince(log: LogEntry[], sinceMs: number): ChangeSummary {
  const events = statusTransitions(log)
    .filter(e => e.time >= sinceMs)
    .map(e => ({
      facility: e.facility,
      service: e.field as Service,
      from: e.oldVal as RAG,
      to: e.newVal as RAG,
      time: e.time,
      improved: severity[e.newVal as RAG] < severity[e.oldVal as RAG],
    }));
  return {
    recovered: events.filter(e => e.improved).length,
    degraded: events.filter(e => !e.improved).length,
    events,
  };
}

export interface DivisionPerf {
  cat: string;
  total: number;
  green: number; amber: number; red: number; na: number;
  health: number;
  /** Percentage-point change vs the start of the history window, null if unknown. */
  delta: number | null;
}

export function divisionPerformance(
  facilities: { name: string; cat: string }[],
  state: Record<string, FacState>,
  log: LogEntry[],
  days = 14,
  defaults?: () => FacState,
): DivisionPerf[] {
  const cats = Array.from(new Set(facilities.map(f => f.cat)));
  return cats.map(cat => {
    const fs = facilities.filter(f => f.cat === cat);
    let g = 0, a = 0, r = 0, n = 0;
    for (const f of fs) {
      const s = state[f.name];
      if (!s) { n++; continue; }
      const o = overallOf(s);
      if (o === "green") g++; else if (o === "amber") a++; else if (o === "red") r++; else n++;
    }
    const total = fs.length || 1;
    const health = g / total;

    const hist = reconstructHistory(fs, state, log, days, defaults);
    const first = hist.points[0];
    const delta = hist.coverage > 0 && first ? (health - first.health) * 100 : null;

    return { cat, total: fs.length, green: g, amber: a, red: r, na: n, health, delta };
  }).sort((x, y) => x.health - y.health); // worst division first — that is the story
}

export interface ServiceStat {
  service: Service;
  ok: number; degraded: number; down: number; total: number;
  availability: number;
  series: number[];
  delta: number | null;
}

export function serviceStats(
  facilities: { name: string; cat: string }[],
  state: Record<string, FacState>,
  hist: HistoryResult,
): ServiceStat[] {
  return SERVICES.map(sv => {
    let ok = 0, degraded = 0, down = 0;
    for (const f of facilities) {
      const s = state[f.name];
      if (!s) continue;
      if (s[sv] === "green") ok++;
      else if (s[sv] === "amber") degraded++;
      else if (s[sv] === "red") down++;
    }
    const total = facilities.length || 1;
    const series = hist.points.map(p => p.svc[sv]);
    const delta = hist.coverage > 0 && series.length > 1
      ? (series[series.length - 1] - series[0]) * 100
      : null;
    return { service: sv, ok, degraded, down, total: facilities.length, availability: ok / total, series, delta };
  });
}

/** Facilities that flipped most often — instability the snapshot cannot show. */
export function repeatOffenders(log: LogEntry[], windowDays = 7, limit = 5) {
  const since = Date.now() - windowDays * 864e5;
  const counts = new Map<string, number>();
  for (const e of statusTransitions(log)) {
    if (e.time < since) break; // newest-first, so we can stop
    counts.set(e.facility, (counts.get(e.facility) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([facility, flips]) => ({ facility, flips }))
    .filter(x => x.flips >= 2)
    .sort((a, b) => b.flips - a.flips)
    .slice(0, limit);
}

/** Facilities running below their stated bandwidth requirement. */
export function bandwidthDeficits(
  facilities: { name: string; cat: string }[],
  state: Record<string, FacState>,
) {
  const out: { facility: string; cat: string; current: number; required: number; ratio: number }[] = [];
  for (const f of facilities) {
    const s = state[f.name];
    if (!s) continue;
    const cur = parseFloat((s.bandwidth || "").replace(/[^0-9.]/g, ""));
    const req = parseFloat((s.requiredBandwidth || "").replace(/[^0-9.]/g, ""));
    if (!(cur > 0) || !(req > 0)) continue;
    const ratio = cur / req;
    if (ratio >= 1) continue;
    out.push({ facility: f.name, cat: f.cat, current: cur, required: req, ratio });
  }
  return out.sort((a, b) => a.ratio - b.ratio);
}

export const fmtDuration = (ms: number | null): string => {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};

/**
 * The headline. One sentence that states the position, so the reader does not
 * have to assemble it from tiles.
 */
export function verdict(
  health: number,
  attention: AttentionItem[],
  change: ChangeSummary,
  trendDelta: number | null,
): { headline: string; sub: string; tone: RAG } {
  const pct = Math.round(health * 100);
  const crit = attention.filter(a => a.status === "red").length;
  const deg = attention.filter(a => a.status === "amber").length;

  const tone: RAG = crit > 0 ? "red" : deg > 0 ? "amber" : "green";

  const headline =
    crit > 0
      ? `${crit} site${crit > 1 ? "s" : ""} ${crit > 1 ? "are" : "is"} down. Estate is at ${pct}% operational capacity.`
      : deg > 0
        ? `Estate is stable at ${pct}%, with ${deg} site${deg > 1 ? "s" : ""} degraded.`
        : `All monitored sites are fully operational at ${pct}%.`;

  const dir = trendDelta === null ? null : trendDelta > 1.5 ? "improving" : trendDelta < -1.5 ? "declining" : "flat";
  const bits: string[] = [];
  if (dir) bits.push(`Trend is ${dir}${trendDelta !== null && dir !== "flat" ? ` (${trendDelta > 0 ? "+" : ""}${trendDelta.toFixed(1)} pts over the window)` : ""}.`);
  if (change.recovered || change.degraded) {
    bits.push(`${change.recovered} recovery${change.recovered === 1 ? "" : "s"} and ${change.degraded} regression${change.degraded === 1 ? "" : "s"} in the last 24 hours.`);
  } else {
    bits.push("No status changes in the last 24 hours.");
  }

  return { headline, sub: bits.join(" "), tone };
}
