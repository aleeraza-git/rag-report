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
  T, Card, Eyebrow, Num, Delta, Dot, Spark, Meter, StackedArea, DivergingBars,
  Heatmap, ChartLegend, Dur, statusColor, statusLabel,
} from "./ui";
import {
  reconstructRange, attentionInRange, changesBetween, divisionPerformanceRange,
  divisionSeries, serviceStats, repeatOffenders, bandwidthDeficits, verdict,
  overallOf, fmtDuration, mttrByService, dailyChurn, facilityDayMatrix,
  worstPerformers, comparePeriods, previousRange, rangeDays, rangeOf, fmtRange,
  toDateInput, fromDateInput, SERVICES, SERVICE_LABEL,
  type FacState, type LogEntry, type RAG, type DateRange,
} from "@/lib/analytics";
import { buildReport, type ReportOptions } from "@/lib/reportPdf";

type Preset = "executive" | "operational" | "board";

const PRESETS: Record<Preset,{ label:string; blurb:string; sections:ReportOptions["sections"] }> = {
  executive:   { label:"Executive",   blurb:"Verdict, trend and exceptions. No raw register.",
                 sections:{summary:true,performance:true,exceptions:true,appendix:false} },
  operational: { label:"Operational", blurb:"Everything, including availability grid and register.",
                 sections:{summary:true,performance:true,exceptions:true,appendix:true} },
  board:       { label:"Board",       blurb:"Summary and performance only. Two pages.",
                 sections:{summary:true,performance:true,exceptions:false,appendix:false} },
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

  const a = useMemo(()=>{
    const hist    = reconstructRange(fac, state, log, range);
    const attn    = attentionInRange(fac, state, log, range);
    const change  = changesBetween(log, range);
    const divs    = divisionPerformanceRange(fac, state, log, range);
    const divSer  = divisionSeries(fac, state, log, range);
    const svcs    = serviceStats(fac, state, hist);
    const mttr    = mttrByService(log, range);
    const churn   = dailyChurn(log, range);
    const worst   = worstPerformers(fac, state, log, range, 8);
    const matrix  = facilityDayMatrix(fac, state, log, range, 14);
    const cmp     = comparePeriods(fac, state, log, range);
    const flappy  = repeatOffenders(log, rangeDays(range), 5);
    const bw      = bandwidthDeficits(fac, state);
    const series  = hist.points.map(p=>p.health);
    const health  = series[series.length-1] ?? 0;
    const trend   = hist.coverage>0 && series.length>1 ? (health-series[0])*100 : null;
    const v       = verdict(health, attn, change, trend);
    const counts  = {green:0,amber:0,red:0,na:0} as Record<RAG,number>;
    const last    = hist.points[hist.points.length-1];
    if (last) { counts.green=last.green; counts.amber=last.amber; counts.red=last.red; counts.na=last.na; }
    return { hist,attn,change,divs,divSer,svcs,mttr,churn,worst,matrix,cmp,flappy,bw,series,health,trend,v,counts };
  },[fac,state,log,range]);

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

  const pageCount = 1 + (sections.performance?1:0) + (sections.exceptions?1:0)
                      + (sections.appendix?1+Math.max(0,Math.ceil((fac.length-26)/34)):0);

  const exportPdf = async () => {
    setBusy(true); setDone(null);
    try {
      const name = await buildReport(facilities, state, log, {
        title:"Estate Reliability Report", org, period:fmtRange(range), author:"IT Department",
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
            ["summary","Executive summary","Verdict, KPIs, composition"],
            ["performance","Performance","Divisions, services, recovery time"],
            ["exceptions","Exceptions","Ranked attention, worst performers"],
            ["appendix","Availability & register","Day-by-day grid, full list"],
          ] as const).map(([k,label,sub])=>{
            const on = sections[k], locked = k==="summary";
            return (
              <label key={k} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"8px 2px",
                                      cursor:locked?"default":"pointer", opacity:locked?0.65:1 }}>
                <input type="checkbox" checked={on} disabled={locked}
                  onChange={e=>{setSec(s=>({...s,[k]:e.target.checked}));setDone(null);}}
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
            <PageSummary a={a} total={total} range={range} org={org} hasHist={hasHist} days={days} />
          </Sheet>
          {sections.performance && (
            <Sheet n={2} label="Performance">
              <PagePerformance a={a} hasHist={hasHist} total={total} days={days} />
            </Sheet>
          )}
          {sections.exceptions && (
            <Sheet n={2+(sections.performance?1:0)} label="Exceptions">
              <PageExceptions a={a} days={days} />
            </Sheet>
          )}
          {sections.appendix && (
            <Sheet n={2+(sections.performance?1:0)+(sections.exceptions?1:0)} label="Availability & register">
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
                    boxShadow:"0 2px 14px rgba(24,24,27,0.07)", padding:"32px 36px",
                    display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:10, paddingBottom:8,
                      borderBottom:`1px solid ${T.line}`, marginBottom:16 }}>
          <span style={{ fontFamily:T.sans, fontSize:9, fontWeight:700, color:T.ink, letterSpacing:"0.08em" }}>IMARAT GROUP</span>
          <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink3 }}>Estate Reliability Report</span>
          <span style={{ marginLeft:"auto", fontFamily:T.sans, fontSize:9, color:T.ink3 }}>{label}</span>
        </div>
        <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>{children}</div>
        <div style={{ paddingTop:10, borderTop:`1px solid ${T.line}`, display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontFamily:T.sans, fontSize:8, color:T.ink4 }}>Imarat Group · IT Department</span>
          <span style={{ fontFamily:T.mono, fontSize:8, color:T.ink4 }}>{n}</span>
        </div>
      </div>
    </div>
  );
}

