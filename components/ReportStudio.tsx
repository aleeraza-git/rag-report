"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Report Studio — compose, preview, export.
//
// The old flow was a modal full of checkboxes with a static thumbnail. This is a
// working surface: an audience preset on the left changes what the report says,
// the centre shows the real paginated document at A4 proportion, and export is
// one action. What you see scrolling in the centre is the document you get.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import {
  T, Card, Eyebrow, Num, Delta, Pill, Dot, Spark, Meter, Btn, Segmented,
  statusColor, statusBg, statusLabel,
} from "./ui";
import {
  reconstructHistory, attentionQueue, changesSince, divisionPerformance,
  serviceStats, repeatOffenders, bandwidthDeficits, verdict, overallOf,
  fmtDuration, SERVICES, SERVICE_LABEL,
  type FacState, type LogEntry, type RAG,
} from "@/lib/analytics";
import { buildReport, type ReportOptions } from "@/lib/reportPdf";

type Preset = "executive" | "operational" | "board";

const PRESETS: Record<Preset,{ label:string; blurb:string; sections:ReportOptions["sections"]; window:number }> = {
  executive:   { label:"Executive",   blurb:"Verdict, trend and exceptions. No raw register.",
                 sections:{summary:true,performance:true,exceptions:true,appendix:false}, window:14 },
  operational: { label:"Operational", blurb:"Everything, including the full facility register.",
                 sections:{summary:true,performance:true,exceptions:true,appendix:true}, window:7 },
  board:       { label:"Board",       blurb:"Summary and performance only. Two pages.",
                 sections:{summary:true,performance:true,exceptions:false,appendix:false}, window:30 },
};

interface Props {
  facilities: { name:string; cat:string }[];
  state: Record<string, FacState>;
  log: LogEntry[];
  org: string;
}

