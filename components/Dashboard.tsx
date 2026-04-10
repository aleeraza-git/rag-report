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
  requiredBandwidth: string;
  internet: RAGStatus;
  bio: RAGStatus;
  printing: RAGStatus;
  bandwidth: string;
  issue: string;
  notes: string;
  ts: string;
}
type AppState = Record<string, FacilityState>;
type FilterMode = "all" | "green" | "amber" | "red";

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

const RAG: Record<RAGStatus, { bg: string; border: string; text: string; label: string; dot: string; pdf: [number,number,number] }> = {
  green: { bg:"#edf7f0", border:"#a8d5b5", text:"#1a6b35", label:"Operational", dot:"#22c55e", pdf:[198,239,206] },
  amber: { bg:"#fef8ec", border:"#f5d48a", text:"#7a5200", label:"Degraded",    dot:"#f59e0b", pdf:[255,235,156] },
  red:   { bg:"#fdf0f0", border:"#f5b8b8", text:"#8b1c1c", label:"Critical",    dot:"#ef4444", pdf:[255,199,206] },
  na:    { bg:"#f1f4f8", border:"#c8d0dc", text:"#6b7280", label:"N/A",         dot:"#9ca3af", pdf:[241,244,248] },
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
  return new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function uid() { return "TKT-" + Math.random().toString(36).substr(2,6).toUpperCase(); }
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
  const saveTimer = useRef<NodeJS.Timeout|null>(null);

  useEffect(() => {
    const init: AppState = {};
    FACILITIES.forEach(f => { init[f.name] = defaultState(); });

    const loadAll = async () => {
      setSyncing(true);
      try {
        const [{ data: fsData }, { data: tkData }, { data: stData }] = await Promise.all([
          supabase.from("facility_state").select("*"),
          supabase.from("tickets").select("*"),
          supabase.from("daily_stats").select("*").eq("id","today").single(),
        ]);
        if (fsData) fsData.forEach((row: any) => { if (init[row.id]) init[row.id] = row.data; });
        if (tkData) setTickets(tkData.map((r: any) => r.data).sort((a: Ticket, b: Ticket) => b.ts.localeCompare(a.ts)));
        if (stData) setStats(stData.data);
      } catch {}
      setState(init);
      setSyncing(false);
      setLastSync(nowTime());
      setMounted(true);
    };
    loadAll();

    const fmt = () => new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
    setNow(fmt());
    const t = setInterval(() => setNow(fmt()), 60000);

    const fsSub = supabase.channel("fs_changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"facility_state" }, (payload: any) => {
        if (payload.new) { setState(prev => ({ ...prev, [payload.new.id]: payload.new.data })); setLastSync(nowTime()); }
      }).subscribe();

    const tkSub = supabase.channel("tk_changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"tickets" }, async () => {
        const { data } = await supabase.from("tickets").select("*");
        if (data) setTickets(data.map((r: any) => r.data).sort((a: Ticket, b: Ticket) => b.ts.localeCompare(a.ts)));
        setLastSync(nowTime());
      }).subscribe();

    const stSub = supabase.channel("st_changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"daily_stats" }, (payload: any) => {
        if (payload.new) { setStats(payload.new.data); setLastSync(nowTime()); }
      }).subscribe();

    return () => {
      clearInterval(t);
      supabase.removeChannel(fsSub);
      supabase.removeChannel(tkSub);
      supabase.removeChannel(stSub);
    };
  }, []);

  const saveFacility = useCallback(async (name: string, data: FacilityState) => {
    await supabase.from("facility_state").upsert({ id: name, data, updated_at: new Date().toISOString() });
    setLastSync(nowTime());
  }, []);

  const updateField = useCallback((name:string, field:keyof FacilityState, val:string) => {
    setState(prev => {
      const updated = { ...prev[name], [field]: val, ts: nowTime() };
      const newState = { ...prev, [name]: updated };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveFacility(name, updated), 800);
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
    const t: Ticket = {
      id: uid(),
      office: newTicket.office || "Unknown / Remote Office",
      medium: newTicket.medium || "—",
      description: newTicket.description,
      reportedBy: newTicket.reportedBy || "Unknown",
      assignedTo: newTicket.assignedTo,
      resolvedBy: "",
      status: "open",
      ts: nowFull(),
      resolvedTs: "",
    };
    await supabase.from("tickets").upsert({ id: t.id, data: t, updated_at: new Date().toISOString() });
    setNewTicket({ office:"", description:"", reportedBy:"", assignedTo:"", medium:"" });
    setShowTicketForm(false);
  };

  const updateTicket = async (id:string, field:keyof Ticket, val:string) => {
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return;
    const updated = { ...ticket, [field]: val };
    if (field === "status" && val === "resolved") updated.resolvedTs = nowFull();
    await supabase.from("tickets").upsert({ id, data: updated, updated_at: new Date().toISOString() });
  };

  const deleteTicket = async (id:string) => {
    await supabase.from("tickets").delete().eq("id", id);
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

  const exportPDF = () => {
    const d = new Date();
    const today = d.toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" });
    const timeNow = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    const iL: Record<RAGStatus,string> = { green:"Working", amber:"Slow/Intermittent", red:"Down", na:"N/A" };
    const bL: Record<RAGStatus,string> = { green:"Working & Syncing", amber:"Delayed", red:"Not Working", na:"N/A" };
    const pL: Record<RAGStatus,string> = { green:"Working", amber:"Partial", red:"Not Working", na:"N/A" };
    const oL: Record<RAGStatus,string> = { green:"Operational", amber:"Degraded", red:"Critical", na:"N/A" };

    const drawHeader = (title: string, subtitle: string) => {
      doc.setFillColor(15,40,75); doc.rect(0,0,W,30,"F");
      doc.setFillColor(201,163,66); doc.rect(0,30,W,1.5,"F");
      doc.setTextColor(255,255,255); doc.setFontSize(20); doc.setFont("helvetica","bold");
      doc.text("IMARAT", 10, 14);
      doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(201,163,66);
      doc.text("GROUP", 10, 20);
      doc.setTextColor(180,200,225); doc.text("Information Technology Department", 10, 26);
      doc.setDrawColor(201,163,66); doc.setLineWidth(0.5); doc.line(55,8,55,26);
      doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont("helvetica","bold");
      doc.text(title, 60, 14);
      doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(180,200,225);
      doc.text(subtitle, 60, 21);
      doc.setTextColor(201,163,66); doc.setFontSize(8); doc.setFont("helvetica","bold");
      doc.text(today, W-10, 12, { align:"right" });
      doc.setTextColor(180,200,225); doc.setFontSize(7); doc.setFont("helvetica","normal");
      doc.text("Report Time: "+timeNow, W-10, 18, { align:"right" });
      doc.text("it.support@imarat.com.pk", W-10, 24, { align:"right" });
    };

    const drawFooter = () => {
      doc.setFillColor(15,40,75); doc.rect(0,H-10,W,10,"F");
      doc.setFillColor(201,163,66); doc.rect(0,H-10,W,0.8,"F");
      doc.setTextColor(180,200,225); doc.setFontSize(6.5); doc.setFont("helvetica","normal");
      doc.text("IMARAT GROUP  |  IT Facilities RAG Dashboard  |  Internal Use Only  |  Confidential", 10, H-4);
      doc.text(`Generated: ${today} at ${timeNow}`, W-10, H-4, { align:"right" });
    };

    const drawSummary = () => {
      const sy = 36;
      doc.setFillColor(235,240,250); doc.rect(0,sy,W,34,"F");
      doc.setDrawColor(200,210,230); doc.setLineWidth(0.3);
      doc.line(0,sy,W,sy); doc.line(0,sy+34,W,sy+34);
      const cards = [
        { label:"TOTAL FACILITIES", val:String(FACILITIES.length), r:15,g:40,b:75, light:[220,228,245] as [number,number,number] },
        { label:"FULLY OPERATIONAL", val:String(counts.green), r:21,g:128,b:61, light:[198,239,206] as [number,number,number] },
        { label:"WARNING / DEGRADED", val:String(counts.amber), r:161,g:98,b:7, light:[255,235,156] as [number,number,number] },
        { label:"CRITICAL", val:String(counts.red), r:185,g:28,b:28, light:[255,199,206] as [number,number,number] },
        { label:"QUERIES TODAY", val:String(stats.received), r:30,g:64,b:175, light:[219,234,254] as [number,number,number] },
        { label:"RESOLVED TODAY", val:String(stats.resolved), r:4,g:120,b:87, light:[187,247,208] as [number,number,number] },
        { label:"PENDING", val:String(stats.pending), r:120,g:53,b:15, light:[254,215,170] as [number,number,number] },
      ];
      const cw = (W-20)/cards.length;
      cards.forEach((c,i) => {
        const x = 10+i*cw;
        const [lr,lg,lb] = c.light;
        doc.setFillColor(lr,lg,lb); doc.roundedRect(x,sy+3,cw-3,28,2,2,"F");
        doc.setFillColor(c.r,c.g,c.b); doc.rect(x,sy+3,2.5,28,"F");
        doc.setTextColor(c.r,c.g,c.b);
        doc.setFontSize(14); doc.setFont("helvetica","bold");
        doc.text(c.val, x+cw/2-1, sy+19, { align:"center" });
        doc.setFontSize(5.5); doc.setFont("helvetica","bold");
        doc.text(c.label, x+cw/2-1, sy+26, { align:"center" });
      });
    };

    drawHeader("IT Facilities RAG Dashboard","Daily Facility Monitoring Report — All Sites");
    drawSummary();
    drawFooter();

    const rows = FACILITIES.map((f,i) => {
      const s = state[f.name] ?? defaultState();
      const ov = calcOverall(s);
      const cur = s.bandwidth?.replace(/[^0-9.]/g,"");
      const req = s.requiredBandwidth?.replace(/[^0-9.]/g,"");
      let bwStatus = "—";
      if (cur && req) {
        const pct = Math.round((parseFloat(cur)/parseFloat(req))*100);
        bwStatus = pct >= 100 ? `${pct}% OK` : pct >= 70 ? `${pct}% LOW` : `${pct}% CRITICAL`;
      }
      return [String(i+1), f.name, f.cat, iL[s.internet], bL[s.bio], pL[s.printing], oL[ov], s.bandwidth||"—", s.requiredBandwidth||"—", bwStatus, s.issue||"—", s.notes||"—"];
    });

    autoTable(doc, {
      startY: 76,
      showHead: "everyPage",
      margin: { left:8, right:8 },
      head: [["#","Facility Name","Category","Internet","Biometric","Printing","Overall","Bandwidth","Required BW","BW Status","Reported Issue","Notes"]],
      body: rows,
      styles: { fontSize:7.5, cellPadding:{ top:3,bottom:3,left:3,right:3 }, font:"helvetica", lineColor:[210,218,230], lineWidth:0.3, textColor:[30,40,60], overflow:"linebreak" },
      headStyles: { fillColor:[15,40,75], textColor:[255,255,255], fontStyle:"bold", fontSize:7.5, cellPadding:{ top:4,bottom:4,left:3,right:3 }, lineColor:[201,163,66], lineWidth:0.5, halign:"center" },
      alternateRowStyles: { fillColor:[245,248,252] },
      rowPageBreak: "avoid",
      columnStyles: {
        0:{ cellWidth:6,  halign:"center", textColor:[150,160,180], fontStyle:"bold" },
        1:{ cellWidth:28, fontStyle:"bold", textColor:[15,40,75] },
        2:{ cellWidth:14, halign:"center", fontStyle:"bold" },
        3:{ cellWidth:18, halign:"center" },
        4:{ cellWidth:20, halign:"center" },
        5:{ cellWidth:16, halign:"center" },
        6:{ cellWidth:18, halign:"center", fontStyle:"bold" },
        7:{ cellWidth:14, halign:"center" },
        8:{ cellWidth:14, halign:"center" },
        9:{ cellWidth:16, halign:"center", fontStyle:"bold" },
        10:{ cellWidth:26 },
        11:{ cellWidth:20 },
      },
      didParseCell: (data: any) => {
        if (data.section === "body") {
          const row = rows[data.row.index];
          const statusMaps: Record<number,Record<string,RAGStatus>> = {
            3: Object.fromEntries(Object.entries(iL).map(([k,v])=>[v,k as RAGStatus])),
            4: Object.fromEntries(Object.entries(bL).map(([k,v])=>[v,k as RAGStatus])),
            5: Object.fromEntries(Object.entries(pL).map(([k,v])=>[v,k as RAGStatus])),
            6: Object.fromEntries(Object.entries(oL).map(([k,v])=>[v,k as RAGStatus])),
          };
          const map = statusMaps[data.column.index];
          if (map) {
            const status = map[row[data.column.index]];
            if (status && RAG[status]) {
              const fills: Record<RAGStatus,[number,number,number]> = { green:[198,239,206], amber:[255,235,156], red:[255,199,206], na:[240,242,245] };
              const texts: Record<RAGStatus,[number,number,number]> = { green:[15,90,40], amber:[120,70,0], red:[160,20,20], na:[120,130,145] };
              data.cell.styles.fillColor = fills[status];
              data.cell.styles.textColor = texts[status];
              data.cell.styles.fontStyle = "bold";
            }
          }
          if (data.column.index === 2) {
            const catColors: Record<string,[number,number,number]> = { Projects:[59,91,219], Imarat:[12,122,109], Graana:[124,58,237], Agency21:[192,86,33] };
            if (catColors[row[2]]) { data.cell.styles.textColor = catColors[row[2]]; data.cell.styles.fontStyle = "bold"; }
          }
          if (data.column.index === 7 && row[7] !== "—") { data.cell.styles.fillColor = [219,234,254]; data.cell.styles.textColor = [30,64,175]; data.cell.styles.fontStyle = "bold"; }
          if (data.column.index === 8 && row[8] !== "—") { data.cell.styles.fillColor = [219,234,254]; data.cell.styles.textColor = [30,64,175]; data.cell.styles.fontStyle = "bold"; }
          if (data.column.index === 9 && row[9] !== "—") {
            const v = row[9];
            if (v.includes("OK"))       { data.cell.styles.fillColor=[198,239,206]; data.cell.styles.textColor=[15,90,40];  data.cell.styles.fontStyle="bold"; }
            if (v.includes("LOW"))      { data.cell.styles.fillColor=[255,235,156]; data.cell.styles.textColor=[120,70,0];  data.cell.styles.fontStyle="bold"; }
            if (v.includes("CRITICAL")) { data.cell.styles.fillColor=[255,199,206]; data.cell.styles.textColor=[160,20,20]; data.cell.styles.fontStyle="bold"; }
          }
          if (data.column.index === 10 && row[10] !== "—") { data.cell.styles.textColor = [160,20,20]; }
        }
      },
      didDrawPage: (data: any) => {
        try { if (data.pageNumber > 1) { drawHeader("IT Facilities RAG Dashboard","Daily Facility Monitoring Report — All Sites"); drawFooter(); } } catch(e) {}
      },
    });

    if (tickets.length > 0) {
      doc.addPage();
      drawHeader("IT Support Tickets","Helpdesk Issue Tracking — All Reported Incidents");
      drawFooter();

      const tsy = 36;
      doc.setFillColor(235,240,250); doc.rect(0,tsy,W,18,"F");
      doc.setDrawColor(200,210,230); doc.setLineWidth(0.3);
      doc.line(0,tsy,W,tsy); doc.line(0,tsy+18,W,tsy+18);
      const tCards = [
        { label:"TOTAL", val:String(tickets.length), r:15,g:40,b:75, light:[220,228,245] as [number,number,number] },
        { label:"OPEN", val:String(tCounts.open), r:185,g:28,b:28, light:[255,199,206] as [number,number,number] },
        { label:"IN PROGRESS", val:String(tCounts.inprogress), r:161,g:98,b:7, light:[255,235,156] as [number,number,number] },
        { label:"PENDING", val:String(tCounts.pending), r:30,g:64,b:175, light:[219,234,254] as [number,number,number] },
        { label:"RESOLVED", val:String(tCounts.resolved), r:21,g:128,b:61, light:[198,239,206] as [number,number,number] },
      ];
      const tcw = (W-20)/tCards.length;
      tCards.forEach((c,i) => {
        const x = 10+i*tcw;
        const [lr,lg,lb] = c.light;
        doc.setFillColor(lr,lg,lb); doc.roundedRect(x,tsy+2,tcw-3,14,2,2,"F");
        doc.setFillColor(c.r,c.g,c.b); doc.rect(x,tsy+2,2,14,"F");
        doc.setTextColor(c.r,c.g,c.b);
        doc.setFontSize(12); doc.setFont("helvetica","bold");
        doc.text(c.val, x+tcw/2-1, tsy+11, { align:"center" });
        doc.setFontSize(5.5); doc.setFont("helvetica","bold");
        doc.text(c.label, x+tcw/2-1, tsy+15.5, { align:"center" });
      });

      const tRows = tickets.map(t => [t.id, t.office, t.medium||"—", t.description, t.reportedBy, t.assignedTo||"Unassigned", TICKET_STATUS[t.status].lbl, t.resolvedBy||"—", t.ts, t.resolvedTs||"—"]);

      autoTable(doc, {
        startY: 58,
        margin: { left:8, right:8 },
        head: [["Ticket ID","Office","Medium","Issue Description","Reported By","Assigned To","Status","Resolved By","Reported At","Resolved At"]],
        body: tRows,
        styles: { fontSize:7.5, cellPadding:{ top:3,bottom:3,left:3,right:3 }, font:"helvetica", lineColor:[210,218,230], lineWidth:0.3, textColor:[30,40,60] },
        headStyles: { fillColor:[15,40,75], textColor:[255,255,255], fontStyle:"bold", fontSize:7.5, cellPadding:{ top:4,bottom:4,left:3,right:3 }, lineColor:[201,163,66], lineWidth:0.5, halign:"center" },
        alternateRowStyles: { fillColor:[245,248,252] },
        rowPageBreak: "avoid",
        columnStyles: {
          0:{ cellWidth:20, fontStyle:"bold", textColor:[15,40,75] },
          1:{ cellWidth:28 },
          2:{ cellWidth:18, halign:"center" },
          3:{ cellWidth:52 },
          4:{ cellWidth:22 },
          5:{ cellWidth:24 },
          6:{ cellWidth:20, halign:"center", fontStyle:"bold" },
          7:{ cellWidth:22 },
          8:{ cellWidth:24, halign:"center" },
          9:{ cellWidth:24, halign:"center" },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 6) {
            const st = tRows[data.row.index][6];
            if (st==="Open")        { data.cell.styles.fillColor=[255,199,206]; data.cell.styles.textColor=[160,20,20];  data.cell.styles.fontStyle="bold"; }
            if (st==="In Progress") { data.cell.styles.fillColor=[255,235,156]; data.cell.styles.textColor=[120,70,0];   data.cell.styles.fontStyle="bold"; }
            if (st==="Resolved")    { data.cell.styles.fillColor=[198,239,206]; data.cell.styles.textColor=[15,90,40];   data.cell.styles.fontStyle="bold"; }
            if (st==="Pending")     { data.cell.styles.fillColor=[219,234,254]; data.cell.styles.textColor=[30,64,175];  data.cell.styles.fontStyle="bold"; }
          }
          if (data.section === "body" && data.column.index === 2) {
            const medColors: Record<string,[number,number,number]> = { "Email":[30,64,175], "Helpdesk Ticket":[124,58,237], "Whatsapp":[21,128,61], "In Person":[161,98,7] };
            if (medColors[tRows[data.row.index][2]]) { data.cell.styles.textColor = medColors[tRows[data.row.index][2]]; data.cell.styles.fontStyle = "bold"; }
          }
        },
        didDrawPage: (data: any) => {
          try { if (data.pageNumber > 1) { drawHeader("IT Support Tickets","Helpdesk Issue Tracking — All Reported Incidents"); drawFooter(); } } catch(e) {}
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
        <div style={{ color:"#8a94a6", fontSize:12, marginTop:4 }}>Loading latest data from all users</div>
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
            <span style={{ fontSize:10, color:"#94B8D4" }}>{syncing ? "Syncing..." : `Live — Last sync: ${lastSync}`}</span>
          </div>
          <div style={{ fontSize:11, color:"#94B8D4" }}>{now}</div>
        </div>
      </div>

      <div style={{ padding:"16px 20px" }}>
        <div style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, padding:"14px 18px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"#1a1f2e" }}>Today's Query Summary</div>
              <div style={{ fontSize:10, color:"#8a94a6", marginTop:2 }}>Shared across all users in real-time — use + / - to update</div>
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

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:16 }}>
          {[
            { title:"Internet Status", rows:[{l:`${iC.green} Sites Stable`,s:"green" as RAGStatus},{l:`${iC.amber} Slow / Intermittent`,s:"amber" as RAGStatus},{l:`${iC.red} Sites Down`,s:"red" as RAGStatus}] },
            { title:"Biometric Status", rows:[{l:`${bC.green} Sites Working`,s:"green" as RAGStatus},{l:`${bC.amber} Sync Delays`,s:"amber" as RAGStatus},{l:`${bC.red} Offline`,s:"red" as RAGStatus}] },
            { title:"Printing Devices", rows:[{l:`${pC.green} Working`,s:"green" as RAGStatus},{l:`${pC.amber} Partially Working`,s:"amber" as RAGStatus},{l:`${pC.red} Not Working`,s:"red" as RAGStatus}] },
            { title:"Overall RAG", rows:[{l:"Operational",s:"green" as RAGStatus,c:counts.green},{l:"Degraded",s:"amber" as RAGStatus,c:counts.amber},{l:"Critical",s:"red" as RAGStatus,c:counts.red}] },
          ].map(panel => (
            <div key={panel.title} style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, padding:"14px 16px" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#1a1f2e", marginBottom:10 }}>{panel.title}</div>
              {panel.rows.map((r: {l:string;s:RAGStatus;c?:number}) => (
                <div key={r.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid #f5f5f5" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, color:"#1a1f2e" }}><Dot s={r.s} />{r.l}</div>
                  {r.c !== undefined
                    ? <span style={{ fontSize:12, fontWeight:700, color:RAG[r.s].text }}>{r.c}/{FACILITIES.length}</span>
                    : <span style={{ background:RAG[r.s].bg, color:RAG[r.s].text, border:`1px solid ${RAG[r.s].border}`, padding:"1px 7px", borderRadius:3, fontSize:10, fontWeight:600 }}>
                        {r.s==="green"?"OK":r.s==="amber"?"WARN":"DOWN"}
                      </span>
                  }
                </div>
              ))}
              {panel.title==="Overall RAG" && (
                <div style={{ marginTop:8, paddingTop:6, borderTop:"1px solid #f0f2f5", fontSize:10, color:"#8a94a6" }}>
                  <span style={{ color:"#1A3A5C", fontWeight:600 }}>it.support@imarat.com.pk</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #e2e6ed", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#1a1f2e" }}>RAG Status of All Facilities</div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              <button onClick={() => setFilter(fOpts[(fOpts.indexOf(filter)+1)%fOpts.length])}
                style={{ padding:"5px 12px", background:"#f1f4f8", border:"1px solid #dde1e8", borderRadius:4, fontSize:11, color:"#4a5568", cursor:"pointer" }}>
                {fLabels[filter]}
              </button>
              <button onClick={exportPDF} style={{ padding:"5px 14px", background:"#1A3A5C", border:"none", borderRadius:4, fontSize:11, color:"#fff", cursor:"pointer", fontWeight:600 }}>EXPORT PDF</button>
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#f8f9fb" }}>
                  {["#","FACILITY","CATEGORY","INTERNET","BIOMETRIC","PRINTING DEVICES","OVERALL","BANDWIDTH","REQUIRED BW","STATUS","REPORTED ISSUE / OUTSTANDING","NOTES","UPDATED"].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"9px 10px", color:"#8a94a6", fontWeight:600, fontSize:10, letterSpacing:".3px", borderBottom:"2px solid #e2e6ed", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((f,i) => {
                  const s = state[f.name] ?? defaultState();
                  const ov = calcOverall(s);
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
                        <input defaultValue={s.bandwidth} onBlur={e=>updateField(f.name,"bandwidth",e.target.value)} placeholder="e.g. 50 Mbps"
                          style={{ background:"#f0f4ff", border:"1px solid #b4c6fb", borderRadius:3, padding:"3px 7px", color:"#1A3A5C", fontSize:11, width:95, fontWeight:500 }} />
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <input defaultValue={s.issue} onBlur={e=>updateField(f.name,"issue",e.target.value)} placeholder="Reported issue..."
                          style={{ background:"#fff8f8", border:"1px solid #f5b8b8", borderRadius:3, padding:"3px 7px", color:"#8b1c1c", fontSize:11, width:160 }} />
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <input defaultValue={s.notes} onBlur={e=>updateField(f.name,"notes",e.target.value)} placeholder="Notes..."
                          style={{ background:"#f8f9fb", border:"1px solid #dde1e8", borderRadius:3, padding:"3px 7px", color:"#1a1f2e", fontSize:11, width:110 }} />
                      </td>
                      <td style={{ padding:"7px 10px", fontFamily:"monospace", fontSize:10, color:"#8a94a6", whiteSpace:"nowrap" }}>{s.ts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

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
              ].map(b => (
                <span key={b.lbl} style={{ background:b.bg, color:b.text, border:`1px solid ${b.border}`, padding:"3px 10px", borderRadius:4, fontSize:11, fontWeight:600 }}>{b.lbl}</span>
              ))}
              <button onClick={() => setShowTicketForm(v => !v)}
                style={{ padding:"5px 14px", background:"#1A3A5C", border:"none", borderRadius:4, fontSize:11, color:"#fff", cursor:"pointer", fontWeight:600 }}>
                + New Ticket
              </button>
            </div>
          </div>

          {showTicketForm && (
            <div style={{ padding:"16px", background:"#f8f9fb", borderBottom:"1px solid #e2e6ed", display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
              <div>
                <div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>OFFICE / LOCATION</div>
                <input value={newTicket.office} onChange={e=>setNewTicket(p=>({...p,office:e.target.value}))} placeholder="Office name or Unknown / Remote"
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff" }} />
              </div>
              <div>
                <div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>MEDIUM</div>
                <select value={newTicket.medium} onChange={e=>setNewTicket(p=>({...p,medium:e.target.value}))}
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff", cursor:"pointer" }}>
                  <option value="">— Select Medium —</option>
                  <option value="Email">Email</option>
                  <option value="Helpdesk Ticket">Helpdesk Ticket</option>
                  <option value="Whatsapp">Whatsapp</option>
                  <option value="In Person">In Person</option>
                </select>
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>ISSUE DESCRIPTION</div>
                <input value={newTicket.description} onChange={e=>setNewTicket(p=>({...p,description:e.target.value}))} placeholder="Describe the issue..."
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff" }} />
              </div>
              <div>
                <div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>REPORTED BY</div>
                <input value={newTicket.reportedBy} onChange={e=>setNewTicket(p=>({...p,reportedBy:e.target.value}))} placeholder="Name or Unknown"
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff" }} />
              </div>
              <div>
                <div style={{ fontSize:10, color:"#6b7280", marginBottom:4, fontWeight:600 }}>ASSIGN TO TEAM MEMBER</div>
                <select value={newTicket.assignedTo} onChange={e=>setNewTicket(p=>({...p,assignedTo:e.target.value}))}
                  style={{ width:"100%", padding:"6px 8px", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#1a1f2e", background:"#fff", cursor:"pointer" }}>
                  {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, gridColumn:"span 2" }}>
                <button onClick={addTicket} style={{ padding:"6px 18px", background:"#1A3A5C", border:"none", borderRadius:4, fontSize:12, color:"#fff", cursor:"pointer", fontWeight:600 }}>Add Ticket</button>
                <button onClick={() => setShowTicketForm(false)} style={{ padding:"6px 14px", background:"#f1f4f8", border:"1px solid #dde1e8", borderRadius:4, fontSize:12, color:"#4a5568", cursor:"pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {tickets.length === 0 ? (
            <div style={{ padding:"32px", textAlign:"center", color:"#8a94a6", fontSize:13 }}>No tickets yet. Click "+ New Ticket" to log an issue.</div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f8f9fb" }}>
                    {["TICKET ID","OFFICE / LOCATION","MEDIUM","ISSUE DESCRIPTION","REPORTED BY","ASSIGNED TO TEAM MEMBER","STATUS","RESOLVED BY","REPORTED AT","RESOLVED AT",""].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"9px 10px", color:"#8a94a6", fontWeight:600, fontSize:10, borderBottom:"2px solid #e2e6ed", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t,i) => (
                    <tr key={t.id} style={{ borderBottom:"1px solid #f0f2f5", background:i%2===0?"#fff":"#fafbfc" }}>
                      <td style={{ padding:"7px 10px", fontFamily:"monospace", fontSize:11, fontWeight:600, color:"#1A3A5C" }}>{t.id}</td>
                      <td style={{ padding:"7px 10px", fontWeight:600, color:"#1a1f2e", whiteSpace:"nowrap" }}>{t.office}</td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ background:"#f0f4ff", border:"1px solid #b4c6fb", color:"#1A3A5C", padding:"2px 8px", borderRadius:3, fontSize:10, fontWeight:600, whiteSpace:"nowrap" as const }}>{t.medium||"—"}</span>
                      </td>
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
                        {t.status === "resolved" ? (
                          <select value={t.resolvedBy} onChange={e=>updateTicket(t.id,"resolvedBy",e.target.value)}
                            style={{ border:"1px solid #a8d5b5", borderRadius:3, padding:"3px 6px", fontSize:11, color:"#1a6b35", background:"#edf7f0", cursor:"pointer" }}>
                            {TEAM.map(m=><option key={m} value={m.startsWith("—")?"":m}>{m}</option>)}
                          </select>
                        ) : <span style={{ color:"#c0c8d6", fontSize:11 }}>—</span>}
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