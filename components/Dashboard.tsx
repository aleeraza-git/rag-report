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
  green: { bg:"#edf7f0", border:"#a8d5b5", text:"#1a6b35", label:"Operational", dot:"#22c55e" },
  amber: { bg:"#fef8ec", border:"#f5d48a", text:"#7a5200", label:"Degraded",    dot:"#f59e0b" },
  red:   { bg:"#fdf0f0", border:"#f5b8b8", text:"#8b1c1c", label:"Critical",    dot:"#ef4444" },
  na:    { bg:"#f1f4f8", border:"#c8d0dc", text:"#6b7280", label:"N/A",         dot:"#9ca3af" },
};
const CAT_COLORS: Record<string,string> = {
  Projects:"#3b5bdb", Imarat:"#0c7a6d", Graana:"#7c3aed", Agency21:"#c05621",
};
const TICKET_STATUS: Record<string,{ bg:string; text:string; lbl:string; border:string }> = {
  open:       { bg:"#fdf0f0", text:"#8b1c1c", lbl:"Open",       border:"#f5b8b8" },
  inprogress: { bg:"#fef8ec", text:"#7a5200", lbl:"In Progress", border:"#f5d48a" },
  resolved:   { bg:"#edf7f0", text:"#1a6b35", lbl:"Resolved",    border:"#a8d5b5" },
  pending:    { bg:"#f0f4ff", text:"#3b5bdb", lbl:"Pending",     border:"#b4c6fb" },
};

