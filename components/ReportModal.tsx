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

// ─── Live preview canvas (HTML mockup of the PDF) ─────────────────────────────
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
  const healthPct = total > 0 ? Math.round(counts.green / total * 100) : 0;
  const hCol = healthPct >= 80 ? "#10B981" : healthPct >= 50 ? "#F59E0B" : "#EF4444";

  const filtered = facilities.filter(f => cfg.divFilter === "all" || f.cat === cfg.divFilter);
  const ORDER: Record<string, number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted = [...filtered].sort((a,b) => (ORDER[a.cat]??9) - (ORDER[b.cat]??9));

  // Page is 930×658 (A4 landscape at ~3.1px/mm), scaled to fit container
  return (
    <div ref={containerRef} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Page shadow wrapper */}
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top center", width: 930, transition: "transform 0.15s" }}>
        <div style={{ width: 930, background: "#fff", boxShadow: "0 4px 32px rgba(0,0,0,0.22)", borderRadius: 3, overflow: "hidden", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

          {/* HEADER */}
          <div style={{ background: "#0C1A2E", padding: "14px 28px", display: "flex", alignItems: "center", gap: 0 }}>
            {/* Gold top bar */}
            <div style={{ position: "absolute" as const, top: 0, left: 0, right: 0, height: 4, background: "#C49A1E" }} />
            {/* Logo area */}
            <div style={{ display: "flex", flexDirection: "column" as const, minWidth: 160 }}>
              {cfg.includeLogo && (
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: 4, fontFamily: "Georgia, serif", lineHeight: 1 }}>IMARAT</div>
              )}
              <div style={{ fontSize: 8.5, color: "#C49A1E", fontWeight: 700, letterSpacing: 1.5, marginTop: 2 }}>GROUP OF COMPANIES</div>
              <div style={{ fontSize: 7.5, color: "#4A6A98", marginTop: 1 }}>IT Department</div>
            </div>
            <div style={{ width: 1, background: "#1E3050", alignSelf: "stretch", margin: "0 20px" }} />
            {/* Title */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>{cfg.title || "IT Facilities RAG Dashboard"}</div>
              <div style={{ fontSize: 9, color: "#C49A1E", fontWeight: 600, marginTop: 2 }}>{cfg.subtitle || "Daily Operational Status"}</div>
              <div style={{ fontSize: 8, color: "#4A6A98", marginTop: 2 }}>{cfg.org} · {cfg.period || new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</div>
            </div>
            {/* Meta */}
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 14, color: "#C49A1E", fontWeight: 700 }}>{new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</div>
              <div style={{ fontSize: 9, color: "#4A6A98", marginTop: 2 }}>{new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}</div>
              {cfg.includeRef && <div style={{ fontSize: 7.5, color: "#2A4060", marginTop: 2 }}>REF: IGC-IT-PREVIEW</div>}
            </div>
          </div>

          {/* KPI CARDS */}
          {cfg.includeKPIs && (
            <div style={{ background: "#EBF0F8", padding: "8px 20px", display: "flex", gap: 6 }}>
              {[
                { val: total,              lbl: "Total Sites",   col: "#0C1A2E" },
                { val: counts.green,       lbl: "Operational",   col: "#059669" },
                { val: counts.amber,       lbl: "Degraded",      col: "#D97706" },
                { val: counts.red,         lbl: "Critical",      col: "#DC2626" },
                { val: autoStats.received, lbl: "Tickets",       col: "#2C5EE8" },
                { val: autoStats.resolved, lbl: "Resolved",      col: "#059669" },
                { val: autoStats.pending,  lbl: "Pending",       col: "#D97706" },
              ].map((k, i) => (
                <div key={i} style={{ flex: 1, background: "#fff", borderRadius: 4, padding: "7px 8px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", borderTop: `2.5px solid ${k.col}` }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: k.col, lineHeight: 1 }}>{k.val}</div>
                  <div style={{ fontSize: 7.5, color: "#8A9AB8", fontWeight: 600, marginTop: 3, letterSpacing: 0.4 }}>{k.lbl.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}

          {/* DIVISION OVERVIEW */}
          {cfg.includeDivs && (
            <div style={{ background: "#fff", padding: "8px 20px", display: "flex", gap: 6 }}>
              {/* Health */}
              <div style={{ width: 150, background: "#0C1A2E", borderRadius: 4, padding: "10px 12px" }}>
                <div style={{ fontSize: 7.5, color: "#4A6A98", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>OVERALL HEALTH</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: hCol, lineHeight: 1 }}>{healthPct}%</div>
                <div style={{ marginTop: 6, height: 4, background: "#1A3050", borderRadius: 2 }}>
                  <div style={{ height: 4, background: hCol, borderRadius: 2, width: `${healthPct}%` }} />
                </div>
              </div>
              {/* Division cards */}
              {(["Imarat","Projects","Graana","Agency21"] as const).map(cat => {
                const facs = facilities.filter(f => f.cat === cat);
                const tot = facs.length;
                const grn = facs.filter(f => calcOverall(state[f.name] ?? defState()) === "green").length;
                const amb = facs.filter(f => calcOverall(state[f.name] ?? defState()) === "amber").length;
                const red = facs.filter(f => calcOverall(state[f.name] ?? defState()) === "red").length;
                const hex = CAT_HEX[cat];
                const bgHex = CAT_BGHEX[cat];
                return (
                  <div key={cat} style={{ flex: 1, background: bgHex, borderRadius: 4, padding: "8px 10px", borderTop: `2.5px solid ${hex}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: hex, letterSpacing: 0.5 }}>{cat.toUpperCase()}</div>
                      <div style={{ fontSize: 9, color: hex }}>{tot}</div>
                    </div>
                    <div style={{ height: 3, background: "rgba(0,0,0,0.1)", borderRadius: 2, margin: "5px 0" }}>
                      {tot > 0 && <div style={{ height: 3, background: hex, borderRadius: 2, width: `${(grn/tot)*100}%` }} />}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <span style={{ flex: 1, textAlign: "center" as const, fontSize: 12, fontWeight: 800, color: "#059669" }}>{grn}</span>
                      <span style={{ flex: 1, textAlign: "center" as const, fontSize: 12, fontWeight: 800, color: "#D97706" }}>{amb}</span>
                      <span style={{ flex: 1, textAlign: "center" as const, fontSize: 12, fontWeight: 800, color: "#DC2626" }}>{red}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FACILITY ANALYTICS — all facilities, no truncation */}
          {cfg.includeTable && (
            <div style={{ padding: "6px 20px 10px" }}>
              {/* Section header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:"1px solid #DDE4EF", paddingTop:6, marginBottom:7 }}>
                <span style={{ fontSize:8, fontWeight:700, color:"#8A9AB8", letterSpacing:1 }}>
                  FACILITY PERFORMANCE ANALYTICS — {sorted.length} SITES
                </span>
                <span style={{ display:"flex", gap:8, fontSize:6.5 }}>
                  {[{l:"Operational",c:"#059669"},{l:"Degraded",c:"#D97706"},{l:"Critical",c:"#DC2626"},{l:"N/A",c:"#9CA3AF"}].map(s=>(
                    <span key={s.l} style={{ display:"flex", alignItems:"center", gap:3, color:s.c, fontWeight:700 }}>
                      <span style={{ width:6,height:6,borderRadius:"50%",background:s.c,display:"inline-block" }} />{s.l}
                    </span>
                  ))}
                </span>
              </div>

              <div style={{ display:"flex", gap:10 }}>

                {/* LEFT: Ranked performance bar chart */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:7, fontWeight:800, color:"#0C1A2E", letterSpacing:0.8, marginBottom:5, textTransform:"uppercase" as const }}>
                    Performance Ranking
                  </div>
                  {/* Chart header */}
                  <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:4, paddingBottom:3, borderBottom:"1px solid #EEF2F8" }}>
                    <div style={{ width:12, fontSize:5.5, color:"#C0CAD8", fontWeight:700 }}>#</div>
                    <div style={{ width:88, fontSize:5.5, color:"#8A9AB8", fontWeight:700 }}>FACILITY</div>
                    <div style={{ flex:1, fontSize:5.5, color:"#8A9AB8", fontWeight:700 }}>SCORE</div>
                    <div style={{ width:44, fontSize:5.5, color:"#8A9AB8", fontWeight:700, textAlign:"center" as const }}>STATUS</div>
                  </div>
                  {sorted.map((f,i)=>{
                    const s   = state[f.name]??defState();
                    const ov  = calcOverall(s);
                    const sc  = ov==="green"?100:ov==="amber"?62:ov==="red"?28:8;
                    const bc  = ov==="green"?"#059669":ov==="amber"?"#D97706":ov==="red"?"#DC2626":"#9CA3AF";
                    const bbg = ov==="green"?"#ECFDF5":ov==="amber"?"#FFFBEB":ov==="red"?"#FEF2F2":"#F4F7FC";
                    const catBdr = (i===0||sorted[i-1].cat!==f.cat) ? `2px solid ${CAT_HEX[f.cat]}` : undefined;
                    return (
                      <div key={f.name} style={{ display:"flex", alignItems:"center", gap:4, padding:"1.6px 0", background:i%2===0?"#fff":"#F7FAFF", borderTop:catBdr }}>
                        <div style={{ width:12, fontSize:6, color:"#C0CAD8", fontWeight:700, textAlign:"right" as const, flexShrink:0 }}>{i+1}</div>
                        <div style={{ width:88, fontSize:6.5, color:"#0C1A2E", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, flexShrink:0 }}>{f.name}</div>
                        <div style={{ flex:1, height:5, background:"#EEF2F8", borderRadius:3, position:"relative" as const }}>
                          <div style={{ position:"absolute" as const, left:0, top:0, height:5, width:`${sc}%`, background:bc, borderRadius:3, transition:"width 0.3s" }} />
                        </div>
                        <div style={{ width:10, fontSize:6, color:"#8A9AB8", textAlign:"right" as const, flexShrink:0 }}>{sc}%</div>
                        <div style={{ width:44, flexShrink:0, textAlign:"center" as const }}>
                          <span style={{ fontSize:6, fontWeight:700, color:bc, background:bbg, padding:"1px 5px", borderRadius:8 }}>{ragLabel(ov)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* RIGHT: Service availability heatmap */}
                <div style={{ width:138, flexShrink:0 }}>
                  <div style={{ fontSize:7, fontWeight:800, color:"#0C1A2E", letterSpacing:0.8, marginBottom:5, textTransform:"uppercase" as const }}>
                    Service Matrix
                  </div>
                  {/* Column headers */}
                  <div style={{ display:"flex", gap:2, marginBottom:4, paddingBottom:3, borderBottom:"1px solid #EEF2F8" }}>
                    {["INTERNET","BIOMETRIC","PRINTING"].map(h=>(
                      <div key={h} style={{ flex:1, fontSize:5, color:"#8A9AB8", fontWeight:700, textAlign:"center" as const }}>{h}</div>
                    ))}
                  </div>
                  {sorted.map((f,i)=>{
                    const s = state[f.name]??defState();
                    const catBdr = (i===0||sorted[i-1].cat!==f.cat) ? `2px solid ${CAT_HEX[f.cat]}` : undefined;
                    return (
                      <div key={f.name} style={{ display:"flex", gap:2, padding:"1.6px 0", background:i%2===0?"#fff":"#F7FAFF", borderTop:catBdr }}>
                        {([s.internet,s.bio,s.printing] as RAGStatus[]).map((st,j)=>{
                          const dc = st==="green"?"#059669":st==="amber"?"#D97706":st==="red"?"#DC2626":"#9CA3AF";
                          const db = st==="green"?"#ECFDF5":st==="amber"?"#FFFBEB":st==="red"?"#FEF2F2":"#F4F7FC";
                          return (
                            <div key={j} style={{ flex:1, height:7, background:db, borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center", gap:2 }}>
                              <div style={{ width:4,height:4,borderRadius:"50%",background:dc,flexShrink:0 }} />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Summary footer */}
                  <div style={{ marginTop:6, padding:"5px 6px", background:"#F4F7FC", borderRadius:4 }}>
                    <div style={{ fontSize:5.5, color:"#8A9AB8", fontWeight:700, marginBottom:3 }}>DISTRIBUTION</div>
                    {[{l:"Operational",v:sorted.filter(f=>calcOverall(state[f.name]??defState())==="green").length,c:"#059669"},
                      {l:"Degraded",v:sorted.filter(f=>calcOverall(state[f.name]??defState())==="amber").length,c:"#D97706"},
                      {l:"Critical",v:sorted.filter(f=>calcOverall(state[f.name]??defState())==="red").length,c:"#DC2626"}
                    ].map(r=>(
                      <div key={r.l} style={{ display:"flex", justifyContent:"space-between", fontSize:5.5, marginBottom:1.5 }}>
                        <span style={{ color:"#8A9AB8" }}>{r.l}</span>
                        <span style={{ color:r.c, fontWeight:700 }}>{r.v} <span style={{ color:"#C0CAD8" }}>({sorted.length>0?Math.round(r.v/sorted.length*100):0}%)</span></span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
          {/* FOOTER */}
          <div style={{ background: "#0C1A2E", padding: "8px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #C49A1E" }}>
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#C49A1E" }}>{cfg.org}</div>
              <div style={{ fontSize: 7, color: "#3A5A88" }}>IT Department · it.support@imarat.com.pk</div>
            </div>
            {cfg.includeTs && (
              <div style={{ fontSize: 7.5, fontWeight: 700, color: "#8A9AB8", letterSpacing: 0.5 }}>SYSTEM GENERATED REPORT</div>
            )}
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 7.5, color: "#C49A1E" }}>{new Date().toLocaleDateString("en-GB")}</div>
              <div style={{ fontSize: 7, color: "#3A5A88" }}>imarat.com.pk</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#8A9AB8", marginTop: 12, fontStyle: "italic" }}>
        Page 1 of 1 · {cfg.orientation === "landscape" ? "A4 Landscape" : "A4 Portrait"}
        {cfg.divFilter !== "all" && ` · Filtered: ${cfg.divFilter} only`}
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

// ─── PDF Generator — 4-page executive report ──────────────────────────────────
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
  const PAD  = 11;
  const TW   = PW - PAD*2;
  const HDR  = 26;
  const FTR_Y= PH - 11;
  const BODY_TOP = HDR + 4;

  const filtered  = facilities.filter(f => cfg.divFilter==="all" || f.cat===cfg.divFilter);
  const ORDER: Record<string,number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted    = [...filtered].sort((a,b)=>(ORDER[a.cat]??9)-(ORDER[b.cat]??9));
  const total     = facilities.length;
  const grnN      = counts.green;
  const ambN      = counts.amber;
  const redN      = counts.red;
  const healthPct = total>0 ? grnN/total : 0;

  const NAVY:RGB=[12,26,46], NAVYM:RGB=[18,40,72], GOLD:RGB=[196,154,30];
  const WHITE:RGB=[255,255,255], INK:RGB=[18,28,54], MUTED:RGB=[100,120,158];
  const BDR:RGB=[218,226,240], BGLT:RGB=[248,250,254];

  const fr  = (x:number,y:number,w:number,h:number,c:RGB) => { doc.setFillColor(...c); doc.rect(x,y,w,h,"F"); };
  const frr = (x:number,y:number,w:number,h:number,r:number,c:RGB) => { doc.setFillColor(...c); doc.roundedRect(x,y,w,h,r,r,"F"); };
  const txt = (s:string,x:number,y:number,sz:number,c:RGB,b:"bold"|"normal"="normal",a:"left"|"center"|"right"="left") => {
    doc.setFont("helvetica",b); doc.setFontSize(sz); doc.setTextColor(...c); doc.text(s,x,y,{align:a});
  };
  const pbar = (x:number,y:number,w:number,h:number,pct:number,c:RGB) => {
    frr(x,y,w,h,h/2,[218,224,238] as RGB);
    if(pct>0) frr(x,y,Math.max(w*pct,h),h,h/2,c);
  };
  // Filled donut arc segment via polygon approximation
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

  const TOTPG = 4;
  const drawShell = (pg:number, subtitle="") => {
    fr(0,0,PW,PH,BGLT);
    fr(0,0,PW,HDR,NAVY); fr(0,0,PW,2.5,GOLD); fr(0,HDR-0.6,PW,0.6,NAVYM);
    if(cfg.includeLogo&&logoData) doc.addImage(logoData,"PNG",PAD,5,36,12);
    else txt("IMARAT",PAD,15,13,WHITE,"bold");
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
    doc.line(PAD+42,4,PAD+42,22);
    txt(cfg.title,PAD+47,11.5,10,WHITE,"bold");
    txt(subtitle||cfg.subtitle,PAD+47,17,5,GOLD,"bold");
    txt(`${cfg.org}  ·  ${cfg.period||dateStr}`,PAD+47,21.5,3.8,MUTED);
    txt(dateStr,PW-PAD,11,10,GOLD,"bold","right");
    txt(timeStr,PW-PAD,17,5,MUTED,"normal","right");
    if(cfg.includeRef) txt(`Ref: ${refNo}`,PW-PAD,22,3.5,[60,90,135] as RGB,"normal","right");
    fr(0,FTR_Y,PW,PH-FTR_Y,NAVY); fr(0,FTR_Y,PW,0.6,GOLD);
    const fy=FTR_Y+4;
    txt(cfg.org,PAD,fy,5,GOLD,"bold");
    txt("IT Department  ·  it.support@imarat.com.pk",PAD,fy+4,3.5,MUTED);
    if(cfg.includeTs){txt("SYSTEM GENERATED REPORT",PW/2,fy,5,WHITE,"bold","center"); txt(`Ref: ${refNo}`,PW/2,fy+4,3.5,MUTED,"normal","center");}
    txt(`Page ${pg} of ${TOTPG}`,PW-PAD,fy,5,GOLD,"bold","right");
    txt(`${sorted.length} sites monitored`,PW-PAD,fy+4,3.5,MUTED,"normal","right");
  };

  const insight = (() => {
    if(redN>0&&ambN>0) return `${redN} critical and ${ambN} degraded sites detected — immediate IT response required across the estate.`;
    if(redN>0) return `${redN} site${redN>1?"s":""} currently critical — service restoration is the top operational priority.`;
    if(ambN>0) return `${ambN} site${ambN>1?"s":""} operating in a degraded state. No critical failures detected at this time.`;
    return `All ${grnN} monitored facilities are fully operational. Internet, biometric, and print services are healthy across all divisions.`;
  })();
  const drawInsight = (y:number) => {
    frr(PAD,y,TW,10,2,[228,236,252] as RGB);
    doc.setDrawColor(...[44,94,232] as RGB); doc.setLineWidth(2.5); doc.line(PAD,y,PAD,y+10);
    txt("OPERATIONAL INSIGHT",PAD+6,y+3.8,4.5,MUTED,"bold");
    txt(insight,PAD+6,y+8.5,4.8,INK,"normal");
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — EXECUTIVE COMMAND CENTER
  // ══════════════════════════════════════════════════════════════════════════
  drawShell(1,"Executive Intelligence Overview");
  const CT = BODY_TOP+3;

  // ── Health ring (left column, cx≈67) ─────────────────────────────────────
  const RCX=PAD+57, RCY=CT+52, RO=36, RI=26;
  drawArc(RCX,RCY,RO,RI,-90,270,[228,234,246] as RGB);
  const hC:RGB = healthPct>=0.8?gC:healthPct>=0.5?aC:rC;
  if(healthPct>0) drawArc(RCX,RCY,RO,RI,-90,-90+360*healthPct,hC);
  doc.setFillColor(...BGLT); doc.circle(RCX,RCY,RI-0.5,"F");
  // Tick mark per facility
  facilities.forEach((_,ti)=>{
    const ang=(-90+ti*(360/total))*Math.PI/180;
    const sv=state[facilities[ti].name]??defaultState();
    doc.setDrawColor(...ragAccent(calcOverall(sv))); doc.setLineWidth(1);
    doc.line(RCX+(RO+1)*Math.cos(ang),RCY+(RO+1)*Math.sin(ang),RCX+(RO+4)*Math.cos(ang),RCY+(RO+4)*Math.sin(ang));
  });
  txt(`${Math.round(healthPct*100)}%`,RCX,RCY+4,20,hC,"bold","center");
  txt("HEALTH",RCX,RCY+10,5,MUTED,"bold","center");
  txt("OVERALL IT HEALTH",RCX,CT+4,6,NAVY,"bold","center");
  txt(`${total} SITES MONITORED`,RCX,CT+10,4,MUTED,"normal","center");

  // Stat badges below ring
  const stY=RCY+RO+10;
  ([{v:grnN,l:"OPERATIONAL",c:gC,bg:gL},{v:ambN,l:"DEGRADED",c:aC,bg:aL},{v:redN,l:"CRITICAL",c:rC,bg:rL}] as {v:number;l:string;c:RGB;bg:RGB}[]).forEach((st,si)=>{
    const sx=RCX-28+si*28;
    frr(sx-12,stY-5,24,16,2,st.bg);
    txt(String(st.v),sx,stY+4,12,st.c,"bold","center");
    txt(st.l,sx,stY+9.5,3.2,MUTED,"bold","center");
  });
  const tkY=stY+24;
  txt("SUPPORT TICKETS",RCX,tkY,4.5,MUTED,"bold","center");
  ([{v:autoStats.received,l:"Total"},{v:autoStats.resolved,l:"Resolved"},{v:autoStats.pending,l:"Pending"}]).forEach((tk,ti)=>{
    const tx=RCX-28+ti*28;
    txt(String(tk.v),tx,tkY+8,10,[44,94,232] as RGB,"bold","center");
    txt(tk.l,tx,tkY+13.5,3.5,MUTED,"normal","center");
  });

  // ── Key Metrics strip (centre column) ────────────────────────────────────
  const MX=PAD+118, MW=46, MY=CT;
  frr(MX,MY,MW,104,3,WHITE);
  doc.setDrawColor(...BDR); doc.setLineWidth(0.2); doc.roundedRect(MX,MY,MW,104,3,3,"S");
  txt("KEY METRICS",MX+MW/2,MY+7,5,NAVY,"bold","center");
  const kpis=[
    {v:String(total),l:"Total Sites",c:NAVY},
    {v:String(grnN),l:"Operational",c:gC},
    {v:String(ambN),l:"Degraded",c:aC},
    {v:String(redN),l:"Critical",c:rC},
    {v:String(autoStats.received),l:"Tickets",c:[44,94,232] as RGB},
    {v:String(autoStats.pending),l:"Pending",c:aC},
  ];
  kpis.forEach((k,ki)=>{
    const ky=MY+13+ki*14;
    if(ki>0){doc.setDrawColor(...BDR);doc.setLineWidth(0.15);doc.line(MX+3,ky-1,MX+MW-3,ky-1);}
    frr(MX+3,ky+1,3.5,9,1,k.c as RGB);
    txt(k.v,MX+MW-3,ky+10,11,k.c as RGB,"bold","right");
    txt(k.l,MX+9,ky+10,4.5,MUTED,"normal");
  });

  // ── Facility constellation (right column) ────────────────────────────────
  const CNX=PAD+170;
  txt("FACILITY STATUS",CNX,CT+4,6,NAVY,"bold");
  txt("CONSTELLATION",CNX,CT+10,6,NAVY,"bold");
  txt("Each node = one monitored site",CNX,CT+16,3.8,MUTED);
  let legX2=CNX;
  (["Imarat","Projects","Graana","Agency21"] as const).forEach(cat=>{
    doc.setFillColor(...CAT_C[cat]); doc.circle(legX2+2.5,CT+22,2.5,"F");
    txt(cat,legX2+7,CT+24,3.8,INK); legX2+=30;
  });
  const DCOLS=4, DGAP=11, GRID_Y=CT+29;
  sorted.forEach((f,fi)=>{
    const col=fi%DCOLS, row=Math.floor(fi/DCOLS);
    const dx=CNX+col*DGAP+5.5, dy=GRID_Y+row*DGAP+5.5;
    const sv=state[f.name]??defaultState(); const ov=calcOverall(sv);
    doc.setFillColor(...ragFill(ov)); doc.circle(dx,dy,5.5,"F");
    doc.setFillColor(...ragAccent(ov)); doc.circle(dx,dy,4.5,"F");
    doc.setDrawColor(...CAT_C[f.cat]); doc.setLineWidth(0.8); doc.circle(dx,dy,4.5,"S");
    txt(String(fi+1),dx,dy+1.5,3.5,WHITE,"bold","center");
  });
  const legY2=GRID_Y+Math.ceil(sorted.length/DCOLS)*DGAP+6;
  let lkX=CNX;
  ([{l:"Operational",c:gC},{l:"Degraded",c:aC},{l:"Critical",c:rC}] as {l:string;c:RGB}[]).forEach(lk=>{
    doc.setFillColor(...lk.c); doc.circle(lkX+2.5,legY2,2.5,"F");
    txt(lk.l,lkX+7,legY2+1.5,3.8,INK); lkX+=30;
  });

  drawInsight(FTR_Y-14);

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — DIVISION PERFORMANCE LANDSCAPE
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawShell(2,"Division Performance Landscape");
  const D2Y=BODY_TOP+3;
  txt("DIVISION HEALTH COMPARISON",PAD,D2Y+5,7,NAVY,"bold");
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(PAD,D2Y+9,PW-PAD,D2Y+9);

  const CATS=["Imarat","Projects","Graana","Agency21"] as const;
  const DCW=(TW-6)/2, DCH=60, DCY1=D2Y+13, DCY2=DCY1+DCH+5;

  CATS.forEach((cat,ci)=>{
    const dcol=ci%2, drow=Math.floor(ci/2);
    const cx=PAD+dcol*(DCW+6), cy=drow===0?DCY1:DCY2;
    const facs=facilities.filter(f=>f.cat===cat);
    const tot=facs.length;
    const grn=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
    const amb=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="amber").length;
    const red=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="red").length;
    const cc=CAT_C[cat], cbg=CAT_BG[cat];
    const hlth=tot>0?grn/tot:0;
    frr(cx,cy,DCW,DCH,3,cbg);
    frr(cx,cy,4,DCH,2,cc); frr(cx+4,cy,DCW-4,2.5,1,cc);
    txt(cat.toUpperCase(),cx+12,cy+10,8,cc,"bold");
    txt(`${tot} SITES`,cx+DCW-4,cy+10,5.5,cc,"bold","right");
    txt(`${Math.round(hlth*100)}%`,cx+12,cy+23,17,cc,"bold");
    txt("OPERATIONAL",cx+12,cy+29,4,cc,"normal");
    pbar(cx+12,cy+33,DCW-24,5,hlth,cc);
    const ckY=cy+43;
    ([{v:grn,l:"Operational",c:gC,bg:gL},{v:amb,l:"Degraded",c:aC,bg:aL},{v:red,l:"Critical",c:rC,bg:rL}] as {v:number;l:string;c:RGB;bg:RGB}[]).forEach((ck,cki)=>{
      const ckx=cx+12+cki*(DCW-24)/3;
      frr(ckx,ckY-4,(DCW-24)/3-2,18,2,ck.bg);
      txt(String(ck.v),ckx+(DCW-24)/6-1,ckY+6,13,ck.c,"bold","center");
      txt(ck.l,ckx+(DCW-24)/6-1,ckY+11,3.5,MUTED,"normal","center");
    });
    const fnY=cy+DCH-10;
    doc.setDrawColor(...cc); doc.setLineWidth(0.2); doc.line(cx+8,fnY,cx+DCW-4,fnY);
    const names=facs.map(f=>f.name).join(" · ");
    txt(names.length>72?names.slice(0,70)+"…":names,cx+12,fnY+5.5,3.5,cc,"normal");
  });

  const CBAR_Y=DCY2+DCH+8;
  txt("COMPARATIVE SITE DISTRIBUTION",PAD,CBAR_Y,5.5,NAVY,"bold");
  doc.setDrawColor(...BDR); doc.setLineWidth(0.3); doc.line(PAD,CBAR_Y+3,PW-PAD,CBAR_Y+3);
  const maxF=Math.max(...CATS.map(c=>facilities.filter(f=>f.cat===c).length));
  CATS.forEach((cat,ci)=>{
    const facs=facilities.filter(f=>f.cat===cat);
    const bW=Math.max((TW-36)*(facs.length/maxF),4);
    const by=CBAR_Y+7+ci*10;
    txt(cat,PAD,by+6.5,5,CAT_C[cat],"bold");
    frr(PAD+32,by,TW-36,7.5,3.5,[228,234,246] as RGB);
    frr(PAD+32,by,bW,7.5,3.5,CAT_C[cat]);
    const grn=facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
    const hlth=facs.length>0?Math.round(grn/facs.length*100):0;
    if(bW>40) txt(`${hlth}% operational`,PAD+32+bW-44,by+5.5,3.5,WHITE,"bold");
    txt(`${facs.length} sites`,PAD+32+bW+4,by+6,4.5,MUTED);
  });

  drawInsight(FTR_Y-14);

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — FACILITY OPERATIONAL MATRIX
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawShell(3,"Facility Operational Matrix");
  const D3Y=BODY_TOP+2;
  txt("OPERATIONAL STATUS MATRIX",PAD,D3Y+5,7,NAVY,"bold");
  txt("All monitored facilities  ·  Internet · Biometric · Printing",PAD,D3Y+11,4.5,MUTED);
  doc.setDrawColor(...BDR); doc.setLineWidth(0.3); doc.line(PAD,D3Y+14,PW-PAD,D3Y+14);

  const MCOLS=5, MAT_Y=D3Y+18;
  const MCW=TW/MCOLS;
  const MROWS=Math.ceil(sorted.length/MCOLS);
  const MRH=Math.min(20,(FTR_Y-18-MAT_Y)/MROWS);

  sorted.forEach((f,fi)=>{
    const col=fi%MCOLS, row=Math.floor(fi/MCOLS);
    const cx=PAD+col*MCW, cy=MAT_Y+row*MRH;
    const sv=state[f.name]??defaultState(); const ov=calcOverall(sv);
    frr(cx+1,cy+1,MCW-2,MRH-2,2,ragFill(ov));
    frr(cx+1,cy+1,3.5,MRH-2,1.5,CAT_C[f.cat]);
    doc.setFillColor(...ragAccent(ov)); doc.circle(cx+MCW-7,cy+MRH/2,3.5,"F");
    doc.setFillColor(...WHITE); doc.circle(cx+MCW-7,cy+MRH/2,1.5,"F");
    txt(f.name.length>20?f.name.slice(0,18)+"…":f.name,cx+7,cy+MRH*0.42,4.5,INK,"bold");
    const dotY=cy+MRH*0.73;
    ([sv.internet,sv.bio,sv.printing] as RAGStatus[]).forEach((st,si)=>{
      const dotX=cx+7+si*18;
      doc.setFillColor(...ragAccent(st)); doc.circle(dotX+2.5,dotY,2.8,"F");
      txt(["NET","BIO","PRT"][si],dotX+7,dotY+1.5,3.8,ragText(st),"normal");
    });
  });

  const LEGY=MAT_Y+MROWS*MRH+4;
  frr(PAD,LEGY,TW,12,2,[228,236,252] as RGB);
  doc.setDrawColor(...[44,94,232] as RGB); doc.setLineWidth(2); doc.line(PAD,LEGY,PAD,LEGY+12);
  txt("STATUS LEGEND",PAD+5,LEGY+4.5,4.5,MUTED,"bold");
  let llX=PAD+40;
  ([{l:"Operational",c:gC},{l:"Degraded",c:aC},{l:"Critical",c:rC}] as {l:string;c:RGB}[]).forEach(ll=>{
    doc.setFillColor(...ll.c); doc.circle(llX+2.5,LEGY+5,2.5,"F");
    txt(ll.l,llX+7,LEGY+6.5,4,INK); llX+=34;
  });
  txt("Left stripe = Division colour  ·  Right ring = Overall health  ·  NET / BIO / PRT = individual service status",PAD+5,LEGY+10.5,3.5,MUTED);

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 4 — INFRASTRUCTURE SERVICE HEALTH + APPENDIX
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawShell(4,"Infrastructure Service Analysis");
  const D4Y=BODY_TOP+2;
  txt("INFRASTRUCTURE SERVICE HEALTH",PAD,D4Y+5,7,NAVY,"bold");
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(PAD,D4Y+9,PW-PAD,D4Y+9);

  const SVC_Y=D4Y+13, SVC_W=(TW-8)/3, SVC_H=44;
  const svcDefs=[
    {lbl:"INTERNET CONNECTIVITY",key:"internet" as keyof FacilityState,icon:"◉"},
    {lbl:"BIOMETRIC SYSTEMS",key:"bio" as keyof FacilityState,icon:"◈"},
    {lbl:"PRINTING SERVICES",key:"printing" as keyof FacilityState,icon:"◎"},
  ];
  svcDefs.forEach((svc,si)=>{
    const sx=PAD+si*(SVC_W+4);
    const vals=sorted.map(f=>(state[f.name]??defaultState())[svc.key] as RAGStatus);
    const sg=vals.filter(v=>v==="green").length, sa=vals.filter(v=>v==="amber").length;
    const sr=vals.filter(v=>v==="red").length, sn=vals.filter(v=>v==="na").length;
    const sh=vals.length>0?sg/vals.length:0;
    const shC:RGB=sh>=0.8?gC:sh>=0.5?aC:rC;
    frr(sx,SVC_Y,SVC_W,SVC_H,3,WHITE);
    doc.setDrawColor(...BDR); doc.setLineWidth(0.3); doc.roundedRect(sx,SVC_Y,SVC_W,SVC_H,3,3,"S");
    frr(sx,SVC_Y,SVC_W,2.5,1.5,shC);
    txt(svc.icon,sx+SVC_W/2,SVC_Y+10,9,shC,"bold","center");
    txt(svc.lbl,sx+SVC_W/2,SVC_Y+16,5,NAVY,"bold","center");
    txt(`${Math.round(sh*100)}%`,sx+SVC_W/2,SVC_Y+26,15,shC,"bold","center");
    txt("AVAILABILITY",sx+SVC_W/2,SVC_Y+31,4,MUTED,"bold","center");
    pbar(sx+6,SVC_Y+33,SVC_W-12,4,sh,shC);
    const ckY=SVC_Y+40;
    ([{v:sg,l:"Active",c:gC},{v:sa,l:"Partial",c:aC},{v:sr,l:"Down",c:rC},{v:sn,l:"N/A",c:nC}] as {v:number;l:string;c:RGB}[]).forEach((ck,cki)=>{
      const ckx=sx+4+cki*(SVC_W/4);
      txt(String(ck.v),ckx+SVC_W/8,ckY+5,9,ck.c,"bold","center");
      txt(ck.l,ckx+SVC_W/8,ckY+9.5,3.5,MUTED,"normal","center");
    });
  });

  // Compact facility appendix
  const APP_Y=SVC_Y+SVC_H+8;
  txt("FACILITY DETAIL APPENDIX",PAD,APP_Y,6,NAVY,"bold");
  doc.setDrawColor(...BDR); doc.setLineWidth(0.3); doc.line(PAD,APP_Y+3,PW-PAD,APP_Y+3);
  const ACOLS=[
    {h:"#",        w:7,  x:PAD},
    {h:"FACILITY", w:65, x:PAD+7},
    {h:"DIV",      w:25, x:PAD+72},
    {h:"INTERNET", w:25, x:PAD+97},
    {h:"BIOMETRIC",w:25, x:PAD+122},
    {h:"PRINTING", w:25, x:PAD+147},
    {h:"OVERALL",  w:28, x:PAD+172},
    {h:"BANDWIDTH",w:28, x:PAD+200},
  ];
  const ATH_Y=APP_Y+6;
  fr(0,ATH_Y,PW,6,NAVY);
  ACOLS.forEach(col=>txt(col.h,col.x+col.w/2,ATH_Y+4.2,3.8,WHITE,"bold","center"));
  const ARWH=Math.min(5.5,(FTR_Y-16-ATH_Y-6)/sorted.length);
  sorted.forEach((f,fi)=>{
    const sv=state[f.name]??defaultState(); const ov=calcOverall(sv);
    const ry=ATH_Y+6+fi*ARWH;
    fr(0,ry,PW,ARWH,fi%2===0?WHITE:[244,247,252] as RGB);
    frr(PAD,ry,2.5,ARWH,0,CAT_C[f.cat]??NAVY);
    const tc=ry+ARWH*0.72;
    txt(String(fi+1),PAD+3.5,tc,3.5,MUTED,"normal","center");
    txt(f.name.length>22?f.name.slice(0,20)+"…":f.name,PAD+9,tc,3.8,INK,"bold");
    txt(f.cat,PAD+84.5,tc,3.5,CAT_C[f.cat]??NAVY,"bold","center");
    ([sv.internet,sv.bio,sv.printing] as RAGStatus[]).forEach((st,sti)=>{
      const lx=[PAD+109.5,PAD+134.5,PAD+159.5][sti];
      doc.setFillColor(...ragAccent(st)); doc.circle(lx,ry+ARWH/2,2.5,"F");
    });
    frr(PAD+174,ry+1,24,ARWH-2,1,ragFill(ov));
    txt(ragLabel(ov),PAD+186,tc,3.5,ragText(ov),"bold","center");
    if(sv.bandwidth) txt(sv.bandwidth,PAD+214,tc,3.5,MUTED,"normal","center");
  });

  drawInsight(FTR_Y-14);

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
