"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Operations — the working surface.
//
// Replaces the old numbered-square grid (which showed "17" instead of a name)
// and the raw data-entry table. This is a status MATRIX: named facilities down
// the side, services across, severity-sorted so broken things float to the top.
// Editing happens in a focused side panel, not inline in the scan view.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import {
  T, Card, Eyebrow, Num, Dot, Pill, Segmented, Btn, EmptyState, Skel,
  statusColor, statusBg, statusLabel, Meter,
} from "./ui";
import {
  overallOf, severity, statusTransitions, fmtDuration, SERVICES, SERVICE_LABEL,
  type FacState, type LogEntry, type RAG, type Service,
} from "@/lib/analytics";

const OPTS: Record<Service, { v:RAG; l:string }[]> = {
  internet: [{v:"green",l:"Working"},{v:"amber",l:"Slow / intermittent"},{v:"red",l:"Down"},{v:"na",l:"N/A"}],
  bio:      [{v:"green",l:"Syncing"},{v:"amber",l:"Delayed"},{v:"red",l:"Not working"},{v:"na",l:"N/A"}],
  printing: [{v:"green",l:"Working"},{v:"amber",l:"Partial"},{v:"red",l:"Not working"},{v:"na",l:"N/A"}],
};

type Sort = "severity" | "name" | "division" | "recent";

interface Props {
  facilities: { name:string; cat:string }[];
  state: Record<string, FacState>;
  log: LogEntry[];
  loading: boolean;
  selected: string | null;
  onSelect: (f:string|null)=>void;
  onUpdate: (facility:string, field:keyof FacState, value:string)=>void;
}

