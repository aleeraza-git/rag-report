"use client";

import { useState, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
];

type RAGStatus = "green" | "amber" | "red" | "na";
interface FacilityState {
  internet: RAGStatus;
  bio: RAGStatus;
  printing: RAGStatus;
  issue: string;
  notes: string;
  ts: string;
}
type AppState = Record<string, FacilityState>;
type FilterMode = "all" | "green" | "amber" | "red";

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

function nowTime() {
  return new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function calcOverall(s: FacilityState): RAGStatus {
  const vals = [s.internet, s.bio, s.printing];
  if (vals.includes("red")) return "red";
  if (vals.includes("amber")) return "amber";
  if (vals.every(v => v === "na")) return "na";
  return "green";
}
function defaultState(): FacilityState {
  return { internet:"green", bio:"green", printing:"green", issue:"", notes:"", ts:nowTime() };
}
function loadFromStorage(): AppState {
  try { const r = localStorage.getItem("rag_v6"); if (r) return JSON.parse(r); } catch {}
  return {};
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

export default function Dashboard() {
  const [state, setState] = useState<AppState>({});
  const [filter, setFilter] = useState<FilterMode>("all");
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState("");

  useEffect(() => {
    const saved = loadFromStorage();
    const init: AppState = {};
    FACILITIES.forEach(f => { init[f.name] = saved[f.name] ?? defaultState(); });
    setState(init);
    const fmt = () => new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
    setNow(fmt());
    setMounted(true);
    const t = setInterval(() => setNow(fmt()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem("rag_v6", JSON.stringify(state));
  }, [state, mounted]);

  const updateField = useCallback((name:string, field:keyof FacilityState, val:string) => {
    setState(prev => ({ ...prev, [name]: { ...prev[name], [field]: val, ts: nowTime() } }));
  }, []);

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

  const visible = filter === "all" ? FACILITIES : FACILITIES.filter(f => { const s = state[f.name]; return s && calcOverall(s) === filter; });

  const exportPDF = () => {
    const d = new Date();
    const today = d.toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" });
    const timeNow = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });

    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const W = doc.internal.pageSize.getWidth();

    doc.setFillColor(26,58,92);
    doc.rect(0,0,W,28,"F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(18); doc.setFont("helvetica","bold");
    doc.text("IMARAT GROUP",10,12);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.setTextColor(148,184,212);
    doc.text("INFORMATION TECHNOLOGY DEPARTMENT",10,18);
    doc.setTextColor(255,255,255);
    doc.setFontSize(11); doc.setFont("helvetica","bold");
    doc.text("IT Facilities RAG Dashboard", W-10, 10, { align:"right" });
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.setTextColor(148,184,212);
    doc.text(today, W-10, 16, { align:"right" });
    doc.text("Report Time: "+timeNow, W-10, 22, { align:"right" });

    doc.setFillColor(34,55,90);
    doc.rect(0,28,W,10,"F");
    doc.setTextColor(148,184,212); doc.setFontSize(7.5);
    const infos = [`Period: Daily`,`Total: ${FACILITIES.length}`,`Operational: ${counts.green}`,`Degraded: ${counts.amber}`,`Critical: ${counts.red}`,`Support: it.support@imarat.com.pk`];
    const step = W / infos.length;
    infos.forEach((t,i) => doc.text(t, 10+i*step, 34.5));

    const cards = [
      { label:"Total Facilities", val:String(FACILITIES.length), r:255,g:255,b:255, tr:26,tg:31,tb:46 },
      { label:"Fully Operational", val:String(counts.green), r:237,g:247,b:240, tr:26,tg:107,tb:53 },
      { label:"Warning Sites", val:String(counts.amber), r:254,g:248,b:236, tr:122,tg:82,tb:0 },
      { label:"Critical Sites", val:String(counts.red), r:253,g:240,b:240, tr:139,tg:28,tb:28 },
    ];
    const cw=(W-20)/4;
    cards.forEach((c,i) => {
      doc.setFillColor(c.r,c.g,c.b); doc.roundedRect(10+i*cw,42,cw-3,14,2,2,"F");
      doc.setTextColor(120,130,150); doc.setFontSize(6.5); doc.setFont("helvetica","normal");
      doc.text(c.label.toUpperCase(), 13+i*cw, 47);
      doc.setTextColor(c.tr,c.tg,c.tb); doc.setFontSize(14); doc.setFont("helvetica","bold");
      doc.text(c.val, 13+i*cw, 54);
    });

    const iL: Record<RAGStatus,string> = { green:"Working", amber:"Slow/Intermittent", red:"Down", na:"N/A" };
    const bL: Record<RAGStatus,string> = { green:"Working & Syncing", amber:"Delayed", red:"Not Working", na:"N/A" };
    const pL: Record<RAGStatus,string> = { green:"Working", amber:"Partial", red:"Not Working", na:"N/A" };
    const oL: Record<RAGStatus,string> = { green:"Operational", amber:"Degraded", red:"Critical", na:"N/A" };

    const rows = FACILITIES.map((f,i) => {
      const s = state[f.name] ?? defaultState();
      const ov = calcOverall(s);
      return [String(i+1), f.name, f.cat, iL[s.internet], bL[s.bio], pL[s.printing], oL[ov], s.issue||"—", s.notes||"—", s.ts];
    });

    autoTable(doc, {
      startY: 60,
      head: [["#","Facility","Category","Internet","Biometric","Printing","Overall","Reported Issue","Notes","Updated"]],
      body: rows,
      styles: { fontSize:7, cellPadding:2.5, font:"helvetica" },
      headStyles: { fillColor:[44,74,110], textColor:255, fontStyle:"bold", fontSize:7.5 },
      alternateRowStyles: { fillColor:[244,246,249] },
      columnStyles: {
        0:{ cellWidth:8, halign:"center" },
        1:{ cellWidth:38 },
        2:{ cellWidth:18 },
        3:{ cellWidth:22 },
        4:{ cellWidth:26 },
        5:{ cellWidth:20 },
        6:{ cellWidth:20 },
        7:{ cellWidth:32 },
        8:{ cellWidth:28 },
        9:{ cellWidth:18, halign:"center" },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          const row = rows[data.row.index];
          const colMap: Record<number, Record<string,RAGStatus>> = {
            3: Object.fromEntries(Object.entries(iL).map(([k,v])=>[v,k as RAGStatus])),
            4: Object.fromEntries(Object.entries(bL).map(([k,v])=>[v,k as RAGStatus])),
            5: Object.fromEntries(Object.entries(pL).map(([k,v])=>[v,k as RAGStatus])),
            6: Object.fromEntries(Object.entries(oL).map(([k,v])=>[v,k as RAGStatus])),
          };
          const map = colMap[data.column.index];
          if (map) {
            const status = map[row[data.column.index]];
            if (status && RAG[status]) {
              const [r,g,b] = RAG[status].pdf;
              data.cell.styles.fillColor = [r,g,b];
              const tc: Record<RAGStatus,[number,number,number]> = { green:[26,107,53], amber:[122,82,0], red:[139,28,28], na:[107,114,128] };
              data.cell.styles.textColor = tc[status];
              data.cell.styles.fontStyle = "bold";
            }
          }
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setDrawColor(26,58,92); doc.setLineWidth(0.5);
    doc.line(10, finalY, W-10, finalY);
    doc.setTextColor(107,114,128); doc.setFontSize(7); doc.setFont("helvetica","normal");
    doc.text("System-generated by Imarat Group IT Department", 10, finalY+5);
    doc.text(`Date: ${today}  |  Time: ${timeNow}`, 10, finalY+9);
    doc.text("Support: it.support@imarat.com.pk", 10, finalY+13);
    doc.setTextColor(26,58,92); doc.setFont("helvetica","bold");
    doc.text("Imarat Group — Strictly Confidential / Internal Use Only", 10, finalY+18);

    doc.setDrawColor(26,58,92); doc.setLineWidth(0.8);
    doc.circle(W-25, finalY+8, 8);
    doc.setFontSize(6); doc.setFont("helvetica","bold"); doc.setTextColor(26,58,92);
    doc.text("IT", W-25, finalY+7, { align:"center" });
    doc.text("DEPT", W-25, finalY+10, { align:"center" });
    doc.setLineWidth(0.4);
    doc.line(W-60, finalY+18, W-10, finalY+18);
    doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.setTextColor(26,58,92);
    doc.text("IT Department Head", W-35, finalY+22, { align:"center" });
    doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(107,114,128);
    doc.text("Information Technology · Imarat Group", W-35, finalY+26, { align:"center" });

    doc.save(`Imarat_RAG_${d.toISOString().slice(0,10)}.pdf`);
  };

  if (!mounted) return null;

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
        <div style={{ marginLeft:"auto" }}><div style={{ fontSize:11, color:"#94B8D4" }}>{now}</div></div>
      </div>

      <div style={{ padding:"16px 20px" }}>
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
                  <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, color:"#1a1f2e" }}>
                    <Dot s={r.s} />{r.l}
                  </div>
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

        <div style={{ background:"#fff", border:"1px solid #e2e6ed", borderRadius:8, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #e2e6ed", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#1a1f2e" }}>RAG Status of All Facilities</div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              <button onClick={() => setFilter(fOpts[(fOpts.indexOf(filter)+1)%fOpts.length])}
                style={{ padding:"5px 12px", background:"#f1f4f8", border:"1px solid #dde1e8", borderRadius:4, fontSize:11, color:"#4a5568", cursor:"pointer" }}>
                {fLabels[filter]}
              </button>
              <button onClick={exportPDF}
                style={{ padding:"5px 14px", background:"#1A3A5C", border:"none", borderRadius:4, fontSize:11, color:"#fff", cursor:"pointer", fontWeight:600 }}>
                EXPORT PDF
              </button>
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#f8f9fb" }}>
                  {["#","FACILITY","CATEGORY","INTERNET","BIOMETRIC","PRINTING DEVICES","OVERALL","REPORTED ISSUE / OUTSTANDING","NOTES","UPDATED"].map(h => (
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
                        <input defaultValue={s.issue} onBlur={e=>updateField(f.name,"issue",e.target.value)} placeholder="Reported issue..."
                          style={{ background:"#fff8f8", border:"1px solid #f5b8b8", borderRadius:3, padding:"3px 7px", color:"#8b1c1c", fontSize:11, width:160 }} />
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <input defaultValue={s.notes} onBlur={e=>updateField(f.name,"notes",e.target.value)} placeholder="Notes..."
                          style={{ background:"#f8f9fb", border:"1px solid #dde1e8", borderRadius:3, padding:"3px 7px", color:"#1a1f2e", fontSize:11, width:120 }} />
                      </td>
                      <td style={{ padding:"7px 10px", fontFamily:"monospace", fontSize:10, color:"#8a94a6", whiteSpace:"nowrap" }}>{s.ts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

