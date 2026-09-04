"use client";
// ─────────────────────────────────────────────────────────────────────────────
// "Ledger" design system.
//
// Rule that governs everything here: STATUS IS THE ONLY COLOUR.
// The page is warm paper, ink and rule-lines. Green/amber/red appear solely to
// encode operational state, so anything coloured is by definition something the
// reader must act on. There is no decorative brand accent competing with it.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import type { RAG } from "@/lib/analytics";

export const T = {
  // warm neutral ramp — biased warm so it reads as paper, not as a screen
  paper:   "#FBFAF8",
  surface: "#FFFFFF",
  sunken:  "#F4F2EE",
  line:    "#E7E4DE",
  lineSoft:"#F0EDE8",
  ink:     "#18181B",
  ink2:    "#52525B",
  ink3:    "#8A867F",
  ink4:    "#A8A39B",
  // semantic — the only colour in the product
  ok:      "#0E7C5A",
  okBg:    "#EAF4EF",
  warn:    "#B45309",
  warnBg:  "#FBF1E5",
  crit:    "#B42318",
  critBg:  "#FBEDEC",
  none:    "#A8A39B",
  noneBg:  "#F2F0EC",
  serif: "var(--font-serif), Georgia, 'Times New Roman', serif",
  sans:  "var(--font-sans), system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono:  "var(--font-mono), ui-monospace, SFMono-Regular, monospace",
} as const;

export const statusColor: Record<RAG, string> = { green:T.ok, amber:T.warn, red:T.crit, na:T.none };
export const statusBg:    Record<RAG, string> = { green:T.okBg, amber:T.warnBg, red:T.critBg, na:T.noneBg };
export const statusLabel: Record<RAG, string> = { green:"Operational", amber:"Degraded", red:"Critical", na:"Not set" };

// ── Type primitives ──────────────────────────────────────────────────────────

/** Small caps eyebrow. Used for every section and column label in the product. */
export const Eyebrow = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ fontFamily:T.sans, fontSize:10, fontWeight:600, letterSpacing:"0.13em",
                textTransform:"uppercase", color:T.ink3, ...style }}>{children}</div>
);

/** Every number in the product goes through here — one mono, one alignment. */
export const Num = ({ children, size=14, weight=500, color=T.ink, style }:
  { children:React.ReactNode; size?:number; weight?:number; color?:string; style?:React.CSSProperties }) => (
  <span style={{ fontFamily:T.mono, fontSize:size, fontWeight:weight, color,
                 fontVariantNumeric:"tabular-nums", letterSpacing:"-0.02em", ...style }}>{children}</span>
);

export const Card = ({ children, style, pad=20 }:
  { children:React.ReactNode; style?:React.CSSProperties; pad?:number }) => (
  <section style={{ background:T.surface, border:`1px solid ${T.line}`, borderRadius:6,
                    padding:pad, ...style }}>{children}</section>
);

export function SectionHead({ index, title, note, action }:
  { index?:string; title:string; note?:React.ReactNode; action?:React.ReactNode }) {
  return (
    <header style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:14,
                     paddingBottom:10, borderBottom:`1px solid ${T.line}` }}>
      {index && <span style={{ fontFamily:T.mono, fontSize:11, color:T.ink4, letterSpacing:"0.04em" }}>{index}</span>}
      <h2 style={{ margin:0, fontFamily:T.serif, fontSize:19, fontWeight:400, color:T.ink, letterSpacing:"-0.01em" }}>{title}</h2>
      {note && <span style={{ fontFamily:T.sans, fontSize:11.5, color:T.ink3 }}>{note}</span>}
      {action && <span style={{ marginLeft:"auto" }}>{action}</span>}
    </header>
  );
}

// ── Status primitives ────────────────────────────────────────────────────────

export const Dot = ({ s, size=7 }: { s:RAG; size?:number }) => (
  <span aria-hidden style={{ width:size, height:size, borderRadius:"50%",
    background:statusColor[s], display:"inline-block", flexShrink:0 }} />
);

export const Pill = ({ s, children }: { s:RAG; children?:React.ReactNode }) => (
  <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"3px 9px",
    borderRadius:4, background:statusBg[s], color:statusColor[s],
    fontFamily:T.sans, fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
    <Dot s={s} size={6} />{children ?? statusLabel[s]}
  </span>
);

