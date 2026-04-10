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
        ]);
        if (fsData) fsData.forEach((row: any) => { if (init[row.id]) init[row.id] = { ...defaultState(), ...row.data }; });
        if (tkData) setTickets(tkData.map((r: any) => r.data).sort((a: Ticket, b: Ticket) => b.ts.localeCompare(a.ts)));
        if (stData) setStats(stData.data);
        if (logData) setActivityLog(logData.map((r: any) => r.data));
      } catch {}
      setState(init);
      setSyncing(false);
      setLastSync(nowTime());
      setMounted(true);
    };
    loadAll();

    const fmt = () => new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
    setNow(fmt());
    const t = setInterval(() => setNow(fmt()), 30000);

    const fsSub = supabase.channel("fs_ch2").on("postgres_changes", { event:"*", schema:"public", table:"facility_state" }, (payload: any) => {
      if (payload.new) { setState(prev => ({ ...prev, [payload.new.id]: { ...defaultState(), ...payload.new.data } })); setLastSync(nowTime()); }
    }).subscribe();
    const tkSub = supabase.channel("tk_ch2").on("postgres_changes", { event:"*", schema:"public", table:"tickets" }, () => { loadTickets(); setLastSync(nowTime()); }).subscribe();
    const stSub = supabase.channel("st_ch2").on("postgres_changes", { event:"*", schema:"public", table:"daily_stats" }, (payload: any) => {
      if (payload.new) { setStats(payload.new.data); setLastSync(nowTime()); }
    }).subscribe();
    const logSub = supabase.channel("log_ch2").on("postgres_changes", { event:"*", schema:"public", table:"activity_log" }, () => { loadLog(); }).subscribe();

    return () => { clearInterval(t); supabase.removeChannel(fsSub); supabase.removeChannel(tkSub); supabase.removeChannel(stSub); supabase.removeChannel(logSub); };
  }, [loadTickets, loadLog]);

  const addLog = useCallback(async (entry: Omit<ActivityLog,"id"|"ts">) => {
    const log: ActivityLog = { ...entry, id: uid(), ts: nowFull() };
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
    }
    setLastSync(nowTime());
  }, [addLog]);

  const updateField = useCallback((name:string, field:keyof FacilityState, val:string) => {
    setState(prev => {
      const oldData = prev[name] || defaultState();
      const updated = { ...oldData, [field]: val, ts: nowTime() };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveFacility(name, updated, oldData, field), 800);
      return { ...prev, [name]: updated };
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
    await supabase.from("tickets").upsert({ id: t.id, data: t, updated_at: new Date().toISOString() });
    await addLog({ facility: t.office, field:"Ticket Created", oldVal:"—", newVal:`${t.id}: ${t.description}`, type:"ticket" });
    setNewTicket({ office:"", description:"", reportedBy:"", assignedTo:"", medium:"" });
    setShowTicketForm(false);
  };
  const updateTicket = async (id:string, field:keyof Ticket, val:string) => {
    const ticket = tickets.find(t => t.id === id); if (!ticket) return;
    const updated = { ...ticket, [field]: val };
    if (field === "status" && val === "resolved") updated.resolvedTs = nowFull();
    await supabase.from("tickets").upsert({ id, data: updated, updated_at: new Date().toISOString() });
    if (field === "status") await addLog({ facility: ticket.office, field:`Ticket ${id}`, oldVal: humanVal(ticket.status), newVal: humanVal(val), type:"ticket" });
    if (field === "assignedTo") await addLog({ facility: ticket.office, field:`Ticket ${id} Assigned`, oldVal: ticket.assignedTo||"—", newVal: val||"—", type:"ticket" });
  };
  const deleteTicket = async (id:string) => {
    const ticket = tickets.find(t => t.id === id);
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
    const PAD = 10;
    const TW = PW - PAD * 2;
    let pg = 0;

    const C = {
      navy:  [10,30,60]   as [number,number,number],
      gold:  [185,145,45] as [number,number,number],
      white: [255,255,255]as [number,number,number],
      muted: [110,122,142]as [number,number,number],
      ink:   [20,30,50]   as [number,number,number],
      gF:[198,239,206]as[number,number,number], gT:[14,85,38]as[number,number,number],
      aF:[255,235,156]as[number,number,number], aT:[115,65,0]as[number,number,number],
      rF:[255,199,206]as[number,number,number], rT:[148,18,18]as[number,number,number],
      nF:[238,240,245]as[number,number,number], nT:[105,115,132]as[number,number,number],
    };

    const ragF = (s:RAGStatus) => s==="green"?C.gF:s==="amber"?C.aF:s==="red"?C.rF:C.nF;
    const ragT = (s:RAGStatus) => s==="green"?C.gT:s==="amber"?C.aT:s==="red"?C.rT:C.nT;
    const ragLabel = (s:RAGStatus) => s==="green"?"Operational":s==="amber"?"Degraded":s==="red"?"Critical":"N/A";

    const iL: Record<RAGStatus,string> = { green:"Working", amber:"Slow/Intermittent", red:"Down", na:"N/A" };
    const bL: Record<RAGStatus,string> = { green:"Syncing OK", amber:"Delayed", red:"Not Working", na:"N/A" };
    const pL: Record<RAGStatus,string> = { green:"Working", amber:"Partial", red:"Not Working", na:"N/A" };

    const drawHeader = (title: string, sub: string) => {
      pg++;
      doc.setFillColor(...C.navy); doc.rect(0,0,PW,22,"F");
      doc.setFillColor(...C.gold); doc.rect(0,22,PW,1,"F");
      doc.setFillColor(...C.gold); doc.rect(0,0,3,22,"F");
      // Company
      doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(...C.white);
      doc.text("IMARAT GROUP", PAD+2, 9);
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(175,192,218);
      doc.text("Group of Companies  |  Information Technology Department", PAD+2, 14);
      doc.text("it.support@imarat.com.pk", PAD+2, 18);
      // Divider
      doc.setDrawColor(...C.gold); doc.setLineWidth(0.3); doc.line(95,3,95,20);
      // Title
      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...C.white);
      doc.text(title, 99, 10);
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(175,192,218);
      doc.text(sub, 99, 16);
      // Right
      doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...C.gold);
      doc.text(dateStr, PW-PAD, 9, { align:"right" });
      doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(175,192,218);
      doc.text(timeStr, PW-PAD, 14, { align:"right" });
      doc.text("Page "+pg, PW-PAD, 19, { align:"right" });
    };

    const drawFooter = () => {
      doc.setFillColor(...C.gold); doc.rect(0,PH-7,PW,0.5,"F");
      doc.setFillColor(...C.navy); doc.rect(0,PH-6.5,PW,6.5,"F");
      doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(160,175,205);
      doc.text("IMARAT Group of Companies  |  IT Facilities RAG Dashboard  |  Confidential  |  Internal Use Only", PAD, PH-2.5);
      doc.text(`${dateStr}  |  ${timeStr}`, PW-PAD, PH-2.5, { align:"right" });
    };

    const drawSummaryBar = (y: number) => {
      const items = [
        { label:"Total Facilities",  val:String(FACILITIES.length), f:[228,234,248]as[number,number,number], t:C.navy },
        { label:"Fully Operational", val:String(counts.green),       f:C.gF, t:C.gT },
        { label:"Warning Sites",     val:String(counts.amber),       f:C.aF, t:C.aT },
        { label:"Critical Sites",    val:String(counts.red),         f:C.rF, t:C.rT },
        { label:"Queries Today",     val:String(stats.received),     f:[215,228,255]as[number,number,number], t:[25,58,168]as[number,number,number] },
        { label:"Resolved Today",    val:String(stats.resolved),     f:[183,243,205]as[number,number,number], t:[5,98,58]as[number,number,number] },
        { label:"Pending",           val:String(stats.pending),      f:[253,213,168]as[number,number,number], t:[118,52,8]as[number,number,number] },
      ];
      const cw = TW / items.length;
      items.forEach((item, i) => {
        const x = PAD + i*cw;
        doc.setFillColor(...item.f); doc.roundedRect(x+0.5,y,cw-1,18,1.5,1.5,"F");
        doc.setFillColor(...item.t); doc.roundedRect(x+0.5,y,cw-1,2.5,1.5,1.5,"F"); doc.rect(x+0.5,y+1.2,cw-1,1.3,"F");
        doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...item.t);
        doc.text(item.val, x+cw/2, y+12, { align:"center" });
        doc.setFont("helvetica","normal"); doc.setFontSize(5.2);
        doc.text(item.label, x+cw/2, y+16.5, { align:"center" });
      });
    };

    const drawLegend = (y: number) => {
      doc.setFillColor(245,247,251); doc.roundedRect(PAD,y,TW,9,1.5,1.5,"F");
      doc.setDrawColor(208,216,230); doc.setLineWidth(0.2); doc.roundedRect(PAD,y,TW,9,1.5,1.5,"S");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...C.muted);
      doc.text("STATUS GUIDE:", PAD+2.5, y+6.2);
      const items = [
        { label:"Operational / Working", f:C.gF, t:C.gT },
        { label:"Warning / Degraded",    f:C.aF, t:C.aT },
        { label:"Critical / Down",       f:C.rF, t:C.rT },
        { label:"Not Applicable (N/A)",  f:C.nF, t:C.nT },
      ];
      let lx = PAD+34;
      items.forEach(it => {
        doc.setFillColor(...it.f); doc.roundedRect(lx,y+1,40,7,1,1,"F");
        doc.setFillColor(...it.t); doc.circle(lx+3.5,y+5,1.6,"F");
        doc.setTextColor(...it.t); doc.setFont("helvetica","bold"); doc.setFontSize(6.2);
        doc.text(it.label, lx+7.5, y+6.2);
        lx += 43;
      });
    };

    // ── PAGE 1: FACILITY STATUS ──────────────────────────
    drawHeader("IT Facilities RAG Dashboard","Daily Monitoring Report  —  All "+FACILITIES.length+" Sites  —  "+dateStr);
    drawSummaryBar(26);
    drawLegend(47);
    drawFooter();

    const facRows = FACILITIES.map((f,i) => {
      const s = state[f.name] ?? defaultState();
      const ov = calcOverall(s);
      const bw = bwCompare(s.bandwidth, s.requiredBandwidth);
      return {
        d:[String(i+1), f.name, f.cat,
           iL[s.internet], bL[s.bio], pL[s.printing], ragLabel(ov),
           s.bandwidth?s.bandwidth+"Mbps":"—",
           s.requiredBandwidth?s.requiredBandwidth+"Mbps":"—",
           bw?bw.label:"—",
           s.issue||"—",
           s.notes||"—",
           s.ts],
        internet:s.internet, bio:s.bio, printing:s.printing, overall:ov, bw, cat:f.cat,
      };
    });

    autoTable(doc, {
      startY: 59,
      showHead: "everyPage",
      tableWidth: TW,
      margin: { left:PAD, right:PAD },
      head:[["#","Facility Name","Cat","Internet","Biometric","Printing","Overall","Cur BW","Req BW","BW%","Issue","Notes","Updated"]],
      body: facRows.map(r=>r.d),
      styles:{
        fontSize:6.8, cellPadding:{top:2.5,bottom:2.5,left:2,right:2},
        font:"helvetica", lineColor:[210,218,232], lineWidth:0.25,
        textColor:C.ink, valign:"middle", overflow:"linebreak", minCellHeight:7,
      },
      headStyles:{
        fillColor:C.navy, textColor:C.white, fontStyle:"bold", fontSize:6.8,
        halign:"center", valign:"middle",
        cellPadding:{top:3,bottom:3,left:2,right:2},
        lineColor:C.gold, lineWidth:0.4, minCellHeight:8,
      },
      alternateRowStyles:{ fillColor:[247,249,253] },
      pageBreak:"auto", rowPageBreak:"avoid",
      columnStyles:{
        0:{cellWidth:5, halign:"center", textColor:C.muted, fontStyle:"bold"},
        1:{cellWidth:28, fontStyle:"bold", textColor:C.navy},
        2:{cellWidth:12, halign:"center"},
        3:{cellWidth:19, halign:"center"},
        4:{cellWidth:18, halign:"center"},
        5:{cellWidth:15, halign:"center"},
        6:{cellWidth:18, halign:"center", fontStyle:"bold"},
        7:{cellWidth:12, halign:"center"},
        8:{cellWidth:12, halign:"center"},
        9:{cellWidth:14, halign:"center", fontStyle:"bold"},
        10:{cellWidth:38},
        11:{cellWidth:22},
        12:{cellWidth:16, halign:"center", textColor:C.muted},
      },
      didParseCell:(data:any)=>{
        if(data.section!=="body") return;
        const row=facRows[data.row.index]; if(!row) return;
        const si:Record<number,RAGStatus>={3:row.internet,4:row.bio,5:row.printing,6:row.overall};
        const s=si[data.column.index];
        if(s){data.cell.styles.fillColor=ragF(s);data.cell.styles.textColor=ragT(s);data.cell.styles.fontStyle="bold";}
        if(data.column.index===2){
          const cc:Record<string,[number,number,number]>={Projects:[55,88,215],Imarat:[10,118,105],Graana:[120,55,230],Agency21:[185,82,30]};
          if(cc[row.cat]){data.cell.styles.textColor=cc[row.cat];data.cell.styles.fontStyle="bold";}
        }
        if(data.column.index===7&&row.d[7]!=="—"){data.cell.styles.fillColor=[215,230,255];data.cell.styles.textColor=[25,60,170];data.cell.styles.fontStyle="bold";}
        if(data.column.index===8&&row.d[8]!=="—"){data.cell.styles.fillColor=[228,228,255];data.cell.styles.textColor=[75,55,175];data.cell.styles.fontStyle="bold";}
        if(data.column.index===9&&row.bw){
          if(row.bw.label.includes("OK"))  {data.cell.styles.fillColor=C.gF;data.cell.styles.textColor=C.gT;data.cell.styles.fontStyle="bold";}
          if(row.bw.label.includes("LOW")) {data.cell.styles.fillColor=C.aF;data.cell.styles.textColor=C.aT;data.cell.styles.fontStyle="bold";}
          if(row.bw.label.includes("CRIT")){data.cell.styles.fillColor=C.rF;data.cell.styles.textColor=C.rT;data.cell.styles.fontStyle="bold";}
        }
        if(data.column.index===10&&row.d[10]!=="—"){data.cell.styles.textColor=C.rT;}
      },
      didDrawPage:(data:any)=>{
        try{
          drawFooter();
          if(data.pageNumber>1){
            drawHeader("IT Facilities RAG Dashboard","Daily Monitoring Report — Continued");
            drawLegend(26);
          }
        }catch(e){}
      },
    });

    // ── PAGE: TICKETS ONLY ───────────────────────────────
    if(tickets.length>0){
      doc.addPage();
      drawHeader("IT Support Tickets","Helpdesk Issue Tracking  —  All Reported Incidents");
      drawFooter();

      const tPills=[
        {label:`Total: ${tickets.length}`,            f:[228,234,248]as[number,number,number], t:C.navy},
        {label:`Open: ${tCounts.open}`,               f:C.rF, t:C.rT},
        {label:`In Progress: ${tCounts.inprogress}`,  f:C.aF, t:C.aT},
        {label:`Pending: ${tCounts.pending}`,         f:[215,230,255]as[number,number,number], t:[25,60,170]as[number,number,number]},
        {label:`Resolved: ${tCounts.resolved}`,       f:C.gF, t:C.gT},
      ];
      let tpx=PAD;
      tPills.forEach(p=>{
        doc.setFillColor(...p.f);doc.roundedRect(tpx,26,36,9,1.5,1.5,"F");
        doc.setDrawColor(205,212,228);doc.setLineWidth(0.2);doc.roundedRect(tpx,26,36,9,1.5,1.5,"S");
        doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(...p.t);
        doc.text(p.label,tpx+18,32,{align:"center"});
        tpx+=38;
      });

      const tRows=tickets.map(t=>[
        t.id, t.office, t.medium||"—", t.description, t.reportedBy,
        t.assignedTo||"Unassigned",
        t.status==="open"?"Open":t.status==="inprogress"?"In Progress":t.status==="pending"?"Pending":"Resolved",
        t.resolvedBy||"—", t.ts, t.resolvedTs||"—",
      ]);

      autoTable(doc,{
        startY:39,showHead:"everyPage",tableWidth:TW,margin:{left:PAD,right:PAD},
        head:[["Ticket ID","Office / Location","Medium","Issue Description","Reported By","Assigned To","Status","Resolved By","Opened At","Closed At"]],
        body:tRows,
        styles:{fontSize:6.8,cellPadding:{top:2.5,bottom:2.5,left:2,right:2},font:"helvetica",lineColor:[210,218,232],lineWidth:0.25,textColor:C.ink,overflow:"linebreak",minCellHeight:7},
        headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:"bold",fontSize:6.8,halign:"center",cellPadding:{top:3,bottom:3,left:2,right:2},lineColor:C.gold,lineWidth:0.4},
        alternateRowStyles:{fillColor:[247,249,253]},rowPageBreak:"avoid",
        columnStyles:{
          0:{cellWidth:22,fontStyle:"bold",textColor:C.navy},
          1:{cellWidth:26},2:{cellWidth:16,halign:"center"},
          3:{cellWidth:48},4:{cellWidth:18},5:{cellWidth:22},
          6:{cellWidth:18,halign:"center",fontStyle:"bold"},
          7:{cellWidth:18},8:{cellWidth:26,halign:"center"},9:{cellWidth:26,halign:"center"},
        },
        didParseCell:(data:any)=>{
          if(data.section==="body"&&data.column.index===6){
            const st=tRows[data.row.index][6];
            if(st==="Open")       {data.cell.styles.fillColor=C.rF;data.cell.styles.textColor=C.rT;data.cell.styles.fontStyle="bold";}
            if(st==="In Progress"){data.cell.styles.fillColor=C.aF;data.cell.styles.textColor=C.aT;data.cell.styles.fontStyle="bold";}
            if(st==="Pending")    {data.cell.styles.fillColor=[215,230,255];data.cell.styles.textColor=[25,60,170];data.cell.styles.fontStyle="bold";}
            if(st==="Resolved")   {data.cell.styles.fillColor=C.gF;data.cell.styles.textColor=C.gT;data.cell.styles.fontStyle="bold";}
          }
          if(data.section==="body"&&data.column.index===2){
            const mc:Record<string,[number,number,number]>={"Email":[28,60,170],"Helpdesk Ticket":[118,55,225],"Whatsapp":[18,122,58],"In Person":[155,90,5]};
            if(mc[tRows[data.row.index][2]]){data.cell.styles.textColor=mc[tRows[data.row.index][2]];data.cell.styles.fontStyle="bold";}
          }
        },
        didDrawPage:(data:any)=>{
          try{drawFooter();if(data.pageNumber>1)drawHeader("IT Support Tickets","Helpdesk Tracking — Continued");}catch(e){}
        },
      });
    }

    doc.save(`Imarat_RAG_${d.toISOString().slice(0,10)}.pdf`);
  };

  if (!mounted) return (
    <div style={{ minHeight:"100vh", background:"#eef1f7", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:48, height:48, border:"4px solid #1A3A5C", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 16px" }} />
        <div style={{ color:"#1A3A5C", fontWeight:600, fontSize:14 }}>Connecting to server...</div>
        <div style={{ color:"#8a94a6", fontSize:12, marginTop:4 }}>Loading latest data</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );

  const fOpts: FilterMode[] = ["all","red","amber","green"];
  const fLabels: Record<FilterMode,string> = { all:"ALL", red:"CRITICAL ONLY", amber:"DEGRADED ONLY", green:"OPERATIONAL ONLY" };

  return (
    <div style={{ minHeight:"100vh", background:"#eef1f7", fontFamily:"'Segoe UI',Arial,sans-serif" }}>
      <div style={{ background:"#1A3A5C", padding:"0 24px", display:"flex", alignItems:"center", height:56 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, background:"#2c5282", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:16, height:16, border:"2px solid #94B8D4", borderRadius:3 }} />
          </div>
          <div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:15, letterSpacing:.5 }}>IT FACILITIES RAG DASHBOARD</div>
            <div style={{ color:"#94B8D4", fontSize:10 }}>Imarat Group — {FACILITIES.length} Facilities Nationwide</div>
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:syncing?"#f59e0b":"#22c55e", display:"inline-block" }} />
            <span style={{ fontSize:10, color:"#94B8D4" }}>{syncing?"Syncing...":`Live — Last sync: ${lastSync}`}</span>
          </div>
          <div style={{ fontSize:11, color:"#94B8D4" }}>{now}</div>
        </div>
      </div>

      <div style={{ padding:"16px 20px" }}>

        {/* Live Activity Feed */}
        <div style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, marginBottom:16, overflow:"hidden" }}>
          <div style={{ background:"#1A3A5C", padding:"10px 16px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <div style={{ color:"#fff", fontWeight:600, fontSize:13 }}>Live Activity Feed</div>
            <span style={{ background:"#22c55e", width:8, height:8, borderRadius:"50%", display:"inline-block", flexShrink:0 }} />
            <span style={{ color:"#94B8D4", fontSize:10 }}>{activityLog.length} changes recorded</span>
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, color:"#94B8D4" }}>Export PDF from:</span>
              <input type="datetime-local" value={logFrom} onChange={e=>setLogFrom(e.target.value)}
                style={{ padding:"3px 6px", border:"1px solid #2c5282", borderRadius:4, fontSize:11, color:"#1a1f2e", background:"#fff" }} />
              <span style={{ fontSize:10, color:"#94B8D4" }}>to:</span>
              <input type="datetime-local" value={logTo} onChange={e=>setLogTo(e.target.value)}
                style={{ padding:"3px 6px", border:"1px solid #2c5282", borderRadius:4, fontSize:11, color:"#1a1f2e", background:"#fff" }} />
              <button onClick={()=>{setLogFrom("");setLogTo("");}}
                style={{ padding:"4px 10px", background:"#2c5282", border:"none", borderRadius:4, fontSize:11, color:"#94B8D4", cursor:"pointer" }}>Clear</button>
              <button onClick={exportPDF}
                style={{ padding:"5px 14px", background:"#C9A342", border:"none", borderRadius:4, fontSize:11, color:"#fff", cursor:"pointer", fontWeight:600 }}>
                {logFrom||logTo ? "EXPORT PDF (Filtered)" : "EXPORT PDF"}
              </button>
            </div>
          </div>
          {activityLog.length === 0 ? (
            <div style={{ padding:"12px 16px", color:"#8a94a6", fontSize:12, textAlign:"center" }}>No activity yet — every change will appear here automatically</div>
          ) : (
            <div style={{ maxHeight:200, overflowY:"auto" }}>
              {activityLog.slice(0,100).map((l,i) => {
                const ls = LOG_STYLE[l.type] || LOG_STYLE.notes;
                return (
                  <div key={l.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 16px", borderBottom:"1px solid #f5f5f5", background:i%2===0?"#fff":"#fafbfc" }}>
                    <span style={{ fontFamily:"monospace", fontSize:10, color:"#8a94a6", whiteSpace:"nowrap" as const, minWidth:145, flexShrink:0 }}>{l.ts}</span>
                    <span style={{ fontWeight:600, color:"#1A3A5C", fontSize:11, minWidth:130, whiteSpace:"nowrap" as const, flexShrink:0 }}>{l.facility}</span>
                    <span style={{ fontSize:11, color:"#4a5568", minWidth:90, flexShrink:0 }}>{l.field}</span>
                    <span style={{ fontSize:11, color:"#8b1c1c", minWidth:60 }}>{l.oldVal}</span>
                    <span style={{ fontSize:12, color:"#6b7280", fontWeight:700, flexShrink:0 }}>→</span>
                    <span style={{ fontSize:11, color:"#1a6b35", fontWeight:600, flex:1 }}>{l.newVal}</span>
                    <span style={{ background:ls.bg, border:`1px solid ${ls.border}`, color:ls.text, padding:"1px 7px", borderRadius:3, fontSize:9, fontWeight:600, textTransform:"uppercase" as const, flexShrink:0 }}>{l.type}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily Stats */}
        <div style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, padding:"14px 18px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"#1a1f2e" }}>{"Today's Query Summary"}</div>
              <div style={{ fontSize:10, color:"#8a94a6", marginTop:2 }}>Shared across all users in real-time</div>
            </div>
            <button onClick={resetStats} style={{ padding:"4px 12px", background:"#f1f4f8", border:"1px solid #dde1e8", borderRadius:4, fontSize:11, color:"#6b7280", cursor:"pointer" }}>Reset Day</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            <StatInput label="QUERIES RECEIVED TODAY" value={stats.received} color="#1A3A5C" bg="#f0f4ff" border="#b4c6fb" onChange={v=>updateStat("received",v)} />
            <StatInput label="RESOLVED TODAY" value={stats.resolved} color="#1a6b35" bg="#edf7f0" border="#a8d5b5" onChange={v=>updateStat("resolved",v)} />
            <StatInput label="PENDING" value={stats.pending} color="#7a5200" bg="#fef8ec" border="#f5d48a" onChange={v=>updateStat("pending",v)} />
            <StatInput label="IN PROGRESS" value={stats.inprogress} color="#8b1c1c" bg="#fdf0f0" border="#f5b8b8" onChange={v=>updateStat("inprogress",v)} />
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
          {[
            { label:"Total Facilities", value:FACILITIES.length, color:"#1a1f2e", border:"#d1d9e6", bg:"#fff" },
            { label:"Fully Operational", value:counts.green, color:"#1A6B35", border:"#a8d5b5", bg:"#f6fbf8" },
            { label:"Warning Sites", value:counts.amber, color:"#7A5200", border:"#f5d48a", bg:"#fefdf5" },
            { label:"Critical Sites", value:counts.red, color:"#8B1C1C", border:"#f5b8b8", bg:"#fdf5f5" },
          ].map(c => (
            <div key={c.label} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:8, padding:"14px 18px" }}>
              <div style={{ fontSize:10, color:"#8a94a6", marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:28, fontWeight:700, color:c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Status Panels */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:16 }}>
          {[
            { title:"Internet Status", rows:[{l:`${iC.green} Sites Stable`,s:"green" as RAGStatus},{l:`${iC.amber} Slow/Intermittent`,s:"amber" as RAGStatus},{l:`${iC.red} Sites Down`,s:"red" as RAGStatus}] },
            { title:"Biometric Status", rows:[{l:`${bC.green} Sites Working`,s:"green" as RAGStatus},{l:`${bC.amber} Sync Delays`,s:"amber" as RAGStatus},{l:`${bC.red} Offline`,s:"red" as RAGStatus}] },
            { title:"Printing Devices", rows:[{l:`${pC.green} Working`,s:"green" as RAGStatus},{l:`${pC.amber} Partially Working`,s:"amber" as RAGStatus},{l:`${pC.red} Not Working`,s:"red" as RAGStatus}] },
            { title:"Overall RAG", rows:[{l:"Operational",s:"green" as RAGStatus,c:counts.green},{l:"Degraded",s:"amber" as RAGStatus,c:counts.amber},{l:"Critical",s:"red" as RAGStatus,c:counts.red}] },
          ].map(panel => (
            <div key={panel.title} style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, padding:"14px 16px" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#1a1f2e", marginBottom:10 }}>{panel.title}</div>
              {panel.rows.map((r:{l:string;s:RAGStatus;c?:number}) => (
                <div key={r.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid #f5f5f5" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, color:"#1a1f2e" }}><Dot s={r.s} />{r.l}</div>
                  {r.c!==undefined
                    ? <span style={{ fontSize:12, fontWeight:700, color:RAG[r.s].text }}>{r.c}/{FACILITIES.length}</span>
                    : <span style={{ background:RAG[r.s].bg, color:RAG[r.s].text, border:`1px solid ${RAG[r.s].border}`, padding:"1px 7px", borderRadius:3, fontSize:10, fontWeight:600 }}>{r.s==="green"?"OK":r.s==="amber"?"WARN":"DOWN"}</span>
                  }
                </div>
              ))}
              {panel.title==="Overall RAG"&&(<div style={{ marginTop:8, paddingTop:6, borderTop:"1px solid #f0f2f5", fontSize:10, color:"#8a94a6" }}><span style={{ color:"#1A3A5C", fontWeight:600 }}>it.support@imarat.com.pk</span></div>)}
            </div>
          ))}
        </div>

        {/* Facility Table */}
        <div style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #e2e6ed", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#1a1f2e" }}>RAG Status of All Facilities</div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              <button onClick={()=>setFilter(fOpts[(fOpts.indexOf(filter)+1)%fOpts.length])}
                style={{ padding:"5px 12px", background:"#f1f4f8", border:"1px solid #dde1e8", borderRadius:4, fontSize:11, color:"#4a5568", cursor:"pointer" }}>
                {fLabels[filter]}
              </button>
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#f8f9fb" }}>
                  {["#","FACILITY","CATEGORY","INTERNET","BIOMETRIC","PRINTING","OVERALL","CURRENT BW","REQUIRED BW","BW STATUS","REPORTED ISSUE","NOTES","UPDATED"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"9px 10px", color:"#8a94a6", fontWeight:600, fontSize:10, letterSpacing:".3px", borderBottom:"2px solid #e2e6ed", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((f,i)=>{
                  const s=state[f.name]??defaultState();
                  const ov=calcOverall(s);
                  const bw=bwCompare(s.bandwidth,s.requiredBandwidth);
                  return (
                    <tr key={f.name} style={{ borderBottom:"1px solid #f0f2f5", background:i%2===0?"#fff":"#fafbfc" }}>
                      <td style={{ padding:"7px 10px", color:"#c0c8d6", fontSize:11, fontWeight:600 }}>{i+1}</td>
                      <td style={{ padding:"7px 10px", fontWeight:600, color:"#1a1f2e", whiteSpace:"nowrap" }}>{f.name}</td>
                      <td style={{ padding:"7px 10px" }}><span style={{ color:CAT_COLORS[f.cat]||"#4a5568", fontSize:10, fontWeight:700 }}>{f.cat}</span></td>
                      <td style={{ padding:"7px 10px" }}><Sel value={s.internet} opts={INET_OPTS} onChange={v=>updateField(f.name,"internet",v)} /></td>
                      <td style={{ padding:"7px 10px" }}><Sel value={s.bio} opts={BIO_OPTS} onChange={v=>updateField(f.name,"bio",v)} /></td>
                      <td style={{ padding:"7px 10px" }}><Sel value={s.printing} opts={PRINT_OPTS} onChange={v=>updateField(f.name,"printing",v)} /></td>
                      <td style={{ padding:"7px 10px" }}><Badge s={ov} /></td>
                      <td style={{ padding:"7px 10px" }}>
                        <input defaultValue={s.bandwidth} onBlur={e=>updateField(f.name,"bandwidth",e.target.value)} placeholder="e.g. 50"
                          style={{ background:"#f0f4ff", border:"1px solid #b4c6fb", borderRadius:3, padding:"3px 7px", color:"#1A3A5C", fontSize:11, width:60, fontWeight:500 }} />
                        <span style={{ fontSize:10, color:"#8a94a6", marginLeft:2 }}>Mbps</span>
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <input defaultValue={s.requiredBandwidth} onBlur={e=>updateField(f.name,"requiredBandwidth",e.target.value)} placeholder="e.g. 100"
                          style={{ background:"#f8f9fb", border:"1px solid #dde1e8", borderRadius:3, padding:"3px 7px", color:"#4a5568", fontSize:11, width:60 }} />
                        <span style={{ fontSize:10, color:"#8a94a6", marginLeft:2 }}>Mbps</span>
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        {bw?<span style={{ background:bw.bg, border:`1px solid ${bw.border}`, color:bw.color, padding:"2px 8px", borderRadius:3, fontSize:10, fontWeight:700, whiteSpace:"nowrap" as const }}>{bw.label}</span>
                           :<span style={{ color:"#c0c8d6", fontSize:11 }}>—</span>}
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <input defaultValue={s.issue} onBlur={e=>updateField(f.name,"issue",e.target.value)} placeholder="Reported issue..."
                          style={{ background:"#fff8f8", border:"1px solid #f5b8b8", borderRadius:3, padding:"3px 7px", color:"#8b1c1c", fontSize:11, width:150 }} />
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <input defaultValue={s.notes} onBlur={e=>updateField(f.name,"notes",e.target.value)} placeholder="Notes..."
                          style={{ background:"#f8f9fb", border:"1px solid #dde1e8", borderRadius:3, padding:"3px 7px", color:"#1a1f2e", fontSize:11, width:100 }} />
                      </td>
                      <td style={{ padding:"7px 10px", fontFamily:"monospace", fontSize:10, color:"#8a94a6", whiteSpace:"nowrap" }}>{s.ts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tickets */}
        <div style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #e2e6ed", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"#1a1f2e" }}>IT Support Tickets</div>
              <div style={{ fontSize:10, color:"#8a94a6", marginTop:2 }}>Shared in real-time across all team members</div>
            </div>
            <div style={{ display:"flex", gap:8, marginLeft:"auto", alignItems:"center", flexWrap:"wrap" }}>
              {[
                { lbl:`Open: ${tCounts.open}`, bg:TICKET_STATUS.open.bg, text:TICKET_STATUS.open.text, border:TICKET_STATUS.open.border },
                { lbl:`In Progress: ${tCounts.inprogress}`, bg:TICKET_STATUS.inprogress.bg, text:TICKET_STATUS.inprogress.text, border:TICKET_STATUS.inprogress.border },
                { lbl:`Pending: ${tCounts.pending}`, bg:TICKET_STATUS.pending.bg, text:TICKET_STATUS.pending.text, border:TICKET_STATUS.pending.border },
                { lbl:`Resolved: ${tCounts.resolved}`, bg:TICKET_STATUS.resolved.bg, text:TICKET_STATUS.resolved.text, border:TICKET_STATUS.resolved.border },
              ].map(b=>(<span key={b.lbl} style={{ background:b.bg, color:b.text, border:`1px solid ${b.border}`, padding:"3px 10px", borderRadius:4, fontSize:11, fontWeight:600 }}>{b.lbl}</span>))}
              <button onClick={()=>setShowTicketForm(v=>!v)} style={{ padding:"5px 14px", background:"#1A3A5C", border:"none", borderRadius:4, fontSize:11, color:"#fff", cursor:"pointer", fontWeight:600 }}>+ New Ticket</button>
            </div>
          </div>

          {showTicketForm&&(
            <div style={{ padding:"16px", background:"#f8f9fb", borderBottom:"1px solid #e2e6ed", display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
              <div><div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>OFFICE / LOCATION</div>
                <input value={newTicket.office} onChange={e=>setNewTicket(p=>({...p,office:e.target.value}))} placeholder="Office name"
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff" }} /></div>
              <div><div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>MEDIUM</div>
                <select value={newTicket.medium} onChange={e=>setNewTicket(p=>({...p,medium:e.target.value}))}
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff", cursor:"pointer" }}>
                  <option value="">— Select —</option>
                  <option value="Email">Email</option>
                  <option value="Helpdesk Ticket">Helpdesk Ticket</option>
                  <option value="Whatsapp">Whatsapp</option>
                  <option value="In Person">In Person</option>
                </select></div>
              <div style={{ gridColumn:"span 2" }}><div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>ISSUE DESCRIPTION</div>
                <input value={newTicket.description} onChange={e=>setNewTicket(p=>({...p,description:e.target.value}))} placeholder="Describe the issue..."
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff" }} /></div>
              <div><div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>REPORTED BY</div>
                <input value={newTicket.reportedBy} onChange={e=>setNewTicket(p=>({...p,reportedBy:e.target.value}))} placeholder="Name"
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff" }} /></div>
              <div><div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>ASSIGN TO</div>
                <select value={newTicket.assignedTo} onChange={e=>setNewTicket(p=>({...p,assignedTo:e.target.value}))}
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff", cursor:"pointer" }}>
                  {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                </select></div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, gridColumn:"span 2" }}>
                <button onClick={addTicket} style={{ padding:"6px 18px", background:"#1A3A5C", border:"none", borderRadius:4, fontSize:12, color:"#fff", cursor:"pointer", fontWeight:600 }}>Add Ticket</button>
                <button onClick={()=>setShowTicketForm(false)} style={{ padding:"6px 14px", background:"#f1f4f8", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#4a5568", cursor:"pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {tickets.length===0?(
            <div style={{ padding:"32px", textAlign:"center", color:"#8a94a6", fontSize:13 }}>No tickets yet. Click "+ New Ticket" to log an issue.</div>
          ):(
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f8f9fb" }}>
                    {["TICKET ID","OFFICE / LOCATION","MEDIUM","ISSUE DESCRIPTION","REPORTED BY","ASSIGNED TO","STATUS","RESOLVED BY","REPORTED AT","RESOLVED AT",""].map(h=>(
                      <th key={h} style={{ textAlign:"left", padding:"9px 10px", color:"#8a94a6", fontWeight:600, fontSize:10, borderBottom:"2px solid #e2e6ed", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t,i)=>(
                    <tr key={t.id} style={{ borderBottom:"1px solid #f0f2f5", background:i%2===0?"#fff":"#fafbfc" }}>
                      <td style={{ padding:"7px 10px", fontFamily:"monospace", fontSize:11, fontWeight:600, color:"#1A3A5C" }}>{t.id}</td>
                      <td style={{ padding:"7px 10px", fontWeight:600, color:"#1a1f2e", whiteSpace:"nowrap" }}>{t.office}</td>
                      <td style={{ padding:"7px 10px" }}><span style={{ background:"#f0f4ff", border:"1px solid #b4c6fb", color:"#1A3A5C", padding:"2px 8px", borderRadius:3, fontSize:10, fontWeight:600, whiteSpace:"nowrap" as const }}>{t.medium||"—"}</span></td>
                      <td style={{ padding:"7px 10px", color:"#4a5568", maxWidth:200 }}>{t.description}</td>
                      <td style={{ padding:"7px 10px", color:"#4a5568", whiteSpace:"nowrap" }}>{t.reportedBy}</td>
                      <td style={{ padding:"7px 10px" }}>
                        <select value={t.assignedTo} onChange={e=>updateTicket(t.id,"assignedTo",e.target.value)}
                          style={{ border:"1px solid #dde1e8", borderRadius:3, padding:"3px 6px", fontSize:11, color:"#1a1f2e", background:"#fff", cursor:"pointer" }}>
                          {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <select value={t.status} onChange={e=>updateTicket(t.id,"status",e.target.value)}
                          style={{ background:TICKET_STATUS[t.status].bg, color:TICKET_STATUS[t.status].text, border:`1px solid ${TICKET_STATUS[t.status].border}`, borderRadius:3, padding:"3px 8px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                          <option value="open">Open</option>
                          <option value="inprogress">In Progress</option>
                          <option value="pending">Pending</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        {t.status==="resolved"?(
                          <select value={t.resolvedBy} onChange={e=>updateTicket(t.id,"resolvedBy",e.target.value)}
                            style={{ border:"1px solid #a8d5b5", borderRadius:3, padding:"3px 6px", fontSize:11, color:"#1a6b35", background:"#edf7f0", cursor:"pointer" }}>
                            {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                          </select>
                        ):<span style={{ color:"#c0c8d6", fontSize:11 }}>—</span>}
                      </td>
                      <td style={{ padding:"7px 10px", fontFamily:"monospace", fontSize:10, color:"#8a94a6", whiteSpace:"nowrap" }}>{t.ts}</td>
                      <td style={{ padding:"7px 10px", fontFamily:"monospace", fontSize:10, color:t.resolvedTs?"#1a6b35":"#c0c8d6", whiteSpace:"nowrap" }}>{t.resolvedTs||"—"}</td>
                      <td style={{ padding:"7px 10px" }}>
                        <button onClick={()=>deleteTicket(t.id)} style={{ padding:"2px 8px", background:"#fdf0f0", border:"1px solid #f5b8b8", borderRadius:3, fontSize:10, color:"#8b1c1c", cursor:"pointer" }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}