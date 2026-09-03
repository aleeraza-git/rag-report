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
const gC: RGB=[14,160,110],  gL: RGB=[210,246,232], gD: RGB=[6,88,58];
const aC: RGB=[214,142,0],   aL: RGB=[255,238,170], aD: RGB=[100,64,0];
const rC: RGB=[208,36,50],   rL: RGB=[255,210,216], rD: RGB=[128,10,20];
const nC: RGB=[148,162,190], nL: RGB=[232,236,248], nD: RGB=[80,96,130];
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
        const w = containerRef.current.clientWidth - 48;
        setScale(Math.min(w / 930, 1));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const total = facilities.length;
  const healthPct = total > 0 ? counts.green / total : 0;
  const hCol = healthPct >= 0.8 ? "#10B981" : healthPct >= 0.5 ? "#F59E0B" : "#EF4444";
  const filtered = facilities.filter(f => cfg.divFilter === "all" || f.cat === cfg.divFilter);
  const ORDER: Record<string, number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted = [...filtered].sort((a,b) => (ORDER[a.cat]??9) - (ORDER[b.cat]??9));
  const dateStr = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  const timeStr = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

  // SVG donut helpers
  const R35 = 35, C35 = 2*Math.PI*R35;
  const R30 = 30, C30 = 2*Math.PI*R30;
  const R20 = 20, C20 = 2*Math.PI*R20;

  // Single-fill donut (for health ring)
  const Donut1 = ({ pct, color, r=35, sz=90 }: { pct: number; color: string; r?: number; sz?: number }) => {
    const circ = 2*Math.PI*r;
    return (
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="#E4EAF6" strokeWidth="11"/>
        {pct>0 && <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={`${circ*pct} ${circ*(1-pct)}`} strokeDashoffset={0}
          style={{ transform:`rotate(-90deg)`, transformOrigin:`${sz/2}px ${sz/2}px` }} strokeLinecap="butt"/>}
      </svg>
    );
  };

  // Multi-segment donut (for status distribution)
  const MultiDonut = () => {
    const segs = [{v:counts.green,c:"#059669"},{v:counts.amber,c:"#D97706"},{v:counts.red,c:"#DC2626"},{v:counts.na||0,c:"#9CA3AF"}];
    const tot = segs.reduce((s,r)=>s+r.v,0)||1;
    let cum = 0;
    return (
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={R30} fill="none" stroke="#E4EAF6" strokeWidth="11"/>
        {segs.map((seg,si) => {
          if(!seg.v) { return null; }
          const len=C30*(seg.v/tot), off=-C30*cum;
          cum+=seg.v/tot;
          return <circle key={si} cx="45" cy="45" r={R30} fill="none" stroke={seg.c} strokeWidth="11"
            strokeDasharray={`${len} ${C30-len}`} strokeDashoffset={off}
            style={{ transform:"rotate(-90deg)", transformOrigin:"45px 45px" }} strokeLinecap="butt"/>;
        })}
      </svg>
    );
  };

  // Mini service donut
  const MiniDonut = ({ pct, color }: { pct: number; color: string }) => (
    <svg width="50" height="50" viewBox="0 0 50 50">
      <circle cx="25" cy="25" r={R20} fill="none" stroke="#E4EAF6" strokeWidth="8"/>
      {pct>0 && <circle cx="25" cy="25" r={R20} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${C20*pct} ${C20*(1-pct)}`} strokeDashoffset={0}
        style={{ transform:"rotate(-90deg)", transformOrigin:"25px 25px" }} strokeLinecap="butt"/>}
    </svg>
  );

  // Panel widget wrapper
  const Panel = ({ title, accent="#C49A1E", children, style }: { title:string; accent?:string; children:React.ReactNode; style?:React.CSSProperties }) => (
    <div style={{ background:"#fff", borderRadius:3, overflow:"hidden", border:"1px solid #DDE4EF", display:"flex", flexDirection:"column" as const, ...style }}>
      <div style={{ background:"#060E1C", padding:"4px 10px", borderLeft:`3px solid ${accent}` }}>
        <span style={{ color:accent, fontSize:7.5, fontWeight:800, letterSpacing:0.8 }}>{title}</span>
      </div>
      <div style={{ flex:1, padding:"8px 10px", overflow:"hidden" }}>{children}</div>
    </div>
  );

  return (
    <div ref={containerRef} style={{ width:"100%", display:"flex", flexDirection:"column" as const, alignItems:"center" }}>
      <div style={{ transform:`scale(${scale})`, transformOrigin:"top center", width:930, transition:"transform 0.15s" }}>
        <div style={{ width:930, background:"#EEF3FB", boxShadow:"0 4px 32px rgba(0,0,0,0.22)", borderRadius:3, overflow:"hidden", fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif" }}>

          {/* HEADER */}
          <div style={{ background:"#0C1A2E", padding:"12px 24px", display:"flex", alignItems:"center", borderTop:"3px solid #C49A1E" }}>
            <div style={{ display:"flex", flexDirection:"column" as const, minWidth:150 }}>
              {cfg.includeLogo && <div style={{ fontSize:20, fontWeight:900, color:"#fff", letterSpacing:4, fontFamily:"Georgia,serif" }}>IMARAT</div>}
              <div style={{ fontSize:7.5, color:"#C49A1E", fontWeight:700, letterSpacing:1.5, marginTop:2 }}>GROUP OF COMPANIES</div>
              <div style={{ fontSize:7, color:"#4A6A98" }}>IT Department</div>
            </div>
            <div style={{ width:1, background:"#1E3050", alignSelf:"stretch", margin:"0 16px" }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:800, color:"#fff" }}>{cfg.title}</div>
              <div style={{ fontSize:8, color:"#C49A1E", fontWeight:600, marginTop:1 }}>Executive IT Operations Dashboard · Page 1 of 3</div>
              <div style={{ fontSize:7, color:"#4A6A98", marginTop:1 }}>{cfg.org} · {cfg.period||dateStr}</div>
            </div>
            <div style={{ textAlign:"right" as const }}>
              <div style={{ fontSize:12, color:"#C49A1E", fontWeight:700 }}>{dateStr}</div>
              <div style={{ fontSize:7.5, color:"#4A6A98", marginTop:2 }}>{timeStr}</div>
            </div>
          </div>

          {/* DASHBOARD GRID */}
          <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column" as const, gap:7 }}>

            {/* ROW 1 — 3 panels */}
            <div style={{ display:"flex", gap:7, height:148 }}>

              {/* A: Health Ring */}
              <Panel title="OVERALL IT HEALTH" accent="#C49A1E" style={{ width:192 }}>
                <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center" }}>
                  <div style={{ position:"relative" as const, width:90, height:90 }}>
                    <Donut1 pct={healthPct} color={hCol} r={R35} sz={90}/>
                    <div style={{ position:"absolute" as const, inset:0, display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center" }}>
                      <div style={{ fontSize:20, fontWeight:800, color:hCol, lineHeight:1 }}>{Math.round(healthPct*100)}%</div>
                      <div style={{ fontSize:6.5, color:"#8A9AB8", fontWeight:700 }}>HEALTH</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, fontWeight:800, color:hCol, marginTop:2 }}>{counts.green}/{total}</div>
                  <div style={{ fontSize:6.5, color:"#8A9AB8", fontWeight:600 }}>SITES OPERATIONAL</div>
                </div>
              </Panel>

              {/* B: Status Donut */}
              <Panel title="STATUS DISTRIBUTION" accent="#C49A1E" style={{ width:218 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ position:"relative" as const, flexShrink:0 }}>
                    <MultiDonut/>
                    <div style={{ position:"absolute" as const, inset:0, display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center" }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#0C1A2E" }}>{total}</div>
                      <div style={{ fontSize:5.5, color:"#8A9AB8" }}>TOTAL</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column" as const, gap:5 }}>
                    {[{v:counts.green,l:"Operational",c:"#059669"},{v:counts.amber,l:"Degraded",c:"#D97706"},{v:counts.red,l:"Critical",c:"#DC2626"},{v:counts.na||0,l:"N/A",c:"#9CA3AF"}].map(s=>(
                      <div key={s.l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <div style={{ width:18, height:7, borderRadius:2, background:s.c, flexShrink:0 }}/>
                        <span style={{ fontSize:7, color:"#1A2540", flex:1 }}>{s.l}</span>
                        <span style={{ fontSize:8, fontWeight:800, color:s.c }}>{s.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              {/* C: Division Performance */}
              <Panel title="DIVISION PERFORMANCE" accent="#2C5EE8" style={{ flex:1 }}>
                <div style={{ display:"flex", flexDirection:"column" as const, gap:6, marginTop:2 }}>
                  {(["Imarat","Projects","Graana","Agency21"] as const).map(cat=>{
                    const facs=facilities.filter(f=>f.cat===cat);
                    const grn=facs.filter(f=>calcOverall(state[f.name]??defState())==="green").length;
                    const hlth=facs.length>0?grn/facs.length:0;
                    const cc=CAT_HEX[cat];
                    const maxF=Math.max(...(["Imarat","Projects","Graana","Agency21"] as const).map(c=>facilities.filter(f=>f.cat===c).length),1);
                    return (
                      <div key={cat} style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:52, fontSize:8, fontWeight:800, color:cc, flexShrink:0 }}>{cat}</div>
                        <div style={{ flex:1, height:14, background:"#E8EDF6", borderRadius:3, position:"relative" as const, overflow:"hidden" }}>
                          <div style={{ position:"absolute" as const, left:0, top:0, bottom:0, width:`${(facs.length/maxF)*100}%`, background:`${cc}33` }}/>
                          <div style={{ position:"absolute" as const, left:0, top:0, bottom:0, width:`${hlth*100}%`, background:cc, borderRadius:3 }}/>
                          {hlth>0.12&&<div style={{ position:"absolute" as const, left:5, top:0, bottom:0, display:"flex", alignItems:"center", fontSize:6.5, fontWeight:800, color:"#fff" }}>{Math.round(hlth*100)}%</div>}
                        </div>
                        <div style={{ width:22, fontSize:9, fontWeight:800, color:cc, textAlign:"right" as const, flexShrink:0 }}>{facs.length}</div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>

            {/* ROW 2 — Facility Matrix + Service Intelligence */}
            <div style={{ display:"flex", gap:7 }}>

              {/* D: Facility Health Matrix */}
              <Panel title={`FACILITY HEALTH MATRIX — ALL ${sorted.length} FACILITIES`} accent="#0E9870" style={{ flex:1 }}>
                {/* Col headers */}
                <div style={{ display:"flex", alignItems:"center", background:"#0C1728", borderRadius:2, padding:"2px 4px", marginBottom:1 }}>
                  <div style={{ width:13, fontSize:5.5, color:"#5A7AA8", fontWeight:700, textAlign:"center" as const }}>#</div>
                  <div style={{ flex:1, fontSize:5.5, color:"#8A9AB8", fontWeight:700, paddingLeft:3 }}>FACILITY</div>
                  {["NET","BIO","PRT"].map(h=><div key={h} style={{ width:22, fontSize:5.5, color:"#8A9AB8", fontWeight:700, textAlign:"center" as const }}>{h}</div>)}
                  <div style={{ width:52, fontSize:5.5, color:"#8A9AB8", fontWeight:700, textAlign:"center" as const }}>PERFORMANCE</div>
                  <div style={{ width:52, fontSize:5.5, color:"#8A9AB8", fontWeight:700, textAlign:"center" as const }}>STATUS</div>
                </div>
                {/* Facility rows */}
                {sorted.map((f,fi)=>{
                  const sv=state[f.name]??defState();
                  const ov=calcOverall(sv);
                  const bc=ov==="green"?"#059669":ov==="amber"?"#D97706":ov==="red"?"#DC2626":"#9CA3AF";
                  const bbg=ov==="green"?"#ECFDF5":ov==="amber"?"#FFFBEB":ov==="red"?"#FEF2F2":"#F4F7FC";
                  const score=ov==="green"?1:ov==="amber"?0.62:ov==="red"?0.28:0.08;
                  const catBdr=fi>0&&sorted[fi-1].cat!==f.cat?`1.5px solid ${CAT_HEX[f.cat]}`:undefined;
                  return (
                    <div key={f.name} style={{ display:"flex", alignItems:"center", padding:"1.2px 4px 1.2px 0", background:fi%2===0?"#fff":"#F6F9FF", borderTop:catBdr }}>
                      <div style={{ width:3, alignSelf:"stretch", background:CAT_HEX[f.cat], flexShrink:0, borderRadius:1, marginRight:3 }}/>
                      <div style={{ width:12, fontSize:5.5, color:"#C0CAD8", fontWeight:700, textAlign:"center" as const, flexShrink:0 }}>{fi+1}</div>
                      <div style={{ flex:1, fontSize:6.5, color:"#0C1A2E", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, paddingLeft:2 }}>{f.name}</div>
                      {([sv.internet,sv.bio,sv.printing] as RAGStatus[]).map((st,si)=>{
                        const dc=st==="green"?"#059669":st==="amber"?"#D97706":st==="red"?"#DC2626":"#9CA3AF";
                        return <div key={si} style={{ width:22, display:"flex", justifyContent:"center", flexShrink:0 }}><div style={{ width:8, height:8, borderRadius:"50%", background:dc }}/></div>;
                      })}
                      <div style={{ width:52, flexShrink:0, padding:"0 4px" }}>
                        <div style={{ height:6, background:"#EEF2F8", borderRadius:3, position:"relative" as const, overflow:"hidden" }}>
                          <div style={{ position:"absolute" as const, left:0, top:0, height:6, width:`${score*100}%`, background:bc, borderRadius:3 }}/>
                        </div>
                      </div>
                      <div style={{ width:52, flexShrink:0, textAlign:"center" as const }}>
                        <span style={{ fontSize:5.5, fontWeight:700, color:bc, background:bbg, padding:"1px 5px", borderRadius:6 }}>{ragLabel(ov)}</span>
                      </div>
                    </div>
                  );
                })}
              </Panel>

              {/* E: Service Intelligence + Tickets */}
              <div style={{ width:256, display:"flex", flexDirection:"column" as const, gap:7 }}>
                <Panel title="SERVICE INTELLIGENCE" accent="#2C5EE8" style={{ flex:1 }}>
                  <div style={{ display:"flex", flexDirection:"column" as const, gap:7 }}>
                    {(["internet","bio","printing"] as const).map((key,ki)=>{
                      const lbl=["INTERNET","BIOMETRIC","PRINTING"][ki];
                      const vals=sorted.map(f=>(state[f.name]??defState())[key]);
                      const sg=vals.filter(v=>v==="green").length;
                      const sh=vals.length>0?sg/vals.length:0;
                      const shC=sh>=0.8?"#059669":sh>=0.5?"#D97706":"#DC2626";
                      return (
                        <div key={key} style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ position:"relative" as const, flexShrink:0 }}>
                            <MiniDonut pct={sh} color={shC}/>
                            <div style={{ position:"absolute" as const, inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <span style={{ fontSize:9, fontWeight:800, color:shC }}>{Math.round(sh*100)}</span>
                            </div>
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:8, fontWeight:800, color:"#0C1A2E" }}>{lbl}</div>
                            <div style={{ height:5, background:"#EEF2F8", borderRadius:2, margin:"3px 0", position:"relative" as const, overflow:"hidden" }}>
                              <div style={{ position:"absolute" as const, left:0, top:0, height:5, width:`${sh*100}%`, background:shC }}/>
                            </div>
                            <div style={{ fontSize:6, color:"#8A9AB8" }}>{sg}/{vals.length} sites active</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
                <Panel title="SUPPORT TICKETS" accent="#C49A1E">
                  <div style={{ display:"flex", justifyContent:"space-around", paddingTop:4 }}>
                    {[{v:autoStats.received,l:"Received",c:"#2C5EE8"},{v:autoStats.resolved,l:"Resolved",c:"#059669"},{v:autoStats.pending,l:"Pending",c:"#D97706"}].map(tk=>(
                      <div key={tk.l} style={{ textAlign:"center" as const }}>
                        <div style={{ fontSize:20, fontWeight:800, color:tk.c, lineHeight:1 }}>{tk.v}</div>
                        <div style={{ fontSize:7, color:"#8A9AB8", marginTop:3, fontWeight:600 }}>{tk.l.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>

            {/* INSIGHT STRIP */}
            <div style={{ background:"#0B1D3E", borderRadius:3, padding:"6px 12px", borderLeft:"3px solid #C49A1E", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:8, fontWeight:800, color:"#C49A1E", flexShrink:0 }}>▸ INSIGHT</span>
              <span style={{ fontSize:8, color:"#E0E8F8" }}>
                {counts.red>0&&counts.amber>0?`${counts.red} critical and ${counts.amber} degraded sites require immediate attention.`:counts.red>0?`${counts.red} site${counts.red>1?"s":""} critical — service restoration is the top priority.`:counts.amber>0?`${counts.amber} site${counts.amber>1?"s":""} operating in a degraded state.`:`All ${counts.green} monitored facilities are fully operational across all divisions and services.`}
              </span>
            </div>

          </div>

          {/* FOOTER */}
          <div style={{ background:"#0C1A2E", padding:"7px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:"1px solid #C49A1E" }}>
            <div>
              <div style={{ fontSize:7.5, fontWeight:700, color:"#C49A1E" }}>{cfg.org}</div>
              <div style={{ fontSize:6.5, color:"#3A5A88" }}>IT Department · it.support@imarat.com.pk</div>
            </div>
            {cfg.includeTs && <div style={{ fontSize:7, color:"#8A9AB8", fontWeight:700 }}>SYSTEM GENERATED · Page 1 of 3</div>}
            <div style={{ textAlign:"right" as const }}>
              <div style={{ fontSize:7.5, color:"#C49A1E" }}>{new Date().toLocaleDateString("en-GB")}</div>
              <div style={{ fontSize:6.5, color:"#3A5A88" }}>imarat.com.pk</div>
            </div>
          </div>

        </div>
      </div>
      <div style={{ fontSize:11, color:"#8A9AB8", marginTop:12, fontStyle:"italic" }}>
        Page 1 of 3 · Executive BI Dashboard · {cfg.orientation==="landscape"?"A4 Landscape":"A4 Portrait"}
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

  const NAVY:RGB=[6,14,28], NAVYM:RGB=[12,24,50], GOLD:RGB=[196,154,30];
  const WHITE:RGB=[255,255,255], INK:RGB=[18,28,54], MUTED:RGB=[100,116,150];
  const BDR:RGB=[218,226,240], BGLT:RGB=[246,249,254];

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

  // Panel: dark title bar + white content area
  const panel = (x:number,y:number,w:number,h:number,title:string,accent:RGB=GOLD) => {
    frr(x,y,w,h,2,WHITE);
    doc.setDrawColor(...BDR); doc.setLineWidth(0.2); doc.roundedRect(x,y,w,h,2,2,"S");
    fr(x,y,w,6.5,NAVY);
    frr(x,y,2.5,6.5,0,accent);
    txt(title,x+5,y+4.5,4,GOLD,"bold");
  };

  const TOTPG = 3;
  const drawShell = (pg:number, subtitle="") => {
    fr(0,0,PW,PH,BGLT);
    fr(0,0,PW,HDR,NAVY);
    fr(0,0,PW,1.8,GOLD);
    if(cfg.includeLogo&&logoData) doc.addImage(logoData,"PNG",PAD,4,32,11);
    else txt("IMARAT",PAD,13,12,WHITE,"bold");
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.4);
    doc.line(PAD+38,3,PAD+38,20);
    txt(cfg.title,PAD+42,10,9,WHITE,"bold");
    txt(subtitle||cfg.subtitle,PAD+42,16,4.5,GOLD,"bold");
    txt(`${cfg.org}  ·  ${cfg.period||dateStr}`,PAD+42,20.5,3.5,MUTED);
    txt(dateStr,PW-PAD,10,9,GOLD,"bold","right");
    txt(timeStr,PW-PAD,16,4.5,MUTED,"normal","right");
    if(cfg.includeRef) txt(`Ref: ${refNo}`,PW-PAD,21,3.2,[60,90,135] as RGB,"normal","right");
    fr(0,FTR_Y,PW,PH-FTR_Y,NAVY);
    fr(0,FTR_Y,PW,0.5,GOLD);
    const fy=FTR_Y+4;
    txt(cfg.org,PAD,fy,4.5,GOLD,"bold");
    txt("IT Department  ·  it.support@imarat.com.pk",PAD,fy+3.5,3.2,MUTED);
    if(cfg.includeTs){txt("SYSTEM GENERATED",PW/2,fy,4.5,WHITE,"bold","center"); txt(`Ref: ${refNo}`,PW/2,fy+3.5,3.2,MUTED,"normal","center");}
    txt(`Page ${pg} of ${TOTPG}`,PW-PAD,fy,4.5,GOLD,"bold","right");
    txt(`${sorted.length} facilities`,PW-PAD,fy+3.5,3.2,MUTED,"normal","right");
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

  // Row 1 layout: Panel A (health ring) w=64 | Panel B (status donut) w=74 | Panel C (division bars) flex
  const R1H = 66, R1Y = BT;
  const PA_W=63, PB_W=73, PC_W=TW-PA_W-PB_W-4;
  const PA_X=PAD, PB_X=PAD+PA_W+2, PC_X=PAD+PA_W+PB_W+4;

  // ── Panel A: Overall Health Ring ─────────────────────────────────────────
  panel(PA_X,R1Y,PA_W,R1H,"OVERALL IT HEALTH");
  {
    const cx=PA_X+PA_W/2, cy=R1Y+38, RO=18, RI=12;
    const hC:RGB = healthPct>=0.8?gC:healthPct>=0.5?aC:rC;
    drawArc(cx,cy,RO,RI,-90,270,[228,234,246] as RGB);
    if(healthPct>0) drawArc(cx,cy,RO,RI,-90,-90+360*healthPct,hC);
    doc.setFillColor(...WHITE); doc.circle(cx,cy,RI-0.3,"F");
    txt(`${Math.round(healthPct*100)}%`,cx,cy+2.5,10,hC,"bold","center");
    txt("HEALTH",cx,cy+7,3.5,MUTED,"bold","center");
    // stat strip below ring
    const stY=R1Y+R1H-14;
    ([{v:grnN,l:"OK",c:gC,bg:gL},{v:ambN,l:"DEG",c:aC,bg:aL},{v:redN,l:"CRIT",c:rC,bg:rL}] as {v:number;l:string;c:RGB;bg:RGB}[]).forEach((st,si)=>{
      const sx=PA_X+4+si*19;
      frr(sx,stY,17,11,1.5,st.bg);
      txt(String(st.v),sx+8.5,stY+7,8,st.c,"bold","center");
      txt(st.l,sx+8.5,stY+11.5,3,MUTED,"bold","center");
    });
    txt(`${sorted.length} SITES`,cx,R1Y+11.5,3.5,MUTED,"bold","center");
  }

  // ── Panel B: Status Distribution Donut ──────────────────────────────────
  panel(PB_X,R1Y,PB_W,R1H,"STATUS DISTRIBUTION");
  {
    const cx=PB_X+30, cy=R1Y+37, RO=18, RI=12;
    const segs=[
      {v:grnN,c:gC},{v:ambN,c:aC},{v:redN,c:rC},{v:counts.na||0,c:nC}
    ] as {v:number;c:RGB}[];
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    drawArc(cx,cy,RO,RI,-90,270,[228,234,246] as RGB);
    let cumAngle=-90;
    segs.forEach(seg=>{
      if(!seg.v) return;
      const span=360*seg.v/tot;
      drawArc(cx,cy,RO,RI,cumAngle,cumAngle+span,seg.c);
      cumAngle+=span;
    });
    doc.setFillColor(...WHITE); doc.circle(cx,cy,RI-0.3,"F");
    txt(String(grnN+ambN+redN),cx,cy+2,8,INK,"bold","center");
    txt("TOTAL",cx,cy+6.5,3.5,MUTED,"bold","center");
    // legend
    const legX=PB_X+42, legY=R1Y+12;
    ([{l:"Operational",v:grnN,c:gC},{l:"Degraded",v:ambN,c:aC},{l:"Critical",v:redN,c:rC},{l:"Not Set",v:counts.na||0,c:nC}] as {l:string;v:number;c:RGB}[]).forEach((lk,li)=>{
      const ly=legY+li*10;
      doc.setFillColor(...lk.c); doc.circle(legX+2,ly,2.2,"F");
      txt(lk.l,legX+6,ly+1.2,3.8,INK);
      txt(String(lk.v),PB_X+PB_W-3,ly+1.2,4,lk.c,"bold","right");
    });
    // pct bar across bottom
    const barX=PB_X+4, barW=PB_W-8, barY=R1Y+R1H-9;
    let bx=barX;
    segs.forEach(seg=>{
      const bw=(barW*seg.v/tot);
      if(bw>0){ frr(bx,barY,bw,4.5,0,seg.c); bx+=bw; }
    });
    doc.setDrawColor(...BDR); doc.setLineWidth(0.15); doc.roundedRect(barX,barY,barW,4.5,0,0,"S");
  }

  // ── Panel C: Division Performance Bars ──────────────────────────────────
  panel(PC_X,R1Y,PC_W,R1H,"DIVISION PERFORMANCE");
  {
    const maxFacs=Math.max(...CATS.map(c=>sorted.filter(f=>f.cat===c).length),1);
    CATS.forEach((cat,ci)=>{
      const facs=sorted.filter(f=>f.cat===cat);
      const grn=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const hlth=facs.length>0?grn/facs.length:0;
      const cc=CAT_C[cat];
      const barY=R1Y+9+ci*13;
      txt(cat,PC_X+4,barY+6,4,cc,"bold");
      const barX=PC_X+30, barW=PC_W-44;
      frr(barX,barY+1,barW,6,3,[228,234,246] as RGB);
      if(hlth>0) frr(barX,barY+1,Math.max(barW*hlth,4),6,3,cc);
      txt(`${Math.round(hlth*100)}%`,PC_X+PC_W-4,barY+6.5,4.5,cc,"bold","right");
      txt(`${facs.length}`,barX-6,barY+6.5,3.8,MUTED,"normal","center");
    });
    // tickets strip
    const tkY=R1Y+R1H-11;
    doc.setDrawColor(...BDR); doc.setLineWidth(0.15); doc.line(PC_X+3,tkY-1,PC_X+PC_W-3,tkY-1);
    txt("TICKETS",PC_X+4,tkY+3.5,3.5,MUTED,"bold");
    ([{v:autoStats.received,l:"Received"},{v:autoStats.resolved,l:"Resolved"},{v:autoStats.pending,l:"Pending"}]).forEach((tk,ti)=>{
      const tx=PC_X+PC_W-54+ti*18;
      frr(tx,tkY-0.5,16,9,1.5,ti===2?aL:gL);
      txt(String(tk.v),tx+8,tkY+5.5,6,ti===2?aC:gC,"bold","center");
    });
  }

  // Row 2 layout: Panel D (facility matrix) flex | Panel E (service intel) w=78
  const R2Y = R1Y + R1H + 3;
  const PE_W=78, PD_W=TW-PE_W-2;
  const PD_X=PAD, PE_X=PAD+PD_W+2;
  const R2H = FTR_Y - R2Y - 14;

  // ── Panel D: Facility Health Matrix ─────────────────────────────────────
  panel(PD_X,R2Y,PD_W,R2H,"FACILITY HEALTH MATRIX");
  {
    const rowH = Math.min(6, (R2H-8)/sorted.length);
    const dotSz=1.5;
    // column header
    const hdrY=R2Y+8.5;
    txt("FACILITY",PD_X+14,hdrY,3,MUTED,"bold");
    txt("NET",PD_X+PD_W-47,hdrY,3,MUTED,"bold","center");
    txt("BIO",PD_X+PD_W-37,hdrY,3,MUTED,"bold","center");
    txt("PRT",PD_X+PD_W-27,hdrY,3,MUTED,"bold","center");
    txt("HEALTH",PD_X+PD_W-15,hdrY,3,MUTED,"bold","center");
    txt("STATUS",PD_X+PD_W-3,hdrY,3,MUTED,"bold","right");
    sorted.forEach((f,fi)=>{
      const sv=state[f.name]??defaultState();
      const ov=calcOverall(sv);
      const ry=R2Y+12+fi*rowH;
      fr(PD_X,ry,PD_W,rowH,fi%2===0?WHITE:[244,247,252] as RGB);
      // div stripe
      fr(PD_X,ry,2,rowH,CAT_C[f.cat]??NAVY);
      // rank
      txt(String(fi+1),PD_X+6,ry+rowH*0.72,3,MUTED,"normal","center");
      // name
      const nm=f.name.length>22?f.name.slice(0,20)+"…":f.name;
      txt(nm,PD_X+12,ry+rowH*0.72,3.5,INK,"bold");
      // service dots
      ([sv.internet,sv.bio,sv.printing] as RAGStatus[]).forEach((st,si)=>{
        const dx=PD_X+PD_W-47+si*10;
        doc.setFillColor(...ragAccent(st)); doc.circle(dx,ry+rowH/2,dotSz,"F");
      });
      // mini health bar
      const score=ov==="green"?1:ov==="amber"?0.6:ov==="red"?0.25:0.05;
      pbar(PD_X+PD_W-24,ry+rowH/2-1.5,18,3,score,ragAccent(ov));
      // status badge
      frr(PD_X+PD_W-5,ry+rowH/2-2,4,4,2,ragAccent(ov));
    });
  }

  // ── Panel E: Service Intelligence + Tickets ──────────────────────────────
  panel(PE_X,R2Y,PE_W,R2H,"SERVICE INTELLIGENCE");
  {
    const svcDefs=[
      {lbl:"INTERNET",key:"internet" as keyof FacilityState,c:gC},
      {lbl:"BIOMETRIC",key:"bio" as keyof FacilityState,c:[44,94,232] as RGB},
      {lbl:"PRINTING",key:"printing" as keyof FacilityState,c:[110,40,210] as RGB},
    ];
    const svcH = (R2H-24)/3;
    svcDefs.forEach((svc,si)=>{
      const vals=sorted.map(f=>(state[f.name]??defaultState())[svc.key] as RAGStatus);
      const sg=vals.filter(v=>v==="green").length;
      const sa=vals.filter(v=>v==="amber").length;
      const sr=vals.filter(v=>v==="red").length;
      const sh=vals.length>0?sg/vals.length:0;
      const shC:RGB=sh>=0.8?gC:sh>=0.5?aC:rC;
      const sy=R2Y+8+si*(svcH+2);
      frr(PE_X+3,sy,PE_W-6,svcH,1.5,BGLT);
      // donut
      const cx=PE_X+16, cy=sy+svcH/2, RO=8, RI=5;
      drawArc(cx,cy,RO,RI,-90,270,[218,226,240] as RGB);
      if(sh>0) drawArc(cx,cy,RO,RI,-90,-90+360*sh,shC);
      doc.setFillColor(...[246,249,254] as RGB); doc.circle(cx,cy,RI-0.2,"F");
      txt(`${Math.round(sh*100)}`,cx,cy+1.5,4.5,shC,"bold","center");
      // label + bars
      txt(svc.lbl,PE_X+27,sy+5,4,MUTED,"bold");
      txt(`${sg}/${vals.length}`,PE_X+PE_W-5,sy+5,4,shC,"bold","right");
      const bY=sy+8;
      ([{v:sg,c:gC,l:"OK"},{v:sa,c:aC,l:"DEG"},{v:sr,c:rC,l:"CRIT"}] as {v:number;c:RGB;l:string}[]).forEach((bk,bi)=>{
        const bW=(PE_W-36)*bk.v/(vals.length||1);
        const bX=PE_X+27+bi*(PE_W-36)/3;
        frr(bX,bY,PE_W-36-2,4,2,[228,234,246] as RGB);
        if(bk.v>0) frr(bX,bY,Math.max(bW,2),4,2,bk.c);
        txt(bk.l,bX+1,bY+3,2.8,MUTED);
      });
    });

    // Tickets mini panel
    const tkY=R2Y+R2H-22;
    doc.setDrawColor(...BDR); doc.setLineWidth(0.15); doc.line(PE_X+3,tkY,PE_X+PE_W-3,tkY);
    txt("SUPPORT TICKETS",PE_X+PE_W/2,tkY+4.5,4,MUTED,"bold","center");
    ([{v:autoStats.received,l:"Received",c:[44,94,232] as RGB},{v:autoStats.resolved,l:"Resolved",c:gC},{v:autoStats.pending,l:"Pending",c:aC}] as {v:number;l:string;c:RGB}[]).forEach((tk,ti)=>{
      const tx=PE_X+12+ti*22;
      txt(String(tk.v),tx,tkY+13,11,tk.c,"bold","center");
      txt(tk.l,tx,tkY+17.5,3.2,MUTED,"normal","center");
    });
  }

  // ── Insight strip ────────────────────────────────────────────────────────
  {
    const iY=FTR_Y-12;
    fr(0,iY,PW,12,NAVYM);
    fr(0,iY,3,12,GOLD);
    txt("OPERATIONAL INSIGHT",PAD+6,iY+4.5,4.5,GOLD,"bold");
    txt(insight,PAD+54,iY+4.5,4.5,WHITE,"normal");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — FACILITY INTELLIGENCE
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawShell(2,"Facility Intelligence");
  const D2Y=BODY_TOP;

  // Full-width heatmap panel
  const HM_H = Math.min(FTR_Y - D2Y - 55, sorted.length * 5.5 + 14);
  panel(PAD,D2Y,TW,HM_H,"FACILITY × SERVICE HEALTH MATRIX");
  {
    const rowH=Math.min(5.5,(HM_H-11)/sorted.length);
    const colW=(TW-80)/3;
    // header row
    const hY=D2Y+9;
    txt("FACILITY",PAD+14,hY,3.5,MUTED,"bold");
    txt("DIV",PAD+64,hY,3.5,MUTED,"bold","center");
    (["INTERNET","BIOMETRIC","PRINTING"] as const).forEach((lbl,li)=>{
      const cx2=PAD+78+li*colW+colW/2;
      txt(lbl,cx2,hY,3.5,MUTED,"bold","center");
    });
    txt("OVERALL",PAD+TW-3,hY,3.5,MUTED,"bold","right");

    sorted.forEach((f,fi)=>{
      const sv=state[f.name]??defaultState();
      const ov=calcOverall(sv);
      const ry=D2Y+12+fi*rowH;
      fr(PAD,ry,TW,rowH,fi%2===0?WHITE:[244,247,252] as RGB);
      fr(PAD,ry,2,rowH,CAT_C[f.cat]??NAVY);
      txt(String(fi+1),PAD+6,ry+rowH*0.72,3,MUTED,"normal","center");
      txt(f.name.length>24?f.name.slice(0,22)+"…":f.name,PAD+12,ry+rowH*0.72,3.8,INK,"bold");
      frr(PAD+62,ry+0.5,14,rowH-1,1,CAT_BG[f.cat]??BGLT);
      txt(f.cat.slice(0,7),PAD+69,ry+rowH*0.72,3.2,CAT_C[f.cat]??NAVY,"bold","center");
      ([sv.internet,sv.bio,sv.printing] as RAGStatus[]).forEach((st,si)=>{
        const cx2=PAD+78+si*colW;
        const cellC=st==="green"?gL:st==="amber"?aL:st==="red"?rL:nL;
        const txtC=ragText(st);
        frr(cx2+1,ry+0.5,colW-2,rowH-1,1,cellC);
        txt(ragLabel(st),cx2+colW/2,ry+rowH*0.72,3.2,txtC,"bold","center");
      });
      frr(PAD+TW-22,ry+0.5,20,rowH-1,1,ragFill(ov));
      txt(ragLabel(ov),PAD+TW-12,ry+rowH*0.72,3.2,ragText(ov),"bold","center");
    });
  }

  // Division comparison + coverage below heatmap
  const D2B = D2Y + HM_H + 3;
  const DIV_H = FTR_Y - D2B - 13;
  const DIV_W = (TW-2)/2;

  // Division Comparison bars
  panel(PAD,D2B,DIV_W,DIV_H,"DIVISION COMPARISON");
  {
    const maxFacs=Math.max(...CATS.map(c=>sorted.filter(f=>f.cat===c).length),1);
    CATS.forEach((cat,ci)=>{
      const facs=sorted.filter(f=>f.cat===cat);
      const grn=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const amb=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="amber").length;
      const red=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="red").length;
      const cc=CAT_C[cat];
      const rY=D2B+9+ci*((DIV_H-11)/4);
      frr(PAD+3,rY,DIV_W-6,(DIV_H-11)/4-2,1.5,CAT_BG[cat]);
      frr(PAD+3,rY,3,(DIV_H-11)/4-2,0,cc);
      txt(cat,PAD+9,rY+5,5,cc,"bold");
      txt(`${facs.length} sites`,PAD+9,rY+9.5,3.5,MUTED);
      // stacked bar
      const barX=PAD+DIV_W/2, barW=DIV_W/2-8, barY=rY+3, barH=5;
      const tot=facs.length||1;
      let bx=barX;
      ([{v:grn,c:gC},{v:amb,c:aC},{v:red,c:rC}] as {v:number;c:RGB}[]).forEach(bk=>{
        const bw=barW*bk.v/tot;
        if(bk.v>0){frr(bx,barY,bw,barH,0,bk.c); bx+=bw;}
      });
      doc.setDrawColor(...BDR); doc.setLineWidth(0.15); doc.rect(barX,barY,barW,barH,"S");
      txt(`${Math.round(grn/tot*100)}%`,PAD+DIV_W-4,rY+6,5,cc,"bold","right");
    });
  }

  // Operational Coverage dots
  panel(PAD+DIV_W+2,D2B,DIV_W,DIV_H,"OPERATIONAL COVERAGE");
  {
    const ox=PAD+DIV_W+2;
    const DCOLS=6, DROWS=Math.ceil(sorted.length/DCOLS);
    const dotSz=Math.min(5,(DIV_H-14)/(DROWS*2));
    const gapX=(DIV_W-8)/DCOLS, gapY=(DIV_H-14)/DROWS;
    sorted.forEach((f,fi)=>{
      const col=fi%DCOLS, row=Math.floor(fi/DCOLS);
      const dx=ox+5+col*gapX+dotSz, dy=D2B+10+row*gapY+dotSz;
      const sv=state[f.name]??defaultState(); const ov=calcOverall(sv);
      doc.setFillColor(...ragFill(ov)); doc.circle(dx,dy,dotSz+1,"F");
      doc.setFillColor(...ragAccent(ov)); doc.circle(dx,dy,dotSz,"F");
      doc.setDrawColor(...CAT_C[f.cat]); doc.setLineWidth(0.5); doc.circle(dx,dy,dotSz,"S");
      txt(String(fi+1),dx,dy+1.2,2.8,WHITE,"bold","center");
    });
  }

  // Insight strip
  {
    const iY=FTR_Y-12;
    fr(0,iY,PW,12,NAVYM);
    fr(0,iY,3,12,GOLD);
    txt("OPERATIONAL INSIGHT",PAD+6,iY+4.5,4.5,GOLD,"bold");
    txt(insight,PAD+54,iY+4.5,4.5,WHITE,"normal");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — INFRASTRUCTURE & SERVICE INTELLIGENCE
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawShell(3,"Infrastructure & Service Intelligence");
  const D3Y=BODY_TOP;

  // 3 service panels row
  const SP_W=(TW-4)/3, SP_H=52;
  const svcDefs=[
    {lbl:"INTERNET CONNECTIVITY",key:"internet" as keyof FacilityState},
    {lbl:"BIOMETRIC SYSTEMS",key:"bio" as keyof FacilityState},
    {lbl:"PRINTING SERVICES",key:"printing" as keyof FacilityState},
  ];
  svcDefs.forEach((svc,si)=>{
    const sx=PAD+si*(SP_W+2);
    const vals=sorted.map(f=>(state[f.name]??defaultState())[svc.key] as RAGStatus);
    const sg=vals.filter(v=>v==="green").length, sa=vals.filter(v=>v==="amber").length;
    const sr=vals.filter(v=>v==="red").length, sn2=vals.filter(v=>v==="na").length;
    const sh=vals.length>0?sg/vals.length:0;
    const shC:RGB=sh>=0.8?gC:sh>=0.5?aC:rC;
    panel(sx,D3Y,SP_W,SP_H,svc.lbl,shC);
    // large donut
    const cx=sx+SP_W/2, cy=D3Y+27, RO=14, RI=9;
    drawArc(cx,cy,RO,RI,-90,270,[228,234,246] as RGB);
    if(sh>0) drawArc(cx,cy,RO,RI,-90,-90+360*sh,shC);
    doc.setFillColor(...WHITE); doc.circle(cx,cy,RI-0.3,"F");
    txt(`${Math.round(sh*100)}%`,cx,cy+2,7,shC,"bold","center");
    txt("AVAIL",cx,cy+6.5,3.2,MUTED,"bold","center");
    pbar(sx+6,D3Y+43,SP_W-12,4,sh,shC);
    // stat row
    ([{v:sg,l:"Active",c:gC},{v:sa,l:"Partial",c:aC},{v:sr,l:"Down",c:rC},{v:sn2,l:"N/A",c:nC}] as {v:number;l:string;c:RGB}[]).forEach((ck,cki)=>{
      const ckx=sx+3+cki*(SP_W-6)/4;
      txt(String(ck.v),ckx+(SP_W-6)/8,D3Y+SP_H-6,8,ck.c,"bold","center");
      txt(ck.l,ckx+(SP_W-6)/8,D3Y+SP_H-2,3,MUTED,"normal","center");
    });
  });

  // Exception analysis + Division summary
  const EA_Y=D3Y+SP_H+3, EA_H=Math.min(50,FTR_Y-EA_Y-40);
  const EA_W=(TW-2)*0.55, DS_W=TW-EA_W-2;

  // Exception Analysis
  panel(PAD,EA_Y,EA_W,EA_H,"EXCEPTION ANALYSIS");
  {
    const issues=sorted.filter(f=>calcOverall(state[f.name]??defaultState())!=="green"&&calcOverall(state[f.name]??defaultState())!=="na");
    if(issues.length===0){
      txt("✓ All facilities operating normally — no exceptions detected.",PAD+EA_W/2,EA_Y+EA_H/2,4.5,gC,"bold","center");
    } else {
      const rowH=Math.min(7,(EA_H-10)/Math.min(issues.length,6));
      issues.slice(0,6).forEach((f,ei)=>{
        const sv=state[f.name]??defaultState(); const ov=calcOverall(sv);
        const ry=EA_Y+9+ei*rowH;
        fr(PAD,ry,EA_W,rowH,ei%2===0?WHITE:[248,250,254] as RGB);
        fr(PAD,ry,2,rowH,ragAccent(ov));
        txt(f.name,PAD+6,ry+rowH*0.7,4,INK,"bold");
        frr(PAD+EA_W-28,ry+1,24,rowH-2,1.5,ragFill(ov));
        txt(ragLabel(ov),PAD+EA_W-16,ry+rowH*0.7,3.5,ragText(ov),"bold","center");
        // service dots
        ([sv.internet,sv.bio,sv.printing] as RAGStatus[]).filter(s=>s!=="green").forEach((st,sti)=>{
          const dx=PAD+EA_W-52+(sti*8);
          doc.setFillColor(...ragAccent(st)); doc.circle(dx,ry+rowH/2,2,"F");
        });
      });
      if(issues.length>6) txt(`+${issues.length-6} more facilities with exceptions`,PAD+6,EA_Y+EA_H-3,3.5,MUTED);
    }
  }

  // Division Summary
  panel(PAD+EA_W+2,EA_Y,DS_W,EA_H,"DIVISION SUMMARY");
  {
    CATS.forEach((cat,ci)=>{
      const facs=sorted.filter(f=>f.cat===cat);
      const grn=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const hlth=facs.length>0?grn/facs.length:0;
      const cc=CAT_C[cat];
      const rY=EA_Y+9+ci*((EA_H-11)/4);
      txt(cat,PAD+EA_W+6,rY+4.5,4.5,cc,"bold");
      pbar(PAD+EA_W+30,rY+1,DS_W-36,5,hlth,cc);
      txt(`${Math.round(hlth*100)}%`,PAD+EA_W+DS_W-3,rY+5,4.5,cc,"bold","right");
      txt(`${facs.length} sites`,PAD+EA_W+6,rY+8.5,3.2,MUTED);
    });
  }

  // Compact appendix table
  const APP_Y=EA_Y+EA_H+3;
  const APP_H=FTR_Y-APP_Y-12;
  panel(PAD,APP_Y,TW,APP_H,"FACILITY APPENDIX — COMPLETE REFERENCE");
  {
    const ACOLS=[
      {h:"#",w:7,x:PAD},
      {h:"FACILITY",w:60,x:PAD+7},
      {h:"DIVISION",w:24,x:PAD+67},
      {h:"NET",w:20,x:PAD+91},
      {h:"BIO",w:20,x:PAD+111},
      {h:"PRT",w:20,x:PAD+131},
      {h:"OVERALL",w:26,x:PAD+151},
      {h:"BW",w:22,x:PAD+177},
      {h:"NOTES",w:TW-177-22,x:PAD+199},
    ];
    const ATH_Y=APP_Y+7.5;
    fr(PAD,ATH_Y,TW,5.5,NAVYM);
    ACOLS.forEach(col=>txt(col.h,col.x+col.w/2,ATH_Y+3.8,3.2,WHITE,"bold","center"));
    const ARWH=Math.min(5,(APP_H-14)/sorted.length);
    sorted.forEach((f,fi)=>{
      const sv=state[f.name]??defaultState(); const ov=calcOverall(sv);
      const ry=ATH_Y+5.5+fi*ARWH;
      fr(PAD,ry,TW,ARWH,fi%2===0?WHITE:[244,247,252] as RGB);
      fr(PAD,ry,2,ARWH,CAT_C[f.cat]??NAVY);
      const tc=ry+ARWH*0.72;
      txt(String(fi+1),PAD+4,tc,3,MUTED,"normal","center");
      txt(f.name.length>20?f.name.slice(0,18)+"…":f.name,PAD+9,tc,3.5,INK,"bold");
      txt(f.cat,PAD+79,tc,3,CAT_C[f.cat]??NAVY,"bold","center");
      ([sv.internet,sv.bio,sv.printing] as RAGStatus[]).forEach((st,sti)=>{
        const lx=[PAD+101,PAD+121,PAD+141][sti];
        doc.setFillColor(...ragAccent(st)); doc.circle(lx,ry+ARWH/2,1.8,"F");
      });
      frr(PAD+153,ry+0.5,22,ARWH-1,1,ragFill(ov));
      txt(ragLabel(ov).slice(0,4),PAD+164,tc,3,ragText(ov),"bold","center");
      if(sv.bandwidth) txt(sv.bandwidth,PAD+188,tc,3,MUTED,"normal","center");
      if(sv.notes) txt(sv.notes.slice(0,28),PAD+201,tc,3,MUTED,"normal");
    });
  }

  // Insight strip
  {
    const iY=FTR_Y-12;
    fr(0,iY,PW,12,NAVYM);
    fr(0,iY,3,12,GOLD);
    txt("OPERATIONAL INSIGHT",PAD+6,iY+4.5,4.5,GOLD,"bold");
    txt(insight,PAD+54,iY+4.5,4.5,WHITE,"normal");
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
