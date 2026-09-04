"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ────────────────────────────────────────────────────────────────────
export type RAGStatus = "green" | "amber" | "red" | "na";
export interface FacilityState {
  internet: RAGStatus; bio: RAGStatus; printing: RAGStatus;
  bandwidth: string; requiredBandwidth: string;
  issue: string; notes: string; ts: string;
}
export interface ReportConfig {
  title:        string;
  subtitle:     string;
  org:          string;
  author:       string;
  period:       string;
  includeLogo:  boolean;
  includeRef:   boolean;
  includeTs:    boolean;
  includeKPIs:  boolean;
  includeDivs:  boolean;
  includeTable: boolean;
  issuesOnly:   boolean;
  divFilter:    string;
  orientation:  "landscape" | "portrait";
}
export interface ReportModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  facilities:    { name: string; cat: string }[];
  state:         Record<string, FacilityState>;
  counts:        Record<RAGStatus, number>;
  autoStats:     { received: number; resolved: number; pending: number };
  calcOverall:   (s: FacilityState) => RAGStatus;
  defaultState:  () => FacilityState;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  panelBg:   "#0C1A2E",
  panelAlt:  "#0F2040",
  panelBdr:  "#1A3050",
  inputBg:   "#0A1626",
  inputBdr:  "#1E3A58",
  centerBg:  "#EBF0F8",
  pageBg:    "#FFFFFF",
  headerBg:  "#FAFBFD",
  gold:      "#C49A1E",
  goldL:     "#E8C048",
  goldBg:    "rgba(196,154,30,0.12)",
  blue:      "#2C5EE8",
  blueHov:   "#2451CC",
  success:   "#059669",
  warn:      "#D97706",
  danger:    "#DC2626",
  white:     "#FFFFFF",
  txtHero:   "#F1F5FD",
  txtPri:    "#CBD5E8",
  txtSec:    "#8A9AB8",
  txtDim:    "#4A5A78",
  cTxt:      "#1A2540",
  cMuted:    "#5A6B85",
  cBdr:      "#DDE4EF",
  cAlt:      "#F4F7FC",
  shadow:    "0 2px 8px rgba(0,0,0,0.12)",
  shadowHvy: "0 8px 40px rgba(0,0,0,0.36)",
};

// ─── Status helpers ───────────────────────────────────────────────────────────
type RGB = [number, number, number];
const gC: RGB=[34,197,94],   gL: RGB=[210,246,232], gD: RGB=[6,88,58];
const aC: RGB=[245,158,11],  aL: RGB=[255,238,170], aD: RGB=[100,64,0];
const rC: RGB=[239,68,68],   rL: RGB=[255,210,216], rD: RGB=[128,10,20];
const nC: RGB=[148,163,184], nL: RGB=[232,236,248], nD: RGB=[80,96,130];
const ragFill  = (s: RAGStatus): RGB => ({green:gL,amber:aL,red:rL,na:nL})[s];
const ragText  = (s: RAGStatus): RGB => ({green:gD,amber:aD,red:rD,na:nD})[s];
const ragAccent= (s: RAGStatus): RGB => ({green:gC,amber:aC,red:rC,na:nC})[s];
const ragLabel = (s: RAGStatus) => ({green:"Operational",amber:"Degraded",red:"Critical",na:"Not Set"})[s];
const iLabel   = (s: RAGStatus) => ({green:"Active",amber:"Unstable",red:"Down",na:"—"})[s];
const bLabel   = (s: RAGStatus) => ({green:"Syncing",amber:"Delayed",red:"Offline",na:"—"})[s];
const pLabel   = (s: RAGStatus) => ({green:"Online",amber:"Partial",red:"Down",na:"—"})[s];

const CAT_C:  Record<string, RGB> = {
  Imarat:[0,148,136], Projects:[40,76,220], Graana:[110,40,210], Agency21:[200,76,14],
};
const CAT_BG: Record<string, RGB> = {
  Imarat:[205,248,242], Projects:[218,228,255], Graana:[236,222,255], Agency21:[255,226,208],
};
const CAT_HEX: Record<string, string> = {
  Imarat:"#00948A", Projects:"#2850DC", Graana:"#6E28D2", Agency21:"#C84C0E",
};
const CAT_BGHEX: Record<string, string> = {
  Imarat:"#CDFAF2", Projects:"#DAE4FF", Graana:"#ECDEff", Agency21:"#FFE2D0",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: D.txtDim, textTransform: "uppercase", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${D.panelBdr}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 10.5, color: D.txtSec, marginBottom: 4, fontWeight: 500, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

function DarkInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", background: D.inputBg, border: `1px solid ${D.inputBdr}`, borderRadius: 5, padding: "7px 10px", fontSize: 11.5, color: D.txtPri, outline: "none", boxSizing: "border-box" as const }}
    />
  );
}

function DarkSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: "100%", background: D.inputBg, border: `1px solid ${D.inputBdr}`, borderRadius: 5, padding: "7px 10px", fontSize: 11.5, color: D.txtPri, outline: "none", boxSizing: "border-box" as const, cursor: "pointer" }}
    >
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 9, cursor: "pointer", userSelect: "none" as const }}
    >
      <div style={{ width: 32, height: 18, borderRadius: 9, background: checked ? D.gold : D.inputBdr, flexShrink: 0, marginTop: 1, position: "relative" as const, transition: "background 0.2s" }}>
        <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff", position: "absolute", top: 2.5, left: checked ? 16 : 2.5, transition: "left 0.18s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
      </div>
      <div>
        <div style={{ fontSize: 11.5, color: D.txtPri, fontWeight: 500, lineHeight: "1.3" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: D.txtDim, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function OrientBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} style={{ flex: 1, background: active ? D.goldBg : D.inputBg, border: `1px solid ${active ? D.gold : D.inputBdr}`, borderRadius: 5, padding: "8px 6px", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 10, color: active ? D.goldL : D.txtSec, fontWeight: active ? 700 : 400 }}>{label}</span>
    </button>
  );
}

