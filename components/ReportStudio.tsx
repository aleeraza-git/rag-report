"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Report Studio — compose, preview, export.
//
// The window is explicit: presets for the common cases plus from/to dates, so a
// daily 09:00-to-09:00 report is one click and an arbitrary window is two.
// Every figure is evaluated as at the END of the window and compared against the
// equally-sized window before it, which is what makes a recurring report useful:
// the reader wants "versus last time", not an absolute they have to remember.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import {
  T, Eyebrow, Num, Delta, Dot, Pill, Meter, StackedArea, DivergingBars,
  Heatmap, ChartLegend, Dur, statusColor, statusLabel,
} from "./ui";
import {
  reconstructRange, attentionInRange, changesBetween, divisionPerformanceRange,
  divisionSeries, serviceStatsAt, bandwidthDeficitsAt, verdict,
  overallOf, fmtDuration, mttrByService, dailyChurn, facilityDayMatrix,
  worstPerformers, comparePeriods, rangeDays, rangeOf, fmtRange, stateAsAt,
  periodActivity, activityTotals,
  toDateInput, fromDateInput, SERVICES, SERVICE_LABEL,
  type FacState, type LogEntry, type RAG, type DateRange,
} from "@/lib/analytics";
import { buildReport, type ReportOptions } from "@/lib/reportPdf";

type Preset = "board" | "executive" | "operational";

const PRESETS: Record<Preset,{ label:string; blurb:string; sections:ReportOptions["sections"] }> = {
  board:       { label:"Board",       blurb:"One page. Verdict, KPIs, composition and division ranking.",
                 sections:{analysis:false, appendix:false} },
  executive:   { label:"Executive",   blurb:"Two pages. Adds service reliability, volume and exceptions.",
                 sections:{analysis:true,  appendix:false} },
  operational: { label:"Operational", blurb:"Three pages. Adds the availability grid and full register.",
                 sections:{analysis:true,  appendix:true} },
};

const RANGE_PRESETS = [
  { k:"today",     label:"Today"      },
  { k:"yesterday", label:"Yesterday"  },
  { k:"last7",     label:"7 days"     },
  { k:"last14",    label:"14 days"    },
  { k:"last30",    label:"30 days"    },
  { k:"thisMonth", label:"This month" },
] as const;

interface Props {
  facilities: { name:string; cat:string }[];
  state: Record<string, FacState>;
  log: LogEntry[];
  org: string;
}

function analyse(
  fac: { name:string; cat:string }[],
  state: Record<string, FacState>,
  log: LogEntry[],
  range: DateRange,
) {
    const hist    = reconstructRange(fac, state, log, range);
    const attn    = attentionInRange(fac, state, log, range);
    const change  = changesBetween(log, range);
    const divs    = divisionPerformanceRange(fac, state, log, range);
    const divSer  = divisionSeries(fac, state, log, range);
    const atEnd   = stateAsAt(fac, state, log, range.to);
    const svcs    = serviceStatsAt(fac, atEnd, hist);
    const mttr    = mttrByService(log, range);
    const churn   = dailyChurn(log, range);
    const worst   = worstPerformers(fac, state, log, range, 8);
    const matrix  = facilityDayMatrix(fac, state, log, range, 14);
    const cmp     = comparePeriods(fac, state, log, range);
    const acts    = periodActivity(fac, state, log, range);
    const actT    = activityTotals(acts);
    const bw      = bandwidthDeficitsAt(fac, state, log, range);
    const series  = hist.points.map(p=>p.health);
    const health  = series[series.length-1] ?? 0;
    const trend   = hist.coverage>0 && series.length>1 ? (health-series[0])*100 : null;
    const v       = verdict(health, attn, change, trend);
    const counts  = {green:0,amber:0,red:0,na:0} as Record<RAG,number>;
    const last    = hist.points[hist.points.length-1];
    if (last) { counts.green=last.green; counts.amber=last.amber; counts.red=last.red; counts.na=last.na; }
    return { hist,attn,change,divs,divSer,svcs,mttr,churn,worst,matrix,cmp,bw,acts,actT,series,health,trend,v,counts };
}

