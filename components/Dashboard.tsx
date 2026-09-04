"use client";
// ─────────────────────────────────────────────────────────────────────────────
// App shell.
//
// The product now has sections rather than one scrolling page:
//   Briefing    — the executive view. Verdict, attention queue, why.
//   Operations  — the working surface. Status matrix + focused inspector.
//   Reports     — the report studio. Compose, preview, export.
//
// The data layer below (fetching, optimistic writes, activity logging, downtime
// capture, 5s polling) is carried over unchanged — it works and is not the part
// that needed redesigning.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Briefing from "./Briefing";
import Operations from "./Operations";
import ReportStudio from "./ReportStudio";
import { T, Eyebrow, Num, Dot, Shimmer, Btn } from "./ui";
import { overallOf, type FacState, type LogEntry, type RAG } from "@/lib/analytics";

const FACILITIES: { name: string; cat: string }[] = [
  // Imarat corporate (8)
  { name: "G9 Group Store",               cat: "Imarat"   },
  { name: "Warehouse",                    cat: "Imarat"   },
  { name: "I8 Guest House",               cat: "Imarat"   },
  { name: "Record Room",                  cat: "Imarat"   },
  { name: "F8 Chairman House",            cat: "Imarat"   },
  { name: "Printing Press",               cat: "Imarat"   },
  { name: "Sialkot Office",               cat: "Imarat"   },
  { name: "Hoon Farm House",              cat: "Imarat"   },
  // Projects (10)
  { name: "Amazon Mall",                  cat: "Projects" },
  { name: "Golf Floras",                  cat: "Projects" },
  { name: "Mall of Imarat",               cat: "Projects" },
  { name: "G11 CYBM",                     cat: "Projects" },
  { name: "Florence Galleria",            cat: "Projects" },
  { name: "Builders Mall",                cat: "Projects" },
  { name: "Babylon Multan",               cat: "Projects" },
  { name: "IR 1",                         cat: "Projects" },
  { name: "IR 2",                         cat: "Projects" },
  { name: "G. Floras Sales Office",       cat: "Projects" },
  // Graana (7)
  { name: "Rawalpindi RO – Opp. Ayub Park", cat: "Graana" },
  { name: "Lahore Office – MM Alam",      cat: "Graana"   },
  { name: "Bahria Phase 7 Midway",        cat: "Graana"   },
  { name: "Peshawar Graana",              cat: "Graana"   },
  { name: "Multan Citi Plaza",            cat: "Graana"   },
  { name: "RO Karachi",                   cat: "Graana"   },
  { name: "Quetta Office",                cat: "Graana"   },
  // Agency21 (6)
  { name: "DHA – Opp. Giga Mall",         cat: "Agency21" },
  { name: "Peshawar Agency21",            cat: "Agency21" },
  { name: "Agency21 Blue Area",           cat: "Agency21" },
  { name: "Civic Center RO",              cat: "Agency21" },
  { name: "Site Office – GT Road",        cat: "Agency21" },
  { name: "DHA Karachi",                  cat: "Agency21" },
];

const ORG = "Imarat Group of Companies";

type AppState = Record<string, FacState>;
interface ActivityLog {
  id: string; ts: string; facility: string; field: string;
  oldVal: string; newVal: string; type: "status"|"issue"|"notes"|"bandwidth"|"ticket";
}
interface DowntimeRecord {
  id: string; facility: string; field: string;
  startTs: string; endTs: string; durationMin: number; resolvedBy: string;
}
type Section = "briefing" | "operations" | "reports";

const nowTime = () => new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true});
const nowFull = () => new Date().toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true});
const uid = () => Math.random().toString(36).substr(2,9).toUpperCase();

// How far back the client keeps history. Reports can span a month, and the
// activity log also carries issue/notes/bandwidth edits, so a small row cap
// would silently truncate the oldest events in a long window.
const LOG_RETENTION_DAYS = 120;
const LOG_CAP = 40000;
const logSince = () =>
  encodeURIComponent(new Date(Date.now() - LOG_RETENTION_DAYS * 864e5).toISOString());

function defaultState(): FacState {
  return { internet:"green", bio:"green", printing:"green",
           bandwidth:"", requiredBandwidth:"", issue:"", notes:"", ts:nowTime() };
}
const fieldLabel = (f:string) => (({
  internet:"Internet", bio:"Biometric", printing:"Printing",
  bandwidth:"Current BW", requiredBandwidth:"Required BW",
  issue:"Reported Issue", notes:"Notes",
} as Record<string,string>)[f] || f);
const humanVal = (v:string) => (({
  green:"Working / OK", amber:"Slow / Degraded", red:"Down / Critical", na:"N/A",
} as Record<string,string>)[v.toLowerCase()] || v);

