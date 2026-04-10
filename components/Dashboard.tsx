"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";

const FACILITIES: { name: string; cat: string }[] = [
  { name: "Amazon Mall", cat: "Projects" },
  { name: "Golf Floras Sales Office", cat: "Projects" },
  { name: "Golf Floras Project Site", cat: "Projects" },
  { name: "Imarat Downtown", cat: "Projects" },
  { name: "IR 1", cat: "Projects" },
  { name: "IR 2", cat: "Projects" },
  { name: "G11 CYBM", cat: "Projects" },
  { name: "Florence Galleria", cat: "Projects" },
  { name: "Builders Mall", cat: "Projects" },
  { name: "Bavylon Multan", cat: "Projects" },
  { name: "GRO Lahore", cat: "Graana" },
  { name: "Warehouse", cat: "Imarat" },
  { name: "Record Room", cat: "Imarat" },
  { name: "Chairman House F8", cat: "Imarat" },
  { name: "Printing Press", cat: "Imarat" },
  { name: "Sialkot Office", cat: "Imarat" },
  { name: "Beverly", cat: "Imarat" },
  { name: "GRO RWP", cat: "Graana" },
  { name: "Bahria Phase 7", cat: "Graana" },
  { name: "Peshawar Graana", cat: "Graana" },
  { name: "Multan Office", cat: "Graana" },
  { name: "GRO Karachi", cat: "Graana" },
  { name: "Quetta Office", cat: "Graana" },
  { name: "Agency21 Blue Area", cat: "Agency21" },
  { name: "Civic Center", cat: "Agency21" },
  { name: "Peshawar Agency21", cat: "Agency21" },
  { name: "Mardan Office", cat: "Agency21" },
  { name: "Site Office GT Road", cat: "Agency21" },
  { name: "Faisalabad Office", cat: "Agency21" },
  { name: "DHA E", cat: "Agency21" },
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
const LOG_STYLE: Record<string,{ bg:string; text:string; border:string }> = {
  status:    { bg:"#f0f4ff", text:"#1A3A5C", border:"#b4c6fb" },
  issue:     { bg:"#fdf0f0", text:"#8b1c1c", border:"#f5b8b8" },
  notes:     { bg:"#f8f9fb", text:"#4a5568", border:"#dde1e8" },
  bandwidth: { bg:"#edf7f0", text:"#1a6b35", border:"#a8d5b5" },
  ticket:    { bg:"#fef8ec", text:"#7a5200", border:"#f5d48a" },
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
function Sel({ value, opts, onChange }: { value:RAGStatus; opts:{v:RAGStatus;l:string}[]; onChange:(v:RAGStatus)=>void }) {
  const r = RAG[value];
  return (
    <select value={value} onChange={e=>onChange(e.target.value as RAGStatus)}
      style={{ background:r.bg, color:r.text, border:`1px solid ${r.border}`, borderRadius:3, padding:"3px 6px", fontSize:11, width:"100%", minWidth:130, cursor:"pointer", fontWeight:500 }}>
      {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
function StatInput({ label, value, color, bg, border, onChange }: { label:string; value:number; color:string; bg:string; border:string; onChange:(v:number)=>void }) {
  return (
    <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:8, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
      <div>
        <div style={{ fontSize:10, color:"#8a94a6", marginBottom:4, letterSpacing:".3px" }}>{label}</div>
        <div style={{ fontSize:26, fontWeight:700, color }}>{value}</div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        <button onClick={()=>onChange(value+1)} style={{ width:28, height:28, border:`1px solid ${border}`, borderRadius:4, background:"#fff", color, fontSize:16, cursor:"pointer", fontWeight:700, lineHeight:1 }}>+</button>
        <button onClick={()=>onChange(Math.max(0,value-1))} style={{ width:28, height:28, border:`1px solid ${border}`, borderRadius:4, background:"#fff", color, fontSize:16, cursor:"pointer", fontWeight:700, lineHeight:1 }}>-</button>
      </div>
    </div>
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

  const loadTickets = useCallback(async () => {
    const { data } = await supabase.from("tickets").select("*");
    if (data) setTickets(data.map((r: any) => r.data).sort((a: Ticket, b: Ticket) => b.ts.localeCompare(a.ts)));
  }, []);

  const loadLog = useCallback(async () => {
    const { data } = await supabase.from("activity_log").select("*").order("updated_at", { ascending: false }).limit(500);
    if (data) setActivityLog(data.map((r: any) => r.data));
  }, []);

  useEffect(() => {
    const init: AppState = {};
    FACILITIES.forEach(f => { init[f.name] = defaultState(); });
    const loadAll = async () => {
      setSyncing(true);
      try {
        const [{ data: fsData }, { data: tkData }, { data: stData }, { data: logData }] = await Promise.all([
          supabase.from("facility_state").select("*"),
          supabase.from("tickets").select("*"),
          supabase.from("daily_stats").select("*").eq("id","today").single(),
          supabase.from("activity_log").select("*").order("updated_at", { ascending: false }).limit(500),
          supabase.from("downtime_log").select("*").order("updated_at", { ascending: false }).limit(200),
        ]);
        if (fsData) fsData.forEach((row: any) => { if (init[row.id]) init[row.id] = { ...defaultState(), ...row.data }; });
        if (tkData) setTickets(tkData.map((r: any) => r.data).sort((a: Ticket, b: Ticket) => b.ts.localeCompare(a.ts)));
        if (stData) setStats(stData.data);
        if (logData) setActivityLog(logData.map((r: any) => r.data));
        const dtData = (await supabase.from("downtime_log").select("*").order("updated_at", { ascending: false }).limit(200)).data;
        if (dtData) setDowntimeRecords(dtData.map((r: any) => r.data));
      } catch {}
      setState(init);
      setSyncing(false);
      setLastSync(nowTime());
      setMounted(true);
    };
    loadAll();

    const fmt = () => new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
    setNow(fmt());
    const t = setInterval(() => setNow(fmt()), 1000);

    const fsSub = supabase.channel("fs_ch2").on("postgres_changes", { event:"*", schema:"public", table:"facility_state" }, (payload: any) => {
      if (payload.new) { setState(prev => ({ ...prev, [payload.new.id]: { ...defaultState(), ...payload.new.data } })); setLastSync(nowTime()); }
    }).subscribe();
    const tkSub = supabase.channel("tk_ch2")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"tickets" }, () => { loadTickets(); setLastSync(nowTime()); })
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"tickets" }, () => { loadTickets(); setLastSync(nowTime()); })
      .on("postgres_changes", { event:"DELETE", schema:"public", table:"tickets" }, () => { loadTickets(); setLastSync(nowTime()); })
      .subscribe();
    const stSub = supabase.channel("st_ch2").on("postgres_changes", { event:"*", schema:"public", table:"daily_stats" }, (payload: any) => {
      if (payload.new) { setStats(payload.new.data); setLastSync(nowTime()); }
    }).subscribe();
    const logSub = supabase.channel("log_ch2").on("postgres_changes", { event:"*", schema:"public", table:"activity_log" }, () => { loadLog(); }).subscribe();
    const dtSub = supabase.channel("dt_ch").on("postgres_changes", { event:"*", schema:"public", table:"downtime_log" }, async () => {
      const { data } = await supabase.from("downtime_log").select("*").order("updated_at", { ascending: false }).limit(200);
      if (data) setDowntimeRecords(data.map((r: any) => r.data));
    }).subscribe();

    return () => { clearInterval(t); supabase.removeChannel(fsSub); supabase.removeChannel(tkSub); supabase.removeChannel(stSub); supabase.removeChannel(logSub); supabase.removeChannel(dtSub); };
  }, [loadTickets, loadLog]);

  const addLog = useCallback(async (entry: Omit<ActivityLog,"id"|"ts">) => {
    const log: ActivityLog = { ...entry, id: uid(), ts: nowFull() };
    // Update local state immediately so feed shows instantly
    setActivityLog(prev => [log, ...prev].slice(0, 500));
    await supabase.from("activity_log").upsert({ id: log.id, data: log, updated_at: new Date().toISOString() });
  }, []);

  const saveFacility = useCallback(async (name: string, data: FacilityState, oldData: FacilityState, changedField: string) => {
    await supabase.from("facility_state").upsert({ id: name, data, updated_at: new Date().toISOString() });
    const oldVal = String((oldData as any)[changedField] || "");
    const newVal = String((data as any)[changedField] || "");
    if (oldVal !== newVal) {
      const type: ActivityLog["type"] = ["internet","bio","printing"].includes(changedField) ? "status" : changedField === "issue" ? "issue" : changedField.includes("andwidth") ? "bandwidth" : "notes";
      const fl = fieldLabel(changedField);
      await addLog({ facility: name, field: fl, oldVal: humanVal(oldVal)||"—", newVal: humanVal(newVal)||"—", type });

      // DOWNTIME TRACKING
      if (["internet","bio","printing"].includes(changedField)) {
        const dtKey = `${name}__${changedField}`;
        const nowMs = Date.now();

        // If going RED or AMBER — start downtime timer
        if ((newVal === "red" || newVal === "amber") && oldVal === "green") {
          activeDowntime.current[dtKey] = { field: fl, startTs: nowFull(), startMs: nowMs };
        }

        // If recovering to GREEN — close downtime record
        if (newVal === "green" && (oldVal === "red" || oldVal === "amber")) {
          const active = activeDowntime.current[dtKey];
          if (active) {
            const durationMin = Math.round((nowMs - active.startMs) / 60000);
            const record: DowntimeRecord = {
              id: uid(),
              facility: name,
              field: fl,
              startTs: active.startTs,
              endTs: nowFull(),
              durationMin,
              resolvedBy: "System",
            };
            setDowntimeRecords(prev => [record, ...prev]);
            await supabase.from("downtime_log").upsert({ id: record.id, data: record, updated_at: new Date().toISOString() });
            delete activeDowntime.current[dtKey];
          }
        }
      }
    }
    setLastSync(nowTime());
  }, [addLog]);

  const updateField = useCallback((name:string, field:keyof FacilityState, val:string) => {
    setState(prev => {
      const oldData = prev[name] || defaultState();
      const updated = { ...oldData, [field]: val, ts: nowTime() };
      // Always update UI immediately
      const newState = { ...prev, [name]: updated };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const isStatus = ["internet","bio","printing"].includes(field as string);
      if (isStatus) {
        // Save and log immediately for status fields
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
    await supabase.from("daily_stats").upsert({ id:"today", data: updated, updated_at: new Date().toISOString() });
  };
  const resetStats = async () => {
    const reset = { received:0, resolved:0, pending:0, inprogress:0 };
    setStats(reset);
    await supabase.from("daily_stats").upsert({ id:"today", data: reset, updated_at: new Date().toISOString() });
  };

  const addTicket = async () => {
    if (!newTicket.description) return;
    const t: Ticket = { id:imatTicketId(), office:newTicket.office||"Unknown / Remote Office", medium:newTicket.medium||"—", description:newTicket.description, reportedBy:newTicket.reportedBy||"Unknown", assignedTo:newTicket.assignedTo, resolvedBy:"", status:"open", ts:nowFull(), resolvedTs:"" };
    setTickets(prev => [t, ...prev]);
    await supabase.from("tickets").upsert({ id: t.id, data: t, updated_at: new Date().toISOString() });
    await addLog({ facility: t.office, field:"Ticket Created", oldVal:"—", newVal:`${t.id}: ${t.description}`, type:"ticket" });
    setNewTicket({ office:"", description:"", reportedBy:"", assignedTo:"", medium:"" });
    setShowTicketForm(false);
  };
  const updateTicket = async (id:string, field:keyof Ticket, val:string) => {
    const ticket = tickets.find(t => t.id === id); if (!ticket) return;
    const updated = { ...ticket, [field]: val };
    if (field === "status" && val === "resolved") updated.resolvedTs = nowFull();
    // Optimistic update - update UI immediately
    setTickets(prev => prev.map(t => t.id === id ? updated : t));
    await supabase.from("tickets").upsert({ id, data: updated, updated_at: new Date().toISOString() });
    if (field === "status") await addLog({ facility: ticket.office, field:`Ticket ${id}`, oldVal: humanVal(ticket.status), newVal: humanVal(val), type:"ticket" });
    if (field === "assignedTo") await addLog({ facility: ticket.office, field:`Ticket ${id} Assigned`, oldVal: ticket.assignedTo||"—", newVal: val||"—", type:"ticket" });
  };
  const deleteTicket = async (id:string) => {
    const ticket = tickets.find(t => t.id === id);
    setTickets(prev => prev.filter(t => t.id !== id));
    await supabase.from("tickets").delete().eq("id", id);
    if (ticket) await addLog({ facility: ticket.office, field:"Ticket Deleted", oldVal: id, newVal:"—", type:"ticket" });
  };

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

  const exportPDF = () => {
    const d = new Date();
    const dateStr = d.toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" });
    const timeStr = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const PAD = 12;
    const TW = PW - PAD * 2;
    let pg = 0;

    // ── COLOUR PALETTE ──────────────────────────────────
    const navy:   [number,number,number] = [10, 22, 40];
    const navyM:  [number,number,number] = [17, 34, 64];
    const gold:   [number,number,number] = [201,168,76];
    const goldL:  [number,number,number] = [245,230,175];
    const white:  [number,number,number] = [255,255,255];
    const ink:    [number,number,number] = [26, 32, 44];
    const muted:  [number,number,number] = [113,128,150];
    const pale:   [number,number,number] = [247,250,252];
    const border: [number,number,number] = [226,232,240];
    const gF:     [number,number,number] = [198,239,206];
    const gT:     [number,number,number] = [14, 85, 38];
    const aF:     [number,number,number] = [255,235,156];
    const aT:     [number,number,number] = [115,65, 0];
    const rF:     [number,number,number] = [255,199,206];
    const rT:     [number,number,number] = [148,18, 18];
    const nF:     [number,number,number] = [238,240,245];
    const nT:     [number,number,number] = [105,115,132];

    const ragF = (s:RAGStatus) => s==="green"?gF:s==="amber"?aF:s==="red"?rF:nF;
    const ragT = (s:RAGStatus) => s==="green"?gT:s==="amber"?aT:s==="red"?rT:nT;
    const ragLbl = (s:RAGStatus) => s==="green"?"Operational":s==="amber"?"Degraded":s==="red"?"Critical":"N/A";
    const iL: Record<RAGStatus,string> = { green:"Working", amber:"Slow/Intermittent", red:"Down", na:"N/A" };
    const bL: Record<RAGStatus,string> = { green:"Syncing OK", amber:"Delayed", red:"Not Working", na:"N/A" };
    const pL: Record<RAGStatus,string> = { green:"Working", amber:"Partial", red:"Not Working", na:"N/A" };

    const statusLog = activityLog.filter(l => l.type === "status").filter(l => {
      if (!logFrom && !logTo) return true;
      try {
        const lts = new Date(l.ts).getTime();
        const from = logFrom ? new Date(logFrom).getTime() : 0;
        const to = logTo ? new Date(logTo).getTime() : Infinity;
        return lts >= from && lts <= to;
      } catch { return true; }
    });

    // ── HEADER ──────────────────────────────────────────
    const drawHeader = (title: string, sub: string) => {
      pg++;
      // Full navy header
      doc.setFillColor(...navy); doc.rect(0, 0, PW, 28, "F");
      // Gold top stripe
      doc.setFillColor(...gold); doc.rect(0, 0, PW, 2.5, "F");
      // Gold bottom stripe
      doc.setFillColor(...gold); doc.rect(0, 28, PW, 1, "F");
      // Left section — company
      doc.setFont("helvetica","bold"); doc.setFontSize(17);
      doc.setTextColor(...white);
      doc.text("IMARAT", PAD, 13);
      doc.setFont("helvetica","normal"); doc.setFontSize(7);
      doc.setTextColor(...gold);
      doc.text("GROUP OF COMPANIES", PAD, 18.5);
      doc.setTextColor(160,185,218); doc.setFontSize(6.5);
      doc.text("Information Technology Department  ·  it.support@imarat.com.pk", PAD, 23.5);
      // Vertical gold rule
      doc.setDrawColor(...gold); doc.setLineWidth(0.4);
      doc.line(PAD+88, 5, PAD+88, 24);
      // Centre — report title
      doc.setFont("helvetica","bold"); doc.setFontSize(12.5);
      doc.setTextColor(...white);
      doc.text(title, PAD+94, 13);
      doc.setFont("helvetica","normal"); doc.setFontSize(7);
      doc.setTextColor(160,185,218);
      doc.text(sub, PAD+94, 19.5);
      // Right — date / page
      doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
      doc.setTextColor(...gold);
      doc.text(dateStr, PW-PAD, 11, { align:"right" });
      doc.setFont("helvetica","normal"); doc.setFontSize(7);
      doc.setTextColor(160,185,218);
      doc.text(timeStr, PW-PAD, 17, { align:"right" });
      doc.text(`Page ${pg}`, PW-PAD, 23, { align:"right" });
    };

    // ── FOOTER ──────────────────────────────────────────
    const drawFooter = () => {
      doc.setFillColor(...navy); doc.rect(0, PH-8, PW, 8, "F");
      doc.setFillColor(...gold); doc.rect(0, PH-8, PW, 0.6, "F");
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
      doc.setTextColor(100,125,165);
      doc.text("IMARAT Group of Companies  ·  IT Facilities RAG Dashboard  ·  Confidential  ·  Internal Use Only", PAD, PH-3);
      doc.text(`${dateStr}  ·  ${timeStr}`, PW-PAD, PH-3, { align:"right" });
    };

    // ── KPI CARDS ───────────────────────────────────────
    const drawKPIs = (y: number) => {
      const cards = [
        { label:"TOTAL SITES",      val:String(FACILITIES.length), f:[228,235,252] as [number,number,number], t:navy,   accent:navyM },
        { label:"OPERATIONAL",      val:String(counts.green),       f:gF,  t:gT,   accent:gT },
        { label:"WARNING",          val:String(counts.amber),       f:aF,  t:aT,   accent:aT },
        { label:"CRITICAL",         val:String(counts.red),         f:rF,  t:rT,   accent:rT },
        { label:"QUERIES TODAY",    val:String(stats.received),     f:[215,230,255] as [number,number,number], t:[22,60,170] as [number,number,number], accent:[22,60,170] as [number,number,number] },
        { label:"RESOLVED",         val:String(stats.resolved),     f:[185,245,205] as [number,number,number], t:[5,98,58] as [number,number,number],   accent:[5,98,58] as [number,number,number] },
        { label:"PENDING",          val:String(stats.pending),      f:aF,  t:aT,   accent:aT },
      ];
      const cw = TW / cards.length;
      cards.forEach((c, i) => {
        const x = PAD + i * cw;
        doc.setFillColor(...c.f); doc.roundedRect(x+0.8, y, cw-1.8, 20, 2, 2, "F");
        doc.setFillColor(...c.accent); doc.roundedRect(x+0.8, y, cw-1.8, 3, 2, 2, "F");
        doc.rect(x+0.8, y+1.5, cw-1.8, 1.5, "F");
        doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...c.t);
        doc.text(c.val, x + cw/2, y + 13, { align:"center" });
        doc.setFont("helvetica","normal"); doc.setFontSize(5.2); doc.setTextColor(...c.t);
        doc.text(c.label, x + cw/2, y + 17.5, { align:"center" });
      });
    };

    // ── STATUS LEGEND ───────────────────────────────────
    const drawLegend = (y: number) => {
      doc.setFillColor(...pale); doc.roundedRect(PAD, y, TW, 8.5, 1.5, 1.5, "F");
      doc.setDrawColor(...border); doc.setLineWidth(0.2); doc.roundedRect(PAD, y, TW, 8.5, 1.5, 1.5, "S");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.2); doc.setTextColor(...muted);
      doc.text("STATUS KEY:", PAD+3, y+5.8);
      const items = [
        { label:"Operational / Working", f:gF, t:gT },
        { label:"Warning / Degraded",    f:aF, t:aT },
        { label:"Critical / Down",       f:rF, t:rT },
        { label:"Not Applicable",        f:nF, t:nT },
      ];
      let lx = PAD+30;
      items.forEach(it => {
        doc.setFillColor(...it.f); doc.roundedRect(lx, y+1, 42, 6.5, 1, 1, "F");
        doc.setFillColor(...it.t); doc.circle(lx+3.5, y+4.8, 1.5, "F");
        doc.setTextColor(...it.t); doc.setFont("helvetica","bold"); doc.setFontSize(6.2);
        doc.text(it.label, lx+7.5, y+5.8);
        lx += 45;
      });
    };

    // ══════════════════════════════════════════════════════
    // PAGE 1 — FACILITY STATUS TABLE
    // ══════════════════════════════════════════════════════
    drawHeader("IT Facilities RAG Dashboard", `Daily Monitoring Report  ·  All ${FACILITIES.length} Sites  ·  ${dateStr}`);
    drawKPIs(32);
    drawLegend(55);
    drawFooter();

    const facRows = FACILITIES.map((f, i) => {
      const s = state[f.name] ?? defaultState();
      const ov = calcOverall(s);
      const bw = bwCompare(s.bandwidth, s.requiredBandwidth);
      return {
        d: [String(i+1), f.name, f.cat,
            iL[s.internet], bL[s.bio], pL[s.printing], ragLbl(ov),
            s.bandwidth ? s.bandwidth+" Mbps" : "—",
            s.requiredBandwidth ? s.requiredBandwidth+" Mbps" : "—",
            bw ? bw.label : "—",
            s.issue||"—", s.notes||"—", s.ts],
        internet:s.internet, bio:s.bio, printing:s.printing, overall:ov, bw, cat:f.cat,
      };
    });

    autoTable(doc, {
      startY: 67,
      showHead: "everyPage",
      tableWidth: TW,
      margin: { left:PAD, right:PAD },
      head: [["#","Facility Name","Cat","Internet","Biometric","Printing","Overall","Cur BW","Req BW","BW%","Issue / Outstanding","Notes","Updated"]],
      body: facRows.map(r => r.d),
      styles: {
        fontSize: 6.8,
        cellPadding: { top:2.8, bottom:2.8, left:2.5, right:2.5 },
        font: "helvetica",
        lineColor: border,
        lineWidth: 0.22,
        textColor: ink,
        valign: "middle",
        overflow: "linebreak",
        minCellHeight: 7.5,
      },
      headStyles: {
        fillColor: navy,
        textColor: white,
        fontStyle: "bold",
        fontSize: 6.8,
        halign: "center",
        valign: "middle",
        cellPadding: { top:3.5, bottom:3.5, left:2.5, right:2.5 },
        lineColor: gold,
        lineWidth: 0.5,
        minCellHeight: 9,
      },
      alternateRowStyles: { fillColor: [249,251,253] },
      pageBreak: "auto",
      rowPageBreak: "avoid",
      columnStyles: {
        0:  { cellWidth:5,  halign:"center", textColor:muted, fontStyle:"bold" },
        1:  { cellWidth:30, fontStyle:"bold", textColor:navy },
        2:  { cellWidth:12, halign:"center" },
        3:  { cellWidth:19, halign:"center" },
        4:  { cellWidth:19, halign:"center" },
        5:  { cellWidth:15, halign:"center" },
        6:  { cellWidth:18, halign:"center", fontStyle:"bold" },
        7:  { cellWidth:13, halign:"center" },
        8:  { cellWidth:13, halign:"center" },
        9:  { cellWidth:14, halign:"center", fontStyle:"bold" },
        10: { cellWidth:44 },
        11: { cellWidth:20 },
        12: { cellWidth:15, halign:"center", textColor:muted },
      },
      didParseCell: (data:any) => {
        if (data.section !== "body") return;
        const row = facRows[data.row.index]; if (!row) return;
        const si: Record<number,RAGStatus> = { 3:row.internet, 4:row.bio, 5:row.printing, 6:row.overall };
        const s = si[data.column.index];
        if (s) { data.cell.styles.fillColor=ragF(s); data.cell.styles.textColor=ragT(s); data.cell.styles.fontStyle="bold"; }
        if (data.column.index === 2) {
          const cc: Record<string,[number,number,number]> = { Projects:[55,88,215], Imarat:[10,118,105], Graana:[120,55,230], Agency21:[185,82,30] };
          if (cc[row.cat]) { data.cell.styles.textColor=cc[row.cat]; data.cell.styles.fontStyle="bold"; }
        }
        if (data.column.index===7 && row.d[7]!=="—") { data.cell.styles.fillColor=[215,230,255]; data.cell.styles.textColor=[22,60,170]; data.cell.styles.fontStyle="bold"; }
        if (data.column.index===8 && row.d[8]!=="—") { data.cell.styles.fillColor=[235,230,255]; data.cell.styles.textColor=[80,55,180]; data.cell.styles.fontStyle="bold"; }
        if (data.column.index===9 && row.bw) {
          if (row.bw.label.includes("OK"))   { data.cell.styles.fillColor=gF; data.cell.styles.textColor=gT; data.cell.styles.fontStyle="bold"; }
          if (row.bw.label.includes("LOW"))  { data.cell.styles.fillColor=aF; data.cell.styles.textColor=aT; data.cell.styles.fontStyle="bold"; }
          if (row.bw.label.includes("CRIT")) { data.cell.styles.fillColor=rF; data.cell.styles.textColor=rT; data.cell.styles.fontStyle="bold"; }
        }
        if (data.column.index===10 && row.d[10]!=="—") { data.cell.styles.textColor=rT; }
      },
      didDrawPage: (data:any) => {
        try {
          drawFooter();
          if (data.pageNumber > 1) {
            drawHeader("IT Facilities RAG Dashboard","Daily Monitoring Report — Continued");
            drawLegend(32);
          }
        } catch(e) {}
      },
    });

    // ══════════════════════════════════════════════════════
    // PAGE 2 — RAG STATUS CHANGE LOG
    // ══════════════════════════════════════════════════════
    if (statusLog.length > 0) {
      doc.addPage();
      const rl = logFrom||logTo
        ? `${logFrom?logFrom.replace("T"," "):"Start"}  →  ${logTo?logTo.replace("T"," "):"Now"}`
        : "All Time";
      drawHeader("RAG Status Change Log", `Internet · Biometric · Printing  ·  ${rl}`);
      drawFooter();

      // Summary strip
      const totalRed   = statusLog.filter(l=>l.newVal.includes("Down")||l.newVal.includes("Critical")).length;
      const totalAmber = statusLog.filter(l=>l.newVal.includes("Slow")||l.newVal.includes("Degraded")).length;
      const totalGreen = statusLog.filter(l=>l.newVal.includes("Working")||l.newVal.includes("OK")||l.newVal.includes("Sync")).length;
      const sumCards = [
        { label:"Total Changes",  val:String(statusLog.length),  f:[228,235,252] as [number,number,number], t:navy },
        { label:"Internet",       val:String(statusLog.filter(l=>l.field==="Internet").length),  f:[215,230,255] as [number,number,number], t:[22,60,170] as [number,number,number] },
        { label:"Biometric",      val:String(statusLog.filter(l=>l.field==="Biometric").length), f:[235,225,255] as [number,number,number], t:[100,40,200] as [number,number,number] },
        { label:"Printing",       val:String(statusLog.filter(l=>l.field==="Printing").length),  f:[215,245,225] as [number,number,number], t:[10,100,50] as [number,number,number] },
        { label:"Went Critical",  val:String(totalRed),   f:rF, t:rT },
        { label:"Went Degraded",  val:String(totalAmber), f:aF, t:aT },
        { label:"Recovered",      val:String(totalGreen), f:gF, t:gT },
      ];
      const scw = TW / sumCards.length;
      sumCards.forEach((c, i) => {
        const x = PAD + i * scw;
        doc.setFillColor(...c.f); doc.roundedRect(x+0.8, 32, scw-1.8, 16, 1.5, 1.5, "F");
        doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...c.t);
        doc.text(c.val, x+scw/2, 42, { align:"center" });
        doc.setFont("helvetica","normal"); doc.setFontSize(5.2);
        doc.text(c.label, x+scw/2, 46, { align:"center" });
      });

      const lRows = statusLog.map(l => [l.ts, l.facility, l.field, l.oldVal, l.newVal]);
      autoTable(doc, {
        startY: 52,
        showHead: "everyPage",
        tableWidth: TW,
        margin: { left:PAD, right:PAD },
        head: [["Timestamp", "Facility Name", "Field", "Previous Status", "New Status"]],
        body: lRows,
        styles: { fontSize:7.5, cellPadding:{top:3,bottom:3,left:3,right:3}, font:"helvetica", lineColor:border, lineWidth:0.22, textColor:ink, overflow:"linebreak", minCellHeight:8.5 },
        headStyles: { fillColor:navy, textColor:white, fontStyle:"bold", fontSize:7.5, halign:"center", cellPadding:{top:4,bottom:4,left:3,right:3}, lineColor:gold, lineWidth:0.5 },
        alternateRowStyles: { fillColor:[249,251,253] },
        rowPageBreak: "avoid",
        columnStyles: {
          0: { cellWidth:40 },
          1: { cellWidth:55, fontStyle:"bold", textColor:navy },
          2: { cellWidth:22, halign:"center", fontStyle:"bold" },
          3: { cellWidth:76 },
          4: { cellWidth:76, fontStyle:"bold" },
        },
        didParseCell: (data:any) => {
          if (data.section !== "body") return;
          const row = lRows[data.row.index];
          if (data.column.index === 2) {
            const fld = row[2];
            if (fld==="Internet")  { data.cell.styles.fillColor=[215,230,255]; data.cell.styles.textColor=[22,60,170];  }
            if (fld==="Biometric") { data.cell.styles.fillColor=[235,225,255]; data.cell.styles.textColor=[100,40,200]; }
            if (fld==="Printing")  { data.cell.styles.fillColor=[215,245,225]; data.cell.styles.textColor=[10,100,50];  }
          }
          if (data.column.index === 3 || data.column.index === 4) {
            const v = row[data.column.index];
            const isR = v.includes("Down")||v.includes("Critical");
            const isA = v.includes("Slow")||v.includes("Degraded");
            const isG = v.includes("Working")||v.includes("OK")||v.includes("Sync");
            if (isR) { data.cell.styles.fillColor=rF; data.cell.styles.textColor=rT; data.cell.styles.fontStyle="bold"; }
            else if (isA) { data.cell.styles.fillColor=aF; data.cell.styles.textColor=aT; data.cell.styles.fontStyle="bold"; }
            else if (isG) { data.cell.styles.fillColor=gF; data.cell.styles.textColor=gT; data.cell.styles.fontStyle="bold"; }
          }
        },
        didDrawPage: (data:any) => {
          try { drawFooter(); if(data.pageNumber>1) drawHeader("RAG Status Change Log",`${rl} — Continued`); } catch(e) {}
        },
      });
    }

    // ══════════════════════════════════════════════════════
    // PAGE 3 — IT SUPPORT TICKETS
    // ══════════════════════════════════════════════════════
    if (tickets.length > 0) {
      doc.addPage();
      drawHeader("IT Support Tickets","Helpdesk Issue Tracking  ·  All Reported Incidents");
      drawFooter();

      // Ticket summary strip
      const tCards = [
        { label:"TOTAL",       val:String(tickets.length),          f:[228,235,252] as [number,number,number], t:navy },
        { label:"OPEN",        val:String(tCounts.open),            f:rF, t:rT },
        { label:"IN PROGRESS", val:String(tCounts.inprogress),      f:aF, t:aT },
        { label:"PENDING",     val:String(tCounts.pending),         f:[215,230,255] as [number,number,number], t:[22,60,170] as [number,number,number] },
        { label:"RESOLVED",    val:String(tCounts.resolved),        f:gF, t:gT },
      ];
      const tcw = TW / tCards.length;
      tCards.forEach((c, i) => {
        const x = PAD + i * tcw;
        doc.setFillColor(...c.f); doc.roundedRect(x+0.8, 32, tcw-1.8, 16, 1.5, 1.5, "F");
        doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...c.t);
        doc.text(c.val, x+tcw/2, 42, { align:"center" });
        doc.setFont("helvetica","normal"); doc.setFontSize(5.5);
        doc.text(c.label, x+tcw/2, 46, { align:"center" });
      });

      const tRows = tickets.map(t => [
        t.id, t.office, t.medium||"—", t.description,
        t.reportedBy, t.assignedTo||"Unassigned",
        t.status==="open"?"Open":t.status==="inprogress"?"In Progress":t.status==="pending"?"Pending":"Resolved",
        t.resolvedBy||"—", t.ts, t.resolvedTs||"—",
      ]);

      autoTable(doc, {
        startY: 52,
        showHead: "everyPage",
        tableWidth: TW,
        margin: { left:PAD, right:PAD },
        head: [["Ticket ID","Office / Location","Via","Issue Description","Reported By","Assigned To","Status","Resolved By","Opened At","Closed At"]],
        body: tRows,
        styles: { fontSize:7, cellPadding:{top:2.8,bottom:2.8,left:2.5,right:2.5}, font:"helvetica", lineColor:border, lineWidth:0.22, textColor:ink, overflow:"linebreak", minCellHeight:8 },
        headStyles: { fillColor:navy, textColor:white, fontStyle:"bold", fontSize:7, halign:"center", cellPadding:{top:3.5,bottom:3.5,left:2.5,right:2.5}, lineColor:gold, lineWidth:0.5 },
        alternateRowStyles: { fillColor:[249,251,253] },
        rowPageBreak: "avoid",
        columnStyles: {
          0: { cellWidth:22, fontStyle:"bold", textColor:navy },
          1: { cellWidth:26 },
          2: { cellWidth:15, halign:"center" },
          3: { cellWidth:52 },
          4: { cellWidth:20 },
          5: { cellWidth:22 },
          6: { cellWidth:20, halign:"center", fontStyle:"bold" },
          7: { cellWidth:18 },
          8: { cellWidth:28, halign:"center" },
          9: { cellWidth:28, halign:"center" },
        },
        didParseCell: (data:any) => {
          if (data.section !== "body") return;
          if (data.column.index === 6) {
            const st = tRows[data.row.index][6];
            if (st==="Open")        { data.cell.styles.fillColor=rF; data.cell.styles.textColor=rT; data.cell.styles.fontStyle="bold"; }
            if (st==="In Progress") { data.cell.styles.fillColor=aF; data.cell.styles.textColor=aT; data.cell.styles.fontStyle="bold"; }
            if (st==="Pending")     { data.cell.styles.fillColor=[215,230,255]; data.cell.styles.textColor=[22,60,170]; data.cell.styles.fontStyle="bold"; }
            if (st==="Resolved")    { data.cell.styles.fillColor=gF; data.cell.styles.textColor=gT; data.cell.styles.fontStyle="bold"; }
          }
          if (data.column.index === 2) {
            const mc: Record<string,[number,number,number]> = { "Email":[22,60,170], "Helpdesk Ticket":[118,55,225], "Whatsapp":[18,122,58], "In Person":[155,90,5] };
            if (mc[tRows[data.row.index][2]]) { data.cell.styles.textColor=mc[tRows[data.row.index][2]]; data.cell.styles.fontStyle="bold"; }
          }
        },
        didDrawPage: (data:any) => {
          try { drawFooter(); if(data.pageNumber>1) drawHeader("IT Support Tickets","Helpdesk Tracking — Continued"); } catch(e) {}
        },
      });
    }

    doc.save(`Imarat_RAG_${d.toISOString().slice(0,10)}.pdf`);
  };
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
        <div style={{ color:"#4A6FA5", fontSize:13 }}>Connecting to live data...</div>
        <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}`}</style>
      </div>
    </div>
  );

  const fOpts: FilterMode[] = ["all","red","amber","green"];
  const fLabels: Record<FilterMode,string> = { all:"All Facilities", red:"Critical Only", amber:"Warning Only", green:"Operational Only" };

  const S = {
    bg: "#F0F4F8",
    card: "#FFFFFF",
    navy: "#0A1628",
    navyLight: "#112240",
    gold: "#C9A84C",
    goldLight: "#F5E6C0",
    border: "#E2E8F0",
    text: "#1A202C",
    textMuted: "#718096",
    textLight: "#A0AEC0",
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
    fontSize:12, color:"#fff", cursor:"pointer", fontWeight:600,
    transition:"background 0.2s", letterSpacing:.3,
  };

  const card: React.CSSProperties = {
    background:S.card, borderRadius:12, border:`1px solid ${S.border}`,
    boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
  };

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

      {/* ── TOP NAV ─────────────────────────────────────── */}
      <nav style={{ background:S.navy, height:60, display:"flex", alignItems:"center", padding:"0 28px", position:"sticky" as const, top:0, zIndex:100, boxShadow:"0 2px 8px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ display:"flex", flexDirection:"column" as const }}>
            <span style={{ color:"#fff", fontWeight:800, fontSize:16, letterSpacing:1.5, lineHeight:1 }}>IMARAT GROUP</span>
            <span style={{ color:S.gold, fontSize:9.5, letterSpacing:2.5, fontWeight:500, marginTop:2 }}>IT FACILITIES DASHBOARD</span>
          </div>
          <div style={{ width:1, height:32, background:"rgba(201,168,76,0.3)", margin:"0 8px" }} />
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:syncing?"#f59e0b":"#22c55e", display:"inline-block", animation:"pulse2 2s infinite" }} />
            <span style={{ fontSize:11, color:"#718096" }}>{syncing ? "Syncing..." : `Live · ${lastSync}`}</span>
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
          <div style={{ marginLeft:8, fontSize:11, color:"#4A6FA5" }}>{now}</div>
        </div>
      </nav>

      <div style={{ padding:"24px 28px", maxWidth:1800, margin:"0 auto" }}>

        {/* ── LIVE STATUS FEED ────────────────────────────── */}
        <div style={{ ...card, marginBottom:20, overflow:"hidden", animation:"fadein 0.3s ease" }}>
          <div style={{ background:S.navyLight, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e", animation:"pulse2 2s infinite" }} />
            <span style={{ color:"#fff", fontWeight:700, fontSize:13, letterSpacing:.3 }}>Live RAG Status Feed</span>
            <span style={{ background:"rgba(255,255,255,0.08)", color:"#A0AEC0", fontSize:11, padding:"2px 8px", borderRadius:20, marginLeft:4 }}>
              {activityLog.filter(l=>l.type==="status").length} changes
            </span>
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

        {/* ── KPI ROW ─────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:14, marginBottom:20 }}>
          {[
            { label:"Total Sites",      value:FACILITIES.length, color:S.navy,  bg:"#EEF2FF", accent:"#3b5bdb" },
            { label:"Operational",      value:counts.green,      color:S.green, bg:S.greenBg, accent:S.green },
            { label:"Warning",          value:counts.amber,      color:S.amber, bg:S.amberBg, accent:S.amber },
            { label:"Critical",         value:counts.red,        color:S.red,   bg:S.redBg,   accent:S.red },
            { label:"Queries Today",    value:stats.received,    color:"#1a4a8a", bg:"#EBF4FF", accent:"#2563eb" },
            { label:"Resolved",         value:stats.resolved,    color:S.green, bg:S.greenBg, accent:S.green },
            { label:"Pending",          value:stats.pending,     color:S.amber, bg:S.amberBg, accent:S.amber },
            { label:"In Progress",      value:stats.inprogress,  color:"#6b21a8", bg:"#F5F3FF", accent:"#7c3aed" },
          ].map(c => (
            <div key={c.label} style={{ ...card, padding:"16px 18px", background:c.bg, borderLeft:`3px solid ${c.accent}`, position:"relative" as const }}>
              <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, letterSpacing:.5, textTransform:"uppercase" as const, marginBottom:6 }}>{c.label}</div>
              <div style={{ fontSize:30, fontWeight:800, color:c.color, lineHeight:1 }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* ── TODAY QUERY CONTROLS ────────────────────────── */}
        <div style={{ ...card, padding:"18px 22px", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:S.text }}>{"Today's Query Summary"}</div>
              <div style={{ fontSize:11, color:S.textMuted, marginTop:2 }}>Shared live across all team members</div>
            </div>
            <button onClick={resetStats} style={{ padding:"6px 14px", background:"#F7FAFC", border:`1px solid ${S.border}`, borderRadius:8, fontSize:12, color:S.textMuted, cursor:"pointer", fontWeight:500 }}>
              Reset Day
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            {[
              { label:"Queries Received", field:"received" as keyof DailyStats, value:stats.received, color:"#1a4a8a", bg:"#EBF4FF", border:"#93C5FD" },
              { label:"Resolved Today",   field:"resolved" as keyof DailyStats, value:stats.resolved, color:S.green,  bg:S.greenBg, border:S.greenBorder },
              { label:"Pending",          field:"pending"  as keyof DailyStats, value:stats.pending,  color:S.amber,  bg:S.amberBg, border:S.amberBorder },
              { label:"In Progress",      field:"inprogress" as keyof DailyStats, value:stats.inprogress, color:"#6b21a8", bg:"#F5F3FF", border:"#C4B5FD" },
            ].map(s2 => (
              <div key={s2.label} style={{ background:s2.bg, border:`1px solid ${s2.border}`, borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:10, color:S.textMuted, fontWeight:600, letterSpacing:.5, marginBottom:6 }}>{s2.label.toUpperCase()}</div>
                  <div style={{ fontSize:28, fontWeight:800, color:s2.color }}>{s2.value}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column" as const, gap:5 }}>
                  <button onClick={()=>updateStat(s2.field, s2.value+1)}
                    style={{ width:30, height:30, border:`1px solid ${s2.border}`, borderRadius:6, background:"#fff", color:s2.color, fontSize:18, cursor:"pointer", fontWeight:700, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                  <button onClick={()=>updateStat(s2.field, Math.max(0,s2.value-1))}
                    style={{ width:30, height:30, border:`1px solid ${s2.border}`, borderRadius:6, background:"#fff", color:s2.color, fontSize:18, cursor:"pointer", fontWeight:700, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── STATUS SUMMARY PANELS ───────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginBottom:20 }}>
          {[
            { title:"Internet", icon:"🌐", rows:[{l:`${iC.green} Working`,s:"green"as RAGStatus},{l:`${iC.amber} Slow`,s:"amber"as RAGStatus},{l:`${iC.red} Down`,s:"red"as RAGStatus}] },
            { title:"Biometric", icon:"👆", rows:[{l:`${bC.green} Syncing`,s:"green"as RAGStatus},{l:`${bC.amber} Delayed`,s:"amber"as RAGStatus},{l:`${bC.red} Offline`,s:"red"as RAGStatus}] },
            { title:"Printing",  icon:"🖨️", rows:[{l:`${pC.green} Working`,s:"green"as RAGStatus},{l:`${pC.amber} Partial`,s:"amber"as RAGStatus},{l:`${pC.red} Down`,s:"red"as RAGStatus}] },
            { title:"Overall RAG", icon:"📊", rows:[{l:"Operational",s:"green"as RAGStatus,c:counts.green},{l:"Degraded",s:"amber"as RAGStatus,c:counts.amber},{l:"Critical",s:"red"as RAGStatus,c:counts.red}] },
          ].map(panel => (
            <div key={panel.title} style={{ ...card, padding:"16px 18px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:S.text, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                <span>{panel.icon}</span>{panel.title}
              </div>
              {panel.rows.map((r:{l:string;s:RAGStatus;c?:number}) => {
                const rp = RAG[r.s];
                return (
                  <div key={r.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${S.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:S.text }}>
                      <span style={{ width:8, height:8, borderRadius:"50%", background:rp.dot, display:"inline-block" }} />
                      {r.l}
                    </div>
                    {r.c !== undefined
                      ? <span style={{ fontSize:13, fontWeight:700, color:rp.text }}>{r.c}<span style={{ fontSize:10, color:S.textLight, fontWeight:400 }}>/{FACILITIES.length}</span></span>
                      : <span style={{ background:rp.bg, color:rp.text, border:`1px solid ${rp.border}`, padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700 }}>
                          {r.s==="green"?"OK":r.s==="amber"?"WARN":"DOWN"}
                        </span>
                    }
                  </div>
                );
              })}
              {panel.title==="Overall RAG" && (
                <div style={{ marginTop:10, fontSize:10, color:S.textLight }}>it.support@imarat.com.pk</div>
              )}
            </div>
          ))}
        </div>

        {/* ── FACILITY TABLE ──────────────────────────────── */}
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
                    style={{ padding:"5px 12px", background:c2.bg, border:`1px solid ${c2.border}`, borderRadius:20, fontSize:11, color:c2.text, cursor:"pointer", fontWeight:active?700:400, transition:"all 0.15s" }}>
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
                    <tr key={f.name} style={{ borderBottom:`1px solid ${S.border}`, transition:"background 0.1s" }}>
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

        {/* ── DOWNTIME TRACKER ────────────────────────────── */}
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
                      {downtimeRecords.map((r,i) => {
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

        {/* ── TICKETS ─────────────────────────────────────── */}
        <div style={{ ...card, overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${S.border}`, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" as const }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:S.text }}>IT Support Tickets</div>
              <div style={{ fontSize:11, color:S.textMuted, marginTop:2 }}>Live across all team members</div>
            </div>
            <div style={{ display:"flex", gap:8, marginLeft:"auto", alignItems:"center", flexWrap:"wrap" as const }}>
              {[
                { label:`Open`,        count:tCounts.open,        bg:S.redBg,   text:S.red,   border:S.redBorder },
                { label:`In Progress`, count:tCounts.inprogress,  bg:S.amberBg, text:S.amber, border:S.amberBorder },
                { label:`Pending`,     count:tCounts.pending,     bg:"#EEF2FF", text:"#3730a3",border:"#C7D2FE" },
                { label:`Resolved`,    count:tCounts.resolved,    bg:S.greenBg, text:S.green, border:S.greenBorder },
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
                    {tickets.map((t,i)=>{
                      const ts2 = TICKET_STATUS[t.status];
                      return (
                        <tr key={t.id} style={{ borderBottom:`1px solid ${S.border}`, transition:"background 0.1s" }}>
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