export default function ReportStudio({ facilities, state, log, org }: Props) {
  const [preset, setPreset]     = useState<Preset>("executive");
  const [rangeKey, setRangeKey] = useState<string>("last7");
  const [custom, setCustom]     = useState<{from:string;to:string}>({
    from: toDateInput(Date.now()-6*864e5), to: toDateInput(Date.now()),
  });
  const [divFilter, setDiv]     = useState("all");
  const [sections, setSec]      = useState(PRESETS.executive.sections);
  const [confidential, setConf] = useState(true);
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState<string|null>(null);

  const range: DateRange = useMemo(()=>{
    if (rangeKey === "custom") {
      const from = fromDateInput(custom.from);
      const to   = Math.min(fromDateInput(custom.to, true), Date.now());
      return from < to ? { from, to, label:"Custom" } : { from:to-864e5, to, label:"Custom" };
    }
    return (rangeOf as any)[rangeKey]() as DateRange;
  },[rangeKey, custom]);

  const divisions = useMemo(()=>Array.from(new Set(facilities.map(f=>f.cat))),[facilities]);
  const fac = useMemo(()=>facilities.filter(f=>divFilter==="all"||f.cat===divFilter),[facilities,divFilter]);

  const a = useMemo(()=>analyse(fac, state, log, range),[fac,state,log,range]);

  const hasHist = a.hist.coverage > 0.02;
  const total = fac.length || 1;
  const days = rangeDays(range);

  // heatmap rows — problem sites first, healthy ones collapse into the footnote
  const heatRows = useMemo(()=>{
    const rows = a.matrix.facilities.map(name=>({
      name, states: a.matrix.days.map(d=>d.status[name] ?? "na" as RAG),
    }));
    const rank = (r:typeof rows[0]) => r.states.reduce((s,x)=> s + (x==="red"?3:x==="amber"?2:x==="na"?1:0), 0);
    return rows.filter(r=>rank(r)>0).sort((x,y)=>rank(y)-rank(x))
      .concat(rows.filter(r=>rank(r)===0));
  },[a.matrix]);

  const pageCount = 1 + (sections.analysis?1:0) + (sections.appendix?1:0);

  const exportPdf = async () => {
    setBusy(true); setDone(null);
    try {
      const name = await buildReport(facilities, state, log, {
        title:"IT Operations Report", org, period:fmtRange(range), author:"IT Department",
        range, divFilter, sections, confidential,
      });
      setDone(name);
    } catch(e){ console.error("Report export failed", e); }
    setBusy(false);
  };

  const field: React.CSSProperties = {
    width:"100%", padding:"7px 9px", borderRadius:5, border:`1px solid ${T.line}`,
    background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:11.5, outline:"none",
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"282px minmax(0,1fr)", gap:24, alignItems:"start" }}>

      {/* ── Composer rail ────────────────────────────────────────────────── */}
      <aside style={{ position:"sticky", top:20, display:"flex", flexDirection:"column", gap:18,
                      maxHeight:"calc(100vh - 40px)", overflowY:"auto", paddingRight:4 }}>

        {/* Reporting period — the primary control */}
        <div>
          <Eyebrow style={{ marginBottom:8 }}>Reporting period</Eyebrow>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4, marginBottom:8 }}>
            {RANGE_PRESETS.map(p=>{
              const on = rangeKey===p.k;
              return (
                <button key={p.k} onClick={()=>{setRangeKey(p.k);setDone(null);}}
                  style={{ padding:"7px 4px", borderRadius:4, cursor:"pointer",
                           border:`1px solid ${on?T.ink:T.line}`, background:on?T.ink:T.surface,
                           color:on?"#fff":T.ink2, fontFamily:T.sans, fontSize:11,
                           fontWeight:on?600:500, whiteSpace:"nowrap" }}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <button onClick={()=>{setRangeKey("custom");setDone(null);}}
            style={{ width:"100%", padding:"7px 4px", borderRadius:4, cursor:"pointer",
                     border:`1px solid ${rangeKey==="custom"?T.ink:T.line}`,
                     background:rangeKey==="custom"?T.ink:T.surface,
                     color:rangeKey==="custom"?"#fff":T.ink2, fontFamily:T.sans,
                     fontSize:11, fontWeight:rangeKey==="custom"?600:500 }}>
            Custom range
          </button>
          {rangeKey==="custom" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
              <label>
                <Eyebrow style={{ fontSize:8.5, marginBottom:4 }}>From</Eyebrow>
                <input type="date" value={custom.from} max={custom.to} style={field}
                  onChange={e=>{setCustom(c=>({...c,from:e.target.value}));setDone(null);}} />
              </label>
              <label>
                <Eyebrow style={{ fontSize:8.5, marginBottom:4 }}>To</Eyebrow>
                <input type="date" value={custom.to} min={custom.from} max={toDateInput(Date.now())} style={field}
                  onChange={e=>{setCustom(c=>({...c,to:e.target.value}));setDone(null);}} />
              </label>
            </div>
          )}
          <div style={{ marginTop:9, padding:"8px 10px", background:T.sunken, borderRadius:4 }}>
            <div style={{ fontFamily:T.mono, fontSize:11, color:T.ink }}>{fmtRange(range)}</div>
            <div style={{ fontFamily:T.sans, fontSize:10, color:T.ink3, marginTop:2 }}>
              {days} day{days>1?"s":""} · compared against the {days} day{days>1?"s":""} before
            </div>
          </div>
          {!hasHist && (
            <div style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink4, marginTop:8, lineHeight:1.45 }}>
              No recorded changes inside this window — trend sections will say so rather than draw a flat line.
            </div>
          )}
        </div>

        <div>
          <Eyebrow style={{ marginBottom:8 }}>Audience</Eyebrow>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {(Object.keys(PRESETS) as Preset[]).map(p=>{
              const on = preset===p;
              return (
                <button key={p} onClick={()=>{setPreset(p);setSec(PRESETS[p].sections);setDone(null);}}
                  style={{ textAlign:"left", padding:"10px 12px", borderRadius:5, cursor:"pointer",
                           border:`1px solid ${on?T.ink:T.line}`, background:on?T.ink:T.surface,
                           color:on?"#fff":T.ink, fontFamily:T.sans }}>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>{PRESETS[p].label}</div>
                  <div style={{ fontSize:10.5, color:on?"rgba(255,255,255,0.66)":T.ink3, marginTop:2, lineHeight:1.4 }}>
                    {PRESETS[p].blurb}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Eyebrow style={{ marginBottom:8 }}>Scope</Eyebrow>
          <select value={divFilter} onChange={e=>{setDiv(e.target.value);setDone(null);}}
            style={{ ...field, fontFamily:T.sans, fontSize:12.5 }}>
            <option value="all">All divisions ({facilities.length} sites)</option>
            {divisions.map(d=>(
              <option key={d} value={d}>{d} ({facilities.filter(f=>f.cat===d).length} sites)</option>
            ))}
          </select>
        </div>

        <div>
          <Eyebrow style={{ marginBottom:8 }}>Sections</Eyebrow>
          {([
            ["analysis","Analysis","Service reliability, volume, exceptions"],
            ["appendix","Availability & register","Day-by-day grid, full list"],
          ] as const).map(([k,label,sub])=>{
            const on = sections[k];
            return (
              <label key={k} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"8px 2px", cursor:"pointer" }}>
                <input type="checkbox" checked={on}
                  onChange={e=>{setSec(sc=>({...sc,[k]:e.target.checked}));setDone(null);}}
                  style={{ marginTop:2, accentColor:T.ink }} />
                <span>
                  <span style={{ display:"block", fontFamily:T.sans, fontSize:12, color:T.ink, fontWeight:500 }}>{label}</span>
                  <span style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink4 }}>{sub}</span>
                </span>
              </label>
            );
          })}
        </div>

        <label style={{ display:"flex", gap:10, alignItems:"center", cursor:"pointer" }}>
          <input type="checkbox" checked={confidential} onChange={e=>setConf(e.target.checked)}
                 style={{ accentColor:T.ink }} />
          <span style={{ fontFamily:T.sans, fontSize:12, color:T.ink2 }}>Mark confidential</span>
        </label>

        <div style={{ borderTop:`1px solid ${T.line}`, paddingTop:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink3 }}>Estimated length</span>
            <Num size={11.5} color={T.ink}>{pageCount} page{pageCount>1?"s":""}</Num>
          </div>
          <button onClick={exportPdf} disabled={busy}
            style={{ width:"100%", padding:"11px 14px", borderRadius:5, border:"none",
                     background:busy?T.ink3:T.ink, color:"#fff", cursor:busy?"wait":"pointer",
                     fontFamily:T.sans, fontSize:13, fontWeight:600 }}>
            {busy ? "Generating…" : "Export PDF"}
          </button>
          {done && (
            <div style={{ marginTop:10, padding:"9px 11px", background:T.okBg, borderRadius:4 }}>
              <div style={{ fontFamily:T.sans, fontSize:11, color:T.ok, fontWeight:600 }}>Downloaded</div>
              <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.ok, marginTop:2, wordBreak:"break-all" }}>{done}</div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Live document preview ────────────────────────────────────────── */}
      <div style={{ background:T.sunken, borderRadius:8, padding:"26px 0", border:`1px solid ${T.line}` }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:22 }}>
          <Sheet n={1} label="Executive summary">
            <PageDashboard a={a} total={total} range={range} days={days} fac={fac}
                           divFilter={divFilter} hasHist={hasHist} confidential={confidential} />
          </Sheet>
          {sections.analysis && (
            <Sheet n={2} label="Analysis">
              <PageAnalysis a={a} hasHist={hasHist} />
            </Sheet>
          )}
          {sections.appendix && (
            <Sheet n={2+(sections.analysis?1:0)} label="Availability & register">
              <PageAvailability a={a} heatRows={heatRows} fac={fac} state={state} />
            </Sheet>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page shell: true A4 portrait proportion ──────────────────────────────────
function Sheet({ n, label, children }:{ n:number; label:string; children:React.ReactNode }) {
  const W = 620, H = Math.round(W*1.414);
  return (
    <div>
      <Eyebrow style={{ marginBottom:7, marginLeft:2 }}>{n} · {label}</Eyebrow>
      <div style={{ width:W, height:H, background:"#fff", border:`1px solid ${T.line}`,
                    boxShadow:"0 2px 14px rgba(24,24,27,0.07)", padding:"30px 34px",
                    display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:10, paddingBottom:7,
                      borderBottom:`1px solid ${T.line}`, marginBottom:14 }}>
          <span style={{ fontFamily:T.sans, fontSize:9, fontWeight:700, color:T.ink, letterSpacing:"0.08em" }}>IMARAT GROUP</span>
          <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink3 }}>IT Operations Report</span>
          <span style={{ marginLeft:"auto", fontFamily:T.sans, fontSize:9, color:T.ink3 }}>{label}</span>
        </div>
        <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>{children}</div>
        <div style={{ paddingTop:9, marginTop:10, borderTop:`1px solid ${T.line}`,
                      display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontFamily:T.sans, fontSize:8, color:T.ink4 }}>
            Imarat Group · IT Department · system generated
          </span>
          <span style={{ fontFamily:T.mono, fontSize:8, color:T.ink4 }}>{n}</span>
        </div>
      </div>
    </div>
  );
}

