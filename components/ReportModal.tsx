"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ────────────────────────────────────────────────────────────────────
export type RAGStatus = "green" | "amber" | "red" | "na";
export interface FacilityState {
  internet: RAGStatus; bio: RAGStatus; printing: RAGStatus;
  bandwidth?: string; requiredBandwidth?: string;
  issue?: string; notes?: string; ts?: string;
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

          {/* TABLE */}
          {cfg.includeTable && (
            <div style={{ padding: "6px 20px 10px" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#8A9AB8", letterSpacing: 1, marginBottom: 5, borderTop: "1px solid #DDE4EF", paddingTop: 6 }}>
                FACILITY STATUS DETAIL — {sorted.length} SITES
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                <thead>
                  <tr style={{ background: "#0C1A2E" }}>
                    {["#","Facility","Division","Internet","Biometric","Printing","Status","Updated"].map(h => (
                      <th key={h} style={{ padding: "5px 6px", color: "#fff", fontWeight: 700, textAlign: "left" as const, fontSize: 8, whiteSpace: "nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 8).map((f, i) => {
                    const s = state[f.name] ?? defState();
                    const ov = calcOverall(s);
                    const ovCol = ov==="green"?"#059669":ov==="amber"?"#D97706":ov==="red"?"#DC2626":"#8A9AB8";
                    const ovBg = ov==="green"?"#ECFDF5":ov==="amber"?"#FFFBEB":ov==="red"?"#FEF2F2":"#F4F7FC";
                    return (
                      <tr key={f.name} style={{ background: i%2===0?"#fff":"#F7FAFF" }}>
                        <td style={{ padding: "3.5px 6px", color: "#8A9AB8", fontSize: 8 }}>{i+1}</td>
                        <td style={{ padding: "3.5px 6px", fontWeight: 700, color: "#0C1A2E", fontSize: 8.5, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.name}</td>
                        <td style={{ padding: "3.5px 6px" }}>
                          <span style={{ fontSize: 7.5, fontWeight: 700, color: CAT_HEX[f.cat], background: CAT_BGHEX[f.cat], padding: "1px 6px", borderRadius: 10 }}>{f.cat}</span>
                        </td>
                        <td style={{ padding: "3.5px 6px", fontSize: 8 }}>{iLabel(s.internet)}</td>
                        <td style={{ padding: "3.5px 6px", fontSize: 8 }}>{bLabel(s.bio)}</td>
                        <td style={{ padding: "3.5px 6px", fontSize: 8 }}>{pLabel(s.printing)}</td>
                        <td style={{ padding: "3.5px 6px" }}>
                          <span style={{ fontSize: 7.5, fontWeight: 700, color: ovCol, background: ovBg, padding: "1px 7px", borderRadius: 10 }}>{ragLabel(ov)}</span>
                        </td>
                        <td style={{ padding: "3.5px 6px", fontSize: 7.5, color: "#8A9AB8" }}>{s.ts ? s.ts.slice(5,16).replace("T"," ") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sorted.length > 8 && (
                <div style={{ textAlign: "center" as const, fontSize: 8, color: "#8A9AB8", padding: "5px 0 2px", fontStyle: "italic" }}>
                  ··· {sorted.length - 8} more facilities not shown in preview ···
                </div>
              )}
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

// ─── PDF Generator ────────────────────────────────────────────────────────────
async function generatePDF(
  cfg: ReportConfig,
  facilities: { name: string; cat: string }[],
  state: Record<string, FacilityState>,
  counts: Record<RAGStatus, number>,
  autoStats: { received: number; resolved: number; pending: number },
  calcOverall: (s: FacilityState) => RAGStatus,
  defaultState: () => FacilityState,
): Promise<string> {
  // Load & invert logo
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

  const d = new Date();
  const dateStr = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  const timeStr = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const refNo   = `IGC-IT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
  const fileName = `Imarat_IT_RAG_${d.toISOString().slice(0,10)}.pdf`;

  const doc = new jsPDF({ orientation: cfg.orientation, unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const PAD = 11;
  const TW  = PW - PAD * 2;

  // Filtered + sorted facilities
  const filtered = facilities.filter(f => cfg.divFilter === "all" || f.cat === cfg.divFilter);
  const ORDER: Record<string,number> = { Imarat:0, Projects:1, Graana:2, Agency21:3 };
  const sorted  = [...filtered].sort((a,b) => (ORDER[a.cat]??9)-(ORDER[b.cat]??9));
  const total   = facilities.length;
  const healthPct = total > 0 ? counts.green / total : 0;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fr  = (x:number,y:number,w:number,h:number,c:RGB) => { doc.setFillColor(...c); doc.rect(x,y,w,h,"F"); };
  const frr = (x:number,y:number,w:number,h:number,r:number,c:RGB) => { doc.setFillColor(...c); doc.roundedRect(x,y,w,h,r,r,"F"); };
  const txt = (s:string,x:number,y:number,sz:number,c:RGB,b:"bold"|"normal"="normal",a:"left"|"center"|"right"="left") => {
    doc.setFont("helvetica",b); doc.setFontSize(sz); doc.setTextColor(...c); doc.text(s,x,y,{align:a});
  };
  const card = (x:number,y:number,w:number,h:number) => {
    doc.setFillColor(205,213,230); doc.roundedRect(x+0.8,y+0.8,w,h,2,2,"F");
    doc.setFillColor(255,255,255); doc.roundedRect(x,y,w,h,2,2,"F");
  };
  const pbar = (x:number,y:number,w:number,h:number,pct:number,c:RGB) => {
    frr(x,y,w,h,h/2,[218,224,238]); if(pct>0) frr(x,y,Math.max(w*pct,h),h,h/2,c);
  };

  // Navy, Gold, White
  const NAVY: RGB = [12,26,46];
  const NAVYM: RGB = [18,40,72];
  const GOLD: RGB = [196,154,30];
  const GOLDL: RGB = [232,200,96];
  const WHITE: RGB = [255,255,255];
  const INK: RGB   = [18,28,54];
  const MUTED: RGB = [100,120,158];
  const BDR: RGB   = [218,226,240];
  const BG: RGB    = [242,245,252];

  // Layout
  const HDR = 26;
  const KY = 27.5, KH = 15;
  const DY = 43.5, DH = 16;
  const SY = 61;
  const TBL_START = 66;
  const FTR_Y = PH - 12;

  // PAGE BG
  fr(0,0,PW,PH,BG);

  // ── HEADER ─────────────────────────────────────────────────────────────────
  fr(0,0,PW,HDR,NAVY);
  fr(0,0,PW,2.5,GOLD);     // gold top rule
  fr(0,HDR-0.7,PW,0.7,NAVYM);

  // Logo (white on navy)
  if (cfg.includeLogo && logoData) {
    doc.addImage(logoData, "PNG", PAD, 5, 38, 13);
  } else {
    txt("IMARAT", PAD, 15, 13, WHITE, "bold");
  }
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.5);
  doc.line(PAD+44, 4, PAD+44, 23);

  txt(cfg.title,    PAD+49, 11.5, 11, WHITE,  "bold");
  txt(cfg.subtitle, PAD+49, 17,   5.5, GOLD,   "bold");
  txt(`${cfg.org}  ·  ${cfg.period||dateStr}`, PAD+49, 22, 4, MUTED);
  txt(dateStr,  PW-PAD, 11, 10.5, GOLD,  "bold",   "right");
  txt(timeStr,  PW-PAD, 17.5, 5.5, MUTED, "normal", "right");
  if(cfg.includeRef) txt(`Ref: ${refNo}`, PW-PAD, 22.5, 3.8, [60,90,135] as RGB, "normal", "right");

  // ── KPI ROW ────────────────────────────────────────────────────────────────
  if (cfg.includeKPIs) {
    fr(0,KY-1,PW,KH+2,[230,236,250] as RGB);
    const kpis = [
      { val:String(total),               lbl:"TOTAL SITES",  c:NAVY },
      { val:String(counts.green),        lbl:"OPERATIONAL",  c:gC   },
      { val:String(counts.amber),        lbl:"DEGRADED",     c:aC   },
      { val:String(counts.red),          lbl:"CRITICAL",     c:rC   },
      { val:String(autoStats.received),  lbl:"TICKETS",      c:[44,94,232] as RGB },
      { val:String(autoStats.resolved),  lbl:"RESOLVED",     c:gC   },
      { val:String(autoStats.pending),   lbl:"PENDING",      c:aC   },
    ];
    const KW = TW / kpis.length;
    kpis.forEach((k,i) => {
      const x = PAD + i*KW;
      card(x+0.5, KY, KW-1, KH);
      frr(x+0.5,KY,KW-1,2,1,k.c); fr(x+0.5,KY+1,KW-1,1,k.c);
      txt(k.val, x+KW/2, KY+9.5, 14, k.c, "bold", "center");
      txt(k.lbl, x+KW/2, KY+13.2, 4, MUTED, "bold", "center");
    });
  }

  // ── DIVISION ROW ───────────────────────────────────────────────────────────
  if (cfg.includeDivs) {
    fr(0,DY-0.5,PW,DH+1.5,WHITE);
    const hCol: RGB = healthPct>=0.8?gC:healthPct>=0.5?aC:rC;
    const HSW = 50;
    const dGap = 2;
    const dW   = (TW-HSW-dGap)/4-0.8;

    // Health card
    frr(PAD,DY,HSW,DH,2,NAVY);
    txt("OVERALL HEALTH", PAD+HSW/2, DY+4.5, 4.5, MUTED, "bold", "center");
    txt(`${Math.round(healthPct*100)}%`, PAD+HSW/2, DY+12.5, 18, hCol, "bold", "center");
    frr(PAD+4,DY+DH-3,HSW-8,2,1,[22,40,72] as RGB);
    if(healthPct>0) frr(PAD+4,DY+DH-3,Math.max((HSW-8)*healthPct,2),2,1,hCol);

    // Division cards
    (["Imarat","Projects","Graana","Agency21"] as const).forEach((cat,ci) => {
      const facs  = facilities.filter(f=>f.cat===cat);
      const tot   = facs.length;
      const grn   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="green").length;
      const amb   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="amber").length;
      const red   = facs.filter(f=>calcOverall(state[f.name]??defaultState())==="red").length;
      const cx    = PAD+HSW+dGap+ci*(dW+1);
      const ac    = CAT_C[cat];
      const bgc   = CAT_BG[cat];

      frr(cx,DY,dW,DH,2,bgc);
      frr(cx,DY,dW,2,1,ac); fr(cx,DY+1,dW,1,ac);
      txt(cat.toUpperCase(),cx+3,DY+6,5.5,ac,"bold");
      txt(`${tot}`,cx+dW-3,DY+6,5.5,ac,"bold","right");
      const sbX=cx+3,sbW=dW-6,sbY=DY+8,sbH=2.2;
      frr(sbX,sbY,sbW,sbH,sbH/2,[200,215,232] as RGB);
      let bx=sbX;
      if(grn>0){const bw=sbW*(grn/tot);frr(bx,sbY,bw,sbH,sbH/2,gC);bx+=bw;}
      if(amb>0){const bw=sbW*(amb/tot);fr(bx,sbY,bw,sbH,aC);bx+=bw;}
      if(red>0) frr(bx,sbY,sbW*(red/tot),sbH,sbH/2,rC);
      const cw=dW/3;
      ([{v:grn,c:gC},{v:amb,c:aC},{v:red,c:rC}] as {v:number;c:RGB}[]).forEach((col,li)=>{
        txt(String(col.v),cx+li*cw+cw/2,DY+14.5,8,col.c,"bold","center");
      });
    });
  }

  // ── SECTION DIVIDER ────────────────────────────────────────────────────────
  doc.setDrawColor(...BDR); doc.setLineWidth(0.3);
  doc.line(PAD,SY,PW-PAD,SY);
  txt("FACILITY STATUS DETAIL", PAD, SY+4.5, 5.5, NAVY, "bold");
  // Legend
  const lgDefs = [{lbl:"Operational",c:gC},{lbl:"Degraded",c:aC},{lbl:"Critical",c:rC},{lbl:"Not Set",c:nC}];
  let lgX=PW-PAD;
  [...lgDefs].reverse().forEach(lg=>{
    doc.setFont("helvetica","normal"); doc.setFontSize(4.8);
    const tw=doc.getTextWidth(lg.lbl); lgX-=tw;
    txt(lg.lbl,lgX,SY+4.5,4.8,INK);
    lgX-=5.5; doc.setFillColor(...lg.c); doc.circle(lgX,SY+3,1.4,"F"); lgX-=3.5;
  });

  // ── TABLE ──────────────────────────────────────────────────────────────────
  const facRows = sorted.map((f,i) => {
    const s  = state[f.name]??defaultState();
    const ov = calcOverall(s);
    return {
      d:[String(i+1),f.name,f.cat,iLabel(s.internet),bLabel(s.bio),pLabel(s.printing),ragLabel(ov),s.ts?s.ts.replace("T"," ").slice(5,16):"—",s.issue||""],
      internet:s.internet,bio:s.bio,printing:s.printing,overall:ov,cat:f.cat,prevCat:i>0?sorted[i-1].cat:"",
    };
  });

  autoTable(doc,{
    startY:TBL_START, tableWidth:TW,
    margin:{left:PAD,right:PAD,bottom:14},
    head:[["#","Facility Name","Division","Internet","Biometric","Printing","RAG Status","Updated","Notes"]],
    body:facRows.map(r=>r.d),
    styles:{font:"helvetica",fontSize:5.2,cellPadding:{top:1.3,bottom:1.3,left:2,right:2},minCellHeight:3.5,valign:"middle",overflow:"ellipsize",textColor:INK,fillColor:WHITE,lineColor:BDR,lineWidth:0.1},
    headStyles:{fillColor:NAVY,textColor:WHITE,fontStyle:"bold",fontSize:5.2,halign:"center",cellPadding:{top:2.5,bottom:2.5,left:2,right:2},minCellHeight:7.5,lineWidth:0},
    alternateRowStyles:{fillColor:[244,247,253] as RGB},
    columnStyles:{
      0:{cellWidth:5.5,halign:"center",fontStyle:"bold",textColor:MUTED},
      1:{cellWidth:40,fontStyle:"bold",textColor:NAVY},
      2:{cellWidth:16,halign:"center"},
      3:{cellWidth:16,halign:"center"},
      4:{cellWidth:15,halign:"center"},
      5:{cellWidth:13,halign:"center"},
      6:{cellWidth:21,halign:"center",fontStyle:"bold"},
      7:{cellWidth:17,halign:"center"},
      8:{cellWidth:"auto" as any},
    },
    didParseCell:(data:any)=>{
      if(data.section!=="body") return;
      const row=facRows[data.row.index]; if(!row) return;
      const sm:Record<number,RAGStatus>={3:row.internet,4:row.bio,5:row.printing,6:row.overall};
      const st=sm[data.column.index];
      if(st){data.cell.styles.fillColor=ragFill(st);data.cell.styles.textColor=ragText(st);data.cell.styles.fontStyle="bold";}
      if(data.column.index===2){data.cell.styles.fillColor=CAT_BG[row.cat];data.cell.styles.textColor=CAT_C[row.cat];data.cell.styles.fontStyle="bold";}
      if(data.column.index===7){data.cell.styles.textColor=MUTED;data.cell.styles.fontSize=4.5;}
      if(data.column.index===8&&row.d[8]){data.cell.styles.textColor=rD;data.cell.styles.fontStyle="italic";}
      if(row.cat!==row.prevCat&&data.row.index>0){data.cell.styles.lineColor=CAT_C[row.cat]??BDR;data.cell.styles.lineWidth=0.5;}
    },
    didDrawCell:(data:any)=>{
      if(data.section==="body"&&data.column.index===0){
        const row=facRows[data.row.index];
        if(row&&row.cat!==row.prevCat){doc.setFillColor(...(CAT_C[row.cat]??NAVY));doc.rect(data.cell.x,data.cell.y,1.8,data.cell.height,"F");}
      }
    },
  });

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  fr(0,FTR_Y,PW,PH-FTR_Y,NAVY); fr(0,FTR_Y,PW,0.6,GOLD);
  const f1=FTR_Y+4, f2=FTR_Y+7.6, f3=FTR_Y+10.8;
  txt(cfg.org, PAD, f1, 5.5, GOLD, "bold");
  txt("IT Department  ·  it.support@imarat.com.pk", PAD, f2, 4, MUTED);
  txt("CONFIDENTIAL — AUTHORISED PERSONNEL ONLY", PAD, f3, 3.5, [60,90,135] as RGB);
  if(cfg.includeTs) {
    txt("SYSTEM GENERATED REPORT", PW/2, f1, 5.5, WHITE, "bold", "center");
    txt(`RAG Dashboard  ·  Ref: ${refNo}`, PW/2, f2, 4, MUTED, "normal", "center");
  }
  txt(`${dateStr}  ·  ${timeStr}`, PW-PAD, f1, 5.5, GOLD, "bold", "right");
  txt(`${filtered.length} Sites Monitored`, PW-PAD, f2, 4, MUTED, "normal", "right");
  txt("imarat.com.pk", PW-PAD, f3, 3.5, [60,90,135] as RGB, "normal", "right");

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