export default function ReportStudio({ facilities, state, log, org }: Props) {
  const [preset, setPreset]   = useState<Preset>("executive");
  const [windowDays, setWin]  = useState(14);
  const [divFilter, setDiv]   = useState("all");
  const [sections, setSec]    = useState(PRESETS.executive.sections);
  const [confidential, setConf] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState<string|null>(null);

  const divisions = useMemo(()=>Array.from(new Set(facilities.map(f=>f.cat))),[facilities]);

  const applyPreset = (p:Preset) => {
    setPreset(p); setSec(PRESETS[p].sections); setWin(PRESETS[p].window); setDone(null);
  };

  const fac = useMemo(
    ()=>facilities.filter(f=>divFilter==="all"||f.cat===divFilter),
    [facilities,divFilter]);

  const a = useMemo(()=>{
    const hist   = reconstructHistory(fac,state,log,windowDays);
    const attn   = attentionQueue(fac,state,log,7);
    const change = changesSince(log,Date.now()-864e5);
    const divs   = divisionPerformance(fac,state,log,windowDays);
    const svcs   = serviceStats(fac,state,hist);
    const flappy = repeatOffenders(log,7,5);
    const bw     = bandwidthDeficits(fac,state);
    const series = hist.points.map(p=>p.health);
    const health = series[series.length-1]??0;
    const trend  = hist.coverage>0&&series.length>1 ? (health-series[0])*100 : null;
    const v      = verdict(health,attn,change,trend);
    const counts = {green:0,amber:0,red:0,na:0} as Record<RAG,number>;
    for(const f of fac){ const s=state[f.name]; if(s) counts[overallOf(s)]++; }
    return { hist,attn,change,divs,svcs,flappy,bw,series,health,trend,v,counts };
  },[fac,state,log,windowDays]);

  const hasHist = a.hist.coverage>0.02;
  const total = fac.length||1;
  const period = `${new Date(Date.now()-windowDays*864e5).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} – ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}`;

  const pages = 1 + (sections.performance?1:0) + (sections.exceptions?1:0) + (sections.appendix?Math.ceil(fac.length/28):0);

  const exportPdf = async () => {
    setBusy(true); setDone(null);
    try {
      const name = await buildReport(facilities,state,log,{
        title:"Estate Reliability Report", org, period, author:"IT Department",
        windowDays, divFilter, sections, confidential,
      });
      setDone(name);
    } catch(e){ console.error("Report export failed",e); }
    setBusy(false);
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"268px minmax(0,1fr)", gap:24, alignItems:"start" }}>

      {/* ── Composer rail ────────────────────────────────────────────────── */}
      <aside style={{ position:"sticky", top:20, display:"flex", flexDirection:"column", gap:18 }}>
        <div>
          <Eyebrow style={{ marginBottom:8 }}>Audience</Eyebrow>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {(Object.keys(PRESETS) as Preset[]).map(p=>{
              const on = preset===p;
              return (
                <button key={p} onClick={()=>applyPreset(p)}
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
          <Eyebrow style={{ marginBottom:8 }}>Window</Eyebrow>
          <Segmented size="sm" value={String(windowDays)} onChange={v=>{setWin(Number(v));setDone(null);}}
            options={[{v:"7",label:"7d"},{v:"14",label:"14d"},{v:"30",label:"30d"}]} />
          {!hasHist && (
            <div style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink4, marginTop:8, lineHeight:1.45 }}>
              No recorded history yet — trend sections will state this rather than draw a flat line.
            </div>
          )}
        </div>

        <div>
          <Eyebrow style={{ marginBottom:8 }}>Scope</Eyebrow>
          <select value={divFilter} onChange={e=>{setDiv(e.target.value);setDone(null);}}
            style={{ width:"100%", padding:"8px 10px", borderRadius:5, border:`1px solid ${T.line}`,
                     background:T.surface, color:T.ink, fontFamily:T.sans, fontSize:12.5, outline:"none" }}>
            <option value="all">All divisions ({facilities.length} sites)</option>
            {divisions.map(d=>(
              <option key={d} value={d}>{d} ({facilities.filter(f=>f.cat===d).length} sites)</option>
            ))}
          </select>
        </div>

        <div>
          <Eyebrow style={{ marginBottom:8 }}>Sections</Eyebrow>
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            {([
              ["summary","Executive summary","Verdict, KPIs, trend"],
              ["performance","Performance","Divisions, services, instability"],
              ["exceptions","Exceptions","Ranked attention list"],
              ["appendix","Appendix","Full facility register"],
            ] as const).map(([k,label,sub])=>{
              const on = sections[k];
              const locked = k==="summary";
              return (
                <label key={k} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"8px 2px",
                                        cursor:locked?"default":"pointer", opacity:locked?0.65:1 }}>
                  <input type="checkbox" checked={on} disabled={locked}
                    onChange={e=>{ setSec(s=>({...s,[k]:e.target.checked})); setPreset("executive"); setDone(null); }}
                    style={{ marginTop:2, accentColor:T.ink }} />
                  <span>
                    <span style={{ display:"block", fontFamily:T.sans, fontSize:12, color:T.ink, fontWeight:500 }}>{label}</span>
                    <span style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink4 }}>{sub}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <label style={{ display:"flex", gap:10, alignItems:"center", cursor:"pointer" }}>
          <input type="checkbox" checked={confidential} onChange={e=>setConf(e.target.checked)}
                 style={{ accentColor:T.ink }} />
          <span style={{ fontFamily:T.sans, fontSize:12, color:T.ink2 }}>Mark confidential</span>
        </label>

        <div style={{ borderTop:`1px solid ${T.line}`, paddingTop:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink3 }}>Estimated length</span>
            <Num size={11.5} color={T.ink}>{pages} page{pages>1?"s":""}</Num>
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

          <Sheet label="1 · Executive summary">
            <PageSummary a={a} total={total} period={period} org={org} hasHist={hasHist} windowDays={windowDays} />
          </Sheet>

          {sections.performance && (
            <Sheet label="2 · Performance">
              <PagePerformance a={a} hasHist={hasHist} total={total} windowDays={windowDays} />
            </Sheet>
          )}

          {sections.exceptions && (
            <Sheet label={`${2+(sections.performance?1:0)} · Exceptions`}>
              <PageExceptions a={a} />
            </Sheet>
          )}

          {sections.appendix && (
            <Sheet label={`${2+(sections.performance?1:0)+(sections.exceptions?1:0)} · Appendix`}>
              <PageAppendix fac={fac} state={state} />
            </Sheet>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page shell: true A4 portrait proportion (1 : 1.414) ──────────────────────
function Sheet({ label, children }:{ label:string; children:React.ReactNode }) {
  const W = 620, H = Math.round(W*1.414);
  return (
    <div>
      <Eyebrow style={{ marginBottom:7, marginLeft:2 }}>{label}</Eyebrow>
      <div style={{ width:W, height:H, background:"#fff", border:`1px solid ${T.line}`,
                    boxShadow:"0 2px 14px rgba(24,24,27,0.07)", padding:"34px 38px",
                    display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:10, paddingBottom:8,
                      borderBottom:`1px solid ${T.line}`, marginBottom:20 }}>
          <span style={{ fontFamily:T.sans, fontSize:9, fontWeight:700, color:T.ink, letterSpacing:"0.08em" }}>IMARAT GROUP</span>
          <span style={{ fontFamily:T.sans, fontSize:9, color:T.ink3 }}>Estate Reliability Report</span>
        </div>
        <div style={{ flex:1, minHeight:0 }}>{children}</div>
      </div>
    </div>
  );
}

type A = ReturnType<typeof useAnalysisShape>;
// helper only for typing the page props
function useAnalysisShape() {
  return null as unknown as {
    hist:ReturnType<typeof reconstructHistory>;
    attn:ReturnType<typeof attentionQueue>;
    change:ReturnType<typeof changesSince>;
    divs:ReturnType<typeof divisionPerformance>;
    svcs:ReturnType<typeof serviceStats>;
    flappy:ReturnType<typeof repeatOffenders>;
    bw:ReturnType<typeof bandwidthDeficits>;
    series:number[]; health:number; trend:number|null;
    v:ReturnType<typeof verdict>; counts:Record<RAG,number>;
  };
}

function PageSummary({ a, total, period, org, hasHist, windowDays }:
  { a:A; total:number; period:string; org:string; hasHist:boolean; windowDays:number }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <Eyebrow>Executive summary</Eyebrow>
      <div style={{ fontFamily:T.sans, fontSize:10, color:T.ink3, marginTop:5, marginBottom:16 }}>{period}</div>

      <h1 style={{ margin:0, fontFamily:T.serif, fontSize:25, lineHeight:1.24, fontWeight:400,
                   color:T.ink, letterSpacing:"-0.02em", textWrap:"balance" }}>{a.v.headline}</h1>
      <p style={{ margin:"11px 0 0", fontFamily:T.sans, fontSize:11, lineHeight:1.62, color:T.ink2 }}>{a.v.sub}</p>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", marginTop:22,
                    borderTop:`1px solid ${T.line}`, borderBottom:`1px solid ${T.line}` }}>
        {[
          {l:"Operational capacity",v:`${Math.round(a.health*100)}%`,d:a.trend,c:statusColor[a.v.tone]},
          {l:"Sites operational",v:`${a.counts.green}/${total}`,d:null,c:T.ok},
          {l:"Critical",v:String(a.counts.red),d:null,c:a.counts.red?T.crit:T.ink3},
          {l:"Degraded",v:String(a.counts.amber),d:null,c:a.counts.amber?T.warn:T.ink3},
        ].map((k,i)=>(
          <div key={k.l} style={{ padding:"13px 12px", borderLeft:i?`1px solid ${T.line}`:"none" }}>
            <Eyebrow style={{ fontSize:8.5 }}>{k.l}</Eyebrow>
            <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:7 }}>
              <Num size={20} weight={400} color={k.c}>{k.v}</Num>
              {k.d!==null && hasHist && <Delta v={k.d} unit="" />}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:20 }}>
        <Eyebrow style={{ marginBottom:8 }}>Operational capacity · last {windowDays} days</Eyebrow>
        {hasHist ? (
          <div style={{ border:`1px solid ${T.line}`, padding:"12px 14px" }}>
            <Spark data={a.series} w={508} h={82} color={statusColor[a.v.tone]} coverage={a.hist.coverage} />
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
              <span style={{ fontFamily:T.mono, fontSize:8.5, color:T.ink4 }}>
                {new Date(a.hist.points[0].t).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
              </span>
              <span style={{ fontFamily:T.mono, fontSize:8.5, color:T.ink4 }}>today</span>
            </div>
          </div>
        ) : (
          <div style={{ border:`1px solid ${T.line}`, padding:"20px 14px", fontFamily:T.sans,
                        fontSize:10.5, color:T.ink4 }}>
            No status changes recorded yet — trend becomes available once the activity log has history.
          </div>
        )}
      </div>

      <div style={{ marginTop:20 }}>
        <Eyebrow style={{ marginBottom:8 }}>Movement · last 24 hours</Eyebrow>
        <div style={{ display:"flex", gap:26, alignItems:"baseline" }}>
          <span><Num size={17} color={a.change.recovered?T.ok:T.ink4}>{a.change.recovered}</Num>
            <span style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink2, marginLeft:6 }}>recovered</span></span>
          <span><Num size={17} color={a.change.degraded?T.crit:T.ink4}>{a.change.degraded}</Num>
            <span style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink2, marginLeft:6 }}>regressed</span></span>
        </div>
      </div>

      <div style={{ marginTop:"auto", paddingTop:14, borderTop:`1px solid ${T.line}`,
                    display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink4 }}>{org} · IT Department</span>
        <span style={{ fontFamily:T.mono, fontSize:8.5, color:T.ink4 }}>1</span>
      </div>
    </div>
  );
}