type A = ReturnType<typeof analyse>;

const Rule = ({ strong=false, my=0 }:{ strong?:boolean; my?:number }) => (
  <div style={{ height:strong?1.5:1, background:strong?T.ink:T.line, margin:`${my}px 0` }} />
);

/** Ring gauge — mirrors drawGauge() in the PDF. */
function Gauge({ pct, color, size=120, thickness=16 }:
  { pct:number; color:string; size?:number; thickness?:number }) {
  const r = (size - thickness) / 2, c = 2 * Math.PI * r, cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
         aria-label={`capacity ${Math.round(pct*100)} percent`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={T.sunken} strokeWidth={thickness} />
      {pct > 0.001 && (
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={thickness}
                strokeDasharray={`${c*Math.min(pct,1)} ${c}`} strokeLinecap="butt"
                style={{ transform:"rotate(-90deg)", transformOrigin:`${cx}px ${cx}px` }} />
      )}
    </svg>
  );
}

/** Half-ring gauge — mirrors drawHalfGauge(). */
function HalfGauge({ pct, color, size=76, thickness=11 }:
  { pct:number; color:string; size?:number; thickness?:number }) {
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const semi = Math.PI * r;
  return (
    <svg width={size} height={size/2 + 3} viewBox={`0 0 ${size} ${size/2+3}`} role="img"
         aria-label={`${Math.round(pct*100)} percent available`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.sunken} strokeWidth={thickness}
              strokeDasharray={`${semi} ${semi*2}`}
              style={{ transform:"rotate(180deg)", transformOrigin:`${cx}px ${cy}px` }} />
      {pct > 0.001 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={thickness}
                strokeDasharray={`${semi*Math.min(pct,1)} ${semi*2}`} strokeLinecap="butt"
                style={{ transform:"rotate(180deg)", transformOrigin:`${cx}px ${cy}px` }} />
      )}
    </svg>
  );
}

