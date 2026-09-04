"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ReportModal from "./ReportModal";

const FACILITIES: { name: string; cat: string }[] = [
  // Imarat corporate (8)
  { name: "G9 Group Store",               cat: "Imarat"   },
  { name: "Warehouse",                    cat: "Imarat"   },
  { name: "I8 Guest House",               cat: "Imarat"   },
  { name: "Record Room",                  cat: "Imarat"   },
  { name: "F8 Chairman House",            cat: "Imarat"   },
  { name: "Printing Press",               cat: "Imarat"   },
  { name: "Sialkot Office",               cat: "Imarat"   },
  { name: "Hoon Farm House",              cat: "Imarat"   },
  // Projects (10)
  { name: "Amazon Mall",                  cat: "Projects" },
  { name: "Golf Floras",                  cat: "Projects" },
  { name: "Mall of Imarat",               cat: "Projects" },
  { name: "G11 CYBM",                     cat: "Projects" },
  { name: "Florence Galleria",            cat: "Projects" },
  { name: "Builders Mall",                cat: "Projects" },
  { name: "Babylon Multan",               cat: "Projects" },
  { name: "IR 1",                         cat: "Projects" },
  { name: "IR 2",                         cat: "Projects" },
  { name: "G. Floras Sales Office",       cat: "Projects" },
  // Graana (7)
  { name: "Rawalpindi RO – Opp. Ayub Park", cat: "Graana" },
  { name: "Lahore Office – MM Alam",      cat: "Graana"   },
  { name: "Bahria Phase 7 Midway",        cat: "Graana"   },
  { name: "Peshawar Graana",              cat: "Graana"   },
  { name: "Multan Citi Plaza",            cat: "Graana"   },
  { name: "RO Karachi",                   cat: "Graana"   },
  { name: "Quetta Office",                cat: "Graana"   },
  // Agency21 (6)
  { name: "DHA – Opp. Giga Mall",         cat: "Agency21" },
  { name: "Peshawar Agency21",            cat: "Agency21" },
  { name: "Agency21 Blue Area",           cat: "Agency21" },
  { name: "Civic Center RO",              cat: "Agency21" },
  { name: "Site Office – GT Road",        cat: "Agency21" },
  { name: "DHA Karachi",                  cat: "Agency21" },
];

const TEAM = [
  "— Select Team Member —",
  "Usama Nasir",
  "Muhammad Usman",
  "Ali Raza",
  "Rameez Gulzar",
  "Hamza",
  "Mubasher Hassan",
  "Huzaifa Talib",
];

type RAGStatus = "green" | "amber" | "red" | "na";
interface FacilityState {
  internet: RAGStatus;
  bio: RAGStatus;
  printing: RAGStatus;
  bandwidth: string;
  requiredBandwidth: string;
  issue: string;
  notes: string;
  ts: string;
}
type AppState = Record<string, FacilityState>;
type FilterMode = "all" | "green" | "amber" | "red";

interface ActivityLog {
  id: string;
  ts: string;
  facility: string;
  field: string;
  oldVal: string;
  newVal: string;
  type: "status" | "issue" | "notes" | "bandwidth" | "ticket";
}

interface DowntimeRecord {
  id: string;
  facility: string;
  field: string;
  startTs: string;
  endTs: string;
  durationMin: number;
  resolvedBy: string;
}

interface Ticket {
  id: string;
  office: string;
  medium: string;
  description: string;
  reportedBy: string;
  assignedTo: string;
  resolvedBy: string;
  status: "open" | "inprogress" | "resolved" | "pending";
  ts: string;
  resolvedTs: string;
}

interface DailyStats {
  received: number;
  resolved: number;
  pending: number;
  inprogress: number;
}

const INET_OPTS: { v: RAGStatus; l: string }[] = [
  { v: "green", l: "Working" },
  { v: "amber", l: "Slow / Intermittent" },
  { v: "red", l: "Down" },
  { v: "na", l: "N/A" },
];
const BIO_OPTS: { v: RAGStatus; l: string }[] = [
  { v: "green", l: "Working & Syncing" },
  { v: "amber", l: "Working but Delayed" },
  { v: "red", l: "Not Working" },
  { v: "na", l: "N/A" },
];
const PRINT_OPTS: { v: RAGStatus; l: string }[] = [
  { v: "green", l: "Working" },
  { v: "amber", l: "Partially Working" },
  { v: "red", l: "Not Working" },
  { v: "na", l: "N/A" },
];

const RAG: Record<RAGStatus, { bg: string; border: string; text: string; label: string; dot: string }> = {
  green: { bg:"rgba(16,185,129,0.12)", border:"rgba(16,185,129,0.35)", text:"#10B981", label:"Operational", dot:"#10B981" },
  amber: { bg:"rgba(245,158,11,0.12)", border:"rgba(245,158,11,0.35)", text:"#F59E0B", label:"Degraded",    dot:"#F59E0B" },
  red:   { bg:"rgba(244,63,94,0.12)", border:"rgba(244,63,94,0.35)", text:"#F43F5E", label:"Critical",    dot:"#F43F5E" },
  na:    { bg:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.30)", text:"#94A3B8", label:"N/A",         dot:"#94A3B8" },
};
const CAT_COLORS: Record<string,string> = {
  Projects:"#38BDF8", Imarat:"#10B981", Graana:"#A78BFA", Agency21:"#FB923C",
};

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", second:"2-digit", hour12:true });
}
function nowFull() {
  return new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"numeric", minute:"2-digit", second:"2-digit", hour12:true });
}
function uid() { return Math.random().toString(36).substr(2, 9).toUpperCase(); }
function calcOverall(s: FacilityState): RAGStatus {
  const vals = [s.internet, s.bio, s.printing];
  if (vals.includes("red")) return "red";
  if (vals.includes("amber")) return "amber";
  if (vals.every(v => v === "na")) return "na";
  return "green";
}
function defaultState(): FacilityState {
  return { internet:"green", bio:"green", printing:"green", bandwidth:"", requiredBandwidth:"", issue:"", notes:"", ts:nowTime() };
}
function bwCompare(cur: string, req: string): { label: string; bg: string; border: string; color: string } | null {
  const c = parseFloat(cur?.replace(/[^0-9.]/g,"") || "");
  const r = parseFloat(req?.replace(/[^0-9.]/g,"") || "");
  if (!c || !r) return null;
  const pct = Math.round((c/r)*100);
  if (pct >= 100) return { label:`${pct}% OK`,       bg:"rgba(16,185,129,0.12)", border:"rgba(16,185,129,0.35)", color:"#10B981" };
  if (pct >= 70)  return { label:`${pct}% LOW`,      bg:"rgba(245,158,11,0.12)", border:"rgba(245,158,11,0.35)", color:"#F59E0B" };
  return             { label:`${pct}% CRITICAL`, bg:"rgba(244,63,94,0.12)", border:"rgba(244,63,94,0.35)", color:"#F43F5E" };
}
function fieldLabel(f: string): string {
  const m: Record<string,string> = { internet:"Internet", bio:"Biometric", printing:"Printing", bandwidth:"Current BW", requiredBandwidth:"Required BW", issue:"Reported Issue", notes:"Notes" };
  return m[f] || f;
}
function humanVal(val: string): string {
  const m: Record<string,string> = {
    green:"Working / OK", amber:"Slow / Degraded", red:"Down / Critical", na:"N/A",
    open:"Open", inprogress:"In Progress", resolved:"Resolved", pending:"Pending",
  };
  return m[val.toLowerCase()] || val;
}