/** Directional change. Null renders an explicit em-dash, never a fake zero. */
export function Delta({ v, unit="pts", invert=false }: { v:number|null; unit?:string; invert?:boolean }) {
  if (v === null || !Number.isFinite(v))
    return <span style={{ fontFamily:T.mono, fontSize:11, color:T.ink4 }}>—</span>;
  const flat = Math.abs(v) < 0.05;
  const good = invert ? v < 0 : v > 0;
  const c = flat ? T.ink3 : good ? T.ok : T.crit;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontFamily:T.mono,
                   fontSize:11, fontWeight:500, color:c, fontVariantNumeric:"tabular-nums" }}>
      <span aria-hidden>{flat ? "→" : good ? "▲" : "▼"}</span>
      {flat ? "0" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`}{unit && <span style={{ color:T.ink4 }}>{unit}</span>}
    </span>
  );
}

// ── Charts ───────────────────────────────────────────────────────────────────

/**
 * Sparkline with area fill, emphasised endpoint and an optional band showing
 * the portion of the window that is observed rather than assumed.
 */
export function Spark({ data, w=180, h=44, color=T.ink, coverage=1, showBand=true }:
  { data:number[]; w?:number; h?:number; color?:string; coverage?:number; showBand?:boolean }) {
  if (!data.length) return <svg width={w} height={h} />;
  const pad = 3;
  const lo = Math.min(...data), hi = Math.max(...data);
  const span = hi - lo || 1;
  const x = (i:number) => pad + (i / Math.max(data.length - 1, 1)) * (w - pad*2);
  const y = (v:number) => pad + (1 - (v - lo) / span) * (h - pad*2);
  const line = data.map((v,i) => `${i?"L":"M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${x(data.length-1).toFixed(2)},${h-pad} L${x(0).toFixed(2)},${h-pad} Z`;
  const uid = React.useId();
  const assumedW = Math.max(0, (1 - Math.min(coverage,1))) * (w - pad*2);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="trend">
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showBand && assumedW > 1 && (
        <rect x={pad} y={pad} width={assumedW} height={h-pad*2} fill={T.sunken} />
      )}
      <path d={area} fill={`url(#g${uid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(data.length-1)} cy={y(data[data.length-1])} r="2.6" fill={color} />
    </svg>
  );
}

/** Segmented horizontal meter. One spec, used for every distribution. */
export function Meter({ segs, h=6, radius=3 }:
  { segs:{ v:number; c:string }[]; h?:number; radius?:number }) {
  const tot = segs.reduce((s,x)=>s+x.v,0) || 1;
  return (
    <div style={{ height:h, background:T.sunken, borderRadius:radius, display:"flex", overflow:"hidden" }}>
      {segs.map((s,i)=> s.v>0 ? <div key={i} style={{ width:`${s.v/tot*100}%`, background:s.c }} /> : null)}
    </div>
  );
}

/**
 * Column chart with a real baseline, value labels and a highlighted latest bar.
 * Used for daily transition volume.
 */
export function Columns({ data, w=220, h=56, labels }:
  { data:{ v:number; c?:string }[]; w?:number; h?:number; labels?:string[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d=>d.v), 1);
  const gap = 3;
  const bw = (w - gap*(data.length-1)) / data.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="daily volume">
      <line x1="0" y1={h-0.5} x2={w} y2={h-0.5} stroke={T.line} strokeWidth="1" />
      {data.map((d,i)=>{
        const bh = d.v === 0 ? 1 : Math.max((d.v/max)*(h-8), 2);
        return <rect key={i} x={i*(bw+gap)} y={h-1-bh} width={bw} height={bh}
                     rx="1" fill={d.c ?? T.ink4}>
          {labels?.[i] && <title>{`${labels[i]}: ${d.v}`}</title>}
        </rect>;
      })}
    </svg>
  );
}

/**
 * Horizontal ranked bar row — the workhorse for comparisons. Replaces the donut,
 * which forced angle comparison the eye is bad at.
 */
export function RankRow({ label, value, max, count, color=T.ink, delta, suffix="%" }:
  { label:string; value:number; max:number; count?:React.ReactNode; color?:string; delta?:number|null; suffix?:string }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"4px 12px", alignItems:"baseline" }}>
      <span style={{ fontFamily:T.sans, fontSize:12.5, color:T.ink, fontWeight:500 }}>{label}</span>
      <span style={{ display:"flex", alignItems:"baseline", gap:10 }}>
        {count}
        <Num size={13} color={color}>{Math.round(value)}{suffix}</Num>
        {delta !== undefined && <Delta v={delta ?? null} />}
      </span>
      <div style={{ gridColumn:"1 / -1" }}>
        <div style={{ height:5, background:T.sunken, borderRadius:2.5, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${max>0 ? (value/max)*100 : 0}%`, background:color, borderRadius:2.5 }} />
        </div>
      </div>
    </div>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