function PagePerformance({ a, hasHist, total, windowDays }:
  { a:A; hasHist:boolean; total:number; windowDays:number }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <Eyebrow>Performance</Eyebrow>
      <h2 style={{ margin:"12px 0 3px", fontFamily:T.serif, fontSize:17, fontWeight:400, color:T.ink }}>
        Division comparison
      </h2>
      <p style={{ margin:0, fontFamily:T.sans, fontSize:10, color:T.ink3 }}>
        Ranked weakest first. Delta compares against the start of the window.
      </p>

      <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:13 }}>
        {a.divs.map(d=>{
          const c = d.health>=0.8?T.ok:d.health>=0.5?T.warn:T.crit;
          return (
            <div key={d.cat}>
              <div style={{ display:"flex", alignItems:"baseline", marginBottom:5 }}>
                <span style={{ fontFamily:T.sans, fontSize:11.5, fontWeight:600, color:T.ink }}>{d.cat}</span>
                <span style={{ fontFamily:T.sans, fontSize:9.5, color:T.ink4, marginLeft:8 }}>
                  {d.green} of {d.total} operational
                </span>
                <span style={{ marginLeft:"auto", display:"flex", alignItems:"baseline", gap:9 }}>
                  <Num size={13} color={c}>{Math.round(d.health*100)}%</Num>
                  {hasHist && <Delta v={d.delta} />}
                </span>
              </div>
              <Meter segs={[{v:d.green,c:T.ok},{v:d.amber,c:T.warn},{v:d.red,c:T.crit},{v:d.na,c:T.none}]} h={5} />
            </div>
          );
        })}
      </div>

      <h2 style={{ margin:"24px 0 3px", fontFamily:T.serif, fontSize:17, fontWeight:400, color:T.ink }}>
        Service reliability
      </h2>
      <p style={{ margin:0, fontFamily:T.sans, fontSize:10, color:T.ink3 }}>
        Availability across {total} monitored sites over {windowDays} days.
      </p>
      <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {a.svcs.map(s=>{
          const c = s.availability>=0.8?T.ok:s.availability>=0.5?T.warn:T.crit;
          return (
            <div key={s.service} style={{ border:`1px solid ${T.line}`, padding:"11px 12px" }}>
              <div style={{ display:"flex", alignItems:"baseline" }}>
                <span style={{ fontFamily:T.sans, fontSize:11, fontWeight:600, color:T.ink }}>
                  {SERVICE_LABEL[s.service]}
                </span>
                {hasHist && <span style={{ marginLeft:"auto" }}><Delta v={s.delta} unit="" /></span>}
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:4, margin:"7px 0 3px" }}>
                <Num size={19} weight={400} color={c}>{Math.round(s.availability*100)}</Num>
                <Num size={10} color={T.ink4}>%</Num>
              </div>
              <div style={{ fontFamily:T.sans, fontSize:9, color:T.ink4, marginBottom:8 }}>
                {s.ok} of {s.total} sites
              </div>
              {hasHist && <Spark data={s.series} w={144} h={26} color={c} coverage={a.hist.coverage} showBand={false} />}
              <div style={{ marginTop:8 }}>
                <Meter segs={[{v:s.ok,c:T.ok},{v:s.degraded,c:T.warn},{v:s.down,c:T.crit}]} h={4} />
                <div style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink3, marginTop:5 }}>
                  {s.degraded} degraded · {s.down} down
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {a.flappy.length>0 && (
        <>
          <h2 style={{ margin:"22px 0 3px", fontFamily:T.serif, fontSize:17, fontWeight:400, color:T.ink }}>
            Instability
          </h2>
          <p style={{ margin:"0 0 10px", fontFamily:T.sans, fontSize:10, color:T.ink3, lineHeight:1.5 }}>
            Sites that changed state most often in the last 7 days. Repeated flapping often indicates
            an unresolved root cause rather than isolated incidents.
          </p>
          {a.flappy.slice(0,4).map(f=>(
            <div key={f.facility} style={{ display:"flex", padding:"6px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink }}>{f.facility}</span>
              <Num size={10} color={T.warn} style={{ marginLeft:"auto" }}>{f.flips} changes</Num>
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop:"auto", paddingTop:14, borderTop:`1px solid ${T.line}`,
                    display:"flex", justifyContent:"flex-end" }}>
        <span style={{ fontFamily:T.mono, fontSize:8.5, color:T.ink4 }}>2</span>
      </div>
    </div>
  );
}

function PageExceptions({ a }:{ a:A }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <Eyebrow>Exceptions</Eyebrow>
      <h2 style={{ margin:"12px 0 3px", fontFamily:T.serif, fontSize:17, fontWeight:400, color:T.ink }}>
        What needs attention
      </h2>
      <p style={{ margin:"0 0 14px", fontFamily:T.sans, fontSize:10, color:T.ink3 }}>
        Ranked by severity, then how long the fault has persisted, then instability.
      </p>

      {a.attn.length===0 ? (
        <div style={{ padding:"18px 14px", background:T.okBg }}>
          <span style={{ fontFamily:T.sans, fontSize:11, color:T.ok }}>
            No exceptions. Every monitored facility is reporting all services operational.
          </span>
        </div>
      ) : (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"1.9fr 1.1fr 62px 46px 58px",
                        gap:8, paddingBottom:5, borderBottom:`1px solid ${T.ink3}` }}>
            {["Facility","Fault","Since","Flips","Capacity"].map(h=>(
              <Eyebrow key={h} style={{ fontSize:8 }}>{h}</Eyebrow>
            ))}
          </div>
          {a.attn.slice(0,13).map((it,i)=>(
            <div key={it.facility} style={{ display:"grid", gridTemplateColumns:"1.9fr 1.1fr 62px 46px 58px",
                  gap:8, alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ minWidth:0 }}>
                <span style={{ display:"block", fontFamily:T.sans, fontSize:10, color:T.ink,
                               overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.facility}</span>
                <span style={{ fontFamily:T.sans, fontSize:8, color:T.ink4 }}>{it.cat}</span>
              </span>
              <span style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                <Dot s={it.status} size={5} />
                <span style={{ fontFamily:T.sans, fontSize:9.5, color:T.ink2, overflow:"hidden",
                               textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.reason}</span>
              </span>
              <Num size={9.5} color={T.ink2}>{it.since?fmtDuration(Date.now()-it.since):"—"}</Num>
              <Num size={9.5} color={it.flips>=3?T.warn:T.ink3}>{it.flips||"—"}</Num>
              <Num size={9.5} color={it.bwRatio!==null&&it.bwRatio<0.7?T.warn:T.ink3}>
                {it.bwRatio!==null?`${Math.round(it.bwRatio*100)}%`:"—"}
              </Num>
            </div>
          ))}
        </div>
      )}

      {a.bw.length>0 && (
        <>
          <h2 style={{ margin:"20px 0 3px", fontFamily:T.serif, fontSize:17, fontWeight:400, color:T.ink }}>
            Capacity risk
          </h2>
          <p style={{ margin:"0 0 10px", fontFamily:T.sans, fontSize:10, color:T.ink3 }}>
            Sites operating below their stated bandwidth requirement.
          </p>
          {a.bw.slice(0,6).map(b=>(
            <div key={b.facility} style={{ display:"grid", gridTemplateColumns:"1.7fr 88px 1fr 46px",
                  gap:10, alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily:T.sans, fontSize:10, color:T.ink, overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.facility}</span>
              <Num size={9} color={T.ink3}>{b.current} / {b.required} Mbps</Num>
              <Meter segs={[{v:b.ratio,c:b.ratio<0.6?T.crit:T.warn},{v:Math.max(1-b.ratio,0),c:T.sunken}]} h={4} />
              <Num size={10} color={b.ratio<0.6?T.crit:T.warn} style={{ textAlign:"right", display:"block" }}>
                {Math.round(b.ratio*100)}%
              </Num>
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop:"auto", paddingTop:14, borderTop:`1px solid ${T.line}`,
                    display:"flex", justifyContent:"flex-end" }}>
        <span style={{ fontFamily:T.mono, fontSize:8.5, color:T.ink4 }}>3</span>
      </div>
    </div>
  );
}

function PageAppendix({ fac, state }:{ fac:{name:string;cat:string}[]; state:Record<string,FacState> }) {
  const ordered = [...fac].sort((a,b)=>{
    const sa=state[a.name], sb=state[b.name];
    const r={red:0,amber:1,na:2,green:3} as Record<RAG,number>;
    const va=sa?r[overallOf(sa)]:4, vb=sb?r[overallOf(sb)]:4;
    return va-vb || a.name.localeCompare(b.name);
  });
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <Eyebrow>Appendix</Eyebrow>
      <h2 style={{ margin:"12px 0 3px", fontFamily:T.serif, fontSize:17, fontWeight:400, color:T.ink }}>
        Full facility register
      </h2>
      <p style={{ margin:"0 0 12px", fontFamily:T.sans, fontSize:10, color:T.ink3 }}>
        All {fac.length} monitored facilities and their current service state.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"1.8fr 1fr repeat(3,64px)", gap:8,
                    paddingBottom:5, borderBottom:`1px solid ${T.ink3}` }}>
        {["Facility","Division","Internet","Biometric","Printing"].map(h=>(
          <Eyebrow key={h} style={{ fontSize:8 }}>{h}</Eyebrow>
        ))}
      </div>
      <div style={{ flex:1, minHeight:0, overflow:"hidden" }}>
        {ordered.slice(0,26).map(f=>{
          const s=state[f.name]; if(!s) return null;
          return (
            <div key={f.name} style={{ display:"grid", gridTemplateColumns:"1.8fr 1fr repeat(3,64px)",
                  gap:8, alignItems:"center", padding:"5.5px 0", borderBottom:`1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily:T.sans, fontSize:9.5, color:T.ink, overflow:"hidden",
                             textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
              <span style={{ fontFamily:T.sans, fontSize:8.5, color:T.ink3 }}>{f.cat}</span>
              {SERVICES.map(sv=>(
                <span key={sv} style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <Dot s={s[sv]} size={5} />
                  <span style={{ fontFamily:T.sans, fontSize:8.5,
                                 color:s[sv]==="green"?T.ink3:statusColor[s[sv]],
                                 fontWeight:s[sv]==="green"?400:600 }}>
                    {s[sv]==="green"?"OK":s[sv]==="na"?"—":statusLabel[s[sv]]}
                  </span>
                </span>
              ))}
            </div>
          );
        })}
        {ordered.length>26 && (
          <div style={{ fontFamily:T.sans, fontSize:9, color:T.ink4, marginTop:8 }}>
            + {ordered.length-26} more continue on the following page of the exported PDF.
          </div>
        )}
      </div>
      <div style={{ marginTop:"auto", paddingTop:14, borderTop:`1px solid ${T.line}`,
                    display:"flex", justifyContent:"flex-end" }}>
        <span style={{ fontFamily:T.mono, fontSize:8.5, color:T.ink4 }}>4</span>
      </div>
    </div>
  );
}
