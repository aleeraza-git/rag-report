"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  const exportPDF = () => {
    const d = new Date();
    const dateStr  = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
    const timeStr  = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const refNo = `IGC-IT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const PW = doc.internal.pageSize.getWidth();   // 297
    const PH = doc.internal.pageSize.getHeight();  // 210
    const PAD = 11;
    const TW  = PW - PAD * 2;                      // 275

    // ── Palette ───────────────────────────────────────────────────────────────
    const C = {
      navy:   [7,  22, 52]  as [number,number,number],
      navyD:  [4,  14, 36]  as [number,number,number],
      navyL:  [18, 42, 88]  as [number,number,number],
      slate:  [240,243,250] as [number,number,number],
      white:  [255,255,255] as [number,number,number],
      gold:   [240,172,  0] as [number,number,number],
      ink:    [18,  26, 46] as [number,number,number],
      muted:  [112,122,146] as [number,number,number],
      border: [220,226,240] as [number,number,number],
      shadow: [210,218,236] as [number,number,number],
      gC:     [0,  155,132] as [number,number,number],  // teal – OK
      gL:     [200,244,236] as [number,number,number],
      gD:     [0,   96, 82] as [number,number,number],
      aC:     [226,148,  0] as [number,number,number],  // amber
      aL:     [255,237,170] as [number,number,number],
      aD:     [108, 68,  0] as [number,number,number],
      rC:     [210, 36, 48] as [number,number,number],  // red
      rL:     [255,198,206] as [number,number,number],
      rD:     [140, 12, 20] as [number,number,number],
      nL:     [232,235,244] as [number,number,number],
      nD:     [105,115,136] as [number,number,number],
      iC:     [0,  155,132] as [number,number,number],  // Imarat = teal
      pC:     [48,  82,220] as [number,number,number],  // Projects = blue
      grC:    [118, 46,228] as [number,number,number],  // Graana = purple
      a21C:   [216, 86, 16] as [number,number,number],  // Agency21 = orange
    };

    const CAT_C: Record<string,[number,number,number]> = {
      Imarat:C.iC, Projects:C.pC, Graana:C.grC, Agency21:C.a21C,
    };
    const CAT_BG: Record<string,[number,number,number]> = {
      Imarat:[208,248,242], Projects:[216,226,255], Graana:[238,222,255], Agency21:[255,226,208],
    };

    const ragFill = (s:RAGStatus) => s==="green"?C.gL:s==="amber"?C.aL:s==="red"?C.rL:C.nL;
    const ragText = (s:RAGStatus) => s==="green"?C.gD:s==="amber"?C.aD:s==="red"?C.rD:C.nD;
    const ragLabel= (s:RAGStatus) => s==="green"?"Operational":s==="amber"?"Degraded":s==="red"?"Critical":"Not Set";
    const iLbl: Record<RAGStatus,string> = { green:"Working",  amber:"Unstable", red:"Down",    na:"—" };
    const bLbl: Record<RAGStatus,string> = { green:"Syncing",  amber:"Delayed",  red:"Offline", na:"—" };
    const pLbl: Record<RAGStatus,string> = { green:"OK",       amber:"Partial",  red:"Down",    na:"—" };

    // ── Helpers ───────────────────────────────────────────────────────────────
    // White card with soft shadow
    const card = (x:number, y:number, w:number, h:number) => {
      doc.setFillColor(...C.shadow); doc.roundedRect(x+0.8, y+0.8, w, h, 2, 2, "F");
      doc.setFillColor(...C.white);  doc.roundedRect(x,     y,     w, h, 2, 2, "F");
    };
    // Filled rounded progress bar (track + fill)
    const bar = (x:number, y:number, w:number, h:number, pct:number, col:[number,number,number]) => {
      doc.setFillColor(...C.border); doc.roundedRect(x, y, w, h, h/2, h/2, "F");
      if (pct > 0) {
        doc.setFillColor(...col);
        doc.roundedRect(x, y, Math.max(w*pct, h), h, h/2, h/2, "F");
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // LAYOUT CONSTANTS  (all Y values are absolute mm from top)
    // Header   : 0   – 24
    // KPI row  : 25  – 41   (height 16)
    // Div row  : 42  – 58   (height 16)
    // Bar      : 59  – 63   (separator + legend, height 4)
    // Table    : 64  – 197  (height 133, row ~3.8mm × 31 + 7.5 header ≈ 125mm ✓)
    // Footer   : 197 – 210  (height 13)
    const H_HDR = 24;
    const KY = 25,  KH = 16;   // KPI cards
    const DY = 42,  DH = 16;   // Division cards
    const SY = 59.5;            // Section separator Y
    const TBL_Y = 64;
    const FTR_Y = PH - 13;     // 197

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE BACKGROUND
    doc.setFillColor(...C.slate); doc.rect(0, 0, PW, PH, "F");

    // ═════════════════════════════════════════════════════════════════════════
    // HEADER  ────────────────────────────────────────────────────────────────
    // Full-width navy bar
    doc.setFillColor(...C.navy); doc.rect(0, 0, PW, H_HDR, "F");
    // Gold top rule (2mm)
    doc.setFillColor(...C.gold); doc.rect(0, 0, PW, 2, "F");
    // Subtle darker sub-band at bottom
    doc.setFillColor(...C.navyD); doc.rect(0, H_HDR-0.8, PW, 0.8, "F");

    // Left – organisation branding
    doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(...C.white);
    doc.text("IMARAT", PAD, 12);
    doc.setFont("helvetica","bold"); doc.setFontSize(6.8); doc.setTextColor(...C.gold);
    doc.text("GROUP OF COMPANIES", PAD, 17);
    doc.setFont("helvetica","normal"); doc.setFontSize(4.5); doc.setTextColor(110,140,190);
    doc.text("IT Department  ·  it.support@imarat.com.pk", PAD, 21.5);

    // Vertical separator
    doc.setDrawColor(45,68,118); doc.setLineWidth(0.5);
    doc.line(PAD+64, 3.5, PAD+64, 22);

    // Centre-left – report title block
    const TX = PAD + 68;
    doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(210,225,255);
    doc.text("IT FACILITIES RAG DASHBOARD", TX, 11);
    doc.setFont("helvetica","normal"); doc.setFontSize(5); doc.setTextColor(125,152,200);
    doc.text(`Daily Operational Status  ·  ${FACILITIES.length} Sites  ·  All Divisions`, TX, 16.5);
    doc.setFontSize(4.2); doc.setTextColor(90,118,168);
    doc.text(`Period: ${dateStr}  ·  Ref No: ${refNo}`, TX, 21.5);

    // Right – date block
    doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(...C.gold);
    doc.text(dateStr, PW-PAD, 12, { align:"right" });
    doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(140,165,210);
    doc.text(timeStr, PW-PAD, 18.5, { align:"right" });

    // ═════════════════════════════════════════════════════════════════════════
    // KPI CARDS  (Y:25 – Y:41, height 16mm each)
    // 7 equal cards across full width
    const totalSites = FACILITIES.length;
    const healthPct  = totalSites > 0 ? Math.round((counts.green / totalSites) * 100) : 0;
    const opPct      = totalSites > 0 ? Math.round((counts.green / totalSites) * 100) : 0;

    const kpis = [
      { val:String(totalSites),         lbl:"TOTAL SITES",    ac:C.navyL,                               vc:C.navy  },
      { val:String(counts.green),        lbl:"OPERATIONAL",    ac:C.gC,                                  vc:C.gD    },
      { val:String(counts.amber),        lbl:"DEGRADED",       ac:C.aC,                                  vc:C.aD    },
      { val:String(counts.red),          lbl:"CRITICAL",       ac:C.rC,                                  vc:C.rD    },
      { val:String(autoStats.received),  lbl:"TICKETS TODAY",  ac:[48,80,218] as [number,number,number], vc:[18,48,165] as [number,number,number] },
      { val:String(autoStats.resolved),  lbl:"RESOLVED",       ac:C.gC,                                  vc:C.gD    },
      { val:String(autoStats.pending),   lbl:"PENDING",        ac:C.aC,                                  vc:C.aD    },
    ];
    const kw = TW / kpis.length;
    kpis.forEach((k, i) => {
      const x = PAD + i * kw;
      card(x + 0.5, KY, kw - 1, KH);
      // Bottom accent line
      doc.setFillColor(...k.ac);
      doc.roundedRect(x+0.5, KY+KH-2, kw-1, 2, 0, 0, "F");
      doc.roundedRect(x+0.5, KY+KH-2, kw-1, 2, 2, 2, "F");
      // Value – vertically centered in top 12mm
      doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(...k.vc);
      doc.text(k.val, x + kw/2, KY + 9.5, { align:"center" });
      // Label – sits just above the accent line
      doc.setFont("helvetica","bold"); doc.setFontSize(4.2); doc.setTextColor(...C.muted);
      doc.text(k.lbl, x + kw/2, KY + 13.2, { align:"center" });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // DIVISION CARDS + HEALTH SCORE  (Y:42 – Y:58, height 16mm)
    // Layout: [Health 48mm] [gap 3] [Imarat] [Projects] [Graana] [Agency21]
    const HSW = 48;
    const divW = (TW - HSW - 3) / 4;   // ~55mm each

    // ── Health score card ──────────────────────────────────────────────────
    card(PAD, DY, HSW, DH);
    // Top accent in health colour
    const hCol: [number,number,number] = healthPct >= 80 ? C.gC : healthPct >= 50 ? C.aC : C.rC;
    doc.setFillColor(...hCol);
    doc.roundedRect(PAD, DY, HSW, 2, 2, 2, "F");
    doc.rect(PAD, DY+1, HSW, 1, "F");
    // Label
    doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...C.muted);
    doc.text("OVERALL HEALTH", PAD + HSW/2, DY + 5.5, { align:"center" });
    // Big percentage (fits in 16mm card minus top bar 2mm minus bar 3mm = 11mm)
    doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(...hCol);
    doc.text(`${healthPct}%`, PAD + HSW/2, DY + 12.5, { align:"center" });
    // Progress bar (3mm from bottom of card)
    bar(PAD + 4, DY + DH - 3.5, HSW - 8, 2, healthPct / 100, hCol);

    // ── Division cards ─────────────────────────────────────────────────────
    const divCats = ["Imarat","Projects","Graana","Agency21"] as const;
    divCats.forEach((cat, ci) => {
      const facs  = FACILITIES.filter(f => f.cat === cat);
      const total = facs.length;
      const grn   = facs.filter(f => calcOverall(state[f.name] ?? defaultState()) === "green").length;
      const amb   = facs.filter(f => calcOverall(state[f.name] ?? defaultState()) === "amber").length;
      const red   = facs.filter(f => calcOverall(state[f.name] ?? defaultState()) === "red").length;
      const cx    = PAD + HSW + 3 + ci * (divW + 1);
      const ac    = CAT_C[cat];

      card(cx, DY, divW, DH);
      // Coloured top bar (2mm)
      doc.setFillColor(...ac); doc.roundedRect(cx, DY, divW, 2, 2, 2, "F");
      doc.rect(cx, DY+1, divW, 1, "F");

      // Division name + site count  (Y:DY+5 – DY+8)
      doc.setFont("helvetica","bold"); doc.setFontSize(5.8); doc.setTextColor(...ac);
      doc.text(cat.toUpperCase(), cx + 3.5, DY + 6);
      doc.setFont("helvetica","normal"); doc.setFontSize(4); doc.setTextColor(...C.muted);
      doc.text(`${total} sites`, cx + 3.5, DY + 9);

      // Stacked bar  (Y:DY+10 – DY+12.5)
      const sbX = cx + 3; const sbW = divW - 6; const sbY = DY + 10; const sbH = 2;
      doc.setFillColor(...C.border); doc.roundedRect(sbX, sbY, sbW, sbH, sbH/2, sbH/2, "F");
      let bx = sbX;
      if (grn > 0) { const bw = sbW*(grn/total); doc.setFillColor(...C.gC); doc.roundedRect(bx,sbY,bw,sbH,sbH/2,sbH/2,"F"); bx+=bw; }
      if (amb > 0) { const bw = sbW*(amb/total); doc.setFillColor(...C.aC); doc.rect(bx,sbY,bw,sbH,"F"); bx+=bw; }
      if (red > 0) { const bw = sbW*(red/total); doc.setFillColor(...C.rC); doc.rect(bx,sbY,bw,sbH,"F"); }

      // Three count columns INSIDE card (Y:DY+13.5)
      // Each column: grn / amb / red — must stay above DY+DH=DY+16
      const cols = [{ v:grn, c:C.gC }, { v:amb, c:C.aC }, { v:red, c:C.rC }];
      const colW = divW / 3;
      cols.forEach((col, li) => {
        const lx = cx + li * colW + colW / 2;
        doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...col.c);
        doc.text(String(col.v), lx, DY + 14.8, { align:"center" });
      });
      // Labels at very bottom: OK / WRN / CRT — Y:DY+15.8, inside DH=16
      doc.setFont("helvetica","normal"); doc.setFontSize(3.2); doc.setTextColor(...C.muted);
      ["OK","WRN","CRT"].forEach((lbl, li) => {
        const lx = cx + li * colW + colW / 2;
        // skip – no room; merged into count colour
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION BAR  (Y:59.5)
    // Thin rule + title left, legend right
    doc.setFillColor(...C.border); doc.rect(PAD, SY, TW, 0.4, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(5.8); doc.setTextColor(...C.navy);
    doc.text("FACILITY STATUS DETAIL", PAD, SY + 4);

    // Legend – fixed positions, right-aligned from PW-PAD
    const lgDefs = [
      { lbl:"Operational", c:C.gC },
      { lbl:"Degraded",    c:C.aC },
      { lbl:"Critical",    c:C.rC },
      { lbl:"Not Set",     c:[185,192,210] as [number,number,number] },
    ];
    let lgCursor = PW - PAD;
    [...lgDefs].reverse().forEach(lg => {
      const tw = doc.getTextWidth(lg.lbl) * (4.8/12);   // approx width at 4.8pt
      lgCursor -= (tw + 7);
      doc.setFillColor(...lg.c); doc.circle(lgCursor + 1.5, SY + 2.5, 1.5, "F");
      doc.setFont("helvetica","normal"); doc.setFontSize(4.8); doc.setTextColor(...C.ink);
      doc.text(lg.lbl, lgCursor + 4.2, SY + 3.8);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // FACILITY TABLE  (Y:64)
    const ORDER: Record<string,number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
    const sorted = [...FACILITIES].sort((a,b)=>(ORDER[a.cat]??9)-(ORDER[b.cat]??9));
    const facRows = sorted.map((f, i) => {
      const s  = state[f.name] ?? defaultState();
      const ov = calcOverall(s);
      const ts = s.ts ? s.ts.replace("T"," ").slice(5,16) : "—";
      return {
        d: [String(i+1), f.name, f.cat, iLbl[s.internet], bLbl[s.bio], pLbl[s.printing], ragLabel(ov), ts, s.issue||""],
        internet:s.internet, bio:s.bio, printing:s.printing, overall:ov,
        cat:f.cat, prevCat: i > 0 ? sorted[i-1].cat : "",
      };
    });

    autoTable(doc, {
      startY: TBL_Y,
      tableWidth: TW,
      margin: { left:PAD, right:PAD, bottom: 14 },
      head: [["#","Facility Name","Division","Internet","Biometric","Printing","Overall RAG","Updated","Issue / Notes"]],
      body: facRows.map(r => r.d),
      styles: {
        fontSize: 5.2,
        cellPadding: { top:1.5, bottom:1.5, left:2, right:2 },
        font: "helvetica",
        lineColor: C.border,
        lineWidth: 0.1,
        textColor: C.ink,
        valign: "middle",
        overflow: "ellipsize",
        minCellHeight: 3.8,
        fillColor: C.white,
      },
      headStyles: {
        fillColor: C.navy,
        textColor: C.white,
        fontStyle: "bold",
        fontSize: 5.2,
        halign: "center",
        valign: "middle",
        cellPadding: { top:2.5, bottom:2.5, left:2, right:2 },
        lineWidth: 0,
        minCellHeight: 7.5,
      },
      alternateRowStyles: { fillColor:[244,247,253] },
      pageBreak: "avoid",
      columnStyles: {
        0: { cellWidth:5.5,  halign:"center", fontStyle:"bold", textColor:C.muted },
        1: { cellWidth:38,   fontStyle:"bold", textColor:C.navy },
        2: { cellWidth:15,   halign:"center" },
        3: { cellWidth:17,   halign:"center" },
        4: { cellWidth:15,   halign:"center" },
        5: { cellWidth:13,   halign:"center" },
        6: { cellWidth:19,   halign:"center", fontStyle:"bold" },
        7: { cellWidth:17,   halign:"center" },
        8: { cellWidth:"auto" as any },
      },
      didParseCell: (data:any) => {
        if (data.section !== "body") return;
        const row = facRows[data.row.index]; if (!row) return;
        // Status colour cells
        const rm: Record<number,RAGStatus> = { 3:row.internet, 4:row.bio, 5:row.printing, 6:row.overall };
        const st = rm[data.column.index];
        if (st) {
          data.cell.styles.fillColor = ragFill(st);
          data.cell.styles.textColor = ragText(st);
          data.cell.styles.fontStyle = "bold";
        }
        // Division badge
        if (data.column.index === 2 && CAT_C[row.cat]) {
          data.cell.styles.fillColor = CAT_BG[row.cat];
          data.cell.styles.textColor = CAT_C[row.cat];
          data.cell.styles.fontStyle = "bold";
        }
        // Updated column dim
        if (data.column.index === 7) { data.cell.styles.textColor = C.muted; }
        // Issue column – italic, muted red
        if (data.column.index === 8 && row.d[8]) {
          data.cell.styles.textColor = C.rD;
          data.cell.styles.fontStyle = "italic";
        }
        // Category boundary: thicker top border in category colour
        if (row.cat !== row.prevCat && data.row.index > 0) {
          data.cell.styles.lineColor = CAT_C[row.cat] ?? C.border;
          data.cell.styles.lineWidth = 0.45;
        }
      },
      didDrawCell: (data:any) => {
        // Left-edge coloured stripe on row number cell at each category change
        if (data.section === "body" && data.column.index === 0) {
          const row = facRows[data.row.index];
          if (row && row.cat !== row.prevCat) {
            doc.setFillColor(...(CAT_C[row.cat] ?? C.navy));
            doc.rect(data.cell.x, data.cell.y, 1.4, data.cell.height, "F");
          }
        }
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // FOOTER  (Y:197 – Y:210)
    doc.setFillColor(...C.navy);  doc.rect(0, FTR_Y, PW, PH-FTR_Y, "F");
    doc.setFillColor(...C.gold);  doc.rect(0, FTR_Y, PW, 0.7, "F");

    const fY1 = FTR_Y + 4.5;   // first text line
    const fY2 = FTR_Y + 8;     // second text line
    const fY3 = FTR_Y + 11;    // third text line

    // Left column
    doc.setFont("helvetica","bold"); doc.setFontSize(5.8); doc.setTextColor(...C.gold);
    doc.text("IMARAT GROUP OF COMPANIES", PAD, fY1);
    doc.setFont("helvetica","normal"); doc.setFontSize(4.2); doc.setTextColor(105,132,175);
    doc.text("IT Department  ·  it.support@imarat.com.pk", PAD, fY2);
    doc.setFontSize(3.6); doc.setTextColor(78,104,150);
    doc.text("CONFIDENTIAL — AUTHORISED PERSONNEL ONLY", PAD, fY3);

    // Centre column
    doc.setFont("helvetica","bold"); doc.setFontSize(5.5); doc.setTextColor(188,208,245);
    doc.text("SYSTEM GENERATED REPORT", PW/2, fY1, { align:"center" });
    doc.setFont("helvetica","normal"); doc.setFontSize(4.2); doc.setTextColor(105,132,175);
    doc.text("RAG Dashboard Automation  ·  Do Not Alter", PW/2, fY2, { align:"center" });
    doc.setFontSize(3.6); doc.setTextColor(78,104,150);
    doc.text(`Ref: ${refNo}`, PW/2, fY3, { align:"center" });

    // Right column
    doc.setFont("helvetica","bold"); doc.setFontSize(5.8); doc.setTextColor(...C.gold);
    doc.text(`${dateStr}  ·  ${timeStr}`, PW-PAD, fY1, { align:"right" });
    doc.setFont("helvetica","normal"); doc.setFontSize(4.2); doc.setTextColor(105,132,175);
    doc.text(`${FACILITIES.length} Sites Monitored`, PW-PAD, fY2, { align:"right" });
    doc.setFontSize(3.6); doc.setTextColor(78,104,150);
    doc.text("imarat.com.pk", PW-PAD, fY3, { align:"right" });

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
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, color:"#4A6FA5", marginRight:4 }}>Export PDF range:</span>
          <input type="datetime-local" value={logFrom} onChange={e=>setLogFrom(e.target.value)}
            style={{ padding:"5px 8px", border:"1px solid #1E3A5F", borderRadius:6, fontSize:11, color:"#fff", background:"#112240", width:168 }} />
          <span style={{ color:"#4A6FA5", fontSize:11 }}>to</span>
          <input type="datetime-local" value={logTo} onChange={e=>setLogTo(e.target.value)}
            style={{ padding:"5px 8px", border:"1px solid #1E3A5F", borderRadius:6, fontSize:11, color:"#fff", background:"#112240", width:168 }} />
          <button onClick={()=>{setLogFrom("");setLogTo("");}}
            style={{ padding:"5px 10px", background:"#1E3A5F", border:"none", borderRadius:6, fontSize:11, color:"#718096", cursor:"pointer" }}>Clear</button>
          <button onClick={exportPDF}
            style={{ padding:"6px 16px", background:S.gold, border:"none", borderRadius:6, fontSize:12, color:"#fff", cursor:"pointer", fontWeight:700, letterSpacing:.3 }}>
            {logFrom||logTo ? "Export PDF (Filtered)" : "Export PDF"}
          </button>
          <div style={{ marginLeft:8, fontSize:11, color:"#4A6FA5" }}>{clock}</div>
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
    </div>
  );
}