export default function Operations({ facilities, state, log, loading, selected, onSelect, onUpdate }: Props) {
  const [filter, setFilter] = useState<"all"|RAG>("all");
  const [div, setDiv]       = useState<string>("all");
  const [sort, setSort]     = useState<Sort>("severity");
  const [q, setQ]           = useState("");

  const divisions = useMemo(()=>Array.from(new Set(facilities.map(f=>f.cat))),[facilities]);

  // last transition per facility — powers "changed" column and the recent sort
  const lastChange = useMemo(()=>{
    const m = new Map<string, number>();
    for (const e of statusTransitions(log)) if (!m.has(e.facility)) m.set(e.facility, e.time);
    return m;
  },[log]);

  const counts = useMemo(()=>{
    const c: Record<string, number> = { all:facilities.length, green:0, amber:0, red:0, na:0 };
    for (const f of facilities) { const s=state[f.name]; if (s) c[overallOf(s)]++; }
    return c;
  },[facilities, state]);

  const rows = useMemo(()=>{
    let r = facilities.filter(f=>{
      const s = state[f.name];
      if (!s) return false;
      if (filter!=="all" && overallOf(s)!==filter) return false;
      if (div!=="all" && f.cat!==div) return false;
      if (q && !f.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const sorters: Record<Sort,(a:typeof r[0],b:typeof r[0])=>number> = {
      severity: (a,b)=> severity[overallOf(state[b.name])]-severity[overallOf(state[a.name])] || a.name.localeCompare(b.name),
      name:     (a,b)=> a.name.localeCompare(b.name),
      division: (a,b)=> a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name),
      recent:   (a,b)=> (lastChange.get(b.name)??0)-(lastChange.get(a.name)??0),
    };
    return [...r].sort(sorters[sort]);
  },[facilities, state, filter, div, q, sort, lastChange]);

  const sel = selected ? state[selected] : null;

  if (loading) return (
    <Card pad={0}>
      {Array.from({length:8}).map((_,i)=>(
        <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr repeat(3,110px) 120px",
          gap:16, padding:"14px 18px", borderTop:i?`1px solid ${T.lineSoft}`:"none" }}>
          <Skel h={14}/><Skel h={14}/><Skel h={14}/><Skel h={14}/><Skel h={14}/>
        </div>
      ))}
    </Card>
  );

  return (
    <div style={{ display:"grid", gridTemplateColumns: selected ? "minmax(0,1fr) 340px" : "minmax(0,1fr)",
                  gap:20, alignItems:"start" }}>
      <div>
        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", marginBottom:16 }}>
          <Segmented value={filter} onChange={setFilter} options={[
            { v:"all"   as const, label:"All",         count:counts.all },
            { v:"red"   as const, label:"Critical",    count:counts.red },
            { v:"amber" as const, label:"Degraded",    count:counts.amber },
            { v:"green" as const, label:"Operational", count:counts.green },
          ]} />

          <div style={{ display:"flex", gap:2, background:T.sunken, borderRadius:5, padding:2 }}>
            {["all",...divisions].map(d=>(
              <button key={d} onClick={()=>setDiv(d)}
                style={{ padding:"6px 10px", border:"none", borderRadius:4, cursor:"pointer",
                         fontFamily:T.sans, fontSize:11.5, fontWeight:div===d?600:500,
                         background:div===d?T.surface:"transparent", color:div===d?T.ink:T.ink3,
                         boxShadow:div===d?"0 1px 2px rgba(24,24,27,0.08)":"none" }}>
                {d==="all"?"All divisions":d}
              </button>
            ))}
          </div>

          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search facilities…"
            style={{ marginLeft:"auto", width:200, padding:"7px 11px", borderRadius:5,
                     border:`1px solid ${T.line}`, background:T.surface, color:T.ink,
                     fontFamily:T.sans, fontSize:12.5, outline:"none" }} />

          <select value={sort} onChange={e=>setSort(e.target.value as Sort)}
            style={{ padding:"7px 10px", borderRadius:5, border:`1px solid ${T.line}`,
                     background:T.surface, color:T.ink2, fontFamily:T.sans, fontSize:12, outline:"none" }}>
            <option value="severity">Sort: severity</option>
            <option value="recent">Sort: recently changed</option>
            <option value="name">Sort: name</option>
            <option value="division">Sort: division</option>
          </select>
        </div>

        {/* ── Matrix ─────────────────────────────────────────────────────── */}
        <div style={{ border:`1px solid ${T.line}`, borderRadius:6, background:T.surface, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"minmax(0,2.2fr) repeat(3,104px) 108px 88px",
                        gap:14, padding:"9px 18px", background:T.paper, borderBottom:`1px solid ${T.line}` }}>
            <Eyebrow>Facility</Eyebrow>
            {SERVICES.map(s=><Eyebrow key={s}>{SERVICE_LABEL[s]}</Eyebrow>)}
            <Eyebrow>Overall</Eyebrow>
            <Eyebrow style={{ textAlign:"right" }}>Changed</Eyebrow>
          </div>

          {rows.length===0 ? (
            <EmptyState icon="⌕" title="No facilities match"
              body="Try clearing the search box, or widening the status and division filters." />
          ) : rows.map((f,i)=>{
            const s = state[f.name]; const ov = overallOf(s);
            const on = selected===f.name;
            const t = lastChange.get(f.name);
            return (
              <button key={f.name} onClick={()=>onSelect(on?null:f.name)}
                style={{ width:"100%", textAlign:"left", display:"grid",
                         gridTemplateColumns:"minmax(0,2.2fr) repeat(3,104px) 108px 88px", gap:14,
                         alignItems:"center", padding:"11px 18px", cursor:"pointer",
                         border:"none", borderTop:i?`1px solid ${T.lineSoft}`:"none",
                         background:on?T.paper:"transparent",
                         boxShadow:on?`inset 3px 0 0 ${statusColor[ov]}`:"none" }}
                onMouseEnter={e=>{ if(!on) e.currentTarget.style.background=T.paper; }}
                onMouseLeave={e=>{ if(!on) e.currentTarget.style.background="transparent"; }}>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:"block", fontFamily:T.sans, fontSize:13, fontWeight:on?600:500,
                                 color:T.ink, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {f.name}
                  </span>
                  <span style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink4 }}>{f.cat}</span>
                </span>
                {SERVICES.map(sv=>(
                  <span key={sv} style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <Dot s={s[sv]} size={6} />
                    <span style={{ fontFamily:T.sans, fontSize:11.5,
                                   color: s[sv]==="green" ? T.ink3 : statusColor[s[sv]],
                                   fontWeight: s[sv]==="green" ? 400 : 600 }}>
                      {s[sv]==="green" ? "OK" : s[sv]==="na" ? "—" : statusLabel[s[sv]]}
                    </span>
                  </span>
                ))}
                <span><Pill s={ov} /></span>
                <Num size={11} color={T.ink4} style={{ textAlign:"right", display:"block" }}>
                  {t ? fmtDuration(Date.now()-t) : "—"}
                </Num>
              </button>
            );
          })}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12 }}>
          <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink4 }}>
            Showing <Num size={11.5} color={T.ink2}>{rows.length}</Num> of{" "}
            <Num size={11.5} color={T.ink2}>{facilities.length}</Num> facilities
          </span>
          {(filter!=="all"||div!=="all"||q) && (
            <Btn size="sm" kind="quiet" onClick={()=>{setFilter("all");setDiv("all");setQ("");}}>Clear filters</Btn>
          )}
        </div>
      </div>

      {/* ── Inspector ────────────────────────────────────────────────────── */}
      {selected && sel && (
        <aside style={{ position:"sticky", top:20 }}>
          <Card pad={0}>
            <header style={{ padding:"16px 18px", borderBottom:`1px solid ${T.line}` }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <h3 style={{ margin:0, fontFamily:T.serif, fontSize:17, fontWeight:400, color:T.ink,
                               lineHeight:1.25 }}>{selected}</h3>
                  <div style={{ fontFamily:T.sans, fontSize:11, color:T.ink4, marginTop:3 }}>
                    {facilities.find(f=>f.name===selected)?.cat}
                  </div>
                </div>
                <button onClick={()=>onSelect(null)} aria-label="Close"
                  style={{ background:"none", border:"none", cursor:"pointer", color:T.ink4,
                           fontSize:16, lineHeight:1, padding:2 }}>×</button>
              </div>
              <div style={{ marginTop:12 }}><Pill s={overallOf(sel)} /></div>
            </header>

            <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:16 }}>
              {SERVICES.map(sv=>(
                <div key={sv}>
                  <Eyebrow style={{ marginBottom:6 }}>{SERVICE_LABEL[sv]}</Eyebrow>
                  <div style={{ display:"flex", gap:4 }}>
                    {OPTS[sv].map(o=>{
                      const on = sel[sv]===o.v;
                      return (
                        <button key={o.v} onClick={()=>onUpdate(selected, sv, o.v)} title={o.l}
                          style={{ flex:1, padding:"7px 4px", borderRadius:4, cursor:"pointer",
                                   border:`1px solid ${on?statusColor[o.v]:T.line}`,
                                   background:on?statusBg[o.v]:T.surface,
                                   color:on?statusColor[o.v]:T.ink3,
                                   fontFamily:T.sans, fontSize:10.5, fontWeight:on?600:500 }}>
                          {o.v==="green"?"OK":o.v==="amber"?"Degr":o.v==="red"?"Down":"N/A"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <label>
                  <Eyebrow style={{ marginBottom:5 }}>Current BW</Eyebrow>
                  <input value={sel.bandwidth} onChange={e=>onUpdate(selected,"bandwidth",e.target.value)}
                    placeholder="Mbps"
                    style={{ width:"100%", padding:"7px 9px", borderRadius:4, border:`1px solid ${T.line}`,
                             background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:12, outline:"none" }} />
                </label>
                <label>
                  <Eyebrow style={{ marginBottom:5 }}>Required BW</Eyebrow>
                  <input value={sel.requiredBandwidth} onChange={e=>onUpdate(selected,"requiredBandwidth",e.target.value)}
                    placeholder="Mbps"
                    style={{ width:"100%", padding:"7px 9px", borderRadius:4, border:`1px solid ${T.line}`,
                             background:T.surface, color:T.ink, fontFamily:T.mono, fontSize:12, outline:"none" }} />
                </label>
              </div>

              {(()=>{
                const c=parseFloat(sel.bandwidth.replace(/[^0-9.]/g,""));
                const r=parseFloat(sel.requiredBandwidth.replace(/[^0-9.]/g,""));
                if(!(c>0)||!(r>0)) return null;
                const ratio=c/r, col=ratio>=1?T.ok:ratio>=0.7?T.warn:T.crit;
                return (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <Eyebrow>Capacity</Eyebrow>
                      <Num size={11} color={col}>{Math.round(ratio*100)}% of requirement</Num>
                    </div>
                    <Meter segs={[{v:Math.min(ratio,1),c:col},{v:Math.max(1-ratio,0),c:T.sunken}]} h={5} />
                  </div>
                );
              })()}

              <label>
                <Eyebrow style={{ marginBottom:5 }}>Reported issue</Eyebrow>
                <input value={sel.issue} onChange={e=>onUpdate(selected,"issue",e.target.value)}
                  placeholder="What is wrong?"
                  style={{ width:"100%", padding:"7px 9px", borderRadius:4, border:`1px solid ${T.line}`,
                           background:T.surface, color:T.ink, fontFamily:T.sans, fontSize:12, outline:"none" }} />
              </label>

              <label>
                <Eyebrow style={{ marginBottom:5 }}>Notes</Eyebrow>
                <textarea value={sel.notes} onChange={e=>onUpdate(selected,"notes",e.target.value)}
                  rows={3} placeholder="Context, actions taken, owner…"
                  style={{ width:"100%", padding:"7px 9px", borderRadius:4, border:`1px solid ${T.line}`,
                           background:T.surface, color:T.ink, fontFamily:T.sans, fontSize:12,
                           outline:"none", resize:"vertical" }} />
              </label>
            </div>

            <footer style={{ padding:"12px 18px", borderTop:`1px solid ${T.line}`, background:T.paper }}>
              <Eyebrow style={{ marginBottom:6 }}>Recent activity</Eyebrow>
              {(()=>{
                const mine = statusTransitions(log).filter(e=>e.facility===selected).slice(0,4);
                if(!mine.length) return <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink4 }}>No recorded changes.</span>;
                return (
                  <ul style={{ listStyle:"none", margin:0, padding:0 }}>
                    {mine.map((e,i)=>(
                      <li key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0" }}>
                        <Dot s={e.newVal as RAG} size={5} />
                        <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink2, flex:1 }}>
                          {SERVICE_LABEL[e.field as Service]} → {statusLabel[e.newVal as RAG]}
                        </span>
                        <Num size={10} color={T.ink4}>{fmtDuration(Date.now()-e.time)} ago</Num>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </footer>
          </Card>
        </aside>
      )}
    </div>
  );
}