function nowTime() {
  return new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function nowFull() {
  return new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function imatTicketId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  const alpha = Math.random().toString(36).substr(2, 3).toUpperCase();
  return `IM-${num}-${alpha}`;
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
  if (pct >= 100) return { label:`${pct}% OK`,       bg:"#edf7f0", border:"#a8d5b5", color:"#1a6b35" };
  if (pct >= 70)  return { label:`${pct}% LOW`,      bg:"#fef8ec", border:"#f5d48a", color:"#7a5200" };
  return             { label:`${pct}% CRITICAL`, bg:"#fdf0f0", border:"#f5b8b8", color:"#8b1c1c" };
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
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [newTicket, setNewTicket] = useState({ office:"", description:"", reportedBy:"", assignedTo:"", medium:"" });
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

  const loadTickets = useCallback(async () => {
    const rows = await apiFetch("/api/tickets");
    setTickets(rows.map((r: any) => r.data).sort((a: Ticket, b: Ticket) => b.ts.localeCompare(a.ts)));
  }, [apiFetch]);

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

    const clockTick = () => setClock(new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" }));
    const fmt = () => new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
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

  const addTicket = async () => {
    if (!newTicket.description) return;
    const t: Ticket = {
      id: imatTicketId(), office: newTicket.office||"Unknown / Remote Office",
      medium: newTicket.medium||"—", description: newTicket.description,
      reportedBy: newTicket.reportedBy||"Unknown", assignedTo: newTicket.assignedTo,
      resolvedBy: "", status: "open", ts: nowFull(), resolvedTs: "",
    };
    setTickets(prev => [t, ...prev]);
    await apiFetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, data: t }),
    });
    await addLog({ facility: t.office, field:"Ticket Created", oldVal:"—", newVal:`${t.id}: ${t.description}`, type:"ticket" });
    setNewTicket({ office:"", description:"", reportedBy:"", assignedTo:"", medium:"" });
    setShowTicketForm(false);
  };

  const updateTicket = async (id:string, field:keyof Ticket, val:string) => {
    const ticket = tickets.find(t => t.id === id); if (!ticket) return;
    const updated = { ...ticket, [field]: val };
    if (field === "status" && val === "resolved") updated.resolvedTs = nowFull();
    setTickets(prev => prev.map(t => t.id === id ? updated : t));
    await apiFetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, data: updated }),
    });
    if (field === "status") await addLog({ facility: ticket.office, field:`Ticket ${id}`, oldVal: humanVal(ticket.status), newVal: humanVal(val), type:"ticket" });
    if (field === "assignedTo") await addLog({ facility: ticket.office, field:`Ticket ${id} Assigned`, oldVal: ticket.assignedTo||"—", newVal: val||"—", type:"ticket" });
  };

  const deleteTicket = async (id:string) => {
    const ticket = tickets.find(t => t.id === id);
    setTickets(prev => prev.filter(t => t.id !== id));
    await apiFetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (ticket) await addLog({ facility: ticket.office, field:"Ticket Deleted", oldVal: id, newVal:"—", type:"ticket" });
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
    const timeStr = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
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
      // Core
      ocean:   [18,  46,  82] as RGB,   // header / footer
      oceanM:  [26,  62, 108] as RGB,
      oceanL:  [38,  82, 136] as RGB,
      coral:   [235, 94,  40] as RGB,   // primary accent
      coralL:  [255,236,228] as RGB,
      bg:      [240,244,255] as RGB,    // page background (cool lavender-white)
      white:   [255,255,255] as RGB,
      ink:     [22,  36,  60] as RGB,
      inkM:    [80, 100, 135] as RGB,
      inkL:    [145,162,198] as RGB,
      border:  [210,220,240] as RGB,
      shadow:  [200,212,235] as RGB,
      // Status
      gC:  [14, 160, 110] as RGB,  gL:  [210,246,232] as RGB,  gD:  [6,  88, 58]  as RGB,
      aC:  [210,138,  0] as RGB,   aL:  [255,238,170] as RGB,  aD:  [100, 64,  0] as RGB,
      rC:  [210, 40,  55] as RGB,  rL:  [255,210,215] as RGB,  rD:  [130, 10,  22] as RGB,
      nC:  [148,162,190] as RGB,   nL:  [232,236,248] as RGB,  nD:  [80,  96, 130] as RGB,
      // Divisions (completely new palette)
      iC:  [0,  148,136] as RGB,   iL:  [205,246,242] as RGB,  // Imarat   – jade teal
      pC:  [108, 56, 210] as RGB,  pL:  [234,224,255] as RGB,  // Projects – violet
      grC: [194,108,  0] as RGB,   grL: [255,238,190] as RGB,  // Graana   – amber
      a21C:[198, 32,  70] as RGB,  a21L:[255,218,228] as RGB,  // Agency21 – crimson
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
    t(`Daily Operational Report  ·  ${FACILITIES.length} Sites  ·  ${dateStr}`, TX, 24.5, 4, [110,140,185] as RGB);

    // Right block
    t(timeStr, PW-PAD, 13, 11, C.white, "bold", "right");
    t(dateStr, PW-PAD, 19.5, 5.5, C.coral, "bold", "right");
    t(`Ref: ${refNo}`, PW-PAD, 24.5, 3.8, [100,130,175] as RGB, "normal", "right");

    // =========================================================================
    // KPI STRIP  (Y:29–45, height 16)
    // Background band
    fr(0,KY-1,PW,KH+2,[230,236,250] as RGB);

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
    t("OVERALL HEALTH SCORE", PAD+HSW/2, divStartY+3.8, 4, [140,168,215] as RGB, "bold", "center");
    // Big %
    t(`${Math.round(healthPct*100)}%`, PAD+HSW/2, divStartY+9.5, 18, C.white, "bold", "center");
    // Progress bar at bottom of card
    frr(PAD+4, divStartY+divCardH-3, HSW-8, 2, 1, [38,62,100] as RGB);
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
    t("IT Department  ·  it.support@imarat.com.pk", PAD, f2, 4, [110,138,180] as RGB);
    t("CONFIDENTIAL — AUTHORISED PERSONNEL ONLY", PAD, f3, 3.5, [80,110,155] as RGB);

    t("SYSTEM GENERATED REPORT", PW/2, f1, 5.5, C.white, "bold", "center");
    t(`RAG Dashboard  ·  Ref: ${refNo}`, PW/2, f2, 4, [110,138,180] as RGB, "normal", "center");
    t("Imarat IT Automation — Do Not Alter", PW/2, f3, 3.5, [80,110,155] as RGB, "normal", "center");

    t(`${dateStr}  ·  ${timeStr}`, PW-PAD, f1, 5.8, C.coral, "bold", "right");
    t(`${FACILITIES.length} Sites  ·  All Divisions`, PW-PAD, f2, 4, [110,138,180] as RGB, "normal", "right");
    t("imarat.com.pk", PW-PAD, f3, 3.5, [80,110,155] as RGB, "normal", "right");

    doc.save(`Imarat_IT_RAG_${d.toISOString().slice(0,10)}.pdf`);
  };


  // ── loading screen ───────────────────────────────────────────────────────────

  if (!mounted) return (
    <div style={{ minHeight:"100vh", background:"#0A1628", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:28, fontWeight:800, color:"#fff", letterSpacing:2, marginBottom:4 }}>IMARAT GROUP</div>
          <div style={{ fontSize:12, color:"#4A6FA5", letterSpacing:3, textTransform:"uppercase" }}>IT Facilities Dashboard</div>
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:16 }}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"#C9A84C", opacity:0.3+i*0.2, animation:`bounce 1.2s ease-in-out ${i*0.15}s infinite` }} />
          ))}
        </div>
        <div style={{ color:"#4A6FA5", fontSize:13 }}>Loading data...</div>
        <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}`}</style>
      </div>
    </div>
  );

  // ── styles ───────────────────────────────────────────────────────────────────

  const S = {
    bg: "#F0F4F8", card: "#FFFFFF", navy: "#0A1628", navyLight: "#112240", gold: "#C9A84C",
    border: "#E2E8F0", text: "#1A202C", textMuted: "#718096", textLight: "#A0AEC0",
    green: "#1a6b35", greenBg: "#edf7f0", greenBorder: "#a8d5b5",
    amber: "#7a5200", amberBg: "#fef8ec", amberBorder: "#f5d48a",
    red: "#8b1c1c", redBg: "#fdf0f0", redBorder: "#f5b8b8",
  };
  const inputBase: React.CSSProperties = {
    padding:"8px 12px", border:`1px solid ${S.border}`, borderRadius:8,
    fontSize:13, color:S.text, background:"#fff", outline:"none",
    transition:"border-color 0.2s", width:"100%", boxSizing:"border-box" as const,
  };
  const btnPrimary: React.CSSProperties = {
    padding:"8px 18px", background:S.navy, border:"none", borderRadius:8,
    fontSize:12, color:"#fff", cursor:"pointer", fontWeight:600, letterSpacing:.3,
  };
  const card: React.CSSProperties = {
    background:S.card, borderRadius:12, border:`1px solid ${S.border}`,
    boxShadow:"0 1px 3px rgba(0,0,0,0.04)",
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:"100vh", background:S.bg, fontFamily:"'Inter','Segoe UI',Arial,sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: #C9A84C !important; box-shadow: 0 0 0 3px rgba(201,168,76,0.15); }
        tr:hover td { background: #F7FAFC !important; }
        button:hover { opacity: 0.88; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F0F4F8; }
        ::-webkit-scrollbar-thumb { background: #CBD5E0; border-radius: 3px; }
        @keyframes pulse2 { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── TOP NAV ── */}
      <nav style={{ background:S.navy, height:60, display:"flex", alignItems:"center", padding:"0 28px", position:"sticky" as const, top:0, zIndex:100, boxShadow:"0 2px 8px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ display:"flex", flexDirection:"column" as const }}>
            <span style={{ color:"#fff", fontWeight:800, fontSize:16, letterSpacing:1.5, lineHeight:1 }}>IMARAT GROUP</span>
            <span style={{ color:S.gold, fontSize:9.5, letterSpacing:2.5, fontWeight:500, marginTop:2 }}>IT FACILITIES DASHBOARD</span>
          </div>
          <div style={{ width:1, height:32, background:"rgba(201,168,76,0.3)", margin:"0 8px" }} />
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:syncing?"#f59e0b":"#22c55e", display:"inline-block", animation:"pulse2 2s infinite" }} />
            <span style={{ fontSize:11, color:"#718096" }}>{syncing ? "Syncing..." : `Live · ${clock}`}</span>
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ fontSize:11, color:"#4A6FA5" }}>{clock}</div>
          <button
            onClick={() => setShowReport(true)}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 18px", background:"linear-gradient(135deg,#C49A1E 0%,#E8C048 100%)", border:"none", borderRadius:7, fontSize:12.5, color:"#0C1A2E", cursor:"pointer", fontWeight:800, letterSpacing:.4, boxShadow:"0 3px 14px rgba(196,154,30,0.38)" }}
          >
            <span style={{ fontSize:13 }}>⬡</span> Reports
          </button>
        </div>
      </nav>

      <div style={{ padding:"24px 28px", maxWidth:1800, margin:"0 auto" }}>

        {/* ── LIVE STATUS FEED ── */}
        <div style={{ ...card, marginBottom:20, overflow:"hidden", animation:"fadein 0.3s ease" }}>
          <div style={{ background:S.navyLight, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e", animation:"pulse2 2s infinite" }} />
            <span style={{ color:"#fff", fontWeight:700, fontSize:13, letterSpacing:.3 }}>Live RAG Status Feed</span>
            <span style={{ background:"rgba(255,255,255,0.08)", color:"#A0AEC0", fontSize:11, padding:"2px 8px", borderRadius:20, marginLeft:4 }}>
              {activityLog.filter(l=>l.type==="status").length} changes
            </span>
            <span style={{ marginLeft:"auto", color:"#4A6FA5", fontSize:10 }}>auto-refreshes every 5s · last: {lastSync}</span>
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
                  const dot = isRed?"#ef4444":isAmber?"#f59e0b":isGreen?"#22c55e":"#9ca3af";
                  const nvC = isRed?"#8b1c1c":isAmber?"#7a5200":isGreen?"#1a6b35":"#6b7280";
                  const nvB = isRed?"#fdf0f0":isAmber?"#fef8ec":isGreen?"#edf7f0":"#f1f4f8";
                  const nvBr = isRed?"#f5b8b8":isAmber?"#f5d48a":isGreen?"#a8d5b5":"#c8d0dc";
                  return (
                    <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"7px 20px", borderBottom:`1px solid ${S.border}`, background:i%2===0?"#fff":"#FAFBFC", animation:"fadein 0.2s ease" }}>
                      <span style={{ fontFamily:"monospace", fontSize:10.5, color:S.textLight, whiteSpace:"nowrap" as const, minWidth:152, flexShrink:0 }}>{l.ts}</span>
                      <span style={{ fontWeight:700, color:S.navy, fontSize:12, minWidth:140, whiteSpace:"nowrap" as const, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis" }}>{l.facility}</span>
                      <span style={{ fontSize:11, color:S.textMuted, minWidth:80, flexShrink:0, fontWeight:500 }}>{l.field}</span>
                      <span style={{ fontSize:11, color:S.textLight, minWidth:90, textDecoration:"line-through" }}>{l.oldVal}</span>
                      <span style={{ fontSize:14, color:"#CBD5E0", fontWeight:700, flexShrink:0 }}>→</span>
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
        <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:14, marginBottom:20 }}>
          {[
            { label:"Total Sites",   value:FACILITIES.length,     color:S.navy,    bg:"#EEF2FF", accent:"#3b5bdb" },
            { label:"Operational",   value:counts.green,           color:S.green,   bg:S.greenBg, accent:S.green },
            { label:"Warning",       value:counts.amber,           color:S.amber,   bg:S.amberBg, accent:S.amber },
            { label:"Critical",      value:counts.red,             color:S.red,     bg:S.redBg,   accent:S.red },
            { label:"Queries Today", value:autoStats.received,     color:"#1a4a8a", bg:"#EBF4FF", accent:"#2563eb" },
            { label:"Resolved",      value:autoStats.resolved,     color:S.green,   bg:S.greenBg, accent:S.green },
            { label:"Pending",       value:autoStats.pending,      color:S.amber,   bg:S.amberBg, accent:S.amber },
            { label:"In Progress",   value:autoStats.inprogress,   color:"#6b21a8", bg:"#F5F3FF", accent:"#7c3aed" },
          ].map(c => (
            <div key={c.label} style={{ ...card, padding:"16px 18px", background:c.bg, borderLeft:`3px solid ${c.accent}` }}>
              <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, letterSpacing:.5, textTransform:"uppercase" as const, marginBottom:6 }}>{c.label}</div>
              <div style={{ fontSize:30, fontWeight:800, color:c.color, lineHeight:1 }}>{c.value}</div>
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
                      {([["green","#22c55e",p.green],["amber","#f59e0b",p.amber],["red","#ef4444",p.red]] as [string,string,number][]).map(([,dot,cnt])=>(
                        <span key={dot} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, color:S.text }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", background:dot }} />
                          {cnt}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden", gap:1 }}>
                    {p.green>0 && <div style={{ flex:p.green/tot, background:"#22c55e" }} />}
                    {p.amber>0 && <div style={{ flex:p.amber/tot, background:"#f59e0b" }} />}
                    {p.red>0   && <div style={{ flex:p.red/tot,   background:"#ef4444" }} />}
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
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", animation:"pulse2 2s infinite" }} />
              <span style={{ color:"#fff", fontWeight:700, fontSize:12 }}>Live RAG Status Feed</span>
              <span style={{ background:"rgba(255,255,255,0.08)", color:"#A0AEC0", fontSize:10, padding:"1px 8px", borderRadius:20 }}>
                {activityLog.filter(l=>l.type==="status").length} changes
              </span>
              <span style={{ marginLeft:"auto", color:"#4A6FA5", fontSize:10 }}>every 5s · last: {lastSync}</span>
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
                    const dot = isRed?"#ef4444":isAmber?"#f59e0b":isGreen?"#22c55e":"#9ca3af";
                    const nvC = isRed?"#8b1c1c":isAmber?"#7a5200":isGreen?"#1a6b35":"#6b7280";
                    const nvB = isRed?"#fdf0f0":isAmber?"#fef8ec":isGreen?"#edf7f0":"#f1f4f8";
                    const nvBr = isRed?"#f5b8b8":isAmber?"#f5d48a":isGreen?"#a8d5b5":"#c8d0dc";
                    return (
                      <div key={l.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 16px", borderBottom:`1px solid ${S.border}`, background:i%2===0?"#fff":"#FAFBFC" }}>
                        <span style={{ fontFamily:"monospace", fontSize:10, color:S.textLight, whiteSpace:"nowrap" as const, minWidth:140, flexShrink:0 }}>{l.ts}</span>
                        <span style={{ fontWeight:700, color:S.navy, fontSize:11, minWidth:130, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{l.facility}</span>
                        <span style={{ fontSize:10, color:S.textMuted, minWidth:70, flexShrink:0 }}>{l.field}</span>
                        <span style={{ fontSize:10, color:S.textLight, textDecoration:"line-through", minWidth:80 }}>{l.oldVal}</span>
                        <span style={{ color:"#CBD5E0", fontWeight:700, flexShrink:0 }}>→</span>
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
                  all:   {bg:active?S.navy:"#F7FAFC", text:active?"#fff":S.textMuted, border:active?S.navy:S.border},
                  green: {bg:active?S.greenBg:"#F7FAFC", text:active?S.green:S.textMuted, border:active?S.greenBorder:S.border},
                  amber: {bg:active?S.amberBg:"#F7FAFC", text:active?S.amber:S.textMuted, border:active?S.amberBorder:S.border},
                  red:   {bg:active?S.redBg:"#F7FAFC", text:active?S.red:S.textMuted, border:active?S.redBorder:S.border},
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
                <tr style={{ background:"#F7FAFC", borderBottom:`2px solid ${S.border}` }}>
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
                      <td style={{ padding:"9px 12px", fontWeight:700, color:S.navy, whiteSpace:"nowrap" }}>{f.name}</td>
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
                            style={{ background:"#EBF4FF", border:"1px solid #93C5FD", borderRadius:6, padding:"4px 7px", color:"#1a4a8a", fontSize:11, width:52, fontWeight:600, textAlign:"center" as const }} />
                          <span style={{ fontSize:9, color:S.textLight }}>Mbps</span>
                        </div>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <input defaultValue={s.requiredBandwidth} onBlur={e=>updateField(f.name,"requiredBandwidth",e.target.value)} placeholder="0"
                            style={{ background:"#F5F3FF", border:"1px solid #C4B5FD", borderRadius:6, padding:"4px 7px", color:"#6b21a8", fontSize:11, width:52, fontWeight:600, textAlign:"center" as const }} />
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
                          style={{ background:"#FFF8F8", border:"1px solid #FCA5A5", borderRadius:6, padding:"4px 8px", color:"#7f1d1d", fontSize:11, width:145 }} />
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <input defaultValue={s.notes} onBlur={e=>updateField(f.name,"notes",e.target.value)} placeholder="Notes..."
                          style={{ background:"#FAFAFA", border:`1px solid ${S.border}`, borderRadius:6, padding:"4px 8px", color:S.text, fontSize:11, width:100 }} />
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
              <span style={{ background:"#EEF2FF", border:"1px solid #C7D2FE", color:"#3730a3", padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600 }}>
                {downtimeRecords.length} Records
              </span>
              <button onClick={()=>setShowDowntime(v=>!v)} style={{ ...btnPrimary, padding:"6px 14px", fontSize:11 }}>
                {showDowntime?"Hide History":"View History"}
              </button>
            </div>
          </div>
          {Object.entries(activeDowntime.current).length > 0 && (
            <div style={{ padding:"12px 20px", background:"#FEF2F2", borderBottom:`1px solid #FECACA` }}>
              <div style={{ fontSize:11, fontWeight:700, color:S.red, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:.5 }}>Currently Active Downtimes</div>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8 }}>
                {Object.entries(activeDowntime.current).map(([key, val]) => {
                  const mins = Math.round((Date.now()-val.startMs)/60000);
                  const [fac] = key.split("__");
                  return (
                    <div key={key} style={{ background:"#fff", border:"1px solid #FECACA", borderRadius:8, padding:"8px 14px", fontSize:11, display:"flex", alignItems:"center", gap:8 }}>
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
                    <thead style={{ position:"sticky" as const, top:0, background:"#F7FAFC" }}>
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
                            <td style={{ padding:"9px 14px", fontWeight:700, color:S.navy }}>{r.facility}</td>
                            <td style={{ padding:"9px 14px", color:S.textMuted }}>{r.field}</td>
                            <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:S.red }}>{r.startTs}</td>
                            <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:S.green }}>{r.endTs}</td>
                            <td style={{ padding:"9px 14px" }}>
                              <span style={{ background:"#EEF2FF", border:"1px solid #C7D2FE", color:"#3730a3", padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:600 }}>{dur}</span>
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

        {/* ── TICKETS ── */}
        <div style={{ ...card, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${S.border}`, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" as const }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:S.text }}>IT Support Tickets</div>
              <div style={{ fontSize:11, color:S.textMuted, marginTop:2 }}>Live across all team members</div>
            </div>
            <div style={{ display:"flex", gap:8, marginLeft:"auto", alignItems:"center", flexWrap:"wrap" as const }}>
              {[
                { label:"Open",        count:tCounts.open,       bg:S.redBg,   text:S.red,    border:S.redBorder },
                { label:"In Progress", count:tCounts.inprogress, bg:S.amberBg, text:S.amber,  border:S.amberBorder },
                { label:"Pending",     count:tCounts.pending,    bg:"#EEF2FF", text:"#3730a3", border:"#C7D2FE" },
                { label:"Resolved",    count:tCounts.resolved,   bg:S.greenBg, text:S.green,  border:S.greenBorder },
              ].map(b=>(
                <div key={b.label} style={{ background:b.bg, border:`1px solid ${b.border}`, color:b.text, padding:"5px 14px", borderRadius:20, fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:15, fontWeight:800 }}>{b.count}</span>
                  <span style={{ fontSize:10, opacity:.8 }}>{b.label}</span>
                </div>
              ))}
              <button onClick={()=>setShowTicketForm(v=>!v)} style={{ ...btnPrimary, background:S.gold }}>+ New Ticket</button>
            </div>
          </div>

          {showTicketForm && (
            <div style={{ padding:"20px", background:"#FAFBFF", borderBottom:`1px solid ${S.border}` }}>
              <div style={{ fontSize:13, fontWeight:700, color:S.text, marginBottom:14 }}>New Support Ticket</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr 1fr", gap:12, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, marginBottom:5, letterSpacing:.5 }}>OFFICE / LOCATION</div>
                  <input value={newTicket.office} onChange={e=>setNewTicket(p=>({...p,office:e.target.value}))} placeholder="Office name" style={inputBase} />
                </div>
                <div>
                  <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, marginBottom:5, letterSpacing:.5 }}>MEDIUM</div>
                  <select value={newTicket.medium} onChange={e=>setNewTicket(p=>({...p,medium:e.target.value}))} style={{ ...inputBase }}>
                    <option value="">— Select —</option>
                    <option value="Email">Email</option>
                    <option value="Helpdesk Ticket">Helpdesk Ticket</option>
                    <option value="Whatsapp">Whatsapp</option>
                    <option value="In Person">In Person</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, marginBottom:5, letterSpacing:.5 }}>ISSUE DESCRIPTION</div>
                  <input value={newTicket.description} onChange={e=>setNewTicket(p=>({...p,description:e.target.value}))} placeholder="Describe the issue..." style={inputBase} />
                </div>
                <div>
                  <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, marginBottom:5, letterSpacing:.5 }}>REPORTED BY</div>
                  <input value={newTicket.reportedBy} onChange={e=>setNewTicket(p=>({...p,reportedBy:e.target.value}))} placeholder="Name" style={inputBase} />
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:"0 0 200px" }}>
                  <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, marginBottom:5, letterSpacing:.5 }}>ASSIGN TO</div>
                  <select value={newTicket.assignedTo} onChange={e=>setNewTicket(p=>({...p,assignedTo:e.target.value}))} style={{ ...inputBase }}>
                    {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:18 }}>
                  <button onClick={addTicket} style={{ ...btnPrimary, background:S.gold, padding:"9px 22px" }}>Add Ticket</button>
                  <button onClick={()=>setShowTicketForm(false)} style={{ padding:"9px 16px", background:"#F7FAFC", border:`1px solid ${S.border}`, borderRadius:8, fontSize:12, color:S.textMuted, cursor:"pointer" }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {tickets.length === 0
            ? <div style={{ padding:"40px", textAlign:"center", color:S.textLight, fontSize:13, fontStyle:"italic" }}>No tickets yet. Click "+ New Ticket" to log an issue.</div>
            : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"#F7FAFC", borderBottom:`2px solid ${S.border}` }}>
                      {["TICKET ID","OFFICE / LOCATION","MEDIUM","ISSUE","REPORTED BY","ASSIGNED TO","STATUS","RESOLVED BY","OPENED","CLOSED",""].map(h=>(
                        <th key={h} style={{ textAlign:"left", padding:"10px 12px", color:S.textLight, fontWeight:600, fontSize:10, letterSpacing:.4, whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t)=>{
                      const ts2 = TICKET_STATUS[t.status];
                      return (
                        <tr key={t.id} style={{ borderBottom:`1px solid ${S.border}` }}>
                          <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:11, fontWeight:700, color:S.navy }}>{t.id}</td>
                          <td style={{ padding:"9px 12px", fontWeight:600, color:S.text, whiteSpace:"nowrap" }}>{t.office}</td>
                          <td style={{ padding:"9px 12px" }}>
                            <span style={{ background:"#EEF2FF", border:"1px solid #C7D2FE", color:"#3730a3", padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:600, whiteSpace:"nowrap" as const }}>{t.medium||"—"}</span>
                          </td>
                          <td style={{ padding:"9px 12px", color:S.textMuted, maxWidth:220 }}>{t.description}</td>
                          <td style={{ padding:"9px 12px", color:S.textMuted, whiteSpace:"nowrap" }}>{t.reportedBy}</td>
                          <td style={{ padding:"9px 12px" }}>
                            <select value={t.assignedTo} onChange={e=>updateTicket(t.id,"assignedTo",e.target.value)}
                              style={{ border:`1px solid ${S.border}`, borderRadius:6, padding:"4px 8px", fontSize:11, color:S.text, background:"#fff", cursor:"pointer" }}>
                              {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                            </select>
                          </td>
                          <td style={{ padding:"9px 12px" }}>
                            <select value={t.status} onChange={e=>updateTicket(t.id,"status",e.target.value)}
                              style={{ background:ts2.bg, color:ts2.text, border:`1px solid ${ts2.border}`, borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                              <option value="open">Open</option>
                              <option value="inprogress">In Progress</option>
                              <option value="pending">Pending</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </td>
                          <td style={{ padding:"9px 12px" }}>
                            {t.status==="resolved"
                              ? <select value={t.resolvedBy} onChange={e=>updateTicket(t.id,"resolvedBy",e.target.value)}
                                  style={{ border:`1px solid ${S.greenBorder}`, borderRadius:6, padding:"4px 8px", fontSize:11, color:S.green, background:S.greenBg, cursor:"pointer" }}>
                                  {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                                </select>
                              : <span style={{ color:S.textLight }}>—</span>
                            }
                          </td>
                          <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:10, color:S.textLight, whiteSpace:"nowrap" }}>{t.ts}</td>
                          <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:10, color:t.resolvedTs?S.green:S.textLight, whiteSpace:"nowrap" }}>{t.resolvedTs||"—"}</td>
                          <td style={{ padding:"9px 12px" }}>
                            <button onClick={()=>deleteTicket(t.id)}
                              style={{ padding:"3px 10px", background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:6, fontSize:10, color:S.red, cursor:"pointer", fontWeight:600 }}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
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