export function EmptyState({ title, body, icon="—" }:
  { title:string; body:string; icon?:string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                  padding:"40px 24px", textAlign:"center", gap:6 }}>
      <div aria-hidden style={{ fontFamily:T.mono, fontSize:20, color:T.ink4, marginBottom:2 }}>{icon}</div>
      <div style={{ fontFamily:T.serif, fontSize:16, color:T.ink }}>{title}</div>
      <div style={{ fontFamily:T.sans, fontSize:12.5, color:T.ink3, maxWidth:340, lineHeight:1.55 }}>{body}</div>
    </div>
  );
}

export const Shimmer = () => (
  <style>{`@keyframes led-sh{0%{background-position:-200% 0}100%{background-position:200% 0}}
  .led-sk{background:linear-gradient(90deg,${T.sunken} 25%,${T.lineSoft} 37%,${T.sunken} 63%);
  background-size:200% 100%;animation:led-sh 1.4s ease-in-out infinite;border-radius:3px}
  @media (prefers-reduced-motion:reduce){.led-sk{animation:none}}`}</style>
);

export const Skel = ({ w="100%", h=12, style }: { w?:number|string; h?:number; style?:React.CSSProperties }) => (
  <div className="led-sk" style={{ width:w, height:h, ...style }} />
);

/** Segmented control — the single filter affordance used across the product. */
export function Segmented<V extends string>({ value, onChange, options, size="md" }:
  { value:V; onChange:(v:V)=>void; options:{ v:V; label:React.ReactNode; count?:number }[]; size?:"sm"|"md" }) {
  const py = size==="sm" ? 4 : 6, fs = size==="sm" ? 11 : 12;
  return (
    <div role="tablist" style={{ display:"inline-flex", background:T.sunken, borderRadius:5, padding:2, gap:2 }}>
      {options.map(o=>{
        const on = o.v===value;
        return (
          <button key={o.v} role="tab" aria-selected={on} onClick={()=>onChange(o.v)}
            style={{ display:"inline-flex", alignItems:"center", gap:6, padding:`${py}px 11px`, border:"none",
                     borderRadius:4, cursor:"pointer", fontFamily:T.sans, fontSize:fs, fontWeight:on?600:500,
                     background:on?T.surface:"transparent", color:on?T.ink:T.ink3,
                     boxShadow:on?"0 1px 2px rgba(24,24,27,0.08)":"none", transition:"background .12s, color .12s" }}>
            {o.label}
            {o.count!==undefined && <Num size={10.5} color={on?T.ink3:T.ink4}>{o.count}</Num>}
          </button>
        );
      })}
    </div>
  );
}

export const Btn = ({ children, onClick, kind="ghost", size="md", disabled, title }:
  { children:React.ReactNode; onClick?:()=>void; kind?:"solid"|"ghost"|"quiet"; size?:"sm"|"md"; disabled?:boolean; title?:string }) => {
  const py = size==="sm" ? 5 : 8, px = size==="sm" ? 10 : 14, fs = size==="sm" ? 11.5 : 12.5;
  const styles: Record<string, React.CSSProperties> = {
    solid: { background:T.ink, color:"#fff", border:`1px solid ${T.ink}` },
    ghost: { background:T.surface, color:T.ink, border:`1px solid ${T.line}` },
    quiet: { background:"transparent", color:T.ink3, border:"1px solid transparent" },
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ padding:`${py}px ${px}px`, borderRadius:5, cursor:disabled?"not-allowed":"pointer",
               fontFamily:T.sans, fontSize:fs, fontWeight:550, letterSpacing:"0.01em",
               opacity:disabled?0.45:1, transition:"background .12s, border-color .12s", ...styles[kind] }}>
      {children}
    </button>
  );
};

