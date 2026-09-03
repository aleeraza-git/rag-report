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

  const exportPDF = async () => {
    const d       = new Date();
    const dateStr = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
    const timeStr = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const refNo   = `IGC-IT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;

    // ── Load logo ─────────────────────────────────────────────────────────────
    let logoData = "";
    try {
      const resp = await fetch("/imarat-logo.png");
      const blob = await resp.blob();
      logoData   = await new Promise<string>(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.readAsDataURL(blob);
      });
    } catch { /* logo optional */ }

    // ── Document ──────────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const PW  = doc.internal.pageSize.getWidth();   // 297
    const PH  = doc.internal.pageSize.getHeight();  // 210
    const PAD = 11;
    const TW  = PW - PAD * 2;                       // 275

    // ── Palette ───────────────────────────────────────────────────────────────
    type RGB = [number,number,number];
    const C = {
      navy:   [7,  22,  54] as RGB,
      navyM:  [12, 34,  78] as RGB,
      navyL:  [22, 52, 110] as RGB,
      gold:   [201,168,  76] as RGB,
      goldL:  [245,225, 160] as RGB,
      white:  [255,255, 255] as RGB,
      bg:     [247,248, 252] as RGB,
      bgCard: [255,255, 255] as RGB,
      muted:  [107,122, 159] as RGB,
      border: [221,227, 240] as RGB,
      shadow: [205,213, 232] as RGB,
      ink:    [18,  28,  60] as RGB,
      // Status
      gC: [0,  155, 130] as RGB,   gL: [208,246,238] as RGB,   gD: [0,  88,  72] as RGB,
      aC: [218,148,  0] as RGB,    aL: [254,238,170] as RGB,   aD: [100, 62,  0] as RGB,
      rC: [208, 34,  48] as RGB,   rL: [255,210,216] as RGB,   rD: [130, 10,  20] as RGB,
      nC: [150,160, 185] as RGB,   nL: [234,237,246] as RGB,   nD: [80,  90, 115] as RGB,
      // Division
      dImarat:   [0,  155, 130] as RGB,
      dProjects: [34,  80, 210] as RGB,
      dGraana:   [110, 32, 210] as RGB,
      dAgency21: [210, 80,  12] as RGB,
    };
    const CAT_C:  Record<string,RGB> = { Imarat:C.dImarat, Projects:C.dProjects, Graana:C.dGraana, Agency21:C.dAgency21 };
    const CAT_BG: Record<string,RGB> = { Imarat:[210,248,240], Projects:[218,228,255], Graana:[236,222,255], Agency21:[255,228,208] };

    const ragC  = (s:RAGStatus):RGB => s==="green"?C.gC:s==="amber"?C.aC:s==="red"?C.rC:C.nC;
    const ragL  = (s:RAGStatus):RGB => s==="green"?C.gL:s==="amber"?C.aL:s==="red"?C.rL:C.nL;
    const ragD  = (s:RAGStatus):RGB => s==="green"?C.gD:s==="amber"?C.aD:s==="red"?C.rD:C.nD;
    const ragTx = (s:RAGStatus) => s==="green"?"Operational":s==="amber"?"Degraded":s==="red"?"Critical":"Not Set";
    const iLbl  = (s:RAGStatus) => ({green:"Active",   amber:"Unstable", red:"Down",    na:"—"})[s];
    const bLbl  = (s:RAGStatus) => ({green:"Syncing",  amber:"Delayed",  red:"Offline", na:"—"})[s];
    const pLbl  = (s:RAGStatus) => ({green:"Online",   amber:"Partial",  red:"Down",    na:"—"})[s];

    // ── Helpers ───────────────────────────────────────────────────────────────
    const fillRect = (x:number,y:number,w:number,h:number,c:RGB) => {
      doc.setFillColor(...c); doc.rect(x,y,w,h,"F");
    };
    const fillRR = (x:number,y:number,w:number,h:number,r:number,c:RGB) => {
      doc.setFillColor(...c); doc.roundedRect(x,y,w,h,r,r,"F");
    };
    const card = (x:number,y:number,w:number,h:number,r=2) => {
      doc.setFillColor(...C.shadow); doc.roundedRect(x+0.8,y+0.8,w,h,r,r,"F");
      doc.setFillColor(...C.bgCard); doc.roundedRect(x,y,w,h,r,r,"F");
    };
    const progressBar = (x:number,y:number,w:number,h:number,pct:number,col:RGB) => {
      fillRR(x,y,w,h,h/2,C.border);
      if(pct>0) fillRR(x,y,Math.max(w*pct,h),h,h/2,col);
    };
    const txt = (t:string,x:number,y:number,size:number,col:RGB,style:"normal"|"bold"="normal",align:"left"|"center"|"right"="left") => {
      doc.setFont("helvetica",style); doc.setFontSize(size); doc.setTextColor(...col);
      doc.text(t,x,y,{align});
    };

    // ─────────────────────────────────────────────────────────────────────────
    // LAYOUT BANDS
    // ─────────────────────────────────────────────────────────────────────────
    // Header      Y: 0   – 27
    // KPI band    Y: 28  – 44   (height 16, cards 28.5–43.5)
    // Division    Y: 45  – 62   (height 17, cards 45.5–61.5)
    // Section bar Y: 63  – 67
    // Table       Y: 68  – 197  (usable 117mm; 31×3.5+7.5=116mm ✓)
    // Footer      Y: 197 – 210
    const HDR_H = 27;
    const KY = 28.5, KH = 15;
    const DY = 45.5, DH = 16;
    const SY = 63;
    const TBL_Y = 68;
    const FTR_Y = PH - 13;   // 197

    // =========================================================================
    // 1. PAGE BACKGROUND
    fillRect(0,0,PW,PH,C.bg);

    // =========================================================================
    // 2. HEADER  (0–27mm)
    // Left third: white panel with logo
    // Right two-thirds: navy with title
    const LOGO_W = 58;  // white panel width

    // Navy background full header
    fillRect(0,0,PW,HDR_H,C.navy);

    // Gold top rule (2.5mm)
    fillRect(0,0,PW,2.5,C.gold);

    // White logo panel
    fillRR(PAD,3.5,LOGO_W,21,2,C.white);

    // Logo image inside white panel (centred, scaled to fit 50×14mm)
    if (logoData) {
      // Logo is ~560×187px ≈ 3:1 aspect. At w=46mm → h=15.3mm
      const lw = 46, lh = 15;
      const lx = PAD + (LOGO_W - lw) / 2;
      const ly = 3.5 + (21 - lh) / 2;
      doc.addImage(logoData, "PNG", lx, ly, lw, lh);
    } else {
      txt("IMARAT", PAD + LOGO_W/2, 3.5+13, 14, C.navy, "bold", "center");
    }

    // Vertical gold separator
    doc.setDrawColor(...C.gold); doc.setLineWidth(0.6);
    doc.line(PAD + LOGO_W + 5, 4, PAD + LOGO_W + 5, 24.5);

    // Title block (starts after separator)
    const TX = PAD + LOGO_W + 10;
    txt("IT FACILITIES RAG DASHBOARD", TX, 13.5, 11.5, C.white, "bold");
    txt("IMARAT GROUP OF COMPANIES", TX, 19.5, 6, C.gold, "bold");
    txt(`Daily Operational Report  ·  ${FACILITIES.length} Sites Monitored`, TX, 24, 4.2, [100,130,180] as RGB);

    // Right meta block
    txt(dateStr, PW-PAD, 12, 10.5, C.gold, "bold", "right");
    txt(timeStr, PW-PAD, 18.5, 5.5, [140,165,210] as RGB, "normal", "right");
    txt(`Ref: ${refNo}`, PW-PAD, 23.5, 3.8, [90,118,165] as RGB, "normal", "right");

    // =========================================================================
    // 3. KPI CARDS  (Y:28.5–43.5)
    const kpis = [
      { val:String(FACILITIES.length),   lbl:"TOTAL SITES",   dot:C.navyL },
      { val:String(counts.green),         lbl:"OPERATIONAL",   dot:C.gC    },
      { val:String(counts.amber),         lbl:"DEGRADED",      dot:C.aC    },
      { val:String(counts.red),           lbl:"CRITICAL",      dot:C.rC    },
      { val:String(autoStats.received),   lbl:"TICKETS TODAY", dot:[48,80,218] as RGB },
      { val:String(autoStats.resolved),   lbl:"RESOLVED",      dot:C.gC    },
      { val:String(autoStats.pending),    lbl:"PENDING",       dot:C.aC    },
    ];
    const KW = TW / kpis.length;
    kpis.forEach((k,i) => {
      const x = PAD + i*KW;
      card(x+0.5, KY, KW-1, KH);
      // Left accent stripe (3×KH mm coloured strip)
      fillRR(x+0.5, KY, 2.5, KH, 1, k.dot);
      // Value
      txt(k.val, x+KW/2+1, KY+9.5, 14, k.dot, "bold", "center");
      // Label
      txt(k.lbl, x+KW/2+1, KY+13.3, 4.2, C.muted, "bold", "center");
    });

    // =========================================================================
    // 4. DIVISION STRIP  (Y:45.5–61.5)
    const totalSites = FACILITIES.length;
    const healthPct  = totalSites>0 ? counts.green/totalSites : 0;
    const hCol:RGB   = healthPct>=0.8?C.gC:healthPct>=0.5?C.aC:C.rC;
    const HSW = 52;
    const divGap = 2;
    const divW   = (TW - HSW - divGap) / 4 - 0.5;

    // ── Health card ──────────────────────────────────────────────────────────
    card(PAD, DY, HSW, DH);
    fillRR(PAD, DY, HSW, 2, 1, hCol); fillRect(PAD, DY+1, HSW, 1, hCol); // coloured top strip

    txt("OVERALL HEALTH", PAD+HSW/2, DY+5.8, 4.5, C.muted, "bold", "center");
    txt(`${Math.round(healthPct*100)}%`, PAD+HSW/2, DY+12.5, 19, hCol, "bold", "center");
    progressBar(PAD+4, DY+DH-2.8, HSW-8, 2, healthPct, hCol);

    // ── Division cards ───────────────────────────────────────────────────────
    (["Imarat","Projects","Graana","Agency21"] as const).forEach((cat,ci) => {
      const facs  = FACILITIES.filter(f=>f.cat===cat);
      const total = facs.length;
      const grn   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const amb   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="amber").length;
      const red   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="red").length;
      const cx    = PAD + HSW + divGap + ci*(divW+1);
      const ac    = CAT_C[cat];

      card(cx, DY, divW, DH);
      // Coloured top bar
      fillRR(cx, DY, divW, 2, 1, ac); fillRect(cx, DY+1, divW, 1, ac);

      // Division name row
      txt(cat.toUpperCase(), cx+3, DY+6, 5.8, ac, "bold");
      txt(`${total} sites`, cx+divW-3, DY+6, 4, C.muted, "normal", "right");

      // Stacked bar (Y:DY+8 – DY+10.2)
      const sbX=cx+3, sbW=divW-6, sbY=DY+8, sbH=2.2;
      fillRR(sbX,sbY,sbW,sbH,sbH/2,C.border);
      let bx=sbX;
      if(grn>0){const bw=sbW*(grn/total);fillRR(bx,sbY,bw,sbH,sbH/2,C.gC);bx+=bw;}
      if(amb>0){const bw=sbW*(amb/total);fillRect(bx,sbY,bw,sbH,C.aC);bx+=bw;}
      if(red>0){const bw=sbW*(red/total);fillRR(bx,sbY,bw,sbH,sbH/2,C.rC);}

      // 3 count columns  — MUST stay inside DY+DH (DY+16)
      const colW3 = divW/3;
      ([
        {v:grn,label:"OK",  c:C.gC},
        {v:amb,label:"WRN", c:C.aC},
        {v:red,label:"CRT", c:C.rC},
      ] as {v:number;label:string;c:RGB}[]).forEach((col,li)=>{
        const lx = cx + li*colW3 + colW3/2;
        txt(String(col.v), lx, DY+14.2, 8, col.c, "bold", "center");
      });
    });

    // =========================================================================
    // 5. SECTION BAR  (Y:63–67)
    doc.setDrawColor(...C.border); doc.setLineWidth(0.35);
    doc.line(PAD, SY+0.5, PW-PAD, SY+0.5);
    txt("FACILITY STATUS DETAIL", PAD, SY+4.5, 5.8, C.navy, "bold");

    // Legend (right-aligned, precise spacing)
    const lgItems = [
      {lbl:"Operational",c:C.gC},{lbl:"Degraded",c:C.aC},
      {lbl:"Critical",c:C.rC},{lbl:"Not Set",c:C.nC},
    ];
    let lgX = PW-PAD;
    [...lgItems].reverse().forEach(lg=>{
      doc.setFont("helvetica","normal"); doc.setFontSize(4.8);
      const tw = doc.getTextWidth(lg.lbl);
      lgX -= tw;
      txt(lg.lbl, lgX, SY+4.5, 4.8, C.ink);
      lgX -= 5;
      doc.setFillColor(...lg.c); doc.circle(lgX, SY+3, 1.4, "F");
      lgX -= 4;
    });

    // =========================================================================
    // 6. TABLE  (Y:68)
    const ORDER: Record<string,number> = {Imarat:0,Projects:1,Graana:2,Agency21:3};
    const sorted  = [...FACILITIES].sort((a,b)=>(ORDER[a.cat]??9)-(ORDER[b.cat]??9));
    const facRows = sorted.map((f,i)=>{
      const s  = state[f.name]??defaultState();
      const ov = calcOverall(s);
      const ts = s.ts?s.ts.replace("T"," ").slice(5,16):"—";
      return {
        d:[String(i+1), f.name, f.cat, iLbl(s.internet), bLbl(s.bio), pLbl(s.printing), ragTx(ov), ts, s.issue||""],
        internet:s.internet, bio:s.bio, printing:s.printing, overall:ov,
        cat:f.cat, prevCat:i>0?sorted[i-1].cat:"",
      };
    });

    autoTable(doc,{
      startY: TBL_Y,
      tableWidth: TW,
      margin:{ left:PAD, right:PAD, bottom:14 },
      head:[["#","Facility","Division","Internet","Biometric","Printing","Status","Updated","Notes"]],
      body: facRows.map(r=>r.d),
      styles:{
        font:"helvetica", fontSize:5.2,
        cellPadding:{top:1.4,bottom:1.4,left:2,right:2},
        minCellHeight:3.5,
        valign:"middle", overflow:"ellipsize",
        textColor:C.ink, fillColor:C.white,
        lineColor:C.border, lineWidth:0.12,
      },
      headStyles:{
        fillColor:C.navy, textColor:C.white,
        fontStyle:"bold", fontSize:5.2, halign:"center",
        cellPadding:{top:2.5,bottom:2.5,left:2,right:2},
        minCellHeight:7.5, lineWidth:0,
      },
      alternateRowStyles:{ fillColor:[244,246,252] as RGB },
      columnStyles:{
        0:{ cellWidth:5.5,  halign:"center", fontStyle:"bold", textColor:C.muted },
        1:{ cellWidth:40,   fontStyle:"bold", textColor:C.navy },
        2:{ cellWidth:16,   halign:"center" },
        3:{ cellWidth:16,   halign:"center" },
        4:{ cellWidth:15,   halign:"center" },
        5:{ cellWidth:13,   halign:"center" },
        6:{ cellWidth:20,   halign:"center", fontStyle:"bold" },
        7:{ cellWidth:17,   halign:"center" },
        8:{ cellWidth:"auto" as any },
      },
      didParseCell:(data:any)=>{
        if(data.section!=="body") return;
        const row=facRows[data.row.index]; if(!row) return;
        // Status badge colouring
        const colMap: Record<number,RAGStatus> = {3:row.internet,4:row.bio,5:row.printing,6:row.overall};
        const st=colMap[data.column.index];
        if(st){ data.cell.styles.fillColor=ragL(st); data.cell.styles.textColor=ragD(st); data.cell.styles.fontStyle="bold"; }
        // Division badge
        if(data.column.index===2){
          data.cell.styles.fillColor=CAT_BG[row.cat]??C.nL;
          data.cell.styles.textColor=CAT_C[row.cat]??C.nC;
          data.cell.styles.fontStyle="bold";
        }
        // Updated dim
        if(data.column.index===7){ data.cell.styles.textColor=C.muted; data.cell.styles.fontSize=4.5; }
        // Notes italic
        if(data.column.index===8&&row.d[8]){
          data.cell.styles.textColor=C.rD; data.cell.styles.fontStyle="italic";
        }
        // Category boundary top rule
        if(row.cat!==row.prevCat&&data.row.index>0){
          data.cell.styles.lineColor=CAT_C[row.cat]??C.border;
          data.cell.styles.lineWidth=0.5;
        }
      },
      didDrawCell:(data:any)=>{
        // Coloured left stripe on first column at category boundaries
        if(data.section==="body"&&data.column.index===0){
          const row=facRows[data.row.index];
          if(row&&row.cat!==row.prevCat){
            doc.setFillColor(...(CAT_C[row.cat]??C.navy));
            doc.rect(data.cell.x, data.cell.y, 1.6, data.cell.height,"F");
          }
        }
      },
    });

    // =========================================================================
    // 7. FOOTER  (Y:197–210)
    fillRect(0,FTR_Y,PW,PH-FTR_Y,C.navy);
    fillRect(0,FTR_Y,PW,0.6,C.gold);   // gold rule

    const fY1=FTR_Y+4.2, fY2=FTR_Y+7.8, fY3=FTR_Y+10.8;

    // Left
    txt("IMARAT GROUP OF COMPANIES", PAD, fY1, 5.8, C.gold, "bold");
    txt("IT Department  ·  it.support@imarat.com.pk", PAD, fY2, 4, [105,130,175] as RGB);
    txt("CONFIDENTIAL — FOR AUTHORISED PERSONNEL ONLY", PAD, fY3, 3.5, [78,104,150] as RGB);

    // Centre
    txt("SYSTEM GENERATED REPORT", PW/2, fY1, 5.5, [190,210,248] as RGB, "bold", "center");
    txt(`RAG Dashboard Automation  ·  Ref: ${refNo}`, PW/2, fY2, 4, [105,130,175] as RGB, "normal", "center");
    txt("Powered by Imarat IT — Do Not Distribute", PW/2, fY3, 3.5, [78,104,150] as RGB, "normal", "center");

    // Right
    txt(`${dateStr}  ·  ${timeStr}`, PW-PAD, fY1, 5.8, C.gold, "bold", "right");
    txt(`${FACILITIES.length} Sites  ·  All Divisions`, PW-PAD, fY2, 4, [105,130,175] as RGB, "normal", "right");
    txt("imarat.com.pk", PW-PAD, fY3, 3.5, [78,104,150] as RGB, "normal", "right");

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
