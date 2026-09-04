"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";

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
        setScale(Math.min(w / 960, 1));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const total = facilities.length || 1;
  const healthPct = counts.green / total;
  const filtered = facilities.filter(f => cfg.divFilter === "all" || f.cat === cfg.divFilter);
  const ORDER: Record<string, number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted = [...filtered].sort((a,b) => (ORDER[a.cat]??9) - (ORDER[b.cat]??9));
  const dateStr = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  const timeStr = new Date().toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", hour12:true });
  const cats = ["Imarat","Projects","Graana","Agency21"] as const;

  // ── Aurora Glass tokens ───────────────────────────────────────────────────
  const OK="#10B981", WARN="#F59E0B", CRIT="#F43F5E", OFF="#64748B";
  const CYAN="#22D3EE", INDIGO="#6366F1";
  const INK="#F8FAFC", DIM="#94A3B8", FAINT="#64748B";
  const GLASS="rgba(255,255,255,0.06)", EDGE="rgba(255,255,255,0.12)";
  const TRACK="rgba(255,255,255,0.08)";
  const UI="'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif";
  const MONO="'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace";
  const hue = healthPct>=0.8?OK:healthPct>=0.5?WARN:CRIT;

  // 8pt spacing scale — every gap/pad below is a multiple
  const PAD=20, GAP=16, RAD=16;

  // Frosted panel. Header baseline is identical across every instance.
  const Glass = ({ title, meta, children, style }:{ title:string; meta?:React.ReactNode; children:React.ReactNode; style?:React.CSSProperties }) => (
    <div style={{ background:GLASS, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
                  border:`1px solid ${EDGE}`, borderRadius:RAD, position:"relative" as const,
                  overflow:"hidden", display:"flex", flexDirection:"column" as const,
                  boxShadow:"0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10)", ...style }}>
      <div style={{ padding:`${PAD}px ${PAD}px 0 ${PAD}px`, flexShrink:0, display:"flex", alignItems:"center", gap:8, height:38 }}>
        <span style={{ fontFamily:UI, fontSize:10, fontWeight:800, letterSpacing:"0.14em", textTransform:"uppercase" as const, color:DIM }}>{title}</span>
        {meta && <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>{meta}</span>}
      </div>
      <div style={{ flex:1, padding:`8px ${PAD}px ${PAD}px ${PAD}px`, minHeight:0 }}>{children}</div>
    </div>
  );

  const Fig = ({ v, size=13, color=INK }:{ v:React.ReactNode; size?:number; color?:string }) => (
    <span style={{ fontFamily:MONO, fontSize:size, fontWeight:600, color, fontVariantNumeric:"tabular-nums", letterSpacing:"-0.01em" }}>{v}</span>
  );

  // Segmented meter — one shared bar spec everywhere
  const Meter = ({ segs, h=6 }:{ segs:{v:number;c:string}[]; h?:number }) => {
    const tot=segs.reduce((s,x)=>s+x.v,0)||1;
    return (
      <div style={{ height:h, background:TRACK, borderRadius:h/2, display:"flex", overflow:"hidden" }}>
        {segs.map((s,i)=> s.v>0 ? <div key={i} style={{ width:`${s.v/tot*100}%`, background:s.c }}/> : null)}
      </div>
    );
  };

  const RD=44, CIRC=2*Math.PI*RD;
  const Ring = () => {
    const segs=[{v:counts.green,c:OK},{v:counts.amber,c:WARN},{v:counts.red,c:CRIT},{v:counts.na||0,c:OFF}];
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    let cum=0;
    return (
      <svg width="124" height="124" viewBox="0 0 124 124" style={{ display:"block" }}>
        <circle cx="62" cy="62" r={RD} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12"/>
        {segs.map((seg,i)=>{
          if(!seg.v) return null;
          const len=CIRC*(seg.v/tot), off=-CIRC*cum;
          cum+=seg.v/tot;
          return <circle key={i} cx="62" cy="62" r={RD} fill="none" stroke={seg.c} strokeWidth="12"
            strokeDasharray={`${len} ${CIRC-len}`} strokeDashoffset={off} strokeLinecap="butt"
            style={{ transform:"rotate(-90deg)", transformOrigin:"62px 62px" }}/>;
        })}
      </svg>
    );
  };

  const insightText = counts.red>0&&counts.amber>0
    ?`${counts.red} critical and ${counts.amber} degraded sites require immediate IT attention.`
    :counts.red>0?`${counts.red} site${counts.red>1?"s":""} in critical state — service restoration is the priority.`
    :counts.amber>0?`${counts.amber} site${counts.amber>1?"s":""} in degraded state. No critical failures at this time.`
    :`All ${counts.green} facilities fully operational across all monitored services.`;

  const statRows=[
    {l:"Operational",v:counts.green,c:OK},
    {l:"Degraded",v:counts.amber,c:WARN},
    {l:"Critical",v:counts.red,c:CRIT},
    {l:"Not Set",v:counts.na||0,c:OFF},
  ];

  return (
    <div ref={containerRef} style={{ width:"100%", display:"flex", flexDirection:"column" as const, alignItems:"center" }}>
      <div style={{ transform:`scale(${scale})`, transformOrigin:"top center", width:960, transition:"transform 0.15s" }}>
        <div style={{ width:960, position:"relative" as const, background:"#0B1120", fontFamily:UI,
                      borderRadius:14, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>

          {/* AURORA FIELD */}
          <div aria-hidden style={{ position:"absolute" as const, inset:0, pointerEvents:"none" as const }}>
            <div style={{ position:"absolute" as const, top:-160, left:-80, width:520, height:520, borderRadius:"50%",
                          background:`radial-gradient(circle, ${INDIGO}44 0%, transparent 68%)`, filter:"blur(28px)" }}/>
            <div style={{ position:"absolute" as const, top:-120, right:-60, width:460, height:460, borderRadius:"50%",
                          background:`radial-gradient(circle, ${CYAN}38 0%, transparent 68%)`, filter:"blur(28px)" }}/>
            <div style={{ position:"absolute" as const, bottom:-200, left:"32%", width:560, height:460, borderRadius:"50%",
                          background:`radial-gradient(circle, ${OK}2E 0%, transparent 70%)`, filter:"blur(32px)" }}/>
          </div>

          {/* HEADER */}
          <div style={{ position:"relative" as const, height:72, display:"flex", alignItems:"center",
                        padding:`0 ${PAD+4}px`, borderBottom:`1px solid ${EDGE}`,
                        background:"rgba(255,255,255,0.04)", backdropFilter:"blur(20px)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
                            background:`linear-gradient(135deg, ${INDIGO} 0%, ${CYAN} 100%)`,
                            boxShadow:`0 4px 16px ${INDIGO}55` }}>
                <span style={{ fontSize:13, fontWeight:800, color:"#fff", letterSpacing:"0.02em" }}>IG</span>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:INK, letterSpacing:"0.16em", lineHeight:1.1 }}>IMARAT</div>
                <div style={{ fontSize:9, color:FAINT, letterSpacing:"0.08em", marginTop:3 }}>GROUP OF COMPANIES · IT</div>
              </div>
            </div>

            <div style={{ width:1, height:32, background:EDGE, margin:`0 ${PAD}px` }}/>

            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:INK, letterSpacing:"-0.01em",
                            whiteSpace:"nowrap" as const, overflow:"hidden", textOverflow:"ellipsis" }}>{cfg.title}</div>
              <div style={{ fontSize:10, color:FAINT, marginTop:3 }}>{cfg.org} · {cfg.period||dateStr}</div>
            </div>

            {/* live health capsule */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 14px", borderRadius:999,
                          background:`${hue}1A`, border:`1px solid ${hue}59` }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:hue, boxShadow:`0 0 10px ${hue}` }}/>
              <Fig v={`${Math.round(healthPct*100)}%`} size={12} color={hue}/>
              <span style={{ fontSize:11, fontWeight:600, color:hue }}>operational</span>
            </div>

            <div style={{ textAlign:"right" as const, marginLeft:PAD }}>
              <div style={{ fontFamily:MONO, fontSize:12, fontWeight:600, color:INK, fontVariantNumeric:"tabular-nums" }}>{dateStr}</div>
              <div style={{ fontFamily:MONO, fontSize:10, color:FAINT, marginTop:3 }}>{timeStr}</div>
            </div>
          </div>

          {/* BODY — 12-col grid, uniform GAP */}
          <div style={{ position:"relative" as const, padding:GAP, display:"flex", flexDirection:"column" as const, gap:GAP }}>

            {/* ROW 1 */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap:GAP, height:216 }}>

              {/* Health — 4 col */}
              <Glass title="Facility Health" style={{ gridColumn:"span 4" }}>
                <div style={{ display:"flex", flexDirection:"column" as const, height:"100%" }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:14 }}>
                    <span style={{ fontFamily:MONO, fontSize:42, fontWeight:600, color:hue, lineHeight:1,
                                   letterSpacing:"-0.03em", fontVariantNumeric:"tabular-nums" }}>{Math.round(healthPct*100)}</span>
                    <span style={{ fontFamily:MONO, fontSize:18, fontWeight:500, color:`${hue}99` }}>%</span>
                    <span style={{ marginLeft:"auto", fontSize:10, color:FAINT, letterSpacing:"0.06em" }}>
                      <Fig v={counts.green} size={11} color={DIM}/> / <Fig v={total} size={11} color={FAINT}/> sites
                    </span>
                  </div>
                  <Meter segs={[{v:counts.green,c:OK},{v:counts.amber,c:WARN},{v:counts.red,c:CRIT},{v:counts.na||0,c:OFF}]} h={6}/>
                  <div style={{ marginTop:16, display:"flex", flexDirection:"column" as const, gap:0 }}>
                    {statRows.map((r,i)=>(
                      <div key={r.l} style={{ display:"flex", alignItems:"center", gap:10, height:28,
                                              borderTop: i===0?"none":`1px solid rgba(255,255,255,0.06)` }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:r.c, flexShrink:0 }}/>
                        <span style={{ flex:1, fontSize:11.5, color:DIM }}>{r.l}</span>
                        <Fig v={r.v} size={13} color={r.c}/>
                      </div>
                    ))}
                  </div>
                </div>
              </Glass>

              {/* Status ring — 4 col */}
              <Glass title="Status Distribution" style={{ gridColumn:"span 4" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:18, height:"100%" }}>
                  <div style={{ position:"relative" as const, flexShrink:0 }}>
                    <Ring/>
                    <div style={{ position:"absolute" as const, inset:0, display:"flex", flexDirection:"column" as const,
                                  alignItems:"center", justifyContent:"center" }}>
                      <span style={{ fontFamily:MONO, fontSize:30, fontWeight:600, color:INK, lineHeight:1,
                                     letterSpacing:"-0.03em", fontVariantNumeric:"tabular-nums" }}>{total}</span>
                      <span style={{ fontSize:9, color:FAINT, letterSpacing:"0.12em", marginTop:5 }}>SITES</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column" as const, gap:12, minWidth:104 }}>
                    {statRows.map(r=>(
                      <div key={r.l} style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <span style={{ width:8, height:8, borderRadius:3, background:r.c, flexShrink:0 }}/>
                        <span style={{ flex:1, fontSize:11, color:DIM }}>{r.l}</span>
                        <Fig v={r.v} size={13} color={r.c}/>
                      </div>
                    ))}
                  </div>
                </div>
              </Glass>

              {/* Divisions — 4 col */}
              <Glass title="Division Progress" style={{ gridColumn:"span 4" }}>
                <div style={{ display:"flex", flexDirection:"column" as const, gap:13 }}>
                  {cats.map(cat=>{
                    const facs=facilities.filter(f=>f.cat===cat);
                    const g=facs.filter(f=>calcOverall(state[f.name]??defState())==="green").length;
                    const a=facs.filter(f=>calcOverall(state[f.name]??defState())==="amber").length;
                    const r=facs.filter(f=>calcOverall(state[f.name]??defState())==="red").length;
                    const pct=facs.length>0?Math.round(g/facs.length*100):0;
                    const pc=pct>=80?OK:pct>=50?WARN:CRIT;
                    return (
                      <div key={cat}>
                        <div style={{ display:"flex", alignItems:"baseline", marginBottom:6 }}>
                          <span style={{ fontSize:12, color:INK, fontWeight:600 }}>{cat}</span>
                          <span style={{ marginLeft:"auto", display:"flex", alignItems:"baseline", gap:8 }}>
                            <Fig v={facs.length} size={10} color={FAINT}/>
                            <Fig v={`${pct}%`} size={13} color={pc}/>
                          </span>
                        </div>
                        <Meter segs={[{v:g,c:OK},{v:a,c:WARN},{v:r,c:CRIT}]} h={6}/>
                      </div>
                    );
                  })}
                </div>
              </Glass>
            </div>

            {/* ROW 2 */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap:GAP, height:212 }}>

              {/* Services — 5 col */}
              <Glass title="Service Availability" style={{ gridColumn:"span 5" }}>
                <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>
                  {(["internet","bio","printing"] as const).map((key,ki)=>{
                    const lbls=["Internet","Biometric","Printing"];
                    const vals=sorted.map(f=>(state[f.name]??defState())[key]);
                    const g=vals.filter(v=>v==="green").length;
                    const a=vals.filter(v=>v==="amber").length;
                    const r=vals.filter(v=>v==="red").length;
                    const sh=vals.length>0?g/vals.length:0;
                    const sc=sh>=0.8?OK:sh>=0.5?WARN:CRIT;
                    return (
                      <div key={key}>
                        <div style={{ display:"flex", alignItems:"baseline", marginBottom:6 }}>
                          <span style={{ fontSize:12, color:INK, fontWeight:600 }}>{lbls[ki]}</span>
                          <span style={{ marginLeft:"auto", display:"flex", alignItems:"baseline", gap:10 }}>
                            <span style={{ fontFamily:MONO, fontSize:10, color:FAINT, fontVariantNumeric:"tabular-nums" }}>{g}/{vals.length}</span>
                            <Fig v={`${Math.round(sh*100)}%`} size={13} color={sc}/>
                          </span>
                        </div>
                        <Meter segs={[{v:g,c:OK},{v:a,c:WARN},{v:r,c:CRIT}]} h={6}/>
                      </div>
                    );
                  })}
                </div>
              </Glass>

              {/* Facility grid — 7 col */}
              <Glass title="Facility Overview"
                     meta={<>
                       {statRows.slice(0,3).map(r=>(
                         <span key={r.l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                           <span style={{ width:6, height:6, borderRadius:"50%", background:r.c }}/>
                           <span style={{ fontFamily:MONO, fontSize:10, color:DIM, fontVariantNumeric:"tabular-nums" }}>{r.v}</span>
                         </span>
                       ))}
                     </>}
                     style={{ gridColumn:"span 7" }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(11,1fr)", gap:6 }}>
                  {sorted.map((f,fi)=>{
                    const ov=calcOverall(state[f.name]??defState());
                    const c=ov==="green"?OK:ov==="amber"?WARN:ov==="red"?CRIT:OFF;
                    return (
                      <div key={f.name} title={f.name}
                           style={{ aspectRatio:"1", borderRadius:7, background:`${c}1F`, border:`1px solid ${c}59`,
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    fontFamily:MONO, fontSize:9, fontWeight:600, color:c,
                                    fontVariantNumeric:"tabular-nums" }}>
                        {fi+1}
                      </div>
                    );
                  })}
                </div>
              </Glass>
            </div>

            {/* INSIGHT */}
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:`14px ${PAD}px`, borderRadius:RAD,
                          background:GLASS, backdropFilter:"blur(20px)", border:`1px solid ${EDGE}`,
                          boxShadow:"inset 0 1px 0 rgba(255,255,255,0.10)" }}>
              <span style={{ width:3, height:22, borderRadius:2, flexShrink:0,
                             background:`linear-gradient(180deg, ${CYAN}, ${INDIGO})` }}/>
              <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:"0.14em", color:CYAN, flexShrink:0 }}>INSIGHT</span>
              <span style={{ fontSize:12.5, color:DIM, lineHeight:1.5 }}>{insightText}</span>
            </div>
          </div>

          {/* FOOTER */}
          <div style={{ position:"relative" as const, display:"flex", alignItems:"center", height:44,
                        padding:`0 ${PAD+4}px`, borderTop:`1px solid ${EDGE}`, background:"rgba(255,255,255,0.03)" }}>
            <span style={{ fontSize:10, color:FAINT }}>{cfg.org} · IT Department · it.support@imarat.com.pk</span>
            {cfg.includeTs && <span style={{ margin:"0 auto", fontSize:10, color:FAINT, letterSpacing:"0.08em" }}>CONFIDENTIAL · SYSTEM GENERATED</span>}
            <span style={{ marginLeft:cfg.includeTs?0:"auto", fontSize:10, color:FAINT }}>imarat.com.pk</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize:11, color:"#64748B", marginTop:14, fontFamily:UI, letterSpacing:"0.04em" }}>
        Single Page · A4 {cfg.orientation==="landscape"?"Landscape":"Portrait"} · Aurora Glass
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
  const d        = new Date();
  const dateStr  = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  const timeStr  = d.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", hour12:true });
  const fileName = `Imarat_IT_RAG_${d.toISOString().slice(0,10)}.pdf`;

  const doc = new jsPDF({ orientation: cfg.orientation, unit: "mm", format: "a4" });
  const PW  = doc.internal.pageSize.getWidth();
  const PH  = doc.internal.pageSize.getHeight();

  // ── Aurora Glass tokens (RGB) ─────────────────────────────────────────────
  const BASE:RGB=[11,17,32];
  const OK:RGB=[16,185,129], WARN:RGB=[245,158,11], CRIT:RGB=[244,63,94], OFF:RGB=[100,116,139];
  const CYAN:RGB=[34,211,238], INDIGO:RGB=[99,102,241];
  const INK:RGB=[248,250,252], DIM:RGB=[148,163,184], FAINT:RGB=[100,116,139];
  const W:RGB=[255,255,255];

  // ── 8pt-derived metric grid (mm) — every offset below is on this scale ────
  const M    = 10;              // page margin
  const GAP  = 4;               // gutter
  const RAD  = 3;               // panel radius
  const PADX = 5;               // panel inner x-padding
  const HEAD = 20;              // header band height
  const FOOT = 10;              // footer band height
  const HDR_BASE = 8.5;         // panel title baseline offset (identical everywhere)
  const TW   = PW - M*2;
  const COL  = (TW - GAP*11) / 12;                 // 12-col grid
  const span = (n:number) => COL*n + GAP*(n-1);    // width of n columns
  const colX = (i:number) => M + i*(COL+GAP);      // x of column i

  // ── alpha compositing ─────────────────────────────────────────────────────
  const A = (a:number) => { try { (doc as any).setGState(new (doc as any).GState({ opacity:a })); } catch {} };
  const fill = (c:RGB,a=1) => { A(a); doc.setFillColor(...c); };
  const rect = (x:number,y:number,w:number,h:number,c:RGB,a=1) => { fill(c,a); doc.rect(x,y,w,h,"F"); A(1); };
  const rrect = (x:number,y:number,w:number,h:number,r:number,c:RGB,a=1) => { fill(c,a); doc.roundedRect(x,y,w,h,r,r,"F"); A(1); };
  const txt = (s:string,x:number,y:number,sz:number,c:RGB,b:"bold"|"normal"="normal",al:"left"|"center"|"right"="left",a=1) => {
    A(a); doc.setFont("helvetica",b); doc.setFontSize(sz); doc.setTextColor(...c); doc.text(s,x,y,{align:al}); A(1);
  };
  // soft radial glow, built from concentric discs with quadratic falloff
  const glow = (cx:number,cy:number,r:number,c:RGB,peak=0.20,steps=18) => {
    for(let i=steps;i>0;i--){
      fill(c, peak*Math.pow(i/steps,2.4));
      doc.circle(cx,cy,r*(i/steps),"F");
    }
    A(1);
  };
  // frosted panel: translucent fill + hairline edge + specular top highlight
  const glass = (x:number,y:number,w:number,h:number,r=RAD) => {
    rrect(x,y,w,h,r,W,0.055);
    A(0.13); doc.setDrawColor(...W); doc.setLineWidth(0.22); doc.roundedRect(x,y,w,h,r,r,"S");
    A(0.20); doc.setLineWidth(0.35); doc.line(x+r,y+0.18,x+w-r,y+0.18);
    A(1);
  };
  const panel = (x:number,y:number,w:number,h:number,title:string) => {
    glass(x,y,w,h);
    txt(title.toUpperCase(),x+PADX,y+HDR_BASE,5.4,DIM,"bold");
  };
  // segmented meter — one shared spec, matches the preview's <Meter/>
  const meter = (x:number,y:number,w:number,h:number,segs:{v:number;c:RGB}[]) => {
    rrect(x,y,w,h,h/2,W,0.09);
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    let bx=x;
    segs.forEach(sg=>{
      if(sg.v<=0) return;
      const bw=w*sg.v/tot;
      fill(sg.c,1); doc.rect(bx,y,bw,h,"F"); bx+=bw;
    });
    A(1);
  };

  // ── data ──────────────────────────────────────────────────────────────────
  const filtered = facilities.filter(f => cfg.divFilter==="all" || f.cat===cfg.divFilter);
  const ORDER: Record<string,number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted  = [...filtered].sort((a,b)=>(ORDER[a.cat]??9)-(ORDER[b.cat]??9));
  const total   = sorted.length || 1;
  const grnN=counts.green, ambN=counts.amber, redN=counts.red, naN=counts.na||0;
  const healthPct = total>0 ? grnN/total : 0;
  const hue:RGB = healthPct>=0.8?OK:healthPct>=0.5?WARN:CRIT;
  const CATS = ["Imarat","Projects","Graana","Agency21"] as const;
  const statRows:{l:string;v:number;c:RGB}[] = [
    {l:"Operational",v:grnN,c:OK},{l:"Degraded",v:ambN,c:WARN},
    {l:"Critical",v:redN,c:CRIT},{l:"Not Set",v:naN,c:OFF},
  ];
  const insight =
    redN>0&&ambN>0 ? `${redN} critical and ${ambN} degraded sites require immediate IT attention.`
    : redN>0       ? `${redN} site${redN>1?"s":""} in critical state — service restoration is the priority.`
    : ambN>0       ? `${ambN} site${ambN>1?"s":""} in degraded state. No critical failures at this time.`
    :                `All ${grnN} facilities fully operational across all monitored services.`;

  // ══ GROUND ════════════════════════════════════════════════════════════════
  rect(0,0,PW,PH,BASE);
  glow(PW*0.10, -6,        86, INDIGO, 0.30);
  glow(PW*0.93, -2,        74, CYAN,   0.24);
  glow(PW*0.44, PH+14,     92, OK,     0.17);
  glow(PW*0.72, PH*0.62,   58, INDIGO, 0.11);

  // ══ HEADER ════════════════════════════════════════════════════════════════
  rect(0,0,PW,HEAD,W,0.035);
  A(0.13); doc.setDrawColor(...W); doc.setLineWidth(0.22); doc.line(0,HEAD,PW,HEAD); A(1);
  {
    const cy = HEAD/2;                                  // single vertical centre for the whole band
    // IG mark — indigo→cyan chip
    rrect(M,cy-4.6,9.2,9.2,2.4,INDIGO,1);
    rrect(M+4.4,cy-4.6,4.8,9.2,2.4,CYAN,0.75);
    txt("IG",M+4.6,cy+1.5,6.4,W,"bold","center");
    // wordmark
    txt("IMARAT",M+13,cy-0.6,9.4,INK,"bold");
    txt("GROUP OF COMPANIES · IT",M+13,cy+3.9,3.5,FAINT,"normal");
    // divider
    A(0.13); doc.setDrawColor(...W); doc.setLineWidth(0.22); doc.line(M+56,cy-6,M+56,cy+6); A(1);
    // title
    txt(cfg.title,M+61,cy-0.6,8.4,INK,"bold");
    txt(`${cfg.org}  ·  ${cfg.period||dateStr}`,M+61,cy+3.9,3.5,FAINT,"normal");
    // health capsule — right-aligned block, mirrors the preview capsule
    const capW=42, capH=8, capX=PW-M-52-capW;
    rrect(capX,cy-capH/2,capW,capH,capH/2,hue,0.16);
    A(0.5); doc.setDrawColor(...hue); doc.setLineWidth(0.25); doc.roundedRect(capX,cy-capH/2,capW,capH,capH/2,capH/2,"S"); A(1);
    fill(hue,1); doc.circle(capX+5,cy,1.3,"F"); A(1);
    txt(`${Math.round(healthPct*100)}% OPERATIONAL`,capX+8.5,cy+1.4,4.4,hue,"bold");
    // timestamp
    txt(dateStr,PW-M,cy-0.6,7.4,INK,"bold","right");
    txt(timeStr,PW-M,cy+3.9,3.6,FAINT,"normal","right");
  }

  // ══ BODY GRID ═════════════════════════════════════════════════════════════
  const BT     = HEAD + GAP;
  const INS_H  = 11;
  const FOOT_Y = PH - FOOT;
  const bodyH  = FOOT_Y - BT - INS_H - GAP*2;
  const R1H    = bodyH * 0.505, R2H = bodyH - R1H - GAP;
  const R2Y    = BT + R1H + GAP;

  // ── Panel 1 · Facility Health (cols 0-3) ─────────────────────────────────
  {
    const x=colX(0), w=span(4);
    panel(x,BT,w,R1H,"Facility Health");
    const cy=BT+HDR_BASE+9;
    // hero figure, baseline-aligned with the "n / n sites" caption
    txt(String(Math.round(healthPct*100)),x+PADX,cy+3,22,hue,"bold");
    const numW=doc.getTextWidth(String(Math.round(healthPct*100)));
    txt("%",x+PADX+numW+1.4,cy+3,10,hue,"bold");
    txt(`${grnN} / ${total} sites`,x+w-PADX,cy+3,4.4,FAINT,"normal","right");
    // full-width meter
    meter(x+PADX,cy+6.5,w-PADX*2,2,[{v:grnN,c:OK},{v:ambN,c:WARN},{v:redN,c:CRIT},{v:naN,c:OFF}]);
    // stat rows on a fixed rhythm
    const top=cy+12.5, rh=(R1H-(top-BT)-5)/4;
    statRows.forEach((r,i)=>{
      const ry=top+i*rh, mid=ry+rh/2+1.3;
      if(i>0){ A(0.07); doc.setDrawColor(...W); doc.setLineWidth(0.2); doc.line(x+PADX,ry,x+w-PADX,ry); A(1); }
      fill(r.c,1); doc.circle(x+PADX+1.4,mid-1.2,1.2,"F"); A(1);
      txt(r.l,x+PADX+5,mid,5,DIM,"normal");
      txt(String(r.v),x+w-PADX,mid,6.4,r.c,"bold","right");
    });
  }

  // ── Panel 2 · Status Distribution (cols 4-7) ─────────────────────────────
  {
    const x=colX(4), w=span(4);
    panel(x,BT,w,R1H,"Status Distribution");
    const inner=BT+HDR_BASE+2, ih=R1H-(inner-BT)-4;
    const cx=x+w*0.32, cy=inner+ih/2, RO=17, RI=11.6;
    // track
    A(0.09); drawRing(cx,cy,RO,RI,-90,270,W); A(1);
    let ca=-90;
    const segs=[{v:grnN,c:OK},{v:ambN,c:WARN},{v:redN,c:CRIT},{v:naN,c:OFF}];
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    segs.forEach(sg=>{ if(!sg.v) return; const sp=360*sg.v/tot; drawRing(cx,cy,RO,RI,ca,ca+sp,sg.c); ca+=sp; });
    // centre figure
    txt(String(total),cx,cy+1.2,15,INK,"bold","center");
    txt("SITES",cx,cy+5.6,3.6,FAINT,"bold","center");
    // legend, vertically centred against the ring
    const lx=x+w*0.60, lgH=ih*0.74, ly0=cy-lgH/2, lrh=lgH/4;
    statRows.forEach((r,i)=>{
      const ly=ly0+i*lrh+lrh/2+1.2;
      rrect(lx,ly-2.6,2.2,2.2,0.6,r.c,1);
      txt(r.l,lx+4.4,ly,5,DIM,"normal");
      txt(String(r.v),x+w-PADX,ly,6.4,r.c,"bold","right");
    });
  }

  // ── Panel 3 · Division Progress (cols 8-11) ──────────────────────────────
  {
    const x=colX(8), w=span(4);
    panel(x,BT,w,R1H,"Division Progress");
    const top=BT+HDR_BASE+4, rh=(R1H-(top-BT)-4)/4;
    CATS.forEach((cat,i)=>{
      const facs=sorted.filter(f=>f.cat===cat);
      const g=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const a=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="amber").length;
      const r=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="red").length;
      const pct=Math.round(g/Math.max(facs.length,1)*100);
      const pc:RGB=pct>=80?OK:pct>=50?WARN:CRIT;
      const ry=top+i*rh;
      txt(cat,x+PADX,ry+3.4,5.6,INK,"bold");
      txt(String(facs.length),x+w-PADX-13,ry+3.4,4.2,FAINT,"normal","right");
      txt(`${pct}%`,x+w-PADX,ry+3.4,6.4,pc,"bold","right");
      meter(x+PADX,ry+5.4,w-PADX*2,2,[{v:g,c:OK},{v:a,c:WARN},{v:r,c:CRIT}]);
    });
  }

  // ── Panel 4 · Service Availability (cols 0-4) ────────────────────────────
  {
    const x=colX(0), w=span(5);
    panel(x,R2Y,w,R2H,"Service Availability");
    const svcs=[
      {l:"Internet", k:"internet" as keyof FacilityState},
      {l:"Biometric",k:"bio" as keyof FacilityState},
      {l:"Printing", k:"printing" as keyof FacilityState},
    ];
    const top=R2Y+HDR_BASE+4, rh=(R2H-(top-R2Y)-4)/3;
    svcs.forEach((sv,i)=>{
      const vals=sorted.map(f=>(state[f.name]??defaultState())[sv.k] as RAGStatus);
      const g=vals.filter(v=>v==="green").length, a=vals.filter(v=>v==="amber").length, r=vals.filter(v=>v==="red").length;
      const sh=vals.length>0?g/vals.length:0;
      const sc:RGB=sh>=0.8?OK:sh>=0.5?WARN:CRIT;
      const ry=top+i*rh;
      txt(sv.l,x+PADX,ry+3.4,5.6,INK,"bold");
      txt(`${g}/${vals.length}`,x+w-PADX-14,ry+3.4,4.2,FAINT,"normal","right");
      txt(`${Math.round(sh*100)}%`,x+w-PADX,ry+3.4,6.4,sc,"bold","right");
      meter(x+PADX,ry+5.4,w-PADX*2,2,[{v:g,c:OK},{v:a,c:WARN},{v:r,c:CRIT}]);
    });
  }

  // ── Panel 5 · Facility Overview (cols 5-11) ──────────────────────────────
  {
    const x=colX(5), w=span(7);
    panel(x,R2Y,w,R2H,"Facility Overview");
    // legend sits on the title baseline, right-aligned
    let lgx=x+w-PADX;
    [...statRows].slice(0,3).reverse().forEach(r=>{
      const s=String(r.v);
      txt(s,lgx,R2Y+HDR_BASE,5,DIM,"bold","right");
      lgx-=doc.getTextWidth(s)+2.6;
      fill(r.c,1); doc.circle(lgx,R2Y+HDR_BASE-1.2,1.1,"F"); A(1);
      lgx-=6;
    });
    // tile grid — 11 across, square cells, centred in the remaining box
    const COLS=11;
    const gx=x+PADX, gy=R2Y+HDR_BASE+4;
    const gw=w-PADX*2, gh=R2H-(gy-R2Y)-PADX+1;
    const gap=1.2;
    const rows=Math.ceil(sorted.length/COLS);
    const cell=Math.min((gw-gap*(COLS-1))/COLS, (gh-gap*(rows-1))/rows);
    const usedW=cell*COLS+gap*(COLS-1);
    const ox=gx+(gw-usedW)/2;                       // optical centring
    sorted.forEach((f,i)=>{
      const c=i%COLS, r=Math.floor(i/COLS);
      const tx=ox+c*(cell+gap), ty=gy+r*(cell+gap);
      const ov=calcOverall(state[f.name]??defaultState());
      const col:RGB = ov==="green"?OK:ov==="amber"?WARN:ov==="red"?CRIT:OFF;
      rrect(tx,ty,cell,cell,1,col,0.16);
      A(0.42); doc.setDrawColor(...col); doc.setLineWidth(0.2); doc.roundedRect(tx,ty,cell,cell,1,1,"S"); A(1);
      txt(String(i+1),tx+cell/2,ty+cell/2+1.15,3.6,col,"bold","center");
    });
  }

  // ══ INSIGHT ═══════════════════════════════════════════════════════════════
  {
    const iY=FOOT_Y-GAP-INS_H;
    glass(M,iY,TW,INS_H);
    rrect(M+PADX,iY+3,0.9,INS_H-6,0.45,CYAN,1);
    txt("INSIGHT",M+PADX+3.4,iY+INS_H/2+1.4,4.4,CYAN,"bold");
    txt(insight,M+PADX+24,iY+INS_H/2+1.4,4.8,DIM,"normal");
  }

  // ══ FOOTER ════════════════════════════════════════════════════════════════
  {
    A(0.13); doc.setDrawColor(...W); doc.setLineWidth(0.22); doc.line(0,FOOT_Y,PW,FOOT_Y); A(1);
    const fy=FOOT_Y+FOOT/2+1.2;
    txt(`${cfg.org}  ·  IT Department  ·  it.support@imarat.com.pk`,M,fy,3.8,FAINT,"normal");
    if(cfg.includeTs) txt("CONFIDENTIAL  ·  SYSTEM GENERATED",PW/2,fy,3.8,FAINT,"normal","center");
    txt("imarat.com.pk",PW-M,fy,3.8,FAINT,"normal","right");
  }

  doc.save(fileName);
  return fileName;

  // polygon-approximated ring segment
  function drawRing(cx:number,cy:number,ro:number,ri:number,a1:number,a2:number,c:RGB){
    const steps=Math.max(4,Math.ceil(Math.abs(a2-a1)/4));
    const pts:[number,number][]=[];
    for(let i=0;i<=steps;i++){const a=(a1+i*(a2-a1)/steps)*Math.PI/180; pts.push([cx+ro*Math.cos(a),cy+ro*Math.sin(a)]);}
    for(let i=steps;i>=0;i--){const a=(a1+i*(a2-a1)/steps)*Math.PI/180; pts.push([cx+ri*Math.cos(a),cy+ri*Math.sin(a)]);}
    const lines:[number,number][]=[];
    for(let i=1;i<pts.length;i++) lines.push([pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]]);
    doc.setFillColor(...c);
    (doc as any).lines(lines,pts[0][0],pts[0][1],[1,1],"F",true);
  }
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