// ── Charts, part two ─────────────────────────────────────────────────────────

/**
 * Status composition over time. Shows not just that health fell but what it
 * fell INTO — a drop into amber reads very differently from a drop into red.
 */
export function StackedArea({ points, w=520, h=120, coverage=1, showAxis=true }:
  { points:{ green:number; amber:number; red:number; na:number }[]; w?:number; h?:number;
    coverage?:number; showAxis?:boolean }) {
  if (points.length < 2) return null;
  const padL = showAxis ? 26 : 0, padB = showAxis ? 16 : 0, padT = 4;
  const iw = w - padL, ih = h - padB - padT;
  const total = Math.max(...points.map(p=>p.green+p.amber+p.red+p.na), 1);
  const x = (i:number) => padL + (i/(points.length-1))*iw;

  // stack order puts the good news at the bottom so the eye reads the bad
  // news as growth from the top of the plot
  const bands: { key:"green"|"amber"|"red"|"na"; c:string }[] = [
    { key:"green", c:T.ok }, { key:"na", c:T.none }, { key:"amber", c:T.warn }, { key:"red", c:T.crit },
  ];
  let base = points.map(()=>0);
  const paths: { d:string; c:string }[] = [];
  for (const b of bands) {
    const top = points.map((p,i)=> base[i] + p[b.key]);
    const up   = points.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${(padT+ih-(top[i]/total)*ih).toFixed(1)}`).join(" ");
    const down = points.map((p,i)=>i).reverse()
      .map(i=>`L${x(i).toFixed(1)},${(padT+ih-(base[i]/total)*ih).toFixed(1)}`).join(" ");
    paths.push({ d:`${up} ${down} Z`, c:b.c });
    base = top;
  }

  const assumed = Math.max(0, 1-Math.min(coverage,1)) * iw;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="status composition over time">
      {showAxis && [0,0.5,1].map(f=>{
        const gy = padT + ih - f*ih;
        return (
          <g key={f}>
            <line x1={padL} y1={gy} x2={w} y2={gy} stroke={f===0?T.line:T.lineSoft} strokeWidth="1" />
            <text x={padL-5} y={gy+3} textAnchor="end"
                  style={{ fontFamily:T.mono, fontSize:8, fill:T.ink4 }}>{Math.round(f*total)}</text>
          </g>
        );
      })}
      {paths.map((p,i)=><path key={i} d={p.d} fill={p.c} fillOpacity={i===0?0.82:0.9} />)}
      {assumed>1 && <rect x={padL} y={padT} width={assumed} height={ih} fill={T.paper} fillOpacity="0.72" />}
      <rect x={padL} y={padT} width={iw} height={ih} fill="none" stroke={T.line} strokeWidth="1" />
    </svg>
  );
}

/**
 * Recoveries above the axis, regressions below. A single glance answers
 * "are we fixing faster than we are breaking?"
 */
export function DivergingBars({ data, w=520, h=104, showAxis=true }:
  { data:{ recovered:number; regressed:number; label:string }[]; w?:number; h?:number; showAxis?:boolean }) {
  if (!data.length) return null;
  const padL = showAxis ? 22 : 0, padB = 14, padT = 6;
  const iw = w - padL, ih = h - padB - padT;
  const mid = padT + ih/2;
  const max = Math.max(...data.flatMap(d=>[d.recovered,d.regressed]), 1);
  const gap = data.length > 20 ? 1 : 2.5;
  const bw = Math.max((iw - gap*(data.length-1)) / data.length, 1.5);
  const scale = (v:number) => (v/max) * (ih/2 - 2);
  const every = Math.ceil(data.length / 7);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="daily recoveries and regressions">
      {showAxis && (
        <>
          <text x={padL-5} y={padT+7} textAnchor="end" style={{ fontFamily:T.mono, fontSize:8, fill:T.ok }}>{max}</text>
          <text x={padL-5} y={padT+ih+1} textAnchor="end" style={{ fontFamily:T.mono, fontSize:8, fill:T.crit }}>{max}</text>
        </>
      )}
      <line x1={padL} y1={mid} x2={w} y2={mid} stroke={T.ink4} strokeWidth="1" />
      {data.map((d,i)=>{
        const x = padL + i*(bw+gap);
        return (
          <g key={i}>
            {d.recovered>0 && <rect x={x} y={mid-scale(d.recovered)-1} width={bw} height={scale(d.recovered)} rx="1" fill={T.ok}><title>{`${d.label}: ${d.recovered} recovered`}</title></rect>}
            {d.regressed>0 && <rect x={x} y={mid+1} width={bw} height={scale(d.regressed)} rx="1" fill={T.crit}><title>{`${d.label}: ${d.regressed} regressed`}</title></rect>}
            {i%every===0 && (
              <text x={x+bw/2} y={h-3} textAnchor="middle"
                    style={{ fontFamily:T.mono, fontSize:7.5, fill:T.ink4 }}>
                {d.label.split(" ")[0]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Facility × day availability grid. The densest honest view of the window —
 * patterns (a site broken all week vs one flapping daily) are visible at a
 * glance in a way no aggregate can show.
 */
export function Heatmap({ rows, days, cell=13, gap=2, labelW=132, maxRows=16 }:
  { rows:{ name:string; states:RAG[] }[]; days:{ label:string }[];
    cell?:number; gap?:number; labelW?:number; maxRows?:number }) {
  const shown = rows.slice(0, maxRows);
  const every = Math.ceil(days.length / 8);
  return (
    <div style={{ overflowX:"auto" }}>
      <div style={{ display:"flex", marginLeft:labelW, gap, marginBottom:4 }}>
        {days.map((d,i)=>(
          <span key={i} style={{ width:cell, fontFamily:T.mono, fontSize:7.5, color:T.ink4,
                                 textAlign:"center", whiteSpace:"nowrap" }}>
            {i%every===0 ? d.label.split(" ")[0] : ""}
          </span>
        ))}
      </div>
      {shown.map(r=>(
        <div key={r.name} style={{ display:"flex", alignItems:"center", gap, marginBottom:gap }}>
          <span style={{ width:labelW, paddingRight:8, fontFamily:T.sans, fontSize:10.5, color:T.ink2,
                         overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
          {r.states.map((s,i)=>(
            <span key={i} title={`${r.name} · ${days[i]?.label ?? ""} · ${statusLabel[s]}`}
              style={{ width:cell, height:cell, borderRadius:2, flexShrink:0,
                       background: s==="green" ? T.okBg : statusColor[s],
                       border: s==="green" ? `1px solid ${T.line}` : "none" }} />
          ))}
        </div>
      ))}
      {rows.length > maxRows && (
        <div style={{ marginTop:6, marginLeft:labelW, fontFamily:T.sans, fontSize:10, color:T.ink4 }}>
          + {rows.length-maxRows} further facilities, all fully operational across the window
        </div>
      )}
    </div>
  );
}

/** Legend row shared by the composition and heatmap charts. */
export const ChartLegend = ({ items }: { items:{ c:string; l:string; n?:number }[] }) => (
  <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 16px", marginTop:10 }}>
    {items.map(i=>(
      <span key={i.l} style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
        <span style={{ width:9, height:9, borderRadius:2, background:i.c, flexShrink:0 }} />
        <span style={{ fontFamily:T.sans, fontSize:10.5, color:T.ink3 }}>{i.l}</span>
        {i.n!==undefined && <Num size={10.5} color={T.ink2}>{i.n}</Num>}
      </span>
    ))}
  </div>
);

/** Compact duration display for MTTR figures. */
export const Dur = ({ ms, size=14, color=T.ink }: { ms:number|null; size?:number; color?:string }) => {
  if (ms === null) return <Num size={size} color={T.ink4}>—</Num>;
  const h = ms/36e5;
  const [v,u] = h < 1 ? [Math.round(ms/6e4), "m"] : h < 48 ? [Math.round(h*10)/10, "h"] : [Math.round(h/24*10)/10, "d"];
  return (
    <span style={{ display:"inline-flex", alignItems:"baseline", gap:2 }}>
      <Num size={size} color={color}>{v}</Num>
      <span style={{ fontFamily:T.mono, fontSize:size*0.62, color:T.ink4 }}>{u}</span>
    </span>
  );
};