type A = any;

const H2 = ({ children }:{ children:React.ReactNode }) => (
  <h2 style={{ margin:"0 0 3px", fontFamily:T.serif, fontSize:16, fontWeight:400, color:T.ink }}>{children}</h2>
);
const Note = ({ children }:{ children:React.ReactNode }) => (
  <p style={{ margin:"0 0 11px", fontFamily:T.sans, fontSize:9.5, color:T.ink3, lineHeight:1.5 }}>{children}</p>
);

function PageSummary({ a, total, range, org, hasHist, days }:
  { a:A; total:number; range:DateRange; org:string; hasHist:boolean; days:number }) {
  const cmp = a.cmp;
  return (
    <>
      <Eyebrow>Executive summary</Eyebrow>
      <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.ink3, marginTop:5, marginBottom:14 }}>
        {fmtRange(range)} · {days} day{days>1?"s":""}
      </div>

      <h1 style={{ margin:0, fontFamily:T.serif, fontSize:23, lineHeight:1.25, fontWeight:400,
                   color:T.ink, letterSpacing:"-0.02em", textWrap:"balance" }}>{a.v.headline}</h1>
      <p style={{ margin:"10px 0 0", fontFamily:T.sans, fontSize:10.5, lineHeight:1.6, color:T.ink2 }}>{a.v.sub}</p>

      {/* KPI band with period-over-period deltas */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", marginTop:18,
                    borderTop:`1px solid ${T.line}`, borderBottom:`1px solid ${T.line}` }}>
        {[
          { l:"Capacity",    v:`${Math.round(a.health*100)}%`,      d:cmp.deltaPts, c:statusColor[a.v.tone] },
          { l:"Operational", v:`${a.counts.green}/${total}`,        d:null,         c:T.ok },
          { l:"Critical",    v:String(a.counts.red),                d:null,         c:a.counts.red?T.crit:T.ink3 },
          { l:"Degraded",    v:String(a.counts.amber),              d:null,         c:a.counts.amber?T.warn:T.ink3 },
        ].map((k,i)=>(
          <div key={k.l} style={{ padding:"12px", borderLeft:i?`1px solid ${T.line}`:"none" }}>
            <div style={{ height:14 }}><Eyebrow style={{ fontSize:8.5 }}>{k.l}</Eyebrow></div>
            <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:5 }}>
              <Num size={19} weight={400} color={k.c}>{k.v}</Num>
              {k.d!==null && hasHist && <Delta v={k.d} unit="" />}
            </div>
          </div>
        ))}
      </div>

      {/* Composition over time — richer than a single health line */}
      <div style={{ marginTop:16 }}>
        <Eyebrow style={{ marginBottom:7 }}>Status composition across the period</Eyebrow>
        {hasHist ? (
          <>
            <StackedArea points={a.hist.points} w={540} h={112} coverage={a.hist.coverage} />
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
              <span style={{ fontFamily:T.mono, fontSize:8, color:T.ink4 }}>
                {new Date(range.from).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
              </span>
              <span style={{ fontFamily:T.mono, fontSize:8, color:T.ink4 }}>
                {new Date(range.to).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
              </span>
            </div>
            <ChartLegend items={[
              {c:T.ok,l:"Operational",n:a.counts.green},{c:T.warn,l:"Degraded",n:a.counts.amber},
              {c:T.crit,l:"Critical",n:a.counts.red},{c:T.none,l:"Not set",n:a.counts.na},
            ]} />
          </>
        ) : (
          <div style={{ border:`1px solid ${T.line}`, padding:"18px 14px", fontFamily:T.sans,
                        fontSize:10, color:T.ink4 }}>
            No status changes recorded inside this window.
          </div>
        )}
      </div>

      {/* Versus previous period — the point of a recurring report */}
      <div style={{ marginTop:"auto", paddingTop:14 }}>
        <Eyebrow style={{ marginBottom:8 }}>Versus the previous {days} day{days>1?"s":""}</Eyebrow>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          {[
            { l:"Capacity", now:`${Math.round(cmp.currentHealth*100)}%`,
              was:`${Math.round(cmp.previousHealth*100)}%`, d:cmp.deltaPts, inv:false },
            { l:"Recoveries", now:String(cmp.currentChanges.recovered),
              was:String(cmp.previousChanges.recovered),
              d:cmp.currentChanges.recovered-cmp.previousChanges.recovered, inv:false },
            { l:"Regressions", now:String(cmp.currentChanges.degraded),
              was:String(cmp.previousChanges.degraded),
              d:cmp.currentChanges.degraded-cmp.previousChanges.degraded, inv:true },
          ].map(x=>(
            <div key={x.l} style={{ border:`1px solid ${T.line}`, padding:"9px 11px" }}>
              <Eyebrow style={{ fontSize:8 }}>{x.l}</Eyebrow>
              <div style={{ display:"flex", alignItems:"baseline", gap:7, marginTop:5 }}>
                <Num size={15}>{x.now}</Num>
                <Delta v={x.d} unit="" invert={x.inv} />
              </div>
              <div style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink4, marginTop:2 }}>was {x.was}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PagePerformance({ a, hasHist, total, days }:{ a:A; hasHist:boolean; total:number; days:number }) {
  return (
    <>
      <Eyebrow>Performance</Eyebrow>
      <div style={{ marginTop:12 }}>
        <H2>Division comparison</H2>
        <Note>Ranked weakest first. Delta compares the end of the window against its start.</Note>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"11px 18px" }}>
          {a.divs.map((d:any)=>{
            const c = d.health>=0.8?T.ok:d.health>=0.5?T.warn:T.crit;
            const ser = a.divSer.find((s:any)=>s.cat===d.cat);
            return (
              <div key={d.cat}>
                <div style={{ display:"flex", alignItems:"baseline", marginBottom:4 }}>
                  <span style={{ fontFamily:T.sans, fontSize:11, fontWeight:600, color:T.ink }}>{d.cat}</span>
                  <span style={{ marginLeft:"auto", display:"flex", alignItems:"baseline", gap:7 }}>
                    <Num size={12} color={c}>{Math.round(d.health*100)}%</Num>
                    {hasHist && <Delta v={d.delta} />}
                  </span>
                </div>
                {hasHist && ser && <Spark data={ser.series} w={240} h={26} color={c} coverage={ser.coverage} showBand={false} />}
                <div style={{ marginTop:5 }}>
                  <Meter segs={[{v:d.green,c:T.ok},{v:d.amber,c:T.warn},{v:d.red,c:T.crit},{v:d.na,c:T.none}]} h={4} />
                </div>
                <div style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink4, marginTop:3 }}>
                  {d.green} of {d.total} operational
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop:18 }}>
        <H2>Service reliability and recovery</H2>
        <Note>Availability across {total} sites. Recovery time is measured from each fault to its fix, for outages resolved inside the window.</Note>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          {a.svcs.map((s:any)=>{
            const c = s.availability>=0.8?T.ok:s.availability>=0.5?T.warn:T.crit;
            const m = a.mttr.find((x:any)=>x.service===s.service);
            return (
              <div key={s.service} style={{ border:`1px solid ${T.line}`, padding:"10px 11px" }}>
                <div style={{ display:"flex", alignItems:"baseline" }}>
                  <span style={{ fontFamily:T.sans, fontSize:10.5, fontWeight:600, color:T.ink }}>
                    {SERVICE_LABEL[s.service as keyof typeof SERVICE_LABEL]}
                  </span>
                  {hasHist && <span style={{ marginLeft:"auto" }}><Delta v={s.delta} unit="" /></span>}
                </div>
                <div style={{ display:"flex", alignItems:"baseline", gap:3, margin:"6px 0 2px" }}>
                  <Num size={18} weight={400} color={c}>{Math.round(s.availability*100)}</Num>
                  <Num size={9} color={T.ink4}>%</Num>
                </div>
                {hasHist && <Spark data={s.series} w={148} h={22} color={c} coverage={a.hist.coverage} showBand={false} />}
                <div style={{ marginTop:7, paddingTop:7, borderTop:`1px solid ${T.lineSoft}` }}>
                  <Eyebrow style={{ fontSize:8, marginBottom:3 }}>Mean recovery</Eyebrow>
                  <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                    <Dur ms={m?.meanMs ?? null} size={13} color={T.ink} />
                    <span style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink4 }}>
                      {m?.count ? `${m.count} outage${m.count>1?"s":""}` : "none resolved"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop:18 }}>
        <H2>Fault and recovery volume</H2>
        <Note>Recoveries above the line, regressions below. A period fixing faster than it breaks sits mostly above.</Note>
        {a.churn.some((c:any)=>c.recovered||c.regressed) ? (
          <>
            <DivergingBars data={a.churn} w={540} h={100} />
            <ChartLegend items={[{c:T.ok,l:"Recovered",n:a.change.recovered},{c:T.crit,l:"Regressed",n:a.change.degraded}]} />
          </>
        ) : (
          <div style={{ border:`1px solid ${T.line}`, padding:"16px 14px", fontFamily:T.sans, fontSize:10, color:T.ink4 }}>
            No status changes recorded inside this window.
          </div>
        )}
      </div>
    </>
  );
}

function PageExceptions({ a, days }:{ a:A; days:number }) {
  return (
    <>
      <Eyebrow>Exceptions</Eyebrow>
      <div style={{ marginTop:12 }}>
        <H2>What needs attention</H2>
        <Note>Ranked by severity, then how long the fault has persisted, then instability.</Note>
        {a.attn.length===0 ? (
          <div style={{ padding:"16px 14px", background:T.okBg, fontFamily:T.sans, fontSize:10.5, color:T.ok }}>
            No exceptions. Every monitored facility reported all services operational at the end of the window.
          </div>
        ) : (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1.9fr 1.1fr 58px 42px 52px", gap:8,
                          paddingBottom:5, borderBottom:`1px solid ${T.ink3}` }}>
              {["Facility","Fault","Since","Flips","Capacity"].map(h=><Eyebrow key={h} style={{ fontSize:8 }}>{h}</Eyebrow>)}
            </div>
            {a.attn.slice(0,11).map((it:any)=>(
              <div key={it.facility} style={{ display:"grid", gridTemplateColumns:"1.9fr 1.1fr 58px 42px 52px",
                    gap:8, alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:"block", fontFamily:T.sans, fontSize:9.5, color:T.ink,
                                 overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.facility}</span>
                  <span style={{ fontFamily:T.sans, fontSize:7.5, color:T.ink4 }}>{it.cat}</span>
                </span>
                <span style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                  <Dot s={it.status} size={5} />
                  <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink2, overflow:"hidden",
                                 textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.reason}</span>
                </span>
                <Num size={9} color={T.ink2}>{it.since?fmtDuration(Date.now()-it.since):"—"}</Num>
                <Num size={9} color={it.flips>=3?T.warn:T.ink3}>{it.flips||"—"}</Num>
                <Num size={9} color={it.bwRatio!==null&&it.bwRatio<0.7?T.warn:T.ink3}>
                  {it.bwRatio!==null?`${Math.round(it.bwRatio*100)}%`:"—"}
                </Num>
              </div>
            ))}
          </>
        )}
      </div>

      {a.worst.length>0 && (
        <div style={{ marginTop:16 }}>
          <H2>Least reliable sites across the window</H2>
          <Note>Share of the {days}-day window each site spent below fully operational.</Note>
          {a.worst.slice(0,6).map((w:any)=>(
            <div key={w.facility} style={{ display:"grid", gridTemplateColumns:"1.6fr 1fr 44px",
                  gap:10, alignItems:"center", padding:"5px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily:T.sans, fontSize:9.5, color:T.ink, overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{w.facility}</span>
              <Meter segs={[{v:w.critShare,c:T.crit},{v:w.badShare-w.critShare,c:T.warn},
                            {v:Math.max(1-w.badShare,0),c:T.sunken}]} h={4} />
              <Num size={9.5} color={w.critShare>0?T.crit:T.warn} style={{ textAlign:"right", display:"block" }}>
                {Math.round(w.badShare*100)}%
              </Num>
            </div>
          ))}
        </div>
      )}

      {a.bw.length>0 && (
        <div style={{ marginTop:16 }}>
          <H2>Capacity risk</H2>
          <Note>Sites currently operating below their stated bandwidth requirement.</Note>
          {a.bw.slice(0,5).map((b:any)=>(
            <div key={b.facility} style={{ display:"grid", gridTemplateColumns:"1.7fr 82px 1fr 42px",
                  gap:10, alignItems:"center", padding:"5px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily:T.sans, fontSize:9.5, color:T.ink, overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.facility}</span>
              <Num size={8.5} color={T.ink3}>{b.current} / {b.required} Mbps</Num>
              <Meter segs={[{v:b.ratio,c:b.ratio<0.6?T.crit:T.warn},{v:Math.max(1-b.ratio,0),c:T.sunken}]} h={4} />
              <Num size={9.5} color={b.ratio<0.6?T.crit:T.warn} style={{ textAlign:"right", display:"block" }}>
                {Math.round(b.ratio*100)}%
              </Num>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PageAvailability({ a, heatRows, fac, state }:
  { a:A; heatRows:{name:string;states:RAG[]}[]; fac:{name:string;cat:string}[]; state:Record<string,FacState> }) {
  const dayLabels = a.matrix.days.map((d:any)=>({
    label: new Date(d.t).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),
  }));
  return (
    <>
      <Eyebrow>Availability</Eyebrow>
      <div style={{ marginTop:12 }}>
        <H2>Day-by-day availability</H2>
        <Note>
          One column per day, one row per site. Sites that were never impaired are summarised below the grid.
        </Note>
        {heatRows.length ? (
          <>
            <Heatmap rows={heatRows} days={dayLabels} cell={12} gap={2} labelW={126} maxRows={14} />
            <ChartLegend items={[
              {c:T.okBg,l:"Operational"},{c:T.warn,l:"Degraded"},{c:T.crit,l:"Critical"},{c:T.none,l:"Not set"},
            ]} />
          </>
        ) : (
          <div style={{ border:`1px solid ${T.line}`, padding:"16px 14px", fontFamily:T.sans, fontSize:10, color:T.ink4 }}>
            No availability history recorded for this window.
          </div>
        )}
      </div>

      <div style={{ marginTop:16, flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>
        <H2>Facility register</H2>
        <Note>Current service state for all {fac.length} facilities in scope.</Note>
        <div style={{ display:"grid", gridTemplateColumns:"1.8fr 1fr repeat(3,58px)", gap:8,
                      paddingBottom:4, borderBottom:`1px solid ${T.ink3}` }}>
          {["Facility","Division","Internet","Biometric","Printing"].map(h=>(
            <Eyebrow key={h} style={{ fontSize:8 }}>{h}</Eyebrow>
          ))}
        </div>
        <div style={{ flex:1, minHeight:0, overflow:"hidden" }}>
          {[...fac].sort((x,y)=>{
            const r={red:0,amber:1,na:2,green:3} as Record<RAG,number>;
            const sx=state[x.name], sy=state[y.name];
            return (sx?r[overallOf(sx)]:4)-(sy?r[overallOf(sy)]:4) || x.name.localeCompare(y.name);
          }).slice(0,14).map(f=>{
            const s=state[f.name]; if(!s) return null;
            return (
              <div key={f.name} style={{ display:"grid", gridTemplateColumns:"1.8fr 1fr repeat(3,58px)",
                    gap:8, alignItems:"center", padding:"4.5px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
                <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink, overflow:"hidden",
                               textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                <span style={{ fontFamily:T.sans, fontSize:8, color:T.ink3 }}>{f.cat}</span>
                {SERVICES.map(sv=>(
                  <span key={sv} style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <Dot s={s[sv]} size={4.5} />
                    <span style={{ fontFamily:T.sans, fontSize:8,
                                   color:s[sv]==="green"?T.ink3:statusColor[s[sv]],
                                   fontWeight:s[sv]==="green"?400:600 }}>
                      {s[sv]==="green"?"OK":s[sv]==="na"?"—":statusLabel[s[sv]]}
                    </span>
                  </span>
                ))}
              </div>
            );
          })}
          {fac.length>14 && (
            <div style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink4, marginTop:6 }}>
              + {fac.length-14} more continue on the following pages of the exported PDF.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