// ─── Live preview canvas — BI Dashboard layout ───────────────────────────────
function PreviewCanvas({ cfg, facilities, state, counts, autoStats, calcOverall, defaultState: defState }: {
  cfg: ReportConfig;
  facilities: { name: string; cat: string }[];
  state: Record<string, FacilityState>;
  counts: Record<RAGStatus, number>;
  autoStats: { received: number; resolved: number; pending: number };
  calcOverall: (s: FacilityState) => RAGStatus;
  defaultState: () => FacilityState;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 32;
        setScale(Math.min(w / 930, 1));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const total = facilities.length || 1;
  const healthPct = counts.green / total;
  const hCol = healthPct >= 0.8 ? "#22C55E" : healthPct >= 0.5 ? "#F59E0B" : "#EF4444";
  const filtered = facilities.filter(f => cfg.divFilter === "all" || f.cat === cfg.divFilter);
  const ORDER: Record<string, number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted = [...filtered].sort((a,b) => (ORDER[a.cat]??9) - (ORDER[b.cat]??9));
  const dateStr = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  const timeStr = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const cats = ["Imarat","Projects","Graana","Agency21"] as const;
  // ── Color tokens ──────────────────────────────────────────────────────────
  const BLU="#2563EB", GRN="#10B981", AMB="#F59E0B", CRT="#EF4444", SLT="#94A3B8";
  const NAVY="#0B1D3A", PAGE="#EEF2F8", PANEL="#FFFFFF", BDR_C="#CBD5E1", MUT="#64748B";
  const INK_C="#0F172A";

  const healthColor = healthPct>=0.8?GRN:healthPct>=0.5?AMB:CRT;

  // ── Panel card: white, 3px top accent, uppercase label title ──────────────
  const Card = ({ title, topColor=BLU, children, style }: { title:string; topColor?:string; children:React.ReactNode; style?:React.CSSProperties }) => (
    <div style={{ background:PANEL, borderRadius:8, border:`1px solid ${BDR_C}`, display:"flex", flexDirection:"column" as const, overflow:"hidden", boxShadow:"0 1px 4px rgba(11,29,58,0.07)", ...style }}>
      <div style={{ height:3, background:topColor, flexShrink:0 }}/>
      <div style={{ padding:"12px 15px 0 15px", flexShrink:0 }}>
        <div style={{ fontSize:9.5, fontWeight:700, color:BLU, letterSpacing:"1.8px", textTransform:"uppercase" as const, fontFamily:"'DM Sans','Inter',system-ui,sans-serif", marginBottom:10 }}>{title}</div>
      </div>
      <div style={{ flex:1, padding:"0 15px 13px 15px", overflow:"hidden" }}>{children}</div>
    </div>
  );

  const Dot = ({c,l}:{c:string;l:string}) => (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      <div style={{ width:7,height:7,borderRadius:"50%",background:c,flexShrink:0 }}/>
      <span style={{ fontSize:10.5,color:MUT,fontFamily:"'DM Sans','Inter',system-ui,sans-serif" }}>{l}</span>
    </div>
  );

  // Multi-segment donut
  const RD=32, CD=2*Math.PI*RD;
  const StatusDonut = () => {
    const segs=[{v:counts.green,c:GRN},{v:counts.amber,c:AMB},{v:counts.red,c:CRT},{v:counts.na||0,c:SLT}];
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    let cum=0;
    return (
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={RD} fill="none" stroke="#E2E8F0" strokeWidth="13"/>
        {segs.map((seg,si)=>{
          if(!seg.v) return null;
          const len=CD*(seg.v/tot), off=-CD*cum;
          cum+=seg.v/tot;
          return <circle key={si} cx="46" cy="46" r={RD} fill="none" stroke={seg.c} strokeWidth="13"
            strokeDasharray={`${len} ${CD-len}`} strokeDashoffset={off}
            style={{ transform:"rotate(-90deg)", transformOrigin:"46px 46px" }} strokeLinecap="butt"/>;
        })}
      </svg>
    );
  };

  const insightText = counts.red>0&&counts.amber>0
    ?`${counts.red} critical + ${counts.amber} degraded sites require immediate IT attention.`
    :counts.red>0?`${counts.red} site${counts.red>1?"s":""} in critical state — service restoration is the priority.`
    :counts.amber>0?`${counts.amber} site${counts.amber>1?"s":""} degraded. No critical failures detected at this time.`
    :`All ${counts.green} facilities fully operational. All services healthy across all divisions.`;

  const ff="'DM Sans','Inter',system-ui,sans-serif";

  return (
    <div ref={containerRef} style={{ width:"100%", display:"flex", flexDirection:"column" as const, alignItems:"center" }}>
      <div style={{ transform:`scale(${scale})`, transformOrigin:"top center", width:930, transition:"transform 0.15s" }}>
        <div style={{ width:930, background:PAGE, fontFamily:ff, borderRadius:8, overflow:"hidden", boxShadow:"0 12px 48px rgba(11,29,58,0.22)" }}>

          {/* HEADER */}
          <div style={{ background:NAVY, display:"flex", alignItems:"center", padding:"0 22px", height:54, borderBottom:`3px solid ${BLU}` }}>
            {/* Wordmark */}
            <div style={{ display:"flex", alignItems:"center", gap:0 }}>
              <div style={{ width:28, height:28, borderRadius:6, background:BLU, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontSize:13, fontWeight:900, color:"#fff", letterSpacing:0.5, fontFamily:ff }}>IG</span>
              </div>
              <div style={{ marginLeft:10 }}>
                <div style={{ fontSize:13, fontWeight:800, color:"#F1F5F9", letterSpacing:3, fontFamily:ff }}>IMARAT</div>
                <div style={{ fontSize:8, color:"#64748B", letterSpacing:0.8, marginTop:1 }}>Group of Companies · IT Department</div>
              </div>
            </div>
            {/* Divider */}
            <div style={{ width:1, height:28, background:"#1E3A5F", margin:"0 20px" }}/>
            {/* Title block */}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#F1F5F9" }}>{cfg.title}</div>
              <div style={{ fontSize:9, color:"#475569", marginTop:2 }}>{cfg.org} · {cfg.period||dateStr}</div>
            </div>
            {/* Health badge */}
            <div style={{ background: healthPct>=0.8?"rgba(16,185,129,0.15)":healthPct>=0.5?"rgba(245,158,11,0.15)":"rgba(239,68,68,0.15)", border:`1px solid ${healthColor}`, borderRadius:20, padding:"4px 14px", marginRight:20 }}>
              <span style={{ fontSize:11, fontWeight:700, color:healthColor }}>{Math.round(healthPct*100)}% Operational</span>
            </div>
            {/* Date */}
            <div style={{ textAlign:"right" as const }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#CBD5E1" }}>{dateStr}</div>
              <div style={{ fontSize:9, color:"#475569", marginTop:2 }}>{timeStr}</div>
            </div>
          </div>

          {/* BODY */}
          <div style={{ padding:"12px", display:"flex", flexDirection:"column" as const, gap:10 }}>

            {/* ROW 1 */}
            <div style={{ display:"flex", gap:10, height:196 }}>

              {/* 1 · Health */}
              <Card title="Facility Health" topColor={healthColor} style={{ width:268 }}>
                {[
                  {l:"Overall Health",v:`${Math.round(healthPct*100)}%`,c:healthColor,big:true},
                  {l:"Total Sites",v:String(facilities.length),c:INK_C,big:false},
                  {l:"Operational",v:String(counts.green),c:GRN,big:false},
                  {l:"Degraded",v:String(counts.amber),c:AMB,big:false},
                  {l:"Critical",v:String(counts.red),c:CRT,big:false},
                  {l:"Not Configured",v:String(counts.na||0),c:SLT,big:false},
                ].map((r,ri)=>(
                  <div key={r.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5.5px 0", borderBottom:ri<5?`1px solid #F1F5F9`:"none" }}>
                    <span style={{ fontSize:11.5, color:ri===0?MUT:MUT, fontWeight:ri===0?500:400 }}>{r.l}</span>
                    <span style={{ fontSize:ri===0?17:12.5, fontWeight:ri===0?800:600, color:r.c, fontVariantNumeric:"tabular-nums" }}>{r.v}</span>
                  </div>
                ))}
              </Card>

              {/* 2 · Status */}
              <Card title="Status Distribution" topColor={BLU} style={{ width:250 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, height:"100%" }}>
                  <div style={{ position:"relative" as const, flexShrink:0 }}>
                    <StatusDonut/>
                    <div style={{ position:"absolute" as const, inset:0, display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center" }}>
                      <div style={{ fontSize:21, fontWeight:800, color:INK_C, lineHeight:1 }}>{facilities.length}</div>
                      <div style={{ fontSize:8.5, color:SLT, marginTop:2 }}>sites</div>
                    </div>
                  </div>
                  <div style={{ flex:1, display:"flex", flexDirection:"column" as const, gap:7 }}>
                    {([{v:counts.green,l:"Operational",c:GRN},{v:counts.amber,l:"Degraded",c:AMB},{v:counts.red,l:"Critical",c:CRT},{v:counts.na||0,l:"Not Set",c:SLT}]).map(s=>(
                      <div key={s.l}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:11, color:MUT }}>{s.l}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:s.c, fontVariantNumeric:"tabular-nums" }}>{s.v}</span>
                        </div>
                        <div style={{ height:4, background:"#EEF2F8", borderRadius:2 }}>
                          <div style={{ height:4, borderRadius:2, width:`${facilities.length>0?s.v/facilities.length*100:0}%`, background:s.c }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* 3 · Division Progress */}
              <Card title="Division Progress" topColor={BLU} style={{ flex:1 }}>
                <div style={{ display:"flex", flexDirection:"column" as const, gap:11 }}>
                  {cats.map(cat=>{
                    const facs=facilities.filter(f=>f.cat===cat);
                    const grn=facs.filter(f=>calcOverall(state[f.name]??defState())==="green").length;
                    const amb=facs.filter(f=>calcOverall(state[f.name]??defState())==="amber").length;
                    const red=facs.filter(f=>calcOverall(state[f.name]??defState())==="red").length;
                    const hlth=facs.length>0?Math.round(grn/facs.length*100):0;
                    const cc=CAT_HEX[cat];
                    return (
                      <div key={cat}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:12, color:INK_C, fontWeight:600 }}>{cat}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:10.5, color:SLT }}>{facs.length} sites</span>
                            <span style={{ fontSize:13, fontWeight:800, color:cc, fontVariantNumeric:"tabular-nums" }}>{hlth}%</span>
                          </div>
                        </div>
                        <div style={{ height:8, background:"#EEF2F8", borderRadius:4, display:"flex", overflow:"hidden" }}>
                          {grn>0&&<div style={{ width:`${grn/facs.length*100}%`, background:GRN }}/>}
                          {amb>0&&<div style={{ width:`${amb/facs.length*100}%`, background:AMB }}/>}
                          {red>0&&<div style={{ width:`${red/facs.length*100}%`, background:CRT }}/>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* ROW 2 */}
            <div style={{ display:"flex", gap:10, height:214 }}>

              {/* 4 · Services */}
              <Card title="Service Availability" topColor={BLU} style={{ width:268 }}>
                <div style={{ display:"flex", flexDirection:"column" as const, gap:13 }}>
                  {(["internet","bio","printing"] as const).map((key,ki)=>{
                    const lbls=["Internet","Biometric","Printing"];
                    const vals=sorted.map(f=>(state[f.name]??defState())[key]);
                    const sg=vals.filter(v=>v==="green").length;
                    const sa=vals.filter(v=>v==="amber").length;
                    const sr=vals.filter(v=>v==="red").length;
                    const sh=vals.length>0?sg/vals.length:0;
                    const shC=sh>=0.8?GRN:sh>=0.5?AMB:CRT;
                    return (
                      <div key={key}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:12, color:INK_C, fontWeight:600 }}>{lbls[ki]}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:10.5, color:MUT, fontVariantNumeric:"tabular-nums" }}>{sg}/{vals.length}</span>
                            <span style={{ fontSize:11, fontWeight:700, color:shC }}>{Math.round(sh*100)}%</span>
                          </div>
                        </div>
                        <div style={{ height:8, background:"#EEF2F8", borderRadius:4, display:"flex", overflow:"hidden" }}>
                          {sg>0&&<div style={{ width:`${sg/vals.length*100}%`, background:GRN }}/>}
                          {sa>0&&<div style={{ width:`${sa/vals.length*100}%`, background:AMB }}/>}
                          {sr>0&&<div style={{ width:`${sr/vals.length*100}%`, background:CRT }}/>}
                        </div>
                        <div style={{ fontSize:10, color:"#94A3B8", marginTop:3 }}>{sa} degraded · {sr} critical</div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* 5 · Tickets */}
              <Card title="Support Tickets" topColor={BLU} style={{ width:250 }}>
                {(()=>{
                  const maxV=Math.max(autoStats.received,autoStats.resolved,autoStats.pending,1);
                  const bars=[{v:autoStats.received,c:BLU,l:"Received"},{v:autoStats.resolved,c:GRN,l:"Resolved"},{v:autoStats.pending,c:AMB,l:"Pending"}];
                  const barH=108;
                  return (
                    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-around", height:barH+36 }}>
                      {bars.map(b=>(
                        <div key={b.l} style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:5, width:58 }}>
                          <span style={{ fontSize:20, fontWeight:800, color:b.c, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{b.v}</span>
                          <div style={{ width:"100%", height:barH, background:"#EEF2F8", borderRadius:5, display:"flex", alignItems:"flex-end", overflow:"hidden" }}>
                            <div style={{ width:"100%", background:b.c, borderRadius:5, height:`${Math.max(b.v/maxV*100,4)}%` }}/>
                          </div>
                          <span style={{ fontSize:10, color:MUT, textAlign:"center" as const }}>{b.l}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Card>

              {/* 6 · Facility Grid */}
              <Card title="Facility Overview" topColor={BLU} style={{ flex:1 }}>
                <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5 }}>
                  {sorted.map((f,fi)=>{
                    const ov=calcOverall(state[f.name]??defState());
                    const c=ov==="green"?GRN:ov==="amber"?AMB:ov==="red"?CRT:SLT;
                    const bg=ov==="green"?"#ECFDF5":ov==="amber"?"#FFFBEB":ov==="red"?"#FEF2F2":"#F8FAFC";
                    return (
                      <div key={f.name} title={f.name} style={{ width:24, height:24, borderRadius:5, background:bg, border:`1.5px solid ${c}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8.5, fontWeight:700, color:c, flexShrink:0, fontVariantNumeric:"tabular-nums" }}>
                        {fi+1}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex", gap:14, marginTop:10 }}>
                  <Dot c={GRN} l={`${counts.green} OK`}/>
                  <Dot c={AMB} l={`${counts.amber} Degraded`}/>
                  <Dot c={CRT} l={`${counts.red} Critical`}/>
                </div>
              </Card>
            </div>

            {/* INSIGHT STRIP */}
            <div style={{ background:"#0B1D3A", borderRadius:6, padding:"10px 18px", display:"flex", alignItems:"center", gap:14, borderLeft:`4px solid ${BLU}` }}>
              <span style={{ fontSize:9.5, fontWeight:700, color:BLU, letterSpacing:"1.5px", textTransform:"uppercase" as const, flexShrink:0 }}>AI Insight</span>
              <div style={{ width:1, height:16, background:"#1E3A5F", flexShrink:0 }}/>
              <span style={{ fontSize:12, color:"#CBD5E1", lineHeight:1.5 }}>{insightText}</span>
            </div>

          </div>

          {/* FOOTER */}
          <div style={{ background:NAVY, borderTop:`1px solid #1E3A5F`, padding:"8px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:10.5, color:"#475569" }}>{cfg.org} · IT Department · it.support@imarat.com.pk</div>
            {cfg.includeTs&&<div style={{ fontSize:10.5, color:"#334155" }}>Confidential · System Generated</div>}
            <div style={{ fontSize:10.5, color:"#475569" }}>imarat.com.pk · {dateStr}</div>
          </div>

        </div>
      </div>
      <div style={{ fontSize:11, color:"#64748B", marginTop:12, fontFamily:ff }}>
        Single Page · A4 {cfg.orientation==="landscape"?"Landscape":"Portrait"} · RAG Report
      </div>
    </div>
  );
}

// ─── Export Progress ──────────────────────────────────────────────────────────
const STAGES = [
  { icon: "⬡", label: "Preparing report data",          sub: "Collecting facility status from database" },
  { icon: "◈", label: "Generating visualisations",       sub: "Building KPI cards and division overview" },
  { icon: "◉", label: "Composing report sections",       sub: "Laying out header, tables and content" },
  { icon: "◎", label: "Applying branding & formatting",  sub: "Embedding logo and corporate identity" },
  { icon: "⊕", label: "Finalising & exporting PDF",      sub: "Compressing and packaging document" },
];

function ExportProgress({ stage }: { stage: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", height: "100%", padding: 48 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: D.goldL, letterSpacing: 1, marginBottom: 32, textTransform: "uppercase" as const }}>Generating Report</div>
      <div style={{ width: "100%", maxWidth: 440 }}>
        {STAGES.map((s, i) => {
          const done = i < stage;
          const active = i === stage - 1;
          const pending = i >= stage;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, opacity: pending ? 0.35 : 1, transition: "opacity 0.4s" }}>
              {/* Icon */}
              <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? D.success : active ? D.gold : D.inputBg, border: `2px solid ${done ? D.success : active ? D.gold : D.inputBdr}`, flexShrink: 0, fontSize: 15, transition: "all 0.3s" }}>
                {done ? "✓" : s.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: done ? D.txtPri : active ? D.goldL : D.txtDim }}>{s.label}</div>
                {active && <div style={{ fontSize: 10.5, color: D.txtDim, marginTop: 2 }}>{s.sub}</div>}
              </div>
              {done && <div style={{ fontSize: 10.5, color: D.success, fontWeight: 700 }}>Done</div>}
              {active && <div style={{ fontSize: 10.5, color: D.gold }}>...</div>}
            </div>
          );
        })}
        {/* Progress bar */}
        <div style={{ marginTop: 24, height: 3, background: D.inputBdr, borderRadius: 2 }}>
          <div style={{ height: 3, background: D.gold, borderRadius: 2, width: `${(stage / STAGES.length) * 100}%`, transition: "width 0.5s ease" }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: D.txtDim, textAlign: "center" as const }}>
          Step {Math.min(stage, STAGES.length)} of {STAGES.length}
        </div>
      </div>
    </div>
  );
}

function ExportSuccess({ fileName, onClose, onAgain }: { fileName: string; onClose: () => void; onAgain: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", height: "100%", padding: 48 }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "2px solid #059669", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 24 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: D.txtHero, marginBottom: 8 }}>Report Exported Successfully</div>
      <div style={{ fontSize: 12, color: D.txtSec, marginBottom: 4 }}>Your report has been downloaded</div>
      <div style={{ fontSize: 11, color: D.txtDim, background: D.inputBg, border: `1px solid ${D.inputBdr}`, borderRadius: 6, padding: "6px 16px", marginTop: 8, marginBottom: 32, fontFamily: "monospace" }}>{fileName}</div>
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={onAgain} style={{ padding: "10px 24px", background: D.goldBg, border: `1px solid ${D.gold}`, borderRadius: 7, color: D.goldL, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Export Again</button>
        <button onClick={onClose} style={{ padding: "10px 24px", background: D.blue, border: "none", borderRadius: 7, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Close</button>
      </div>
    </div>
  );
}

// ─── PDF Generator — 3-page BI dashboard ──────────────────────────────────────
async function generatePDF(
  cfg: ReportConfig,
  facilities: { name: string; cat: string }[],
  state: Record<string, FacilityState>,
  counts: Record<RAGStatus, number>,
  autoStats: { received: number; resolved: number; pending: number },
  calcOverall: (s: FacilityState) => RAGStatus,
  defaultState: () => FacilityState,
): Promise<string> {
  let logoData = "";
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = "/imarat-logo.png";
    });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const b = (id.data[i]+id.data[i+1]+id.data[i+2])/3;
      id.data[i]=id.data[i+1]=id.data[i+2]=255; id.data[i+3]=b<140?255:0;
    }
    ctx.putImageData(id, 0, 0);
    logoData = cv.toDataURL("image/png");
  } catch { /* skip */ }

  const d       = new Date();
  const dateStr = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  const timeStr = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const refNo   = `IGC-IT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
  const fileName = `Imarat_IT_RAG_${d.toISOString().slice(0,10)}.pdf`;

  const doc  = new jsPDF({ orientation: cfg.orientation, unit: "mm", format: "a4" });
  const PW   = doc.internal.pageSize.getWidth();
  const PH   = doc.internal.pageSize.getHeight();
  const PAD  = 10;
  const TW   = PW - PAD*2;
  const HDR  = 24;
  const FTR_Y= PH - 10;
  const BODY_TOP = HDR + 3;

  const filtered  = facilities.filter(f => cfg.divFilter==="all" || f.cat===cfg.divFilter);
  const ORDER: Record<string,number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted    = [...filtered].sort((a,b)=>(ORDER[a.cat]??9)-(ORDER[b.cat]??9));
  const total     = sorted.length || 1;
  const grnN      = counts.green;
  const ambN      = counts.amber;
  const redN      = counts.red;
  const healthPct = total>0 ? grnN/total : 0;

  const NAVY:RGB=[11,29,58], NAVYM:RGB=[11,29,58], GOLD:RGB=[37,99,235];
  const WHITE:RGB=[255,255,255], INK:RGB=[15,23,42], MUTED:RGB=[100,116,139];
  const BDR:RGB=[203,213,225], BGLT:RGB=[238,242,248];
  const BLUE:RGB=[37,99,235];

  const fr  = (x:number,y:number,w:number,h:number,c:RGB) => { doc.setFillColor(...c); doc.rect(x,y,w,h,"F"); };
  const frr = (x:number,y:number,w:number,h:number,r:number,c:RGB) => { doc.setFillColor(...c); doc.roundedRect(x,y,w,h,r,r,"F"); };
  const txt = (s:string,x:number,y:number,sz:number,c:RGB,b:"bold"|"normal"="normal",a:"left"|"center"|"right"="left") => {
    doc.setFont("helvetica",b); doc.setFontSize(sz); doc.setTextColor(...c); doc.text(s,x,y,{align:a});
  };
  const pbar = (x:number,y:number,w:number,h:number,pct:number,c:RGB) => {
    frr(x,y,w,h,h/2,[218,224,238] as RGB);
    if(pct>0) frr(x,y,Math.max(w*pct,h),h,h/2,c);
  };
  const drawArc = (cx:number,cy:number,ro:number,ri:number,a1d:number,a2d:number,c:RGB) => {
    const steps = Math.max(4, Math.ceil(Math.abs(a2d-a1d)/3));
    const pts:[number,number][] = [];
    for(let i=0;i<=steps;i++){const a=(a1d+i*(a2d-a1d)/steps)*Math.PI/180; pts.push([cx+ro*Math.cos(a),cy+ro*Math.sin(a)]);}
    for(let i=steps;i>=0;i--){const a=(a1d+i*(a2d-a1d)/steps)*Math.PI/180; pts.push([cx+ri*Math.cos(a),cy+ri*Math.sin(a)]);}
    const lines:[number,number][]=[];
    for(let i=1;i<pts.length;i++) lines.push([pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]]);
    doc.setFillColor(...c);
    (doc as any).lines(lines,pts[0][0],pts[0][1],[1,1],"F",true);
  };

  // Panel: white card, 3pt blue top accent bar, uppercase label title, separator
  const panel = (x:number,y:number,w:number,h:number,title:string,accent:RGB=BLUE) => {
    frr(x,y,w,h,2.5,WHITE);
    doc.setDrawColor(...BDR); doc.setLineWidth(0.25); doc.roundedRect(x,y,w,h,2.5,2.5,"S");
    // 2mm top accent stripe
    doc.setFillColor(...accent); doc.roundedRect(x,y,w,2,1,1,"F");
    // uppercase label title in blue
    doc.setFont("helvetica","bold"); doc.setFontSize(5); doc.setTextColor(...BLUE);
    doc.text(title,x+5,y+8);
    // thin rule
    doc.setDrawColor(...BDR); doc.setLineWidth(0.2); doc.line(x+4,y+10,x+w-4,y+10);
  };

  const TOTPG = 1;
  const drawShell = (pg:number, _subtitle="") => {
    // Ice-blue page background
    fr(0,0,PW,PH,BGLT);
    // Dark navy header
    fr(0,0,PW,HDR,NAVY);
    // Blue accent stripe at very top
    fr(0,0,PW,2.5,BLUE);
    // IG monogram box
    frr(PAD,5,10,13,1.5,BLUE);
    txt("IG",PAD+5,13,7,WHITE,"bold","center");
    // IMARAT wordmark
    txt("IMARAT",PAD+14,12,11,WHITE,"bold");
    txt("Group of Companies · IT Dept",PAD+14,18,3.8,MUTED);
    // Vertical divider
    doc.setDrawColor(30,58,95); doc.setLineWidth(0.4); doc.line(PAD+56,4,PAD+56,HDR-3);
    // Report title
    txt(cfg.title,PAD+60,12,9,WHITE,"bold");
    txt(`${cfg.org}  ·  ${cfg.period||dateStr}`,PAD+60,18,3.8,MUTED);
    // Center badge
    frr(PW/2-22,6.5,44,10,2,BLUE);
    txt("EXECUTIVE RAG REPORT",PW/2,13.5,4.5,WHITE,"bold","center");
    // Date right
    txt(dateStr,PW-PAD,12,8,WHITE,"bold","right");
    txt(timeStr,PW-PAD,18,3.8,MUTED,"normal","right");
    // Blue rule at bottom of header
    fr(0,HDR-1,PW,1,BLUE);
    // Dark navy footer (matches header)
    fr(0,FTR_Y,PW,PH-FTR_Y,NAVY);
    fr(0,FTR_Y,PW,0.5,BLUE);
    const fy=FTR_Y+4;
    txt(`${cfg.org}  ·  IT Department  ·  it.support@imarat.com.pk`,PAD,fy+2,4,MUTED);
    if(cfg.includeTs) txt("CONFIDENTIAL  ·  SYSTEM GENERATED",PW/2,fy+2,3.8,MUTED,"bold","center");
    txt(`Page ${pg} / ${TOTPG}  ·  imarat.com.pk`,PW-PAD,fy+2,4,MUTED,"normal","right");
  };

  const insight = (() => {
    if(redN>0&&ambN>0) return `${redN} critical + ${ambN} degraded sites — immediate IT response required across the estate.`;
    if(redN>0) return `${redN} site${redN>1?"s":""} critical — service restoration is the top operational priority.`;
    if(ambN>0) return `${ambN} site${ambN>1?"s":""} in degraded state. No critical failures detected at this time.`;
    return `All ${grnN} facilities fully operational. Internet, biometric, and print services healthy across all divisions.`;
  })();

  const CATS = ["Imarat","Projects","Graana","Agency21"] as const;

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — EXECUTIVE BI DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════
  drawShell(1,"Executive BI Dashboard");
  const BT = BODY_TOP + 1;

  // (old Row 1 variables no longer used)

  // ══ 2×3 panel grid (single page) ════════════════════════════════════════
  const PW3=(TW-4)/3, GAP3=2;
  const ROW_H=(FTR_Y-BT-12)/2, ROW2_Y=BT+ROW_H+GAP3;
  const P_X=(i:number)=>PAD+i*(PW3+GAP3);
  const hC:RGB=healthPct>=0.8?gC:healthPct>=0.5?aC:rC;

  // ── Panel 1: Health ──────────────────────────────────────────────────────
  panel(P_X(0),BT,PW3,ROW_H,"HEALTH");
  {
    const rows=[
      {l:"Overall Health",v:`${Math.round(healthPct*100)}%`,c:hC,highlight:true},
      {l:"Total Sites",v:`${sorted.length}`,c:INK,highlight:false},
      {l:"Operational",v:String(grnN),c:gC,highlight:false},
      {l:"Degraded",v:String(ambN),c:aC,highlight:false},
      {l:"Critical",v:String(redN),c:rC,highlight:false},
      {l:"Not Configured",v:String(counts.na||0),c:nC,highlight:false},
    ] as {l:string;v:string;c:RGB;highlight:boolean}[];
    const rowH=(ROW_H-15)/6;
    rows.forEach((r,ri)=>{
      const ry=BT+14+ri*rowH;
      if(r.highlight){
        frr(P_X(0)+4,ry-1,PW3-8,rowH-1,2,hC);
        txt(r.l,P_X(0)+8,ry+rowH/2+1.5,5.5,WHITE,"normal");
        txt(r.v,P_X(0)+PW3-8,ry+rowH/2+1.5,9,WHITE,"bold","right");
      } else {
        if(ri>0){ doc.setDrawColor(...BDR); doc.setLineWidth(0.15); doc.line(P_X(0)+4,ry-0.5,P_X(0)+PW3-4,ry-0.5); }
        txt(r.l,P_X(0)+6,ry+rowH/2+1.5,5.5,MUTED,"normal");
        txt(r.v,P_X(0)+PW3-6,ry+rowH/2+1.5,6.5,r.c,"bold","right");
      }
    });
  }

  // ── Panel 2: Status ───────────────────────────────────────────────────────
  panel(P_X(1),BT,PW3,ROW_H,"STATUS");
  {
    const cx=P_X(1)+PW3*0.33, cy=BT+14+(ROW_H-15)/2, RO=19, RI=12;
    const segs=[{v:grnN,c:gC},{v:ambN,c:aC},{v:redN,c:rC},{v:counts.na||0,c:nC}] as {v:number;c:RGB}[];
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    drawArc(cx,cy,RO,RI,-90,270,[228,234,246] as RGB);
    let ca=-90;
    segs.forEach(seg=>{ if(!seg.v) return; const sp=360*seg.v/tot; drawArc(cx,cy,RO,RI,ca,ca+sp,seg.c); ca+=sp; });
    doc.setFillColor(...WHITE); doc.circle(cx,cy,RI-0.5,"F");
    txt(String(sorted.length),cx,cy+1.5,10,INK,"bold","center");
    txt("sites",cx,cy+6,4.5,MUTED,"normal","center");
    const legX=P_X(1)+PW3*0.6, legY=BT+14;
    ([{l:"Operational",v:grnN,c:gC},{l:"Degraded",v:ambN,c:aC},{l:"Critical",v:redN,c:rC},{l:"Not Set",v:counts.na||0,c:nC}] as {l:string;v:number;c:RGB}[]).forEach((lk,li)=>{
      const ly=legY+li*((ROW_H-16)/4);
      doc.setFillColor(...lk.c); doc.circle(legX+2.5,ly+3,2,"F");
      txt(lk.l,legX+7,ly+4,5.5,INK);
      txt(String(lk.v),P_X(1)+PW3-5,ly+4,7,lk.c,"bold","right");
      const avail=PW3-legX+P_X(1)-14;
      const bW=avail*lk.v/tot;
      frr(legX+7,ly+6.5,avail,3.5,1.5,[228,234,246] as RGB);
      if(lk.v>0) frr(legX+7,ly+6.5,Math.max(bW,2.5),3.5,1.5,lk.c);
    });
  }

  // ── Panel 3: Division Progress ────────────────────────────────────────────
  panel(P_X(2),BT,PW3,ROW_H,"PROGRESS");
  {
    const catRowH=(ROW_H-16)/4;
    CATS.forEach((cat,ci)=>{
      const facs=sorted.filter(f=>f.cat===cat);
      const grn=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const amb=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="amber").length;
      const red=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="red").length;
      const cc=CAT_C[cat];
      const rY=BT+14+ci*catRowH;
      txt(cat,P_X(2)+6,rY+5.5,6,cc,"bold");
      txt(`${facs.length} sites`,P_X(2)+6,rY+10,4.5,MUTED);
      txt(`${Math.round(grn/Math.max(facs.length,1)*100)}%`,P_X(2)+PW3-6,rY+6,7,cc,"bold","right");
      const bX=P_X(2)+6, bW=PW3-12, bY=rY+12;
      frr(bX,bY,bW,6,2,[228,234,246] as RGB);
      let bx=bX;
      ([{v:grn,c:gC},{v:amb,c:aC},{v:red,c:rC}] as {v:number;c:RGB}[]).forEach(bk=>{
        const bw=bW*bk.v/Math.max(facs.length,1);
        if(bk.v>0){frr(bx,bY,bw,6,0,bk.c); bx+=bw;}
      });
    });
  }

  // ── Panel 4: Services ────────────────────────────────────────────────────
  panel(P_X(0),ROW2_Y,PW3,ROW_H,"SERVICES");
  {
    const svcs=[
      {lbl:"Internet Connectivity",key:"internet" as keyof FacilityState},
      {lbl:"Biometric Systems",key:"bio" as keyof FacilityState},
      {lbl:"Printing Services",key:"printing" as keyof FacilityState},
    ];
    const svcRowH=(ROW_H-16)/3;
    svcs.forEach((svc,si)=>{
      const vals=sorted.map(f=>(state[f.name]??defaultState())[svc.key] as RAGStatus);
      const sg=vals.filter(v=>v==="green").length, sa=vals.filter(v=>v==="amber").length, sr=vals.filter(v=>v==="red").length;
      const sh=vals.length>0?sg/vals.length:0;
      const shC:RGB=sh>=0.8?gC:sh>=0.5?aC:rC;
      const sY=ROW2_Y+14+si*svcRowH;
      txt(svc.lbl,P_X(0)+6,sY+5.5,5.5,INK,"bold");
      txt(`${sg} / ${vals.length}`,P_X(0)+PW3-6,sY+5.5,6.5,shC,"bold","right");
      const bX=P_X(0)+6, bW=PW3-12, bY=sY+8;
      frr(bX,bY,bW,7,2,[228,234,246] as RGB);
      let bx=bX;
      ([{v:sg,c:gC},{v:sa,c:aC},{v:sr,c:rC}] as {v:number;c:RGB}[]).forEach(bk=>{ const bw=bW*bk.v/Math.max(vals.length,1); if(bk.v>0){frr(bx,bY,bw,7,0,bk.c); bx+=bw;} });
      txt(`${Math.round(sh*100)}% availability  ·  ${sa} degraded  ·  ${sr} critical`,P_X(0)+6,sY+19,4.5,MUTED);
    });
  }

  // ── Panel 5: Support Tickets ─────────────────────────────────────────────
  panel(P_X(1),ROW2_Y,PW3,ROW_H,"SUPPORT TICKETS");
  {
    const tkData=[
      {v:autoStats.received,l:"Received",c:[59,130,246] as RGB},
      {v:autoStats.resolved,l:"Resolved",c:gC},
      {v:autoStats.pending,l:"Pending",c:aC},
    ];
    const maxV=Math.max(...tkData.map(t=>t.v),1);
    const barH=ROW_H-34, barW=(PW3-28)/3;
    tkData.forEach((tk,ti)=>{
      const bX=P_X(1)+8+ti*(barW+4);
      const filled=Math.max(barH*(tk.v/maxV),3);
      txt(String(tk.v),bX+barW/2,ROW2_Y+17,11,tk.c,"bold","center");
      frr(bX,ROW2_Y+20,barW,barH,3,[228,234,246] as RGB);
      if(tk.v>0) frr(bX,ROW2_Y+20+barH-filled,barW,filled,3,tk.c);
      txt(tk.l,bX+barW/2,ROW2_Y+ROW_H-5,5,MUTED,"normal","center");
    });
  }

  // ── Panel 6: Facility Overview (dot grid) ────────────────────────────────
  panel(P_X(2),ROW2_Y,PW3,ROW_H,"FACILITY OVERVIEW");
  {
    const COLS=6;
    const availW=PW3-14, availH=ROW_H-18;
    const dotD=Math.min(8,Math.floor(availW/COLS)-2);
    const dotGapX=availW/COLS;
    const rows2=Math.ceil(sorted.length/COLS);
    const dotGapY=Math.min(dotD+3,availH/Math.max(rows2,1));
    sorted.forEach((f,fi)=>{
      const col=fi%COLS, row=Math.floor(fi/COLS);
      const dx=P_X(2)+7+col*dotGapX+dotD/2;
      const dy=ROW2_Y+14+row*dotGapY+dotD/2;
      const ov=calcOverall(state[f.name]??defaultState());
      frr(dx-dotD/2,dy-dotD/2,dotD,dotD,1.5,ragFill(ov));
      doc.setDrawColor(...ragAccent(ov)); doc.setLineWidth(0.5); doc.roundedRect(dx-dotD/2,dy-dotD/2,dotD,dotD,1.5,1.5,"S");
      doc.setTextColor(...ragAccent(ov)); doc.setFont("helvetica","bold"); doc.setFontSize(3.5);
      doc.text(String(fi+1),dx,dy+1.2,{align:"center"});
    });
  }

  // ── Insight strip ────────────────────────────────────────────────────────
  {
    const iY=FTR_Y-12, iH=11;
    frr(PAD,iY,TW,iH,2.5,NAVY);
    // blue left border (4mm thick, full height)
    frr(PAD,iY,4,iH,1.5,BLUE);
    txt("AI INSIGHT",PAD+8,iY+4,4.5,BLUE,"bold");
    // divider dot
    doc.setFillColor(...MUTED); doc.circle(PAD+30,iY+5.5,0.8,"F");
    txt(insight,PAD+34,iY+4,4.5,[203,213,225] as RGB,"normal");
  }

  doc.save(fileName);
  return fileName;
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function ReportModal({ isOpen, onClose, facilities, state, counts, autoStats, calcOverall, defaultState }: ReportModalProps) {
  const [step, setStep]     = useState<"build"|"exporting"|"done">("build");
  const [stage, setStage]   = useState(0);
  const [fileName, setFileName] = useState("");
  const [cfg, setCfg]       = useState<ReportConfig>({
    title: "IT Facilities RAG Dashboard",
    subtitle: "Daily Operational Status Report",
    org: "Imarat Group of Companies",
    author: "IT Department",
    period: new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }),
    includeLogo: true,
    includeRef: true,
    includeTs: true,
    includeKPIs: true,
    includeDivs: true,
    includeTable: true,
    issuesOnly: false,
    divFilter: "all",
    orientation: "landscape",
  });

  const set = useCallback(<K extends keyof ReportConfig>(k: K, v: ReportConfig[K]) => {
    setCfg(prev => ({ ...prev, [k]: v }));
  }, []);

  const handleExport = useCallback(async () => {
    setStep("exporting"); setStage(0);
    const delays = [700, 900, 1100, 800, 600];
    for (let i = 0; i < delays.length; i++) {
      await new Promise(r => setTimeout(r, delays[i]));
      setStage(i + 1);
    }
    try {
      const name = await generatePDF(cfg, facilities, state, counts, autoStats, calcOverall, defaultState);
      setFileName(name);
    } catch (e) {
      console.error("PDF generation failed", e);
    }
    setStep("done");
  }, [cfg, facilities, state, counts, autoStats, calcOverall, defaultState]);

  const handleReset = useCallback(() => { setStep("build"); setStage(0); }, []);

  if (!isOpen) return null;

  const isExporting = step === "exporting";
  const isDone      = step === "done";

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !isExporting) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 9999, display: "flex", alignItems: "stretch", backdropFilter: "blur(3px)" }}
    >
      <div style={{ display: "flex", width: "100%", height: "100%", flexDirection: "column" as const }}>

        {/* ── Top header bar ── */}
        <div style={{ background: "#060E1C", borderBottom: "1px solid #1A3050", display: "flex", alignItems: "center", padding: "0 20px", height: 52, flexShrink: 0 }}>
          {/* Logo wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", letterSpacing: 3.5, fontFamily: "Georgia, serif" }}>IMARAT</div>
            <div style={{ width: 1, height: 20, background: "#1E3050" }} />
            <div style={{ fontSize: 10, color: D.txtDim, letterSpacing: 0.5 }}>Report Builder</div>
          </div>
          {/* Breadcrumb */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, paddingLeft: 20 }}>
            <span style={{ fontSize: 11, color: D.txtDim }}>Reports</span>
            <span style={{ color: D.txtDim, fontSize: 10 }}>›</span>
            <span style={{ fontSize: 11, color: D.txtSec }}>New Report</span>
            <span style={{ color: D.txtDim, fontSize: 10 }}>›</span>
            <span style={{ fontSize: 11, color: D.goldL, fontWeight: 600 }}>
              {cfg.title || "Untitled Report"}
            </span>
          </div>
          {/* Status pill */}
          {!isExporting && !isDone && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 16, background: "rgba(196,154,30,0.1)", border: "1px solid rgba(196,154,30,0.3)", borderRadius: 20, padding: "3px 12px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: D.gold }} />
              <span style={{ fontSize: 10.5, color: D.gold, fontWeight: 600 }}>Draft</span>
            </div>
          )}
          {/* Close */}
          <button
            onClick={onClose}
            disabled={isExporting}
            style={{ background: "none", border: "1px solid #1E3050", borderRadius: 6, color: D.txtSec, cursor: isExporting ? "not-allowed" : "pointer", fontSize: 17, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", opacity: isExporting ? 0.4 : 1 }}
          >×</button>
        </div>

        {/* ── Main 3-column body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* LEFT PANEL – Configuration */}
          <div style={{ width: 260, background: D.panelBg, borderRight: `1px solid ${D.panelBdr}`, display: "flex", flexDirection: "column" as const, overflowY: "auto", flexShrink: 0 }}>
            <div style={{ padding: "16px 16px 0", borderBottom: `1px solid ${D.panelBdr}`, paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.txtHero, letterSpacing: 0.4 }}>Report Configuration</div>
              <div style={{ fontSize: 10, color: D.txtDim, marginTop: 2 }}>Define what this report contains</div>
            </div>
            <div style={{ padding: "0 16px 16px", flex: 1 }}>

              <PanelSection title="Report Identity">
                <FieldRow label="Report Title">
                  <DarkInput value={cfg.title} onChange={v => set("title", v)} placeholder="e.g. IT Facilities RAG Dashboard" />
                </FieldRow>
                <FieldRow label="Subtitle">
                  <DarkInput value={cfg.subtitle} onChange={v => set("subtitle", v)} placeholder="e.g. Daily Operational Status" />
                </FieldRow>
                <FieldRow label="Organisation">
                  <DarkInput value={cfg.org} onChange={v => set("org", v)} placeholder="e.g. Imarat Group of Companies" />
                </FieldRow>
                <FieldRow label="Report Period">
                  <DarkInput value={cfg.period} onChange={v => set("period", v)} placeholder={new Date().toLocaleDateString("en-GB")} />
                </FieldRow>
              </PanelSection>

              <PanelSection title="Content Sections">
                <Toggle checked={cfg.includeKPIs}  onChange={v=>set("includeKPIs",v)}  label="Executive KPI Summary" sub="7 headline metrics across all sites" />
                <Toggle checked={cfg.includeDivs}  onChange={v=>set("includeDivs",v)}  label="Division Overview"     sub="Health score + per-division breakdown" />
                <Toggle checked={cfg.includeTable} onChange={v=>set("includeTable",v)} label="Facility Detail Table"  sub="Full site-by-site status matrix" />
                <Toggle checked={cfg.issuesOnly}   onChange={v=>set("issuesOnly",v)}   label="Issues & Notes"        sub="Flagged facilities with open issues" />
              </PanelSection>

              <PanelSection title="Data Filters">
                <FieldRow label="Division">
                  <DarkSelect
                    value={cfg.divFilter}
                    onChange={v => set("divFilter", v)}
                    options={[{v:"all",l:"All Divisions"},{v:"Imarat",l:"Imarat"},{v:"Projects",l:"Projects"},{v:"Graana",l:"Graana"},{v:"Agency21",l:"Agency21"}]}
                  />
                </FieldRow>
              </PanelSection>

              {/* Site summary */}
              <div style={{ background: D.inputBg, border: `1px solid ${D.inputBdr}`, borderRadius: 6, padding: "10px 12px", marginTop: 4 }}>
                <div style={{ fontSize: 10, color: D.txtDim, marginBottom: 6 }}>REPORT SCOPE</div>
                {[
                  { lbl: "Facilities included", val: String(facilities.filter(f => cfg.divFilter==="all"||f.cat===cfg.divFilter).length) },
                  { lbl: "Operational",          val: String(counts.green), col: "#10B981" },
                  { lbl: "Degraded",             val: String(counts.amber), col: "#F59E0B" },
                  { lbl: "Critical",             val: String(counts.red),   col: "#EF4444" },
                ].map(r => (
                  <div key={r.lbl} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginBottom: 4 }}>
                    <span style={{ color: D.txtSec }}>{r.lbl}</span>
                    <span style={{ color: r.col || D.txtPri, fontWeight: 700 }}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTRE – Preview */}
          <div style={{ flex: 1, background: D.centerBg, display: "flex", flexDirection: "column" as const, overflow: "hidden" }}>
            {/* Preview toolbar */}
            <div style={{ background: D.headerBg, borderBottom: `1px solid ${D.cBdr}`, padding: "8px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: D.cMuted, letterSpacing: 0.5 }}>LIVE PREVIEW</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: D.cMuted, background: D.cAlt, border: `1px solid ${D.cBdr}`, borderRadius: 4, padding: "3px 10px" }}>
                {cfg.orientation === "landscape" ? "A4 Landscape" : "A4 Portrait"} · 1 page
              </span>
              <span style={{ fontSize: 10.5, color: "#10B981", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 4, padding: "3px 10px", fontWeight: 600 }}>● Live</span>
            </div>

            {/* Preview scroll area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px 40px", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
              {isExporting ? (
                <ExportProgress stage={stage} />
              ) : isDone ? (
                <ExportSuccess fileName={fileName} onClose={onClose} onAgain={handleReset} />
              ) : (
                <PreviewCanvas
                  cfg={cfg}
                  facilities={facilities}
                  state={state}
                  counts={counts}
                  autoStats={autoStats}
                  calcOverall={calcOverall}
                  defaultState={defaultState}
                />
              )}
            </div>
          </div>

          {/* RIGHT PANEL – Export Settings */}
          <div style={{ width: 290, background: D.panelBg, borderLeft: `1px solid ${D.panelBdr}`, display: "flex", flexDirection: "column" as const, flexShrink: 0 }}>
            <div style={{ padding: "16px 16px 0", borderBottom: `1px solid ${D.panelBdr}`, paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.txtHero, letterSpacing: 0.4 }}>Export Settings</div>
              <div style={{ fontSize: 10, color: D.txtDim, marginTop: 2 }}>Configure output and branding</div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>

              <PanelSection title="Branding">
                <Toggle checked={cfg.includeLogo} onChange={v=>set("includeLogo",v)} label="Include Company Logo" sub="IMARAT wordmark in header" />
                <Toggle checked={true}            onChange={()=>{}}                  label="Corporate Header"     sub="Branded top bar and gold accent" />
                <Toggle checked={true}            onChange={()=>{}}                  label="Corporate Footer"     sub="Organisation info and confidentiality" />
              </PanelSection>

              <PanelSection title="Page Setup">
                <div style={{ fontSize: 10.5, color: D.txtSec, marginBottom: 6 }}>Orientation</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <OrientBtn active={cfg.orientation==="landscape"} onClick={()=>set("orientation","landscape")} icon="⬜" label="Landscape" />
                  <OrientBtn active={cfg.orientation==="portrait"}  onClick={()=>set("orientation","portrait")}  icon="▭" label="Portrait" />
                </div>
                <FieldRow label="Paper Size">
                  <DarkSelect value="a4" onChange={()=>{}} options={[{v:"a4",l:"A4 (210 × 297 mm)"},{v:"letter",l:"Letter (216 × 279 mm)"}]} />
                </FieldRow>
                <FieldRow label="Margins">
                  <DarkSelect value="normal" onChange={()=>{}} options={[{v:"normal",l:"Normal (11 mm)"},{v:"wide",l:"Wide (18 mm)"},{v:"narrow",l:"Narrow (7 mm)"}]} />
                </FieldRow>
              </PanelSection>

              <PanelSection title="Document Options">
                <Toggle checked={cfg.includeRef} onChange={v=>set("includeRef",v)} label="Reference Number" sub="Auto-generated IGC-IT-YYYYMMDD-HHMM" />
                <Toggle checked={cfg.includeTs}  onChange={v=>set("includeTs",v)}  label="Generated Timestamp"  sub="Date and time of export" />
                <Toggle checked={true}           onChange={()=>{}}                 label="Status Legend"       sub="Colour key in table header" />
              </PanelSection>

              {/* Sections summary */}
              <div style={{ background: D.inputBg, border: `1px solid ${D.inputBdr}`, borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: D.txtDim, marginBottom: 6 }}>SECTIONS INCLUDED</div>
                {[
                  { lbl:"Executive KPIs",       on:cfg.includeKPIs  },
                  { lbl:"Division Overview",     on:cfg.includeDivs  },
                  { lbl:"Facility Status Table", on:cfg.includeTable },
                  { lbl:"Issues & Notes",        on:cfg.issuesOnly   },
                ].map(s => (
                  <div key={s.lbl} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:11, color:s.on?"#10B981":"#3A5A78" }}>{s.on?"✓":"○"}</span>
                    <span style={{ fontSize:10.5, color:s.on?D.txtPri:D.txtDim }}>{s.lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* EXPORT BUTTON */}
            <div style={{ padding: 16, borderTop: `1px solid ${D.panelBdr}`, flexShrink: 0 }}>
              <button
                onClick={handleExport}
                disabled={isExporting || isDone}
                style={{
                  width: "100%", padding: "13px 0", background: isExporting||isDone ? D.inputBg : `linear-gradient(135deg, ${D.gold} 0%, ${D.goldL} 100%)`,
                  border: "none", borderRadius: 8, color: isExporting||isDone ? D.txtDim : "#0C1A2E",
                  fontSize: 13.5, fontWeight: 800, cursor: isExporting||isDone ? "not-allowed" : "pointer",
                  letterSpacing: 0.6, transition: "all 0.2s", boxShadow: isExporting||isDone ? "none" : "0 4px 18px rgba(196,154,30,0.4)",
                }}
              >
                {isExporting ? "Generating…" : isDone ? "Exported ✓" : "⬇  Export PDF Report"}
              </button>
              <div style={{ marginTop: 8, fontSize: 10, color: D.txtDim, textAlign: "center" as const }}>
                {cfg.divFilter==="all"
                  ? `${facilities.length} sites · PDF · A4 ${cfg.orientation}`
                  : `${facilities.filter(f=>f.cat===cfg.divFilter).length} sites (${cfg.divFilter}) · A4 ${cfg.orientation}`}
              </div>
            </div>
          </div>

        </div>

        {/* ── Bottom status bar ── */}
        <div style={{ background: "#06101C", borderTop: "1px solid #1A3050", padding: "6px 20px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: D.txtDim }}>
            {facilities.length} total sites · {counts.green} operational · {counts.amber} degraded · {counts.red} critical
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 10, color: D.txtDim }}>
            Imarat IT Reporting System · {new Date().toLocaleDateString("en-GB")}
          </div>
        </div>

      </div>
    </div>
  );
}
