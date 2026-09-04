"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Briefing — the executive view.
//
// Reading order is deliberate and answers three questions in sequence:
//   1. WHAT IS HAPPENING   → the verdict sentence + trend
//   2. WHAT NEEDS ATTENTION → the ranked queue, worst first, with reasons
//   3. WHY                  → movement, division comparison, service reliability
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo } from "react";
import {
  T, Card, SectionHead, Eyebrow, Num, Pill, Dot, Delta, Spark, Meter, Columns,
  RankRow, EmptyState, Skel, statusColor,
} from "./ui";
import {
  reconstructHistory, attentionQueue, changesSince, divisionPerformance,
  serviceStats, repeatOffenders, bandwidthDeficits, verdict, fmtDuration,
  SERVICE_LABEL, startOfDay,
  type FacState, type LogEntry, type RAG,
} from "@/lib/analytics";

interface Props {
  facilities: { name:string; cat:string }[];
  state: Record<string, FacState>;
  log: LogEntry[];
  loading: boolean;
  windowDays: number;
  onInspect: (facility:string)=>void;
  onOpenReports: ()=>void;
}

export default function Briefing({ facilities, state, log, loading, windowDays, onInspect, onOpenReports }: Props) {
  const a = useMemo(()=>{
    const hist    = reconstructHistory(facilities, state, log, windowDays);
    const attn    = attentionQueue(facilities, state, log, 7);
    const change  = changesSince(log, Date.now() - 864e5);
    const divs    = divisionPerformance(facilities, state, log, windowDays);
    const svcs    = serviceStats(facilities, state, hist);
    const flappy  = repeatOffenders(log, 7, 4);
    const bw      = bandwidthDeficits(facilities, state).slice(0,4);
    const series  = hist.points.map(p=>p.health);
    const health  = series[series.length-1] ?? 0;
    const trend   = hist.coverage > 0 && series.length>1 ? (health - series[0])*100 : null;
    const v       = verdict(health, attn, change, trend);
    return { hist, attn, change, divs, svcs, flappy, bw, series, health, trend, v };
  },[facilities, state, log, windowDays]);

  // daily transition volume over the window (uses the full log, not just 24h)
  const volume = useMemo(()=>{
    const all = changesSince(log, Date.now() - windowDays*864e5).events;
    return Array.from({length:windowDays},(_,i)=>{
      const dayStart = startOfDay(new Date(Date.now() - (windowDays-1-i)*864e5)).getTime();
      const dayEnd = dayStart + 864e5;
      const inDay = all.filter(e=>e.time>=dayStart && e.time<dayEnd);
      const bad = inDay.filter(e=>!e.improved).length;
      return { v:inDay.length, c: bad>0 ? T.crit : inDay.length? T.ok : T.line,
               label:new Date(dayStart).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}) };
    });
  },[log, windowDays]);

  const hasHistory = a.hist.coverage > 0.02;
  const total = facilities.length || 1;

  if (loading) return <LoadingBriefing />;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:28 }}>

      {/* ── 1 · VERDICT ─────────────────────────────────────────────────── */}
      <section style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 300px", gap:36, alignItems:"start" }}>
        <div>
          <Eyebrow style={{ marginBottom:14 }}>Estate briefing · {new Date().toLocaleDateString("en-GB",{weekday:"long", day:"numeric", month:"long"})}</Eyebrow>
          <h1 style={{ margin:0, fontFamily:T.serif, fontSize:38, lineHeight:1.18, fontWeight:400,
                       letterSpacing:"-0.022em", color:T.ink, textWrap:"balance", maxWidth:"20ch" }}>
            {a.v.headline}
          </h1>
          <p style={{ margin:"14px 0 0", fontFamily:T.sans, fontSize:14, lineHeight:1.6,
                      color:T.ink2, maxWidth:"58ch" }}>
            {a.v.sub}
          </p>
        </div>

        {/* headline metric + trend */}
        <Card pad={18} style={{ background:T.surface }}>
          <Eyebrow>Operational capacity</Eyebrow>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, margin:"10px 0 2px" }}>
            <Num size={44} weight={400} color={statusColor[a.v.tone]} style={{ letterSpacing:"-0.045em" }}>
              {Math.round(a.health*100)}
            </Num>
            <Num size={19} weight={400} color={T.ink4}>%</Num>
            <span style={{ marginLeft:"auto" }}><Delta v={a.trend} /></span>
          </div>
          <div style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink3, marginBottom:12 }}>
            <Num size={11.5} color={T.ink2}>{a.hist.points[a.hist.points.length-1]?.green ?? 0}</Num>
            {" of "}
            <Num size={11.5} color={T.ink2}>{total}</Num>
            {" sites fully operational"}
          </div>
          {hasHistory ? (
            <>
              <Spark data={a.series} w={264} h={46} color={statusColor[a.v.tone]} coverage={a.hist.coverage} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                <span style={{ fontFamily:T.mono, fontSize:9.5, color:T.ink4 }}>
                  {new Date(a.hist.points[0].t).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                </span>
                <span style={{ fontFamily:T.mono, fontSize:9.5, color:T.ink4 }}>today</span>
              </div>
              {a.hist.coverage < 0.95 && (
                <div style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink4, marginTop:8, lineHeight:1.45 }}>
                  Shaded region precedes the first recorded change — carried backward, not observed.
                </div>
              )}
            </>
          ) : (
            <div style={{ padding:"14px 0", fontFamily:T.sans, fontSize:11.5, color:T.ink4, lineHeight:1.5 }}>
              No status changes recorded yet. Trend appears once the log has history.
            </div>
          )}
        </Card>
      </section>

      {/* ── 2 · NEEDS ATTENTION ─────────────────────────────────────────── */}
      <section>
        <SectionHead index="01" title="Needs attention"
          note={a.attn.length ? `${a.attn.length} of ${total} sites` : undefined}
          action={<span style={{ fontFamily:T.sans, fontSize:11, color:T.ink4 }}>ranked by severity, duration and instability</span>} />
        {a.attn.length === 0 ? (
          <Card><EmptyState icon="✓" title="Nothing requires attention"
            body="Every monitored facility is reporting all three services as operational." /></Card>
        ) : (
          <div style={{ border:`1px solid ${T.line}`, borderRadius:6, overflow:"hidden", background:T.surface }}>
            {a.attn.slice(0,7).map((it,i)=>(
              <button key={it.facility} onClick={()=>onInspect(it.facility)}
                style={{ width:"100%", textAlign:"left", display:"grid",
                         gridTemplateColumns:"18px minmax(0,2.1fr) minmax(0,1.3fr) 92px 84px 1fr",
                         gap:16, alignItems:"center", padding:"13px 16px", background:"transparent",
                         border:"none", borderTop:i?`1px solid ${T.lineSoft}`:"none", cursor:"pointer",
                         fontFamily:T.sans }}
                onMouseEnter={e=>e.currentTarget.style.background=T.paper}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <Num size={11} color={T.ink4}>{i+1}</Num>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:"block", fontSize:13.5, fontWeight:600, color:T.ink,
                                 overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.facility}</span>
                  <span style={{ fontSize:11, color:T.ink4 }}>{it.cat}</span>
                </span>
                <span style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                  <Dot s={it.status} />
                  <span style={{ fontSize:12.5, color:T.ink2, overflow:"hidden",
                                 textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.reason}</span>
                </span>
                <span>
                  <Eyebrow style={{ fontSize:9, marginBottom:2 }}>For</Eyebrow>
                  <Num size={12} color={it.since ? T.ink : T.ink4}>{fmtDuration(it.since ? Date.now()-it.since : null)}</Num>
                </span>
                <span>
                  <Eyebrow style={{ fontSize:9, marginBottom:2 }}>Flips 7d</Eyebrow>
                  <Num size={12} color={it.flips>=3 ? T.warn : T.ink3}>{it.flips || "—"}</Num>
                </span>
                <span style={{ fontSize:11.5, color:T.ink3, overflow:"hidden", textOverflow:"ellipsis",
                               whiteSpace:"nowrap", textAlign:"right" }}>
                  {it.bwRatio !== null && it.bwRatio < 1
                    ? <span style={{ color:T.warn }}>bandwidth at {Math.round(it.bwRatio*100)}% of requirement</span>
                    : it.issue || ""}
                </span>
              </button>
            ))}
            {a.attn.length > 7 && (
              <div style={{ padding:"10px 16px", borderTop:`1px solid ${T.lineSoft}`, background:T.paper,
                            fontFamily:T.sans, fontSize:11.5, color:T.ink3 }}>
                + {a.attn.length-7} more in Operations
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 3 · WHY: movement, divisions, services ──────────────────────── */}
      <section style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:24 }}>

        {/* Movement */}
        <div>
          <SectionHead index="02" title="Movement" note={`last ${windowDays} days`} />
          <Card>
            <div style={{ display:"flex", gap:28, marginBottom:18 }}>
              <div>
                <Eyebrow>Recovered · 24h</Eyebrow>
                <Num size={26} weight={400} color={a.change.recovered?T.ok:T.ink4} style={{ display:"block", marginTop:4 }}>
                  {a.change.recovered}
                </Num>
              </div>
              <div>
                <Eyebrow>Regressed · 24h</Eyebrow>
                <Num size={26} weight={400} color={a.change.degraded?T.crit:T.ink4} style={{ display:"block", marginTop:4 }}>
                  {a.change.degraded}
                </Num>
              </div>
              <div style={{ marginLeft:"auto", textAlign:"right" }}>
                <Eyebrow>Daily transitions</Eyebrow>
                <div style={{ marginTop:6 }}>
                  <Columns data={volume} w={190} h={40} labels={volume.map(v=>v.label)} />
                </div>
              </div>
            </div>

            <Eyebrow style={{ marginBottom:8 }}>Latest changes</Eyebrow>
            {a.change.events.length === 0 ? (
              <div style={{ fontFamily:T.sans, fontSize:12, color:T.ink4, padding:"6px 0" }}>
                No status changes in the last 24 hours.
              </div>
            ) : (
              <ul style={{ listStyle:"none", margin:0, padding:0, display:"flex", flexDirection:"column", gap:0 }}>
                {a.change.events.slice(0,5).map((e,i)=>(
                  <li key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0",
                                       borderTop:i?`1px solid ${T.lineSoft}`:"none" }}>
                    <span aria-hidden style={{ fontFamily:T.mono, fontSize:11, color:e.improved?T.ok:T.crit, width:12 }}>
                      {e.improved ? "↑" : "↓"}
                    </span>
                    <span style={{ fontFamily:T.sans, fontSize:12.5, color:T.ink, flex:1, minWidth:0,
                                   overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.facility}</span>
                    <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink3 }}>{SERVICE_LABEL[e.service]}</span>
                    <Pill s={e.to} />
                    <Num size={10.5} color={T.ink4} style={{ width:52, textAlign:"right" }}>
                      {fmtDuration(Date.now()-e.time)}
                    </Num>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Divisions */}
        <div>
          <SectionHead index="03" title="Division performance" note="weakest first" />
          <Card>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {a.divs.map(d=>(
                <RankRow key={d.cat} label={d.cat} value={d.health*100} max={100}
                  color={d.health>=0.8?T.ok:d.health>=0.5?T.warn:T.crit}
                  delta={hasHistory ? d.delta : null}
                  count={<span style={{ fontFamily:T.sans, fontSize:11, color:T.ink4 }}>
                    <Num size={11} color={T.ink3}>{d.green}</Num>/<Num size={11} color={T.ink4}>{d.total}</Num>
                  </span>} />
              ))}
            </div>
            {a.flappy.length > 0 && (
              <div style={{ marginTop:20, paddingTop:14, borderTop:`1px solid ${T.line}` }}>
                <Eyebrow style={{ marginBottom:8 }}>Unstable sites · 7 days</Eyebrow>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {a.flappy.map(f=>(
                    <button key={f.facility} onClick={()=>onInspect(f.facility)}
                      style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"4px 9px",
                               background:T.warnBg, border:"none", borderRadius:4, cursor:"pointer",
                               fontFamily:T.sans, fontSize:11.5, color:T.warn, fontWeight:500 }}>
                      {f.facility}
                      <Num size={10.5} color={T.warn}>{f.flips}×</Num>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── 4 · SERVICE RELIABILITY ─────────────────────────────────────── */}
      <section>
        <SectionHead index="04" title="Service reliability" note={`${windowDays}-day availability by service`} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, minmax(0,1fr))", gap:16 }}>
          {a.svcs.map(s=>{
            const c = s.availability>=0.8?T.ok:s.availability>=0.5?T.warn:T.crit;
            return (
              <Card key={s.service}>
                <div style={{ display:"flex", alignItems:"baseline", marginBottom:2 }}>
                  <span style={{ fontFamily:T.sans, fontSize:13, fontWeight:600, color:T.ink }}>
                    {SERVICE_LABEL[s.service]}
                  </span>
                  <span style={{ marginLeft:"auto" }}><Delta v={hasHistory ? s.delta : null} /></span>
                </div>
                <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:10 }}>
                  <Num size={28} weight={400} color={c} style={{ letterSpacing:"-0.04em" }}>
                    {Math.round(s.availability*100)}
                  </Num>
                  <Num size={13} color={T.ink4}>%</Num>
                  <span style={{ marginLeft:8, fontFamily:T.sans, fontSize:11, color:T.ink4 }}>
                    <Num size={11} color={T.ink3}>{s.ok}</Num> of <Num size={11} color={T.ink4}>{s.total}</Num> sites
                  </span>
                </div>
                {hasHistory && <Spark data={s.series} w={252} h={34} color={c} coverage={a.hist.coverage} />}
                <div style={{ marginTop:12 }}>
                  <Meter segs={[{v:s.ok,c:T.ok},{v:s.degraded,c:T.warn},{v:s.down,c:T.crit}]} />
                  <div style={{ display:"flex", gap:14, marginTop:8 }}>
                    {[{n:s.degraded,l:"degraded",c:T.warn},{n:s.down,l:"down",c:T.crit}].map(x=>(
                      <span key={x.l} style={{ display:"flex", alignItems:"center", gap:5,
                                               fontFamily:T.sans, fontSize:11, color:T.ink3 }}>
                        <Num size={11} color={x.n?x.c:T.ink4}>{x.n}</Num> {x.l}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── 5 · CAPACITY RISK ───────────────────────────────────────────── */}
      {a.bw.length > 0 && (
        <section>
          <SectionHead index="05" title="Capacity risk" note="sites below their stated bandwidth requirement" />
          <Card pad={0}>
            {a.bw.map((b,i)=>(
              <div key={b.facility} style={{ display:"grid", gridTemplateColumns:"minmax(0,1.6fr) 1fr 150px 70px",
                gap:16, alignItems:"center", padding:"12px 18px", borderTop:i?`1px solid ${T.lineSoft}`:"none" }}>
                <span style={{ fontFamily:T.sans, fontSize:13, color:T.ink, fontWeight:500,
                               overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.facility}</span>
                <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink4 }}>{b.cat}</span>
                <span>
                  <Meter segs={[{v:b.ratio,c:b.ratio<0.6?T.crit:T.warn},{v:1-b.ratio,c:T.sunken}]} h={5} />
                  <span style={{ fontFamily:T.mono, fontSize:10, color:T.ink4, marginTop:4, display:"block" }}>
                    {b.current} of {b.required} Mbps
                  </span>
                </span>
                <Num size={13} color={b.ratio<0.6?T.crit:T.warn} style={{ textAlign:"right", display:"block" }}>
                  {Math.round(b.ratio*100)}%
                </Num>
              </div>
            ))}
          </Card>
        </section>
      )}

      <footer style={{ display:"flex", alignItems:"center", gap:14, paddingTop:8 }}>
        <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink4 }}>
          Prepared from {log.length} logged events · window {windowDays} days
        </span>
        <button onClick={onOpenReports}
          style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:0,
                   fontFamily:T.sans, fontSize:12.5, color:T.ink, fontWeight:600,
                   borderBottom:`1px solid ${T.ink}` }}>
          Build a report from this briefing →
        </button>
      </footer>
    </div>
  );
}

function LoadingBriefing() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:28 }}>
      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 300px", gap:36 }}>
        <div>
          <Skel w={200} h={10} style={{ marginBottom:16 }} />
          <Skel h={30} style={{ marginBottom:10 }} />
          <Skel w="70%" h={30} style={{ marginBottom:16 }} />
          <Skel w="55%" h={13} />
        </div>
        <Card pad={18}>
          <Skel w={120} h={10} style={{ marginBottom:14 }} />
          <Skel w={140} h={40} style={{ marginBottom:14 }} />
          <Skel h={46} />
        </Card>
      </div>
      <div>
        <Skel w={180} h={14} style={{ marginBottom:14 }} />
        <Card pad={0}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{ padding:"14px 16px", borderTop:i?`1px solid ${T.lineSoft}`:"none",
                                  display:"grid", gridTemplateColumns:"2fr 1fr 90px 80px", gap:16 }}>
              <Skel h={13} /><Skel h={13} /><Skel h={13} /><Skel h={13} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