function Dot({ s }: { s: RAGStatus }) {
  return <span style={{ display:"inline-block", width:9, height:9, borderRadius:"50%", background:RAG[s].dot, flexShrink:0 }} />;
}
function Badge({ s }: { s: RAGStatus }) {
  const r = RAG[s];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:r.bg, border:`1px solid ${r.border}`, color:r.text, padding:"3px 8px", borderRadius:3, fontSize:11, whiteSpace:"nowrap", fontWeight:600 }}>
      <Dot s={s} />{r.label}
    </span>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<AppState>({});
  const [filter, setFilter] = useState<FilterMode>("all");
  const [mounted, setMounted] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [now, setNow] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<DailyStats>({ received:0, resolved:0, pending:0, inprogress:0 });
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
  const [downtimeRecords, setDowntimeRecords] = useState<DowntimeRecord[]>([]);
  const [showDowntime, setShowDowntime] = useState(false);
  const activeDowntime = useRef<Record<string,{field:string;startTs:string;startMs:number}>>({});
  const saveTimer = useRef<NodeJS.Timeout|null>(null);
  const [clock, setClock] = useState("");

  // ── API helpers ──────────────────────────────────────────────────────────────

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  }, []);


  const loadLog = useCallback(async () => {
    const rows = await apiFetch("/api/activity-log");
    setActivityLog(rows.map((r: any) => r.data));
  }, [apiFetch]);

  // ── initial load + polling ───────────────────────────────────────────────────

  useEffect(() => {
    const init: AppState = {};
    FACILITIES.forEach(f => { init[f.name] = defaultState(); });

    const loadAll = async (showSpinner = true) => {
      if (showSpinner) setSyncing(true);
      try {
        const [fsRows, tkRows, stRow, logRows, dtRows] = await Promise.all([
          apiFetch("/api/facilities"),
          apiFetch("/api/tickets"),
          apiFetch("/api/stats"),
          apiFetch("/api/activity-log"),
          apiFetch("/api/downtime"),
        ]);
        setState(prev => {
          const next = { ...prev };
          (fsRows as any[]).forEach((r: any) => { if (init[r.id] !== undefined) next[r.id] = { ...defaultState(), ...r.data }; });
          return next;
        });
        setTickets((tkRows as any[]).map((r: any) => r.data).sort((a: Ticket, b: Ticket) => b.ts.localeCompare(a.ts)));
        if (stRow?.data) setStats(stRow.data);
        setActivityLog((logRows as any[]).map((r: any) => r.data));
        setDowntimeRecords((dtRows as any[]).map((r: any) => r.data));
        setLastSync(nowTime());
      } catch {}
      if (showSpinner) { setSyncing(false); setMounted(true); }
    };

    // set defaults immediately so first render shows something
    setState(init);
    loadAll(true);

    const clockTick = () => setClock(new Date().toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", second:"2-digit", hour12:true }));
    const fmt = () => new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"numeric", minute:"2-digit", hour12:true });
    setNow(fmt());
    clockTick();
    const clockTimer = setInterval(() => { setNow(fmt()); clockTick(); }, 1000);

    // poll every 5 seconds for updates from other sessions
    const pollTimer = setInterval(() => loadAll(false), 5000);

    return () => { clearInterval(clockTimer); clearInterval(pollTimer); };
  }, [apiFetch]);

  // ── write helpers ────────────────────────────────────────────────────────────

  const addLog = useCallback(async (entry: Omit<ActivityLog,"id"|"ts">) => {
    const log: ActivityLog = { ...entry, id: uid(), ts: nowFull() };
    setActivityLog(prev => [log, ...prev].slice(0, 500));
    await apiFetch("/api/activity-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: log.id, data: log }),
    });
  }, [apiFetch]);

  const saveFacility = useCallback(async (name: string, data: FacilityState, oldData: FacilityState, changedField: string) => {
    await apiFetch("/api/facilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, data }),
    });

    const oldVal = String((oldData as any)[changedField] || "");
    const newVal = String((data as any)[changedField] || "");
    if (oldVal !== newVal) {
      const type: ActivityLog["type"] = ["internet","bio","printing"].includes(changedField)
        ? "status"
        : changedField === "issue"
        ? "issue"
        : changedField.includes("andwidth")
        ? "bandwidth"
        : "notes";
      await addLog({ facility: name, field: fieldLabel(changedField), oldVal: humanVal(oldVal)||"—", newVal: humanVal(newVal)||"—", type });

      if (["internet","bio","printing"].includes(changedField)) {
        const dtKey = `${name}__${changedField}`;
        const nowMs = Date.now();
        if ((newVal === "red" || newVal === "amber") && oldVal === "green") {
          activeDowntime.current[dtKey] = { field: fieldLabel(changedField), startTs: nowFull(), startMs: nowMs };
        }
        if (newVal === "green" && (oldVal === "red" || oldVal === "amber")) {
          const active = activeDowntime.current[dtKey];
          if (active) {
            const record: DowntimeRecord = {
              id: uid(), facility: name, field: active.field,
              startTs: active.startTs, endTs: nowFull(),
              durationMin: Math.round((nowMs - active.startMs) / 60000),
              resolvedBy: "System",
            };
            setDowntimeRecords(prev => [record, ...prev]);
            await apiFetch("/api/downtime", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: record.id, data: record }),
            });
            delete activeDowntime.current[dtKey];
          }
        }
      }
    }
    setLastSync(nowTime());
  }, [addLog, apiFetch]);

  const updateField = useCallback((name:string, field:keyof FacilityState, val:string) => {
    setState(prev => {
      const oldData = prev[name] || defaultState();
      const updated = { ...oldData, [field]: val, ts: nowTime() };
      const newState = { ...prev, [name]: updated };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (["internet","bio","printing"].includes(field as string)) {
        saveFacility(name, updated, oldData, field as string);
      } else {
        saveTimer.current = setTimeout(() => saveFacility(name, updated, oldData, field as string), 800);
      }
      return newState;
    });
  }, [saveFacility]);

  const updateStat = async (field: keyof DailyStats, val: number) => {
    const updated = { ...stats, [field]: val };
    setStats(updated);
    await apiFetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: updated }),
    });
  };




  // ── computed values ──────────────────────────────────────────────────────────

  const counts = { green:0, amber:0, red:0, na:0 };
  const iC = { green:0, amber:0, red:0 };
  const bC = { green:0, amber:0, red:0 };
  const pC = { green:0, amber:0, red:0 };
  FACILITIES.forEach(f => {
    const s = state[f.name]; if (!s) return;
    const ov = calcOverall(s); counts[ov as RAGStatus]++;
    if (s.internet !== "na") iC[s.internet as "green"|"amber"|"red"]++;
    if (s.bio !== "na") bC[s.bio as "green"|"amber"|"red"]++;
    if (s.printing !== "na") pC[s.printing as "green"|"amber"|"red"]++;
  });
  const tCounts = { open:0, inprogress:0, resolved:0, pending:0 };
  tickets.forEach(t => { tCounts[t.status]++; });

  const todayStr = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  const todayTickets = tickets.filter(t => t.ts && t.ts.includes(todayStr));
  const todayCounts = { open:0, inprogress:0, resolved:0, pending:0 };
  todayTickets.forEach(t => { todayCounts[t.status]++; });
  const autoStats = {
    received: todayTickets.length,
    resolved: todayCounts.resolved,
    pending: todayCounts.pending,
    inprogress: todayCounts.inprogress,
  };
  const visible = filter === "all" ? FACILITIES : FACILITIES.filter(f => { const s = state[f.name]; return s && calcOverall(s) === filter; });

  const filteredLog = activityLog.filter(l => {
    if (!logFrom && !logTo) return true;
    try {
      const lts = new Date(l.ts).getTime();
      const from = logFrom ? new Date(logFrom).getTime() : 0;
      const to = logTo ? new Date(logTo).getTime() : Infinity;
      return lts >= from && lts <= to;
    } catch { return true; }
  });

  // ── PDF export — single page ────────────────────────────────────────────────

  const exportPDF = async () => {
    const d       = new Date();
    const dateStr = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", hour12:true });
    const refNo   = `IGC-IT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;

    // ── Logo: load & invert to white-on-transparent for dark header ───────────
    let logoData = "";
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image(); el.onload = () => res(el); el.onerror = rej;
        el.src = "/imarat-logo.png";
      });
      const cv  = document.createElement("canvas");
      cv.width  = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const id  = ctx.getImageData(0, 0, cv.width, cv.height);
      for (let i = 0; i < id.data.length; i += 4) {
        const bright = (id.data[i] + id.data[i+1] + id.data[i+2]) / 3;
        if (bright < 140) {
          id.data[i] = id.data[i+1] = id.data[i+2] = 255; id.data[i+3] = 255; // white
        } else {
          id.data[i+3] = 0; // transparent
        }
      }
      ctx.putImageData(id, 0, 0);
      logoData = cv.toDataURL("image/png");
    } catch { /* skip logo if unavailable */ }

    // ── Document setup ────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const PW  = doc.internal.pageSize.getWidth();
    const PH  = doc.internal.pageSize.getHeight();
    const PAD = 12;
    const TW  = PW - PAD * 2;

    // ── Colour system ─────────────────────────────────────────────────────────
    type RGB = [number,number,number];
    const C = {
      // Core — forest-green editorial system
      ocean:   [14,  61,  47] as RGB,   // brand green: header / footer
      oceanM:  [15,  36,  32] as RGB,   // emphasis deep
      oceanL:  [24,  62,  52] as RGB,
      coral:   [200,168, 106] as RGB,   // gold accent
      coralL:  [245,238, 220] as RGB,
      bg:      [244,246,243] as RGB,    // warm sage page ground
      white:   [255,255,255] as RGB,
      ink:     [18,  32,  28] as RGB,
      inkM:    [90, 111, 104] as RGB,
      inkL:    [138,160,153] as RGB,
      border:  [227,231,227] as RGB,
      shadow:  [214,222,216] as RGB,
      // Status — muted earthy RAG
      gC:  [30, 122,  90] as RGB,  gL:  [230,240,235] as RGB,  gD:  [14,  61, 47] as RGB,
      aC:  [196,154,  60] as RGB,  aL:  [245,237,218] as RGB,  aD:  [110, 82, 20] as RGB,
      rC:  [184, 84,  80] as RGB,  rL:  [243,230,229] as RGB,  rD:  [122, 46, 42] as RGB,
      nC:  [138,155,168] as RGB,   nL:  [238,241,243] as RGB,  nD:  [90, 111,104] as RGB,
      // Divisions — earthy, brand-anchored
      iC:  [14,  61,  47] as RGB,  iL:  [230,240,235] as RGB,  // Imarat   – brand green
      pC:  [44,  95, 124] as RGB,  pL:  [225,235,241] as RGB,  // Projects – slate teal
      grC: [107, 78, 125] as RGB,  grL: [237,231,241] as RGB,  // Graana   – muted plum
      a21C:[166, 93,  58] as RGB,  a21L:[246,232,224] as RGB,  // Agency21 – terracotta
    };
    const CAT_C:  Record<string,RGB> = { Imarat:C.iC,  Projects:C.pC,  Graana:C.grC, Agency21:C.a21C };
    const CAT_BG: Record<string,RGB> = { Imarat:C.iL,  Projects:C.pL,  Graana:C.grL, Agency21:C.a21L };

    const ragL  = (s:RAGStatus):RGB => ({green:C.gL,amber:C.aL,red:C.rL,na:C.nL})[s];
    const ragD  = (s:RAGStatus):RGB => ({green:C.gD,amber:C.aD,red:C.rD,na:C.nD})[s];
    const ragC2 = (s:RAGStatus):RGB => ({green:C.gC,amber:C.aC,red:C.rC,na:C.nC})[s];
    const ragTx = (s:RAGStatus) => ({green:"Operational",amber:"Degraded",red:"Critical",na:"Not Set"})[s];
    const iLbl  = (s:RAGStatus) => ({green:"Active",  amber:"Unstable",red:"Down",   na:"—"})[s];
    const bLbl  = (s:RAGStatus) => ({green:"Syncing", amber:"Delayed", red:"Offline",na:"—"})[s];
    const pLbl  = (s:RAGStatus) => ({green:"Online",  amber:"Partial", red:"Down",   na:"—"})[s];

    // ── Drawing helpers ───────────────────────────────────────────────────────
    const fr  = (x:number,y:number,w:number,h:number,c:RGB)          => { doc.setFillColor(...c); doc.rect(x,y,w,h,"F"); };
    const frr = (x:number,y:number,w:number,h:number,r:number,c:RGB) => { doc.setFillColor(...c); doc.roundedRect(x,y,w,h,r,r,"F"); };
    const t   = (s:string,x:number,y:number,sz:number,c:RGB,b:"bold"|"normal"="normal",a:"left"|"center"|"right"="left") => {
      doc.setFont("helvetica",b); doc.setFontSize(sz); doc.setTextColor(...c); doc.text(s,x,y,{align:a});
    };
    // White card with drop shadow
    const card = (x:number,y:number,w:number,h:number,r=2.5) => {
      frr(x+1,y+1,w,h,r,C.shadow); frr(x,y,w,h,r,C.white);
    };
    // Progress track + fill
    const pbar = (x:number,y:number,w:number,h:number,pct:number,c:RGB) => {
      frr(x,y,w,h,h/2,C.border);
      if(pct>0) frr(x,y,Math.max(w*pct,h),h,h/2,c);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // LAYOUT
    //  Header     0  – 28
    //  KPI        29 – 45   (height 16)
    //  Division   46 – 63   (height 17)
    //  Section    64 – 68
    //  Table      69 – 197  (128mm; 31×3.5+7.5=116mm ✓)
    //  Footer    197 – 210
    const HDR = 28;
    const KY  = 29,  KH = 16;
    const DY  = 46,  DH = 17;
    const SY  = 64;
    const TBL = 69;
    const FTR = PH - 13;

    // =========================================================================
    // PAGE BG
    fr(0,0,PW,PH,C.bg);

    // =========================================================================
    // HEADER
    // Full ocean band
    fr(0,0,PW,HDR,C.ocean);
    // Coral accent strip at top (3mm)
    fr(0,0,PW,3,C.coral);
    // Subtle inner gradient band at bottom of header
    fr(0,HDR-1,PW,1,C.oceanM);

    // Logo — white wordmark direct on ocean (no white box)
    if (logoData) {
      // 560×187px logo, ~3:1 ratio. At h=14mm → w=41.9mm
      const lh = 14, lw = 42;
      doc.addImage(logoData, "PNG", PAD, (HDR-lh)/2+0.5, lw, lh);
    } else {
      t("IMARAT", PAD, 17, 14, C.white, "bold");
    }

    // Thin vertical separator
    doc.setDrawColor(...C.coral); doc.setLineWidth(0.5);
    doc.line(PAD+48, 4.5, PAD+48, 25);

    // Title block
    const TX = PAD + 53;
    t("IT FACILITIES RAG DASHBOARD", TX, 13, 12, C.white, "bold");
    t("IMARAT GROUP OF COMPANIES  ·  IT Department", TX, 19, 5.5, C.coral, "bold");
    t(`Daily Operational Report  ·  ${FACILITIES.length} Sites  ·  ${dateStr}`, TX, 24.5, 4, [150,176,163] as RGB);

    // Right block
    t(timeStr, PW-PAD, 13, 11, C.white, "bold", "right");
    t(dateStr, PW-PAD, 19.5, 5.5, C.coral, "bold", "right");
    t(`Ref: ${refNo}`, PW-PAD, 24.5, 3.8, [140,168,155] as RGB, "normal", "right");

    // =========================================================================
    // KPI STRIP  (Y:29–45, height 16)
    // Background band
    fr(0,KY-1,PW,KH+2,[239,242,238] as RGB);

    const totalSites = FACILITIES.length;
    const healthPct  = totalSites>0 ? counts.green/totalSites : 0;
    const kpis = [
      { val:String(totalSites),         lbl:"TOTAL SITES",   vc:C.ocean  },
      { val:String(counts.green),        lbl:"OPERATIONAL",   vc:C.gC     },
      { val:String(counts.amber),        lbl:"DEGRADED",      vc:C.aC     },
      { val:String(counts.red),          lbl:"CRITICAL",      vc:C.rC     },
      { val:String(autoStats.received),  lbl:"TICKETS",       vc:C.pC     },
      { val:String(autoStats.resolved),  lbl:"RESOLVED",      vc:C.gC     },
      { val:String(autoStats.pending),   lbl:"PENDING",       vc:C.aC     },
    ];
    const KW = TW / kpis.length;
    kpis.forEach((k,i) => {
      const x = PAD + i*KW;
      card(x+0.6, KY, KW-1.2, KH, 2);
      // Coral top bar (2mm)
      frr(x+0.6, KY, KW-1.2, 2, 1, k.vc);
      fr(x+0.6, KY+1, KW-1.2, 1, k.vc);
      // Value – centred in card
      t(k.val, x+KW/2, KY+10.5, 15, k.vc, "bold", "center");
      // Label
      t(k.lbl, x+KW/2, KY+14.2, 4, C.inkL, "bold", "center");
    });

    // =========================================================================
    // DIVISION STRIP  (Y:46–63, height 17)
    fr(0,DY-1,PW,DH+2,C.white);

    // Section title above division row
    t("DIVISION OVERVIEW", PAD, DY+3.5, 5, C.ocean, "bold");
    const divStartY = DY + 5;  // cards start a bit lower
    const divCardH  = DH - 5.5;  // 11.5mm card height

    const HSW = 50;
    const divGap = 2;
    const divW   = (TW - HSW - divGap) / 4 - 0.8;

    // ── Health score ─────────────────────────────────────────────────────────
    const hCol:RGB = healthPct>=0.8?C.gC:healthPct>=0.5?C.aC:C.rC;
    frr(PAD, divStartY, HSW, divCardH, 2, C.ocean);  // solid ocean card
    // Small label
    t("OVERALL HEALTH SCORE", PAD+HSW/2, divStartY+3.8, 4, [150,180,166] as RGB, "bold", "center");
    // Big %
    t(`${Math.round(healthPct*100)}%`, PAD+HSW/2, divStartY+9.5, 18, C.white, "bold", "center");
    // Progress bar at bottom of card
    frr(PAD+4, divStartY+divCardH-3, HSW-8, 2, 1, [34,72,60] as RGB);
    if(healthPct>0) frr(PAD+4, divStartY+divCardH-3, Math.max((HSW-8)*healthPct,2), 2, 1, hCol);

    // ── Division cards ────────────────────────────────────────────────────────
    (["Imarat","Projects","Graana","Agency21"] as const).forEach((cat,ci) => {
      const facs  = FACILITIES.filter(f=>f.cat===cat);
      const total = facs.length;
      const grn   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const amb   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="amber").length;
      const red   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="red").length;
      const cx    = PAD + HSW + divGap + ci*(divW+divGap);
      const ac    = CAT_C[cat];
      const bg    = CAT_BG[cat];

      frr(cx, divStartY, divW, divCardH, 2, bg);  // coloured bg card

      // Name + count
      t(cat.toUpperCase(), cx+3.5, divStartY+4.5, 5.5, ac, "bold");
      t(`${total}`, cx+divW-3.5, divStartY+4.5, 6, ac, "bold", "right");

      // Stacked bar  (Y: divStartY+6 to divStartY+8.5)
      const sbX=cx+3.5, sbW=divW-7, sbY=divStartY+6, sbH=2;
      frr(sbX,sbY,sbW,sbH,sbH/2,[200,215,230] as RGB);
      let bx=sbX;
      if(grn>0){const bw=sbW*(grn/total);frr(bx,sbY,bw,sbH,sbH/2,C.gC);bx+=bw;}
      if(amb>0){const bw=sbW*(amb/total);fr(bx,sbY,bw,sbH,C.aC);bx+=bw;}
      if(red>0){const bw=sbW*(red/total);frr(bx,sbY,bw,sbH,sbH/2,C.rC);}

      // Counts — must stay inside divCardH (11.5mm from divStartY)
      // Y: divStartY+9.8 → well inside divStartY+11.5
      const cw3 = divW/3;
      ([{v:grn,c:C.gC},{v:amb,c:C.aC},{v:red,c:C.rC}] as {v:number;c:RGB}[])
        .forEach((col,li) => {
          t(String(col.v), cx+li*cw3+cw3/2, divStartY+10.5, 8.5, col.c, "bold", "center");
        });
    });

    // =========================================================================
    // SECTION SEPARATOR  (Y:64)
    doc.setDrawColor(...C.border); doc.setLineWidth(0.3);
    doc.line(PAD,SY,PW-PAD,SY);
    t("FACILITY STATUS DETAIL", PAD, SY+4.5, 5.5, C.ocean, "bold");

    // Legend
    const lgItems = [
      {lbl:"Operational",c:C.gC},{lbl:"Degraded",c:C.aC},
      {lbl:"Critical",c:C.rC},{lbl:"Not Set",c:C.nC},
    ];
    let lgX = PW-PAD;
    [...lgItems].reverse().forEach(lg=>{
      doc.setFont("helvetica","normal"); doc.setFontSize(4.8);
      const tw = doc.getTextWidth(lg.lbl);
      lgX -= tw;
      t(lg.lbl, lgX, SY+4.5, 4.8, C.ink);
      lgX -= 5.5;
      doc.setFillColor(...lg.c); doc.circle(lgX, SY+3, 1.4,"F");
      lgX -= 3.5;
    });

    // =========================================================================
    // TABLE
    const ORDER:Record<string,number> = {Imarat:0,Projects:1,Graana:2,Agency21:3};
    const sorted  = [...FACILITIES].sort((a,b)=>(ORDER[a.cat]??9)-(ORDER[b.cat]??9));
    const facRows = sorted.map((f,i) => {
      const s  = state[f.name]??defaultState();
      const ov = calcOverall(s);
      const ts = s.ts?s.ts.replace("T"," ").slice(5,16):"—";
      return {
        d:[String(i+1),f.name,f.cat,iLbl(s.internet),bLbl(s.bio),pLbl(s.printing),ragTx(ov),ts,s.issue||""],
        internet:s.internet, bio:s.bio, printing:s.printing, overall:ov,
        cat:f.cat, prevCat:i>0?sorted[i-1].cat:"",
      };
    });

    autoTable(doc,{
      startY: TBL,
      tableWidth: TW,
      margin:{ left:PAD, right:PAD, bottom:14 },
      head:[["#","Facility Name","Division","Internet","Biometric","Printing","RAG Status","Updated","Issue / Notes"]],
      body: facRows.map(r=>r.d),
      styles:{
        font:"helvetica", fontSize:5.2,
        cellPadding:{top:1.3,bottom:1.3,left:2,right:2},
        minCellHeight:3.5, valign:"middle", overflow:"ellipsize",
        textColor:C.ink, fillColor:C.white,
        lineColor:C.border, lineWidth:0.1,
      },
      headStyles:{
        fillColor:C.ocean, textColor:C.white,
        fontStyle:"bold", fontSize:5.2, halign:"center",
        cellPadding:{top:2.5,bottom:2.5,left:2,right:2},
        minCellHeight:7.5, lineWidth:0,
      },
      alternateRowStyles:{ fillColor:[244,247,255] as RGB },
      columnStyles:{
        0:{ cellWidth:5.5,  halign:"center", fontStyle:"bold", textColor:C.inkL },
        1:{ cellWidth:40,   fontStyle:"bold", textColor:C.ocean },
        2:{ cellWidth:16,   halign:"center" },
        3:{ cellWidth:16,   halign:"center" },
        4:{ cellWidth:15,   halign:"center" },
        5:{ cellWidth:13,   halign:"center" },
        6:{ cellWidth:21,   halign:"center", fontStyle:"bold" },
        7:{ cellWidth:17,   halign:"center" },
        8:{ cellWidth:"auto" as any },
      },
      didParseCell:(data:any) => {
        if(data.section!=="body") return;
        const row=facRows[data.row.index]; if(!row) return;
        const sm:Record<number,RAGStatus> = {3:row.internet,4:row.bio,5:row.printing,6:row.overall};
        const st=sm[data.column.index];
        if(st){ data.cell.styles.fillColor=ragL(st); data.cell.styles.textColor=ragD(st); data.cell.styles.fontStyle="bold"; }
        if(data.column.index===2){ data.cell.styles.fillColor=CAT_BG[row.cat]; data.cell.styles.textColor=CAT_C[row.cat]; data.cell.styles.fontStyle="bold"; }
        if(data.column.index===7){ data.cell.styles.textColor=C.inkL; data.cell.styles.fontSize=4.5; }
        if(data.column.index===8&&row.d[8]){ data.cell.styles.textColor=C.rC; data.cell.styles.fontStyle="italic"; }
        if(row.cat!==row.prevCat&&data.row.index>0){ data.cell.styles.lineColor=CAT_C[row.cat]??C.border; data.cell.styles.lineWidth=0.5; }
      },
      didDrawCell:(data:any) => {
        if(data.section==="body"&&data.column.index===0){
          const row=facRows[data.row.index];
          if(row&&row.cat!==row.prevCat){
            doc.setFillColor(...(CAT_C[row.cat]??C.coral));
            doc.rect(data.cell.x,data.cell.y,1.8,data.cell.height,"F");
          }
        }
      },
    });

    // =========================================================================
    // FOOTER
    fr(0,FTR,PW,PH-FTR,C.ocean);
    fr(0,FTR,PW,0.6,C.coral);

    const f1=FTR+4.2, f2=FTR+7.8, f3=FTR+11;

    t("IMARAT GROUP OF COMPANIES", PAD, f1, 5.8, C.coral, "bold");
    t("IT Department  ·  it.support@imarat.com.pk", PAD, f2, 4, [148,174,161] as RGB);
    t("CONFIDENTIAL — AUTHORISED PERSONNEL ONLY", PAD, f3, 3.5, [112,140,128] as RGB);

    t("SYSTEM GENERATED REPORT", PW/2, f1, 5.5, C.white, "bold", "center");
    t(`RAG Dashboard  ·  Ref: ${refNo}`, PW/2, f2, 4, [148,174,161] as RGB, "normal", "center");
    t("Imarat IT Automation — Do Not Alter", PW/2, f3, 3.5, [112,140,128] as RGB, "normal", "center");

    t(`${dateStr}  ·  ${timeStr}`, PW-PAD, f1, 5.8, C.coral, "bold", "right");
    t(`${FACILITIES.length} Sites  ·  All Divisions`, PW-PAD, f2, 4, [148,174,161] as RGB, "normal", "right");
    t("imarat.com.pk", PW-PAD, f3, 3.5, [112,140,128] as RGB, "normal", "right");

    doc.save(`Imarat_IT_RAG_${d.toISOString().slice(0,10)}.pdf`);
  };


  // ── loading screen ───────────────────────────────────────────────────────────

  if (!mounted) return (
    <div style={{ minHeight:"100vh", background:"#10B981", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:28, fontWeight:800, color:"#fff", letterSpacing:2, marginBottom:4 }}>IMARAT GROUP</div>
          <div style={{ fontSize:12, color:"#64748B", letterSpacing:3, textTransform:"uppercase" }}>IT Facilities Dashboard</div>
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:16 }}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"#22D3EE", opacity:0.3+i*0.2, animation:`bounce 1.2s ease-in-out ${i*0.15}s infinite` }} />
          ))}
        </div>
        <div style={{ color:"#64748B", fontSize:13 }}>Loading data...</div>
        <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}`}</style>
      </div>
    </div>
  );

  // ── styles ───────────────────────────────────────────────────────────────────

  const S = {
    // Aurora Glass
    bg:"#0B1120", card:"rgba(255,255,255,0.06)", navy:"#0B1120", navyLight:"#111A2E",
    gold:"#22D3EE", indigo:"#6366F1", cyan:"#22D3EE",
    border:"rgba(255,255,255,0.12)", text:"#F8FAFC", textMuted:"#94A3B8", textLight:"#64748B",
    green:"#10B981", greenBg:"rgba(16,185,129,0.12)",  greenBorder:"rgba(16,185,129,0.35)",
    amber:"#F59E0B", amberBg:"rgba(245,158,11,0.12)",  amberBorder:"rgba(245,158,11,0.35)",
    red:"#F43F5E",   redBg:"rgba(244,63,94,0.12)",     redBorder:"rgba(244,63,94,0.35)",
    surfaceAlt:"rgba(255,255,255,0.04)", accent:"#10B981",
    track:"rgba(255,255,255,0.08)",
    ui:"'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif",
    mono:"'IBM Plex Mono',ui-monospace,SFMono-Regular,monospace",
  };

  const inputBase: React.CSSProperties = {
    padding:"8px 12px", border:`1px solid ${S.border}`, borderRadius:8,
    fontSize:13, color:S.text, background:"rgba(255,255,255,0.05)", outline:"none",
    transition:"border-color 0.2s, box-shadow 0.2s", width:"100%", boxSizing:"border-box" as const,
  };
  const btnPrimary: React.CSSProperties = {
    padding:"8px 18px", background:"linear-gradient(135deg,#6366F1 0%,#22D3EE 100%)",
    border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor:"pointer",
    fontWeight:700, letterSpacing:.3, boxShadow:"0 4px 16px rgba(99,102,241,0.35)",
  };
  const card: React.CSSProperties = {
    background:S.card, borderRadius:16, border:`1px solid ${S.border}`,
    backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
    boxShadow:"0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10)",
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:"100vh", background:S.bg, fontFamily:S.ui, color:S.text, position:"relative" as const }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
      <style>{`
        * { box-sizing: border-box; }
        body { background:#0B1120; }
        input, select, textarea { color:#F8FAFC; }
        select option { background:#111A2E; color:#F8FAFC; }
        input::placeholder, textarea::placeholder { color:#64748B; }
        input:focus, select:focus, textarea:focus {
          outline:none; border-color:rgba(34,211,238,0.55) !important;
          box-shadow:0 0 0 3px rgba(34,211,238,0.14);
        }
        tr:hover td { background: rgba(255,255,255,0.04) !important; }
        button:hover { filter: brightness(1.08); }
        ::-webkit-scrollbar { width:8px; height:8px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius:4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
        @keyframes pulse2 { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
      `}</style>

      {/* AURORA FIELD */}
      <div aria-hidden style={{ position:"fixed" as const, inset:0, pointerEvents:"none" as const, zIndex:0, overflow:"hidden" }}>
        <div style={{ position:"absolute" as const, top:-280, left:-140, width:900, height:900, borderRadius:"50%",
                      background:"radial-gradient(circle, rgba(99,102,241,0.26) 0%, transparent 66%)", filter:"blur(40px)" }} />
        <div style={{ position:"absolute" as const, top:-220, right:-160, width:820, height:820, borderRadius:"50%",
                      background:"radial-gradient(circle, rgba(34,211,238,0.20) 0%, transparent 66%)", filter:"blur(40px)" }} />
        <div style={{ position:"absolute" as const, bottom:-340, left:"34%", width:900, height:760, borderRadius:"50%",
                      background:"radial-gradient(circle, rgba(16,185,129,0.16) 0%, transparent 68%)", filter:"blur(48px)" }} />
      </div>

      {/* ── TOP NAV ── */}
      <nav style={{ position:"sticky" as const, top:0, zIndex:100, height:68, display:"flex", alignItems:"center",
                    padding:"0 28px", background:"rgba(11,17,32,0.72)", backdropFilter:"blur(20px)",
                    WebkitBackdropFilter:"blur(20px)", borderBottom:`1px solid ${S.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:38, height:38, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center",
                        background:"linear-gradient(135deg,#6366F1 0%,#22D3EE 100%)", boxShadow:"0 4px 18px rgba(99,102,241,0.4)" }}>
            <span style={{ fontSize:14, fontWeight:800, color:"#fff" }}>IG</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column" as const }}>
            <span style={{ color:S.text, fontWeight:800, fontSize:15, letterSpacing:"0.14em", lineHeight:1.1 }}>IMARAT GROUP</span>
            <span style={{ color:S.textLight, fontSize:9, letterSpacing:"0.16em", fontWeight:600, marginTop:3 }}>IT FACILITIES DASHBOARD</span>
          </div>
          <div style={{ width:1, height:32, background:S.border, margin:"0 10px" }} />
          <div style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 12px", borderRadius:999,
                        background:syncing?S.amberBg:S.greenBg, border:`1px solid ${syncing?S.amberBorder:S.greenBorder}` }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:syncing?S.amber:S.green,
                           boxShadow:`0 0 8px ${syncing?S.amber:S.green}`, animation:"pulse2 2s infinite" }} />
            <span style={{ fontSize:11, fontWeight:600, color:syncing?S.amber:S.green }}>{syncing ? "Syncing" : "Live"}</span>
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:16 }}>
          <span style={{ fontFamily:S.mono, fontSize:12, color:S.textMuted, fontVariantNumeric:"tabular-nums" }}>{clock}</span>
          <button
            onClick={() => setShowReport(true)}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 20px",
                     background:"linear-gradient(135deg,#6366F1 0%,#22D3EE 100%)", border:"none", borderRadius:10,
                     fontSize:12.5, color:"#fff", cursor:"pointer", fontWeight:700, letterSpacing:.3,
                     boxShadow:"0 4px 18px rgba(99,102,241,0.4)" }}
          >
            <span style={{ fontSize:13 }}>⬡</span> Reports
          </button>
        </div>
      </nav>

      <div style={{ position:"relative" as const, zIndex:1, padding:"24px 28px", maxWidth:1800, margin:"0 auto" }}>

        {/* ── LIVE STATUS FEED ── */}
        <div style={{ ...card, marginBottom:20, overflow:"hidden", animation:"fadein 0.3s ease" }}>
          <div style={{ background:S.navyLight, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#10B981", animation:"pulse2 2s infinite" }} />
            <span style={{ color:"#fff", fontWeight:700, fontSize:13, letterSpacing:.3 }}>Live RAG Status Feed</span>
            <span style={{ background:"rgba(255,255,255,0.08)", color:"#64748B", fontSize:11, padding:"2px 8px", borderRadius:20, marginLeft:4 }}>
              {activityLog.filter(l=>l.type==="status").length} changes
            </span>
            <span style={{ marginLeft:"auto", color:"#64748B", fontSize:10 }}>auto-refreshes every 5s · last: {lastSync}</span>
          </div>
          {(() => {
            const statusOnly = activityLog.filter(l => l.type === "status");
            if (statusOnly.length === 0) return (
              <div style={{ padding:"16px 20px", color:S.textLight, fontSize:12, textAlign:"center", fontStyle:"italic" }}>
                No status changes yet — Internet, Biometric and Printing changes appear here instantly
              </div>
            );
            return (
              <div style={{ maxHeight:180, overflowY:"auto" }}>
                {statusOnly.slice(0,100).map((l,i) => {
                  const isRed = l.newVal.includes("Down")||l.newVal.includes("Critical");
                  const isAmber = l.newVal.includes("Slow")||l.newVal.includes("Degraded");
                  const isGreen = l.newVal.includes("Working")||l.newVal.includes("OK")||l.newVal.includes("Sync");
                  const dot = isRed?"#F43F5E":isAmber?"#F59E0B":isGreen?"#10B981":"#94A3B8";
                  const nvC = isRed?"#F43F5E":isAmber?"#F59E0B":isGreen?"#10B981":"#94A3B8";
                  const nvB = isRed?"rgba(244,63,94,0.12)":isAmber?"rgba(245,158,11,0.12)":isGreen?"rgba(16,185,129,0.12)":"rgba(148,163,184,0.12)";
                  const nvBr = isRed?"rgba(244,63,94,0.35)":isAmber?"rgba(245,158,11,0.35)":isGreen?"rgba(16,185,129,0.35)":"rgba(148,163,184,0.30)";
                  return (
                    <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"7px 20px", borderBottom:`1px solid ${S.border}`, background:i%2===0?"transparent":"rgba(255,255,255,0.03)", animation:"fadein 0.2s ease" }}>
                      <span style={{ fontFamily:"monospace", fontSize:10.5, color:S.textLight, whiteSpace:"nowrap" as const, minWidth:152, flexShrink:0 }}>{l.ts}</span>
                      <span style={{ fontWeight:700, color:S.text, fontSize:12, minWidth:140, whiteSpace:"nowrap" as const, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis" }}>{l.facility}</span>
                      <span style={{ fontSize:11, color:S.textMuted, minWidth:80, flexShrink:0, fontWeight:500 }}>{l.field}</span>
                      <span style={{ fontSize:11, color:S.textLight, minWidth:90, textDecoration:"line-through" }}>{l.oldVal}</span>
                      <span style={{ fontSize:14, color:"rgba(255,255,255,0.16)", fontWeight:700, flexShrink:0 }}>→</span>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:nvB, border:`1px solid ${nvBr}`, color:nvC, padding:"3px 12px", borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" as const }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:dot, display:"inline-block" }} />
                        {l.newVal}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── KPI ROW ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:16, marginBottom:24 }}>
          {[
            { label:"Total Sites",   value:FACILITIES.length,   color:S.text,   bg:"rgba(255,255,255,0.05)", accent:"#818CF8" },
            { label:"Operational",   value:counts.green,        color:S.green,  bg:S.greenBg,                accent:S.green  },
            { label:"Degraded",      value:counts.amber,        color:S.amber,  bg:S.amberBg,                accent:S.amber  },
            { label:"Critical",      value:counts.red,          color:S.red,    bg:S.redBg,                  accent:S.red    },
            { label:"Queries Today", value:autoStats.received,  color:"#38BDF8",bg:"rgba(56,189,248,0.10)",  accent:"#38BDF8"},
            { label:"Resolved",      value:autoStats.resolved,  color:S.green,  bg:S.greenBg,                accent:S.green  },
            { label:"Pending",       value:autoStats.pending,   color:S.amber,  bg:S.amberBg,                accent:S.amber  },
            { label:"In Progress",   value:autoStats.inprogress,color:"#A78BFA",bg:"rgba(167,139,250,0.10)", accent:"#A78BFA"},
          ].map(c => (
            <div key={c.label} style={{ ...card, padding:"16px 18px", background:c.bg, position:"relative" as const, overflow:"hidden" }}>
              <span aria-hidden style={{ position:"absolute" as const, left:0, top:0, bottom:0, width:3, background:c.accent }} />
              <div style={{ fontSize:9.5, color:S.textMuted, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase" as const, marginBottom:9 }}>{c.label}</div>
              <div style={{ fontFamily:S.mono, fontSize:28, fontWeight:600, color:c.color, lineHeight:1, letterSpacing:"-0.03em", fontVariantNumeric:"tabular-nums" }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* ── STATUS BREAKDOWN + LIVE FEED ── */}
        <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:14, marginBottom:20 }}>
          {/* status mini-panels */}
          <div style={{ display:"flex", flexDirection:"column" as const, gap:10 }}>
            {([
              { title:"Internet",  total:iC.green+iC.amber+iC.red, green:iC.green, amber:iC.amber, red:iC.red },
              { title:"Biometric", total:bC.green+bC.amber+bC.red, green:bC.green, amber:bC.amber, red:bC.red },
              { title:"Printing",  total:pC.green+pC.amber+pC.red, green:pC.green, amber:pC.amber, red:pC.red },
            ] as {title:string;total:number;green:number;amber:number;red:number}[]).map(p => {
              const tot = p.total || 1;
              return (
                <div key={p.title} style={{ ...card, padding:"12px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:S.text }}>{p.title}</span>
                    <div style={{ display:"flex", gap:10 }}>
                      {([["green","#10B981",p.green],["amber","#F59E0B",p.amber],["red","#F43F5E",p.red]] as [string,string,number][]).map(([,dot,cnt])=>(
                        <span key={dot} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, color:S.text }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", background:dot }} />
                          {cnt}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden", gap:1 }}>
                    {p.green>0 && <div style={{ flex:p.green/tot, background:"#10B981" }} />}
                    {p.amber>0 && <div style={{ flex:p.amber/tot, background:"#F59E0B" }} />}
                    {p.red>0   && <div style={{ flex:p.red/tot,   background:"#F43F5E" }} />}
                  </div>
                </div>
              );
            })}
            <div style={{ ...card, padding:"12px 16px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:S.text, marginBottom:8 }}>Overall RAG</div>
              {([["green","Operational",counts.green],["amber","Warning",counts.amber],["red","Critical",counts.red]] as [RAGStatus,string,number][]).map(([s,lbl,cnt])=>{
                const rp = RAG[s];
                const pct = Math.round((cnt/FACILITIES.length)*100);
                return (
                  <div key={s} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:rp.dot, flexShrink:0 }} />
                    <span style={{ fontSize:11, color:S.textMuted, width:80 }}>{lbl}</span>
                    <div style={{ flex:1, height:6, background:S.border, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:rp.dot, borderRadius:3 }} />
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:rp.text, width:32, textAlign:"right" as const }}>{cnt}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* live feed */}
          <div style={{ ...card, overflow:"hidden" }}>
            <div style={{ background:S.navyLight, padding:"10px 16px", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#10B981", animation:"pulse2 2s infinite" }} />
              <span style={{ color:"#fff", fontWeight:700, fontSize:12 }}>Live RAG Status Feed</span>
              <span style={{ background:"rgba(255,255,255,0.08)", color:"#64748B", fontSize:10, padding:"1px 8px", borderRadius:20 }}>
                {activityLog.filter(l=>l.type==="status").length} changes
              </span>
              <span style={{ marginLeft:"auto", color:"#64748B", fontSize:10 }}>every 5s · last: {lastSync}</span>
            </div>
            {(() => {
              const statusOnly = activityLog.filter(l => l.type === "status");
              if (statusOnly.length === 0) return (
                <div style={{ padding:"16px 20px", color:S.textLight, fontSize:12, textAlign:"center", fontStyle:"italic" }}>
                  No status changes yet
                </div>
              );
              return (
                <div style={{ maxHeight:226, overflowY:"auto" }}>
                  {statusOnly.slice(0,100).map((l,i) => {
                    const isRed = l.newVal.includes("Down")||l.newVal.includes("Critical");
                    const isAmber = l.newVal.includes("Slow")||l.newVal.includes("Degraded");
                    const isGreen = l.newVal.includes("Working")||l.newVal.includes("OK")||l.newVal.includes("Sync");
                    const dot = isRed?"#F43F5E":isAmber?"#F59E0B":isGreen?"#10B981":"#94A3B8";
                    const nvC = isRed?"#F43F5E":isAmber?"#F59E0B":isGreen?"#10B981":"#94A3B8";
                    const nvB = isRed?"rgba(244,63,94,0.12)":isAmber?"rgba(245,158,11,0.12)":isGreen?"rgba(16,185,129,0.12)":"rgba(148,163,184,0.12)";
                    const nvBr = isRed?"rgba(244,63,94,0.35)":isAmber?"rgba(245,158,11,0.35)":isGreen?"rgba(16,185,129,0.35)":"rgba(148,163,184,0.30)";
                    return (
                      <div key={l.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 16px", borderBottom:`1px solid ${S.border}`, background:i%2===0?"transparent":"rgba(255,255,255,0.03)" }}>
                        <span style={{ fontFamily:"monospace", fontSize:10, color:S.textLight, whiteSpace:"nowrap" as const, minWidth:140, flexShrink:0 }}>{l.ts}</span>
                        <span style={{ fontWeight:700, color:S.text, fontSize:11, minWidth:130, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{l.facility}</span>
                        <span style={{ fontSize:10, color:S.textMuted, minWidth:70, flexShrink:0 }}>{l.field}</span>
                        <span style={{ fontSize:10, color:S.textLight, textDecoration:"line-through", minWidth:80 }}>{l.oldVal}</span>
                        <span style={{ color:"rgba(255,255,255,0.16)", fontWeight:700, flexShrink:0 }}>→</span>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:nvB, border:`1px solid ${nvBr}`, color:nvC, padding:"2px 10px", borderRadius:20, fontSize:10, fontWeight:700, whiteSpace:"nowrap" as const }}>
                          <span style={{ width:5, height:5, borderRadius:"50%", background:dot }} />
                          {l.newVal}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── FACILITY TABLE ── */}
        <div style={{ ...card, marginBottom:20, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${S.border}`, display:"flex", alignItems:"center", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:S.text }}>RAG Status — All Facilities</div>
              <div style={{ fontSize:11, color:S.textMuted, marginTop:2 }}>{visible.length} of {FACILITIES.length} facilities shown</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
              {(["all","green","amber","red"] as FilterMode[]).map(f => {
                const active = filter === f;
                const colors: Record<FilterMode,{bg:string;text:string;border:string}> = {
                  all:   {bg:active?S.navy:"rgba(255,255,255,0.04)", text:active?"#fff":S.textMuted, border:active?S.navy:S.border},
                  green: {bg:active?S.greenBg:"rgba(255,255,255,0.04)", text:active?S.green:S.textMuted, border:active?S.greenBorder:S.border},
                  amber: {bg:active?S.amberBg:"rgba(255,255,255,0.04)", text:active?S.amber:S.textMuted, border:active?S.amberBorder:S.border},
                  red:   {bg:active?S.redBg:"rgba(255,255,255,0.04)", text:active?S.red:S.textMuted, border:active?S.redBorder:S.border},
                };
                const labels: Record<FilterMode,string> = { all:"All", green:"Operational", amber:"Warning", red:"Critical" };
                const c2 = colors[f];
                return (
                  <button key={f} onClick={()=>setFilter(f)}
                    style={{ padding:"5px 12px", background:c2.bg, border:`1px solid ${c2.border}`, borderRadius:20, fontSize:11, color:c2.text, cursor:"pointer", fontWeight:active?700:400 }}>
                    {labels[f]}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"rgba(255,255,255,0.04)", borderBottom:`2px solid ${S.border}` }}>
                  {["#","FACILITY","CAT","INTERNET","BIOMETRIC","PRINTING","OVERALL","CUR BW","REQ BW","BW STATUS","REPORTED ISSUE","NOTES","UPDATED"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"10px 12px", color:S.textLight, fontWeight:600, fontSize:10, letterSpacing:.5, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((f,i)=>{
                  const s=state[f.name]??defaultState();
                  const ov=calcOverall(s);
                  const bw=bwCompare(s.bandwidth,s.requiredBandwidth);
                  const ovR = RAG[ov];
                  return (
                    <tr key={f.name} style={{ borderBottom:`1px solid ${S.border}` }}>
                      <td style={{ padding:"9px 12px", color:S.textLight, fontSize:11, fontWeight:600 }}>{i+1}</td>
                      <td style={{ padding:"9px 12px", fontWeight:700, color:S.text, whiteSpace:"nowrap" }}>{f.name}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ color:CAT_COLORS[f.cat]||S.textMuted, fontSize:10, fontWeight:700, background:`${CAT_COLORS[f.cat]}18`, padding:"2px 8px", borderRadius:20 }}>{f.cat}</span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <select value={s.internet} onChange={e=>updateField(f.name,"internet",e.target.value as RAGStatus)}
                          style={{ background:RAG[s.internet].bg, color:RAG[s.internet].text, border:`1px solid ${RAG[s.internet].border}`, borderRadius:6, padding:"4px 8px", fontSize:11, cursor:"pointer", fontWeight:600, minWidth:118 }}>
                          {INET_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <select value={s.bio} onChange={e=>updateField(f.name,"bio",e.target.value as RAGStatus)}
                          style={{ background:RAG[s.bio].bg, color:RAG[s.bio].text, border:`1px solid ${RAG[s.bio].border}`, borderRadius:6, padding:"4px 8px", fontSize:11, cursor:"pointer", fontWeight:600, minWidth:118 }}>
                          {BIO_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <select value={s.printing} onChange={e=>updateField(f.name,"printing",e.target.value as RAGStatus)}
                          style={{ background:RAG[s.printing].bg, color:RAG[s.printing].text, border:`1px solid ${RAG[s.printing].border}`, borderRadius:6, padding:"4px 8px", fontSize:11, cursor:"pointer", fontWeight:600, minWidth:118 }}>
                          {PRINT_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:ovR.bg, border:`1px solid ${ovR.border}`, color:ovR.text, padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:700, whiteSpace:"nowrap" as const }}>
                          <span style={{ width:6, height:6, borderRadius:"50%", background:ovR.dot }} />
                          {ovR.label}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <input defaultValue={s.bandwidth} onBlur={e=>updateField(f.name,"bandwidth",e.target.value)} placeholder="0"
                            style={{ background:"rgba(56,189,248,0.12)", border:"1px solid rgba(56,189,248,0.35)", borderRadius:6, padding:"4px 7px", color:"#38BDF8", fontSize:11, width:52, fontWeight:600, textAlign:"center" as const }} />
                          <span style={{ fontSize:9, color:S.textLight }}>Mbps</span>
                        </div>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <input defaultValue={s.requiredBandwidth} onBlur={e=>updateField(f.name,"requiredBandwidth",e.target.value)} placeholder="0"
                            style={{ background:"rgba(167,139,250,0.12)", border:"1px solid rgba(167,139,250,0.35)", borderRadius:6, padding:"4px 7px", color:"#A78BFA", fontSize:11, width:52, fontWeight:600, textAlign:"center" as const }} />
                          <span style={{ fontSize:9, color:S.textLight }}>Mbps</span>
                        </div>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        {bw
                          ? <span style={{ background:bw.bg, border:`1px solid ${bw.border}`, color:bw.color, padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:700, whiteSpace:"nowrap" as const }}>{bw.label}</span>
                          : <span style={{ color:S.textLight, fontSize:11 }}>—</span>}
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <input defaultValue={s.issue} onBlur={e=>updateField(f.name,"issue",e.target.value)} placeholder="Issue..."
                          style={{ background:"rgba(244,63,94,0.10)", border:"1px solid rgba(244,63,94,0.32)", borderRadius:6, padding:"4px 8px", color:"#FDA4AF", fontSize:11, width:145 }} />
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <input defaultValue={s.notes} onBlur={e=>updateField(f.name,"notes",e.target.value)} placeholder="Notes..."
                          style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${S.border}`, borderRadius:6, padding:"4px 8px", color:S.text, fontSize:11, width:100 }} />
                      </td>
                      <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:10, color:S.textLight, whiteSpace:"nowrap" }}>{s.ts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── DOWNTIME TRACKER ── */}
        <div style={{ ...card, marginBottom:20, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${S.border}`, display:"flex", alignItems:"center", gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:S.text }}>Downtime Tracker</div>
              <div style={{ fontSize:11, color:S.textMuted, marginTop:2 }}>Auto-records outages and recovery times</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:10, alignItems:"center" }}>
              {Object.keys(activeDowntime.current).length > 0 && (
                <span style={{ background:S.redBg, border:`1px solid ${S.redBorder}`, color:S.red, padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {Object.keys(activeDowntime.current).length} Active
                </span>
              )}
              <span style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.14)", color:"#10B981", padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600 }}>
                {downtimeRecords.length} Records
              </span>
              <button onClick={()=>setShowDowntime(v=>!v)} style={{ ...btnPrimary, padding:"6px 14px", fontSize:11 }}>
                {showDowntime?"Hide History":"View History"}
              </button>
            </div>
          </div>
          {Object.entries(activeDowntime.current).length > 0 && (
            <div style={{ padding:"12px 20px", background:"rgba(244,63,94,0.10)", borderBottom:`1px solid rgba(244,63,94,0.28)` }}>
              <div style={{ fontSize:11, fontWeight:700, color:S.red, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:.5 }}>Currently Active Downtimes</div>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8 }}>
                {Object.entries(activeDowntime.current).map(([key, val]) => {
                  const mins = Math.round((Date.now()-val.startMs)/60000);
                  const [fac] = key.split("__");
                  return (
                    <div key={key} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(244,63,94,0.28)", borderRadius:8, padding:"8px 14px", fontSize:11, display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ width:8, height:8, borderRadius:"50%", background:S.red, animation:"pulse2 1s infinite" }} />
                      <span style={{ fontWeight:700, color:S.red }}>{fac}</span>
                      <span style={{ color:S.textMuted }}>·</span>
                      <span style={{ color:S.amber, fontWeight:600 }}>{val.field}</span>
                      <span style={{ background:S.red, color:"#fff", borderRadius:4, padding:"1px 7px", fontSize:10, fontWeight:700, marginLeft:4 }}>
                        {mins<1?"<1 min":`${mins}m`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {showDowntime && (
            downtimeRecords.length === 0
              ? <div style={{ padding:"28px", textAlign:"center", color:S.textLight, fontSize:13, fontStyle:"italic" }}>No downtime recorded yet.</div>
              : (
                <div style={{ overflowX:"auto", maxHeight:300, overflowY:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead style={{ position:"sticky" as const, top:0, background:"rgba(255,255,255,0.04)" }}>
                      <tr style={{ borderBottom:`2px solid ${S.border}` }}>
                        {["FACILITY","FIELD","WENT DOWN","RECOVERED","DURATION","SEVERITY"].map(h=>(
                          <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:S.textLight, fontWeight:600, fontSize:10, letterSpacing:.5, whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {downtimeRecords.map((r) => {
                        const hrs=Math.floor(r.durationMin/60), mins=r.durationMin%60;
                        const dur=hrs>0?`${hrs}h ${mins}m`:`${mins}m`;
                        const sev=r.durationMin>=60?{bg:S.redBg,text:S.red,label:"LONG"}:r.durationMin>=15?{bg:S.amberBg,text:S.amber,label:"MED"}:{bg:S.greenBg,text:S.green,label:"SHORT"};
                        return (
                          <tr key={r.id} style={{ borderBottom:`1px solid ${S.border}` }}>
                            <td style={{ padding:"9px 14px", fontWeight:700, color:S.text }}>{r.facility}</td>
                            <td style={{ padding:"9px 14px", color:S.textMuted }}>{r.field}</td>
                            <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:S.red }}>{r.startTs}</td>
                            <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:S.green }}>{r.endTs}</td>
                            <td style={{ padding:"9px 14px" }}>
                              <span style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.14)", color:"#10B981", padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:600 }}>{dur}</span>
                            </td>
                            <td style={{ padding:"9px 14px" }}>
                              <span style={{ background:sev.bg, color:sev.text, border:`1px solid ${sev.text}33`, padding:"3px 10px", borderRadius:6, fontSize:10, fontWeight:700 }}>{sev.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </div>


      </div>

      {/* ── Report Builder Modal ─────────────────────────────────────────────── */}
      <ReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        facilities={FACILITIES}
        state={state}
        counts={counts}
        autoStats={autoStats}
        calcOverall={calcOverall}
        defaultState={defaultState}
      />
    </div>
  );
}