export default function Dashboard() {
  const [section, setSection]   = useState<Section>("briefing");
  const [state, setState]       = useState<AppState>({});
  const [mounted, setMounted]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [clock, setClock]       = useState("");
  const [activityLog, setLog]   = useState<ActivityLog[]>([]);
  const [, setDowntime]         = useState<DowntimeRecord[]>([]);
  const [selected, setSelected] = useState<string|null>(null);
  const [windowDays, setWindow] = useState(14);

  const saveTimer      = useRef<ReturnType<typeof setTimeout>|null>(null);
  const activeDowntime = useRef<Record<string,{field:string;startTs:string;startMs:number}>>({});

  const apiFetch = useCallback(async (url:string, opts?:RequestInit) => {
    const res = await fetch(url, opts);
    if(!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  },[]);

  // ── initial load + 5s polling ────────────────────────────────────────────
  useEffect(()=>{
    const init: AppState = {};
    FACILITIES.forEach(f=>{ init[f.name]=defaultState(); });

    const loadAll = async (spinner=true) => {
      if(spinner) setSyncing(true);
      try {
        const [fsRows, logRows, dtRows] = await Promise.all([
          apiFetch("/api/facilities"),
          apiFetch(`/api/activity-log?since=${logSince()}`),
          apiFetch("/api/downtime"),
        ]);
        setState(prev=>{
          const next={...prev};
          (fsRows as any[]).forEach((r:any)=>{ if(init[r.id]!==undefined) next[r.id]={...defaultState(),...r.data}; });
          return next;
        });
        // carry the row's ISO timestamp onto the entry — analytics needs a
        // reliable clock, and `data.ts` is a locale string
        setLog((logRows as any[]).map((r:any)=>({ ...r.data, at:r.updated_at })));
        setDowntime((dtRows as any[]).map((r:any)=>r.data));
        setLastSync(nowTime());
      } catch {}
      if(spinner){ setSyncing(false); setMounted(true); }
    };

    setState(init);
    loadAll(true);

    const tick = () => setClock(nowTime());
    tick();
    const clockTimer = setInterval(tick,1000);
    const pollTimer  = setInterval(()=>loadAll(false),5000);
    return ()=>{ clearInterval(clockTimer); clearInterval(pollTimer); };
  },[apiFetch]);

  // ── writes ───────────────────────────────────────────────────────────────
  const addLog = useCallback(async (entry: Omit<ActivityLog,"id"|"ts">) => {
    const log: ActivityLog = { ...entry, id:uid(), ts:nowFull() };
    setLog(prev=>[{...log, at:new Date().toISOString()} as any, ...prev].slice(0,LOG_CAP));
    await apiFetch("/api/activity-log",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ id:log.id, data:log }),
    });
  },[apiFetch]);

  const saveFacility = useCallback(async (name:string, data:FacState, oldData:FacState, changedField:string) => {
    await apiFetch("/api/facilities",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ id:name, data }),
    });
    const oldVal = String((oldData as any)[changedField] || "");
    const newVal = String((data as any)[changedField] || "");
    if(oldVal===newVal){ setLastSync(nowTime()); return; }

    const type: ActivityLog["type"] =
      ["internet","bio","printing"].includes(changedField) ? "status"
      : changedField==="issue" ? "issue"
      : changedField.includes("andwidth") ? "bandwidth" : "notes";
    await addLog({ facility:name, field:fieldLabel(changedField),
                   oldVal:humanVal(oldVal)||"—", newVal:humanVal(newVal)||"—", type });

    if(["internet","bio","printing"].includes(changedField)){
      const key=`${name}__${changedField}`, ms=Date.now();
      if((newVal==="red"||newVal==="amber") && oldVal==="green"){
        activeDowntime.current[key]={ field:fieldLabel(changedField), startTs:nowFull(), startMs:ms };
      }
      if(newVal==="green" && (oldVal==="red"||oldVal==="amber")){
        const act=activeDowntime.current[key];
        if(act){
          const rec: DowntimeRecord = {
            id:uid(), facility:name, field:act.field, startTs:act.startTs, endTs:nowFull(),
            durationMin:Math.round((ms-act.startMs)/60000), resolvedBy:"System",
          };
          setDowntime(prev=>[rec,...prev]);
          await apiFetch("/api/downtime",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ id:rec.id, data:rec }),
          });
          delete activeDowntime.current[key];
        }
      }
    }
    setLastSync(nowTime());
  },[addLog, apiFetch]);

  const updateField = useCallback((name:string, field:keyof FacState, val:string)=>{
    setState(prev=>{
      const oldData = prev[name] || defaultState();
      const updated = { ...oldData, [field]:val, ts:nowTime() };
      if(saveTimer.current) clearTimeout(saveTimer.current);
      if(["internet","bio","printing"].includes(field as string)){
        saveFacility(name, updated, oldData, field as string);
      } else {
        saveTimer.current = setTimeout(()=>saveFacility(name, updated, oldData, field as string), 800);
      }
      return { ...prev, [name]:updated };
    });
  },[saveFacility]);

  // ── rail counts ──────────────────────────────────────────────────────────
  const counts = useMemo(()=>{
    const c = { green:0, amber:0, red:0, na:0 } as Record<RAG,number>;
    for(const f of FACILITIES){ const s=state[f.name]; if(s) c[overallOf(s)]++; }
    return c;
  },[state]);
  const needsAttention = counts.red + counts.amber;

  const NAV: { id:Section; label:string; hint:string; badge?:number }[] = [
    { id:"briefing",   label:"Briefing",   hint:"Executive view" },
    { id:"operations", label:"Operations", hint:"Status matrix", badge:needsAttention||undefined },
    { id:"reports",    label:"Reports",    hint:"Compose & export" },
  ];

  const goOperations = (facility:string) => { setSelected(facility); setSection("operations"); };

  return (
    <div style={{ minHeight:"100vh", background:T.paper, color:T.ink, fontFamily:T.sans }}>
      <Shimmer />
      <style>{`
        *{box-sizing:border-box}
        body{background:${T.paper};margin:0}
        ::selection{background:${T.ink};color:#fff}
        input:focus,select:focus,textarea:focus{
          outline:none;border-color:${T.ink3}!important;box-shadow:0 0 0 3px rgba(24,24,27,0.07)}
        input::placeholder,textarea::placeholder{color:${T.ink4}}
        ::-webkit-scrollbar{width:10px;height:10px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.line};border-radius:5px;border:3px solid ${T.paper}}
        ::-webkit-scrollbar-thumb:hover{background:${T.ink4}}
        @keyframes led-pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
        @media (max-width:1100px){
          .led-shell{grid-template-columns:1fr!important}
          .led-rail{position:static!important;height:auto!important;
            border-right:none!important;border-bottom:1px solid ${T.line}!important}
          .led-nav{flex-direction:row!important;overflow-x:auto}
          .led-railfoot{display:none!important}
        }
      `}</style>

      <div className="led-shell" style={{ display:"grid", gridTemplateColumns:"232px minmax(0,1fr)",
                                          minHeight:"100vh", alignItems:"start" }}>

        {/* ── Rail ────────────────────────────────────────────────────────── */}
        <nav className="led-rail" style={{ position:"sticky", top:0, height:"100vh",
              borderRight:`1px solid ${T.line}`, background:T.surface,
              display:"flex", flexDirection:"column", padding:"22px 16px" }}>

          <div style={{ marginBottom:26 }}>
            <div style={{ fontFamily:T.serif, fontSize:19, letterSpacing:"-0.01em", color:T.ink, lineHeight:1.1 }}>
              Imarat
            </div>
            <Eyebrow style={{ marginTop:5, fontSize:9 }}>IT Operations</Eyebrow>
          </div>

          <div className="led-nav" style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {NAV.map(n=>{
              const on = section===n.id;
              return (
                <button key={n.id} onClick={()=>setSection(n.id)}
                  style={{ display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left",
                           padding:"10px 11px", borderRadius:5, cursor:"pointer", border:"none",
                           background:on?T.ink:"transparent", color:on?"#fff":T.ink2,
                           fontFamily:T.sans, transition:"background .12s" }}
                  onMouseEnter={e=>{ if(!on) e.currentTarget.style.background=T.paper; }}
                  onMouseLeave={e=>{ if(!on) e.currentTarget.style.background="transparent"; }}>
                  <span style={{ flex:1, minWidth:0 }}>
                    <span style={{ display:"block", fontSize:13, fontWeight:on?600:500 }}>{n.label}</span>
                    <span style={{ fontSize:10.5, color:on?"rgba(255,255,255,0.6)":T.ink4 }}>{n.hint}</span>
                  </span>
                  {n.badge !== undefined && (
                    <span style={{ padding:"2px 7px", borderRadius:10,
                                   background:on?"rgba(255,255,255,0.18)":T.critBg,
                                   color:on?"#fff":T.crit, fontFamily:T.mono, fontSize:10.5, fontWeight:600 }}>
                      {n.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="led-railfoot" style={{ marginTop:"auto", paddingTop:18, borderTop:`1px solid ${T.line}` }}>
            <Eyebrow style={{ marginBottom:9, fontSize:9 }}>Facilities</Eyebrow>
            {([["green","Operational"],["amber","Degraded"],["red","Critical"],["na","Not set"]] as [RAG,string][])
              .map(([k,l])=>(
                <div key={k} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 0" }}>
                  <Dot s={k} size={6} />
                  <span style={{ flex:1, fontSize:11, color:T.ink3 }}>{l}</span>
                  <Num size={11} color={counts[k] ? T.ink : T.ink4}>{counts[k]}</Num>
                </div>
              ))}
            <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:14, paddingTop:12,
                          borderTop:`1px solid ${T.lineSoft}` }}>
              <span style={{ width:5, height:5, borderRadius:"50%",
                             background: syncing ? T.warn : T.ok,
                             animation:"led-pulse 2s infinite" }} />
              <span style={{ fontSize:10.5, color:T.ink4 }}>
                {syncing ? "Syncing" : "Live"}
              </span>
              <Num size={10} color={T.ink4} style={{ marginLeft:"auto" }}>{clock}</Num>
            </div>
          </div>
        </nav>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main style={{ padding:"26px 32px 64px", maxWidth:1320, width:"100%" }}>
          <header style={{ display:"flex", alignItems:"flex-end", gap:16, marginBottom:24,
                           paddingBottom:16, borderBottom:`1px solid ${T.line}` }}>
            <div>
              <h1 style={{ margin:0, fontFamily:T.serif, fontSize:24, fontWeight:400,
                           letterSpacing:"-0.015em", color:T.ink, lineHeight:1.15 }}>
                {section==="briefing" ? "Briefing"
                  : section==="operations" ? "Operations" : "Reports"}
              </h1>
              <div style={{ fontSize:11.5, color:T.ink3, marginTop:5 }}>
                {section==="briefing"   && "What is happening across IT operations, and what needs attention."}
                {section==="operations" && "Every facility, worst first. Select a row to inspect and update."}
                {section==="reports"    && "Compose an executive report and export it as a PDF."}
              </div>
            </div>

            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
              {section==="briefing" && (
                <div style={{ display:"flex", gap:2, background:T.sunken, borderRadius:5, padding:2 }}>
                  {[7,14,30].map(d=>(
                    <button key={d} onClick={()=>setWindow(d)}
                      style={{ padding:"5px 11px", border:"none", borderRadius:4, cursor:"pointer",
                               fontFamily:T.sans, fontSize:11.5, fontWeight:windowDays===d?600:500,
                               background:windowDays===d?T.surface:"transparent",
                               color:windowDays===d?T.ink:T.ink3,
                               boxShadow:windowDays===d?"0 1px 2px rgba(24,24,27,0.08)":"none" }}>
                      {d}d
                    </button>
                  ))}
                </div>
              )}
              {section!=="reports" && (
                <Btn kind="solid" size="sm" onClick={()=>setSection("reports")}>Build report</Btn>
              )}
              <span style={{ fontSize:10.5, color:T.ink4 }}>
                {lastSync ? `Updated ${lastSync}` : "Loading…"}
              </span>
            </div>
          </header>

          {section==="briefing" && (
            <Briefing facilities={FACILITIES} state={state} log={activityLog as unknown as LogEntry[]}
              loading={!mounted} windowDays={windowDays}
              onInspect={goOperations} onOpenReports={()=>setSection("reports")} />
          )}

          {section==="operations" && (
            <Operations facilities={FACILITIES} state={state} log={activityLog as unknown as LogEntry[]}
              loading={!mounted} selected={selected} onSelect={setSelected} onUpdate={updateField} />
          )}

          {section==="reports" && (
            <ReportStudio facilities={FACILITIES} state={state}
              log={activityLog as unknown as LogEntry[]} org={ORG} />
          )}
        </main>
      </div>
    </div>
  );
}