/** Ranked horizontal bars on a shared 0-100 scale — mirrors drawRankedBars(). */
function RankedBars({ rows }:{ rows:{ label:string; value:number; sub?:string; c:string; delta?:number|null }[] }) {
  return (
    <div style={{ position:"relative" }}>
      <div style={{ position:"absolute", inset:0, left:88, right:44, pointerEvents:"none" }}>
        {[0,50,100].map(g=>(
          <div key={g} style={{ position:"absolute", left:`${g}%`, top:0, bottom:14,
                                width:1, background:g===0?T.line:T.lineSoft }} />
        ))}
      </div>
      {rows.map(r=>(
        <div key={r.label} style={{ display:"grid", gridTemplateColumns:"88px 1fr 44px",
              alignItems:"center", gap:0, height:24 }}>
          <span style={{ display:"flex", alignItems:"baseline", gap:5, minWidth:0, paddingRight:8 }}>
            <span style={{ fontFamily:T.sans, fontSize:9.5, color:T.ink,
                           overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.label}</span>
            {r.sub && <span style={{ fontFamily:T.mono, fontSize:7, color:T.ink4, flexShrink:0 }}>{r.sub}</span>}
          </span>
          <span style={{ position:"relative", height:9 }}>
            <span style={{ position:"absolute", left:0, top:0, height:9,
                           width:`${Math.min(r.value,100)}%`, background:r.c }} />
          </span>
          <span style={{ display:"flex", alignItems:"baseline", justifyContent:"flex-end", gap:4 }}>
            <Num size={10} color={r.c}>{Math.round(r.value)}%</Num>
          </span>
        </div>
      ))}
      <div style={{ display:"grid", gridTemplateColumns:"88px 1fr 44px" }}>
        <span />
        <span style={{ position:"relative", height:12 }}>
          {[0,50,100].map(g=>(
            <span key={g} style={{ position:"absolute", left:`${g}%`, transform:"translateX(-50%)",
                                   fontFamily:T.mono, fontSize:7, color:T.ink4 }}>{g}</span>
          ))}
        </span>
        <span />
      </div>
    </div>
  );
}

const Eb = ({ children }:{ children:React.ReactNode }) => (
  <Eyebrow style={{ fontSize:8.5, marginBottom:5 }}>{children}</Eyebrow>
);

const Panel = ({ children, style }:{ children:React.ReactNode; style?:React.CSSProperties }) => (
  <div style={{ border:`1px solid ${T.line}`, padding:"9px 11px", ...style }}>{children}</div>
);

// ── PAGE 1 · Executive dashboard ─────────────────────────────────────────────
function PageDashboard({ a, total, range, days, fac, divFilter, hasHist, confidential }:{
  a:A; total:number; range:DateRange; days:number; fac:{name:string;cat:string}[];
  divFilter:string; hasHist:boolean; confidential:boolean;
}) {
  const gen = new Date();
  const cmp = a.cmp;
  const kpis = [
    { l:"Capacity",    v:`${Math.round(a.health*100)}%`, c:statusColor[a.v.tone] },
    { l:"Operational", v:`${a.counts.green}/${total}`,   c:T.ok },
    { l:"Degraded",    v:String(a.counts.amber),         c:a.counts.amber?T.warn:T.ink3 },
    { l:"Critical",    v:String(a.counts.red),           c:a.counts.red?T.crit:T.ink3 },
    { l:"Recoveries",  v:String(a.change.recovered),     c:a.change.recovered?T.ok:T.ink3 },
    { l:"Regressions", v:String(a.change.degraded),      c:a.change.degraded?T.crit:T.ink3 },
  ];
  const comps = [
    { l:"Capacity",    now:`${Math.round(cmp.currentHealth*100)}%`, was:`${Math.round(cmp.previousHealth*100)}%`,
      d:cmp.deltaPts, inv:false },
    { l:"Recoveries",  now:String(cmp.currentChanges.recovered), was:String(cmp.previousChanges.recovered),
      d:cmp.currentChanges.recovered-cmp.previousChanges.recovered, inv:false },
    { l:"Regressions", now:String(cmp.currentChanges.degraded), was:String(cmp.previousChanges.degraded),
      d:cmp.currentChanges.degraded-cmp.previousChanges.degraded, inv:true },
    { l:"Needs attention", now:String(a.attn.length), was:null, d:null, inv:true },
  ];
  return (
    <>
      {/* masthead */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 style={{ margin:0, fontFamily:T.serif, fontSize:27, fontWeight:400, color:T.ink,
                       letterSpacing:"-0.02em", lineHeight:1.1 }}>IT Operations Report</h1>
          <div style={{ fontFamily:T.mono, fontSize:11, color:T.ink2, marginTop:7 }}>{fmtRange(range)}</div>
          <div style={{ fontFamily:T.sans, fontSize:9.5, color:T.ink4, marginTop:3 }}>
            {days} day{days>1?"s":""} · {divFilter==="all"?"all divisions":divFilter} · {fac.length} facilities
          </div>
        </div>
        <div style={{ position:"relative", flexShrink:0, textAlign:"center" }}>
          <Gauge pct={a.health} color={statusColor[a.v.tone]} size={74} thickness={11} />
          <div style={{ position:"absolute", top:0, left:0, right:0, height:74, display:"flex",
                        flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
            <Num size={16} weight={400} color={statusColor[a.v.tone]} style={{ letterSpacing:"-0.03em" }}>
              {Math.round(a.health*100)}%
            </Num>
            <span style={{ fontFamily:T.sans, fontSize:6.5, fontWeight:700, color:T.ink4,
                           letterSpacing:"0.12em", marginTop:1 }}>CAPACITY</span>
          </div>
          {hasHist && cmp.deltaPts!==null && (
            <div style={{ marginTop:3 }}><Delta v={cmp.deltaPts} unit="" /></div>
          )}
        </div>
      </div>

      <Rule strong my={14} />

      <h2 style={{ margin:0, fontFamily:T.serif, fontSize:18, lineHeight:1.3, fontWeight:400,
                   color:T.ink, letterSpacing:"-0.015em", textWrap:"balance" }}>{a.v.headline}</h2>
      <p style={{ margin:"8px 0 0", fontFamily:T.sans, fontSize:9.5, lineHeight:1.55,
                  color:T.ink2, maxWidth:"66ch" }}>{a.v.sub}</p>

      {/* KPI band */}
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${kpis.length},1fr)`, marginTop:16,
                    borderTop:`1px solid ${T.line}`, borderBottom:`1px solid ${T.line}` }}>
        {kpis.map((k,i)=>(
          <div key={k.l} style={{ padding:"10px 9px", borderLeft:i?`1px solid ${T.line}`:"none" }}>
            <Num size={17} weight={400} color={k.c} style={{ display:"block" }}>{k.v}</Num>
            <Eyebrow style={{ fontSize:7.5, marginTop:4 }}>{k.l}</Eyebrow>
          </div>
        ))}
      </div>

      {/* two-column: composition | division ranking */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:16 }}>
        <div>
          <Eb>Status composition</Eb>
          {hasHist ? (
            <>
              <StackedArea points={a.hist.points} w={252} h={104} coverage={a.hist.coverage} />
              <ChartLegend items={[
                {c:T.ok,l:"Op"},{c:T.warn,l:"Deg"},{c:T.crit,l:"Crit"},{c:T.none,l:"N/S"},
              ]} />
            </>
          ) : (
            <Panel style={{ height:104, display:"flex", alignItems:"center" }}>
              <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink4, lineHeight:1.5 }}>
                No status changes recorded inside this window.
              </span>
            </Panel>
          )}
        </div>
        <div>
          <Eb>Division ranking</Eb>
          <Panel style={{ paddingTop:11 }}>
            <RankedBars rows={a.divs.map(d=>({
              label:d.cat, value:d.health*100, sub:`${d.green}/${d.total}`,
              c: d.health>=0.8?T.ok:d.health>=0.5?T.warn:T.crit,
              delta: hasHist ? d.delta : null,
            }))} />
          </Panel>
        </div>
      </div>

      {/* versus previous */}
      <div style={{ marginTop:16 }}>
        <Eb>Versus the previous {days} day{days>1?"s":""}</Eb>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {comps.map(c=>(
            <Panel key={c.l}>
              <Eyebrow style={{ fontSize:7.5 }}>{c.l}</Eyebrow>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:5 }}>
                <Num size={14}>{c.now}</Num>
                {c.d!==null && <Delta v={c.d} unit="" invert={c.inv} />}
              </div>
              {c.was!==null && (
                <div style={{ fontFamily:T.sans, fontSize:7.5, color:T.ink4, marginTop:2 }}>was {c.was}</div>
              )}
            </Panel>
          ))}
        </div>
      </div>

      {/* system generated */}
      <div style={{ marginTop:"auto", display:"flex", gap:11, background:T.sunken, padding:"10px 12px" }}>
        <div style={{ width:3, background:T.ink3, flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:T.sans, fontSize:8.5, fontWeight:700, color:T.ink2, letterSpacing:"0.06em" }}>
            THIS REPORT IS SYSTEM GENERATED
          </div>
          <div style={{ fontFamily:T.sans, fontSize:8, color:T.ink3, marginTop:2, lineHeight:1.45 }}>
            Produced automatically from the IT Operations activity log on{" "}
            {gen.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})} at{" "}
            {gen.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}. No manual figures.
          </div>
        </div>
        {confidential && (
          <span style={{ alignSelf:"flex-end", fontFamily:T.sans, fontSize:7.5, fontWeight:700,
                         color:T.ink4, letterSpacing:"0.08em" }}>CONFIDENTIAL</span>
        )}
      </div>
    </>
  );
}

// ── PAGE 2 · Analysis ────────────────────────────────────────────────────────
function PageAnalysis({ a, hasHist }:{ a:A; hasHist:boolean }) {
  return (
    <>
      <Eb>Service reliability and recovery</Eb>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:9 }}>
        {a.svcs.map(s=>{
          const c = s.availability>=0.8?T.ok:s.availability>=0.5?T.warn:T.crit;
          const m = a.mttr.find(x=>x.service===s.service);
          return (
            <Panel key={s.service}>
              <div style={{ display:"flex", alignItems:"baseline" }}>
                <span style={{ fontFamily:T.sans, fontSize:10, fontWeight:600, color:T.ink }}>
                  {SERVICE_LABEL[s.service]}
                </span>
                {hasHist && <span style={{ marginLeft:"auto" }}><Delta v={s.delta} unit="" /></span>}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
                <div style={{ position:"relative", flexShrink:0 }}>
                  <HalfGauge pct={s.availability} color={c} size={64} thickness={9} />
                  <div style={{ position:"absolute", left:0, right:0, top:14, textAlign:"center" }}>
                    <Num size={12} color={c}>{Math.round(s.availability*100)}%</Num>
                    <div style={{ fontFamily:T.mono, fontSize:7, color:T.ink4 }}>{s.ok}/{s.total}</div>
                  </div>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <Eyebrow style={{ fontSize:7 }}>Mean recovery</Eyebrow>
                  <div style={{ marginTop:3 }}><Dur ms={m?.meanMs ?? null} size={13} /></div>
                  <div style={{ fontFamily:T.sans, fontSize:7.5, color:T.ink4, marginTop:1 }}>
                    {m?.count ? `${m.count} resolved` : "none resolved"}
                  </div>
                </div>
              </div>
              <div style={{ marginTop:8 }}>
                <Meter segs={[{v:s.ok,c:T.ok},{v:s.degraded,c:T.warn},{v:s.down,c:T.crit}]} h={4} />
                <div style={{ fontFamily:T.sans, fontSize:7.5, color:T.ink3, marginTop:4 }}>
                  {s.degraded} degraded · {s.down} down
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:16 }}>
        <div>
          <Eb>Fault and recovery volume</Eb>
          {a.churn.some(c=>c.recovered||c.regressed) ? (
            <>
              <DivergingBars data={a.churn} w={252} h={92} />
              <ChartLegend items={[{c:T.ok,l:"Recovered",n:a.change.recovered},
                                   {c:T.crit,l:"Regressed",n:a.change.degraded}]} />
            </>
          ) : (
            <Panel style={{ height:92, display:"flex", alignItems:"center" }}>
              <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink4 }}>
                No status changes inside this window.
              </span>
            </Panel>
          )}
        </div>
        <div>
          <Eb>Activity in this period · what was dealt with</Eb>
          <Panel style={{ minHeight:92 }}>
            {a.acts.length ? (
              <>
                <div style={{ display:"flex", gap:14, paddingBottom:7, borderBottom:`1px solid ${T.lineSoft}` }}>
                  {[
                    { n:a.actT.sitesTouched, l:"sites",    c:T.ink },
                    { n:a.actT.changes,      l:"changes",  c:T.ink },
                    { n:a.actT.edits,        l:"edits",    c:T.ink2 },
                    { n:a.actT.improved,     l:"improved", c:a.actT.improved?T.ok:T.ink3 },
                    { n:a.actT.worsened,     l:"worse",    c:a.actT.worsened?T.crit:T.ink3 },
                  ].map(x=>(
                    <span key={x.l} style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                      <Num size={13} color={x.c}>{x.n}</Num>
                      <span style={{ fontFamily:T.sans, fontSize:7.5, color:T.ink4 }}>{x.l}</span>
                    </span>
                  ))}
                </div>
                {a.acts.slice(0,4).map(r=>{
                  const max = Math.max(...a.acts.map(z=>z.changes),1);
                  return (
                    <div key={r.facility} style={{ display:"grid", gridTemplateColumns:"1fr 72px 26px 12px",
                          gap:5, alignItems:"center", height:15 }}>
                      <span style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink, overflow:"hidden",
                                     textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.facility}</span>
                      <span style={{ display:"flex", height:5 }}>
                        {r.recoveries>0 && <span style={{ width:`${r.recoveries/max*100}%`, background:T.ok }} />}
                        {r.regressions>0 && <span style={{ width:`${r.regressions/max*100}%`, background:T.crit }} />}
                      </span>
                      <Num size={8} color={r.changes?T.ink2:T.ink4} style={{ textAlign:"right", display:"block" }}>
                        {r.changes || `${r.edits}e`}
                      </Num>
                      <span style={{ fontFamily:T.mono, fontSize:9, textAlign:"right",
                                     color: r.netImproved===null ? T.ink3 : r.netImproved ? T.ok : T.crit }}>
                        {r.netImproved===null ? "=" : r.netImproved ? "▲" : "▼"}
                      </span>
                    </div>
                  );
                })}
                {a.acts.length>4 && (
                  <div style={{ fontFamily:T.sans, fontSize:7.5, color:T.ink4, marginTop:4 }}>
                    + {a.acts.length-4} more sites had activity
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink4 }}>
                No status changes were recorded in this period.
              </span>
            )}
          </Panel>
        </div>
      </div>

      <div style={{ marginTop:16 }}>
        <Eb>Exceptions · ranked by severity, duration and instability</Eb>
        {a.attn.length===0 ? (
          <div style={{ padding:"12px 12px", background:T.okBg, fontFamily:T.sans, fontSize:9.5, color:T.ok }}>
            No exceptions. Every facility reported all services operational at the end of the window.
          </div>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1.9fr 1.2fr 54px 40px 58px", gap:8,
                          paddingBottom:4, borderBottom:`1px solid ${T.ink3}` }}>
              {["Facility","Fault","Since","Flips","Status"].map(h=>(
                <Eyebrow key={h} style={{ fontSize:7.5 }}>{h}</Eyebrow>
              ))}
            </div>
            {a.attn.slice(0,10).map(it=>(
              <div key={it.facility} style={{ display:"grid", gridTemplateColumns:"1.9fr 1.2fr 54px 40px 58px",
                    gap:8, alignItems:"center", padding:"5px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:"block", fontFamily:T.sans, fontSize:9, color:T.ink,
                                 overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.facility}</span>
                  <span style={{ fontFamily:T.sans, fontSize:7, color:T.ink4 }}>{it.cat}</span>
                </span>
                <span style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                  <Dot s={it.status} size={5} />
                  <span style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink2, overflow:"hidden",
                                 textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.reason}</span>
                </span>
                <Num size={8.5} color={T.ink2}>{it.since?fmtDuration(it.asOf-it.since):"—"}</Num>
                <Num size={8.5} color={it.flips>=3?T.warn:T.ink3}>{it.flips||"—"}</Num>
                <span><Pill s={it.status} /></span>
              </div>
            ))}
            {a.attn.length>10 && (
              <div style={{ fontFamily:T.sans, fontSize:8, color:T.ink4, marginTop:5 }}>
                + {a.attn.length-10} further exceptions.
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:16 }}>
        <div>
          <Eb>Least reliable sites</Eb>
          {a.worst.length ? a.worst.slice(0,5).map(w=>(
            <div key={w.facility} style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr 38px",
                  gap:8, alignItems:"center", padding:"4px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink, overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{w.facility}</span>
              <Meter segs={[{v:w.critShare,c:T.crit},{v:w.badShare-w.critShare,c:T.warn},
                            {v:Math.max(1-w.badShare,0),c:T.sunken}]} h={4} />
              <Num size={8.5} color={w.critShare>0?T.crit:T.warn} style={{ textAlign:"right", display:"block" }}>
                {Math.round(w.badShare*100)}%
              </Num>
            </div>
          )) : (
            <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink4 }}>
              Every site fully operational across the window.
            </span>
          )}
        </div>
        <div>
          <Eb>Capacity risk · below stated requirement</Eb>
          {a.bw.length ? a.bw.slice(0,5).map(b=>(
            <div key={b.facility} style={{ display:"grid", gridTemplateColumns:"1.2fr 56px 1fr 38px",
                  gap:7, alignItems:"center", padding:"4px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink, overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.facility}</span>
              <Num size={7.5} color={T.ink3}>{b.current}/{b.required}</Num>
              <Meter segs={[{v:b.ratio,c:b.ratio<0.6?T.crit:T.warn},{v:Math.max(1-b.ratio,0),c:T.sunken}]} h={4} />
              <Num size={8.5} color={b.ratio<0.6?T.crit:T.warn} style={{ textAlign:"right", display:"block" }}>
                {Math.round(b.ratio*100)}%
              </Num>
            </div>
          )) : (
            <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink4 }}>
              No site is below its stated bandwidth requirement.
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// ── PAGE 3 · Availability & register ─────────────────────────────────────────
function PageAvailability({ a, heatRows, fac, state }:
  { a:A; heatRows:{name:string;states:RAG[]}[]; fac:{name:string;cat:string}[]; state:Record<string,FacState> }) {
  const dayLabels = a.matrix.days.map(d=>({
    label: new Date(d.t).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),
  }));
  const impaired = heatRows.filter(r=>r.states.some(s=>s!=="green"));
  const ordered = [...fac].sort((x,y)=>{
    const r={red:0,amber:1,na:2,green:3} as Record<RAG,number>;
    const sx=state[x.name], sy=state[y.name];
    return (sx?r[overallOf(sx)]:4)-(sy?r[overallOf(sy)]:4) || x.name.localeCompare(y.name);
  });
  const half = Math.ceil(ordered.length/2);
  const cols = [ordered.slice(0,half), ordered.slice(half)];
  return (
    <>
      <Eb>Day-by-day availability</Eb>
      {impaired.length ? (
        <>
          <Heatmap rows={impaired} days={dayLabels} cell={11} gap={2} labelW={112} maxRows={12} />
          <ChartLegend items={[
            {c:T.okBg,l:"Operational"},{c:T.warn,l:"Degraded"},{c:T.crit,l:"Critical"},{c:T.none,l:"Not set"},
          ]} />
        </>
      ) : (
        <div style={{ padding:"12px", background:T.okBg, fontFamily:T.sans, fontSize:9.5, color:T.ok }}>
          Every facility remained fully operational for the whole window.
        </div>
      )}

      <div style={{ marginTop:18, flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>
        <Eb>Facility register · {fac.length} sites in scope</Eb>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, flex:1, minHeight:0 }}>
          {cols.map((colRows,ci)=>(
            <div key={ci}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 30px 30px 30px", gap:4,
                            paddingBottom:3, borderBottom:`1px solid ${T.ink3}` }}>
                <Eyebrow style={{ fontSize:7 }}>Facility</Eyebrow>
                {["Int","Bio","Prn"].map(h=>(
                  <Eyebrow key={h} style={{ fontSize:7, textAlign:"center" }}>{h}</Eyebrow>
                ))}
              </div>
              {colRows.map(f=>{
                const s=state[f.name]; if(!s) return null;
                return (
                  <div key={f.name} style={{ display:"grid", gridTemplateColumns:"1fr 30px 30px 30px", gap:4,
                        alignItems:"center", padding:"3px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
                    <span style={{ fontFamily:T.sans, fontSize:8, color:T.ink, overflow:"hidden",
                                   textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                    {SERVICES.map(sv=>(
                      <span key={sv} style={{ display:"flex", justifyContent:"center" }}>
                        <Dot s={s[sv]} size={6} />
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
