// ─────────────────────────────────────────────────────────────────────────────
// IT Operations Report — multi-page executive document.
//
// Portrait A4: this gets emailed, printed and read in a meeting, not projected
// as a dashboard. Structure follows how a decision-maker reads — verdict, then
// evidence, then exceptions, then the full record they can ignore.
//
// The window is explicit and every headline figure is compared against the
// equally-sized window before it, so a recurring report answers "versus last
// time" without the reader having to remember last time.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import {
  reconstructRange, attentionInRange, changesBetween, divisionPerformanceRange,
  divisionSeries, serviceStats, repeatOffenders, bandwidthDeficits, verdict,
  overallOf, fmtDuration, mttrByService, dailyChurn, facilityDayMatrix,
  worstPerformers, comparePeriods, rangeDays, fmtRange,
  SERVICES, SERVICE_LABEL,
  type FacState, type LogEntry, type RAG, type DateRange, type HealthPoint,
} from "./analytics";

type RGB = [number, number, number];

const INK:RGB=[24,24,27], INK2:RGB=[82,82,91], INK3:RGB=[138,134,127], INK4:RGB=[168,163,155];
const LINE:RGB=[231,228,222], SOFT:RGB=[240,237,232], PAPER:RGB=[251,250,248], WHITE:RGB=[255,255,255];
const OK:RGB=[14,124,90], WARN:RGB=[180,83,9], CRIT:RGB=[180,35,24], NONE:RGB=[168,163,155];
const OKBG:RGB=[234,244,239], WARNBG:RGB=[251,241,229], CRITBG:RGB=[251,237,236];

const statusRGB: Record<RAG,RGB> = { green:OK, amber:WARN, red:CRIT, na:NONE };
const statusBGRGB: Record<RAG,RGB> = { green:OKBG, amber:WARNBG, red:CRITBG, na:SOFT };
const statusText: Record<RAG,string> = { green:"Operational", amber:"Degraded", red:"Critical", na:"Not set" };

export interface ReportOptions {
  title: string;
  org: string;
  period: string;
  author: string;
  range: DateRange;
  divFilter: string;
  sections: { analysis:boolean; appendix:boolean };
  confidential: boolean;
}

const durLabel = (ms:number|null): string => {
  if (ms === null) return "—";
  const h = ms/36e5;
  if (h < 1)  return `${Math.round(ms/6e4)}m`;
  if (h < 48) return `${Math.round(h*10)/10}h`;
  return `${Math.round(h/24*10)/10}d`;
};

export async function buildReport(
  facilities: { name:string; cat:string }[],
  state: Record<string, FacState>,
  log: LogEntry[],
  o: ReportOptions,
): Promise<string> {
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const PW = doc.internal.pageSize.getWidth();   // 210
  const PH = doc.internal.pageSize.getHeight();  // 297
  const M  = 18;
  const CW = PW - M*2;

  const d = new Date();
  const genDate = d.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"});
  const genTime = d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
  const stamp = new Date(o.range.to).toISOString().slice(0,10);
  const fileName = `Imarat_IT_Operations_${stamp}.pdf`;

  // ── primitives ────────────────────────────────────────────────────────────
  const A=(a:number)=>{ try{(doc as any).setGState(new (doc as any).GState({opacity:a}));}catch{} };
  const fill=(c:RGB,a=1)=>{A(a);doc.setFillColor(...c);};
  const rect=(x:number,y:number,w:number,h:number,c:RGB,a=1)=>{fill(c,a);doc.rect(x,y,w,h,"F");A(1);};
  const rrect=(x:number,y:number,w:number,h:number,r:number,c:RGB,a=1)=>{fill(c,a);doc.roundedRect(x,y,w,h,r,r,"F");A(1);};
  const line=(x1:number,y1:number,x2:number,y2:number,c:RGB=LINE,w=0.25)=>{
    doc.setDrawColor(...c);doc.setLineWidth(w);doc.line(x1,y1,x2,y2);
  };
  type Font="serif"|"sans"|"mono";
  const fam:Record<Font,string>={serif:"times",sans:"helvetica",mono:"courier"};
  const txt=(s:string,x:number,y:number,opt:{size?:number;color?:RGB;font?:Font;weight?:"normal"|"bold"|"italic";align?:"left"|"center"|"right";}={})=>{
    const {size=9,color=INK,font="sans",weight="normal",align="left"}=opt;
    doc.setFont(fam[font],weight);doc.setFontSize(size);doc.setTextColor(...color);
    doc.text(s,x,y,{align});
  };
  const wrap=(s:string,w:number,size:number,font:Font="sans",weight:"normal"|"bold"|"italic"="normal")=>{
    doc.setFont(fam[font],weight);doc.setFontSize(size);
    return doc.splitTextToSize(s,w) as string[];
  };
  const clip=(s:string,w:number,size:number)=>{
    doc.setFont("helvetica","normal");doc.setFontSize(size);
    if(doc.getTextWidth(s)<=w) return s;
    let t=s;
    while(t.length>1 && doc.getTextWidth(t+"…")>w) t=t.slice(0,-1);
    return t+"…";
  };
  const eyebrow=(s:string,x:number,y:number,color:RGB=INK3,size=6.6)=>{
    doc.setFont("helvetica","bold");doc.setFontSize(size);doc.setTextColor(...color);
    doc.text(s.toUpperCase(),x,y,{charSpace:0.45});
  };
  const meter=(x:number,y:number,w:number,h:number,segs:{v:number;c:RGB}[])=>{
    rrect(x,y,w,h,h/2,SOFT);
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    let bx=x;
    for(const s of segs){ if(s.v<=0)continue; const bw=w*s.v/tot; fill(s.c,1); doc.rect(bx,y,bw,h,"F"); bx+=bw; }
    A(1);
  };
  const delta=(v:number|null,x:number,y:number,size=7.5,invert=false)=>{
    if(v===null||!Number.isFinite(v)){ txt("—",x,y,{size,font:"mono",color:INK4}); return; }
    const flat=Math.abs(v)<0.05, good=invert?v<0:v>0;
    const c=flat?INK3:good?OK:CRIT;
    txt(`${flat?"=":good?"+":"-"}${flat?"":Math.abs(v).toFixed(1)}`,x,y,{size,font:"mono",color:c});
  };

  // ── page chrome ───────────────────────────────────────────────────────────
  let page=0;
  const newPage=(title:string)=>{
    if(page>0) doc.addPage();
    page++;
    rect(0,0,PW,PH,PAPER);
    txt("IMARAT GROUP",M,13,{size:7.5,weight:"bold",color:INK});
    txt("IT Operations Report",M+30,13,{size:7.5,color:INK3});
    txt(title,PW-M,13,{size:7.5,color:INK3,align:"right"});
    line(M,16,PW-M,16);
    return 25;
  };
  const footer=()=>{
    const y=PH-12;
    line(M,y-5,PW-M,y-5);
    txt(`${o.org} · IT Department`,M,y,{size:6.8,color:INK4});
    txt(o.confidential ? "CONFIDENTIAL · SYSTEM GENERATED" : "SYSTEM GENERATED",
        PW/2,y,{size:6.8,color:INK4,align:"center"});
    txt(String(page),PW-M,y,{size:7.5,font:"mono",color:INK3,align:"right"});
  };

  // ── analysis ──────────────────────────────────────────────────────────────
  const R = o.range;
  const fac = facilities.filter(f=>o.divFilter==="all"||f.cat===o.divFilter);
  const hist   = reconstructRange(fac,state,log,R);
  const attn   = attentionInRange(fac,state,log,R);
  const change = changesBetween(log,R);
  const divs   = divisionPerformanceRange(fac,state,log,R);
  const divSer = divisionSeries(fac,state,log,R);
  const svcs   = serviceStats(fac,state,hist);
  const mttr   = mttrByService(log,R);
  const churn  = dailyChurn(log,R);
  const worst  = worstPerformers(fac,state,log,R,8);
  const cmp    = comparePeriods(fac,state,log,R);
  const bwDef  = bandwidthDeficits(fac,state);
  const flappy = repeatOffenders(log,rangeDays(R),6);
  const series = hist.points.map(p=>p.health);
  const health = series[series.length-1]??0;
  const trend  = hist.coverage>0&&series.length>1 ? (health-series[0])*100 : null;
  const v      = verdict(health,attn,change,trend);
  const hasHist= hist.coverage>0.02;
  const days   = rangeDays(R);

  const last = hist.points[hist.points.length-1];
  const counts = { green:last?.green??0, amber:last?.amber??0, red:last?.red??0, na:last?.na??0 };
  const total = fac.length||1;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — EXECUTIVE DASHBOARD
  //
  // Masthead, verdict, KPIs, composition and division ranking on one sheet. The
  // standalone cover was spending a whole page on a title; folding it into the
  // masthead buys room for two more charts at no cost in legibility.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    let y = newPage("Executive summary");

    // ── masthead ────────────────────────────────────────────────────────────
    txt("IT Operations Report",M,y+4,{size:21,font:"serif",color:INK});
    txt(fmtRange(R),M,y+11,{size:9,font:"mono",color:INK2});
    txt(`${days} day${days>1?"s":""}  ·  ${o.divFilter==="all"?"all divisions":o.divFilter}  ·  ${fac.length} facilities`,
        M,y+16,{size:7.5,color:INK4});

    // capacity gauge, right-aligned with the masthead
    const gx=PW-M-17, gy=y+8;
    drawGauge(gx,gy,16,11.2,health,statusRGB[v.tone]);
    txt(`${Math.round(health*100)}%`,gx,gy+1.6,{size:11,font:"mono",color:statusRGB[v.tone],align:"center"});
    txt("CAPACITY",gx,gy+5.6,{size:4.6,weight:"bold",color:INK4,align:"center"});
    if(cmp.deltaPts!==null&&hasHist){
      const dl = `${cmp.deltaPts>0?"+":cmp.deltaPts<0?"-":"="}${Math.abs(cmp.deltaPts)<0.05?"":Math.abs(cmp.deltaPts).toFixed(1)}`;
      txt(dl,gx,gy+22,{size:6.6,font:"mono",align:"center",
          color:Math.abs(cmp.deltaPts)<0.05?INK3:cmp.deltaPts>0?OK:CRIT});
      txt("vs prev",gx,gy+25.5,{size:5,color:INK4,align:"center"});
    }
    y+=26;

    // ── verdict ─────────────────────────────────────────────────────────────
    line(M,y,PW-M,y,INK,0.5); y+=8;
    for(const l of wrap(v.headline,CW-42,14,"serif")){ txt(l,M,y,{size:14,font:"serif",color:INK}); y+=6.4; }
    y+=1.5;
    for(const l of wrap(v.sub,CW-6,8,"sans").slice(0,2)){ txt(l,M,y,{size:8,color:INK2}); y+=4.4; }
    y+=5;

    // ── KPI band ────────────────────────────────────────────────────────────
    const kpis:{l:string;v:string;c:RGB}[]=[
      { l:"Capacity",    v:`${Math.round(health*100)}%`, c:statusRGB[v.tone] },
      { l:"Operational", v:`${counts.green}/${total}`,   c:OK },
      { l:"Degraded",    v:String(counts.amber),         c:counts.amber?WARN:INK3 },
      { l:"Critical",    v:String(counts.red),           c:counts.red?CRIT:INK3 },
      { l:"Recoveries",  v:String(change.recovered),     c:change.recovered?OK:INK3 },
      { l:"Regressions", v:String(change.degraded),      c:change.degraded?CRIT:INK3 },
    ];
    const kw=CW/kpis.length;
    line(M,y,PW-M,y);
    kpis.forEach((k,i)=>{
      const x=M+i*kw;
      if(i) line(x,y+3,x,y+18,LINE);
      txt(k.v,x+4,y+13,{size:14,font:"mono",color:k.c});
      eyebrow(k.l,x+4,y+17.5,INK4,5.4);
    });
    line(M,y+21,PW-M,y+21);
    y+=29;

    // ── two-column: composition | division ranking ──────────────────────────
    const colW=(CW-8)/2, cx2=M+colW+8;
    const colTop=y;

    eyebrow("Status composition",M,y);
    if(hasHist){
      drawStack(M,y+3,colW,46,hist.points,total);
      let lx=M, ly=y+53;
      for(const g of [{c:OK,l:"Op"},{c:WARN,l:"Deg"},{c:CRIT,l:"Crit"},{c:NONE,l:"N/S"}]){
        fill(g.c,1); doc.rect(lx,ly-2.2,2.2,2.2,"F"); A(1);
        txt(g.l,lx+3.2,ly,{size:6,color:INK3});
        doc.setFont("helvetica","normal");doc.setFontSize(6);
        lx+=3.2+doc.getTextWidth(g.l)+5;
      }
    } else {
      rect(M,y+3,colW,46,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(M,y+3,colW,46,"S");
      for(const l of wrap("No status changes recorded inside this window.",colW-10,7.5,"sans"))
        { txt(l,M+5,y+26,{size:7.5,color:INK4}); }
    }

    eyebrow("Division ranking",cx2,y);
    rect(cx2,y+3,colW,46,WHITE);
    doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(cx2,y+3,colW,46,"S");
    drawRankedBars(cx2+4,y+8,colW-8,divs.map(dv=>({
      label: dv.cat,
      value: dv.health*100,
      sub: `${dv.green}/${dv.total}`,
      c: dv.health>=0.8?OK:dv.health>=0.5?WARN:CRIT,
      delta: hasHist ? dv.delta : null,
    })),9.4);
    y=colTop+58;

    // ── versus previous period ──────────────────────────────────────────────
    eyebrow(`Versus the previous ${days} day${days>1?"s":""}`,M,y); y+=5;
    const comps=[
      { l:"Capacity",    now:`${Math.round(cmp.currentHealth*100)}%`, was:`${Math.round(cmp.previousHealth*100)}%`,
        d:cmp.deltaPts, inv:false },
      { l:"Recoveries",  now:String(cmp.currentChanges.recovered), was:String(cmp.previousChanges.recovered),
        d:cmp.currentChanges.recovered-cmp.previousChanges.recovered, inv:false },
      { l:"Regressions", now:String(cmp.currentChanges.degraded),  was:String(cmp.previousChanges.degraded),
        d:cmp.currentChanges.degraded-cmp.previousChanges.degraded, inv:true },
      { l:"Sites needing attention", now:String(attn.length), was:"—", d:null, inv:true },
    ];
    const cwid=(CW-9)/4;
    comps.forEach((c,i)=>{
      const x=M+i*(cwid+3);
      rect(x,y,cwid,17,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(x,y,cwid,17,"S");
      eyebrow(c.l,x+4,y+5,INK3,5.2);
      txt(c.now,x+4,y+13,{size:12,font:"mono",color:INK});
      doc.setFont("courier","normal");doc.setFontSize(12);
      if(c.d!==null) delta(c.d,x+6+doc.getTextWidth(c.now),y+13,6.4,c.inv);
      if(c.was!=="—") txt(`was ${c.was}`,x+cwid-4,y+13,{size:5.8,color:INK4,align:"right"});
    });
    y+=25;

    // ── system generated notice ─────────────────────────────────────────────
    const ny=PH-30;
    rect(M,ny,CW,13,SOFT);
    rect(M,ny,1.1,13,INK3);
    txt("THIS REPORT IS SYSTEM GENERATED",M+5,ny+5.5,{size:6.6,weight:"bold",color:INK2});
    txt(`Produced automatically from the IT Operations activity log on ${genDate} at ${genTime}. No manual figures.`,
        M+5,ny+10,{size:6.2,color:INK3});
    footer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — ANALYSIS (service reliability, volume, exceptions)
  // ═══════════════════════════════════════════════════════════════════════════
  if(o.sections.analysis){
    let y=newPage("Analysis");

    // ── service reliability: gauge + MTTR per service ───────────────────────
    eyebrow("Service reliability and recovery",M,y); y+=5;
    const sw=(CW-10)/3;
    svcs.forEach((s,i)=>{
      const x=M+i*(sw+5);
      const c:RGB = s.availability>=0.8?OK:s.availability>=0.5?WARN:CRIT;
      const m = mttr.find(z=>z.service===s.service);
      rect(x,y,sw,40,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(x,y,sw,40,"S");
      txt(SERVICE_LABEL[s.service],x+4,y+6,{size:8.5,weight:"bold",color:INK});
      if(s.delta!==null&&hasHist) delta(s.delta,x+sw-12,y+6,6.4);
      drawHalfGauge(x+22,y+22,12,8.4,s.availability,c);
      txt(`${Math.round(s.availability*100)}%`,x+22,y+21,{size:11,font:"mono",color:c,align:"center"});
      txt(`${s.ok}/${s.total}`,x+22,y+25.5,{size:5.6,color:INK4,align:"center"});
      // right half: breakdown + recovery
      const rx=x+40;
      txt("MEAN RECOVERY",rx,y+13,{size:4.8,weight:"bold",color:INK4});
      txt(durLabel(m?.meanMs ?? null),rx,y+20,{size:11,font:"mono",color:INK});
      txt(m?.count ? `${m.count} resolved` : "none resolved",rx,y+24.5,{size:5.6,color:INK4});
      meter(x+4,y+31,sw-8,2.2,[{v:s.ok,c:OK},{v:s.degraded,c:WARN},{v:s.down,c:CRIT}]);
      txt(`${s.degraded} degraded · ${s.down} down`,x+4,y+37,{size:5.8,color:INK3});
    });
    y+=48;

    // ── two-column: churn volume | instability ──────────────────────────────
    const colW=(CW-8)/2, cx2=M+colW+8, colTop=y;
    eyebrow("Fault and recovery volume",M,y);
    if(churn.some(c=>c.recovered||c.regressed)){
      drawChurn(M,y+3,colW,40,churn);
      fill(OK,1); doc.rect(M,y+48,2.2,2.2,"F"); A(1);
      txt(`Recovered ${change.recovered}`,M+3.4,y+50.2,{size:6,color:INK3});
      fill(CRIT,1); doc.rect(M+34,y+48,2.2,2.2,"F"); A(1);
      txt(`Regressed ${change.degraded}`,M+37.4,y+50.2,{size:6,color:INK3});
    } else {
      rect(M,y+3,colW,40,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(M,y+3,colW,40,"S");
      txt("No status changes inside this window.",M+5,y+24,{size:7,color:INK4});
    }

    eyebrow("Instability · most frequent changes",cx2,y);
    rect(cx2,y+3,colW,40,WHITE);
    doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(cx2,y+3,colW,40,"S");
    if(flappy.length){
      const maxF=Math.max(...flappy.map(f=>f.flips),1);
      flappy.slice(0,5).forEach((f,i)=>{
        const ry=y+9+i*7;
        txt(clip(f.facility,40,7),cx2+4,ry,{size:7,color:INK});
        const bw=(colW-58)*(f.flips/maxF);
        rect(cx2+46,ry-2.6,Math.max(bw,0.6),3,WARN);
        txt(String(f.flips),cx2+colW-4,ry,{size:7,font:"mono",color:WARN,align:"right"});
      });
    } else {
      txt("No repeated state changes in this window.",cx2+5,y+24,{size:7,color:INK4});
    }
    y=colTop+52;

    // ── exceptions ──────────────────────────────────────────────────────────
    eyebrow("Exceptions · ranked by severity, duration and instability",M,y); y+=5;
    if(!attn.length){
      rect(M,y,CW,15,OKBG);
      txt("No exceptions. Every facility reported all services operational at the end of the window.",
          M+5,y+9,{size:8,color:OK});
      y+=23;
    } else {
      const c0=M+1, c1=M+62, c2=M+100, c3=M+124, c4=M+144;
      eyebrow("Facility",c0,y,INK3,5.4); eyebrow("Fault",c1,y,INK3,5.4);
      eyebrow("Since",c2,y,INK3,5.4);    eyebrow("Flips",c3,y,INK3,5.4);
      eyebrow("Status",c4,y,INK3,5.4);
      y+=2; line(M,y,PW-M,y,INK3,0.4); y+=4.5;
      const rows=attn.slice(0,10);
      rows.forEach((it,i)=>{
        if(i%2===1) rect(M,y-3.2,CW,7.4,WHITE);
        txt(clip(it.facility,58,7.4),c0,y,{size:7.4,color:INK});
        txt(it.cat,c0,y+2.9,{size:5.6,color:INK4});
        fill(statusRGB[it.status],1); doc.circle(c1+0.9,y-1,0.9,"F"); A(1);
        txt(clip(it.reason,32,6.8),c1+3,y,{size:6.8,color:INK2});
        txt(it.since?fmtDuration(Date.now()-it.since):"—",c2,y,{size:6.8,font:"mono",color:INK2});
        txt(it.flips?String(it.flips):"—",c3,y,{size:6.8,font:"mono",color:it.flips>=3?WARN:INK3});
        rrect(c4,y-2.7,18,4.2,1,statusBGRGB[it.status]);
        txt(statusText[it.status],c4+9,y+0.2,{size:5.4,color:statusRGB[it.status],align:"center",weight:"bold"});
        y+=7.4;
      });
      line(M,y-2.8,PW-M,y-2.8);
      if(attn.length>rows.length){ y+=1.5; txt(`+ ${attn.length-rows.length} further exceptions.`,M,y,{size:6.4,color:INK4}); }
      y+=7;
    }

    // ── two-column: least reliable | capacity risk ──────────────────────────
    const bTop=y;
    eyebrow("Least reliable sites",M,y);
    if(worst.length){
      worst.slice(0,5).forEach((w,i)=>{
        const ry=y+7+i*7.4;
        txt(clip(w.facility,44,7),M+1,ry,{size:7,color:INK});
        meter(M+50,ry-2.4,colW-72,2.4,[{v:w.critShare,c:CRIT},{v:w.badShare-w.critShare,c:WARN},
                                       {v:Math.max(1-w.badShare,0),c:SOFT}]);
        txt(`${Math.round(w.badShare*100)}%`,M+colW-4,ry,
            {size:7,font:"mono",color:w.critShare>0?CRIT:WARN,align:"right"});
      });
    } else txt("Every site fully operational across the window.",M+1,y+9,{size:7,color:INK4});

    eyebrow("Capacity risk · below stated requirement",cx2,y);
    if(bwDef.length){
      bwDef.slice(0,5).forEach((b,i)=>{
        const ry=y+7+i*7.4;
        txt(clip(b.facility,40,7),cx2+1,ry,{size:7,color:INK});
        txt(`${b.current}/${b.required}`,cx2+46,ry,{size:6,font:"mono",color:INK3});
        meter(cx2+66,ry-2.4,colW-92,2.4,[{v:b.ratio,c:b.ratio<0.6?CRIT:WARN},{v:Math.max(1-b.ratio,0),c:SOFT}]);
        txt(`${Math.round(b.ratio*100)}%`,cx2+colW-4,ry,
            {size:7,font:"mono",color:b.ratio<0.6?CRIT:WARN,align:"right"});
      });
    } else txt("No site is below its stated bandwidth requirement.",cx2+1,y+9,{size:7,color:INK4});
    y=bTop+50;

    footer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — AVAILABILITY GRID & REGISTER
  // ═══════════════════════════════════════════════════════════════════════════
  if(o.sections.appendix){
    let y=newPage("Availability");
    eyebrow("Day-by-day availability",M,y); y+=4;
    txt("One column per day, one row per site. Sites never impaired are summarised beneath the grid.",
        M,y+2,{size:6.8,color:INK3});
    y+=8;

    const matrix = facilityDayMatrix(fac,state,log,R,Math.min(days,21));
    const rank = (n:string) => matrix.days.reduce((s,dd)=>{
      const st=dd.status[n]; return s + (st==="red"?3:st==="amber"?2:st==="na"?1:0);
    },0);
    const problem = matrix.facilities.filter(n=>rank(n)>0).sort((a,b)=>rank(b)-rank(a));

    if(problem.length===0 || matrix.days.length===0){
      rect(M,y,CW,16,OKBG);
      txt("Every facility remained fully operational for the whole window.",M+5,y+10,{size:8,color:OK});
      y+=24;
    } else {
      const labelW=50, cols=matrix.days.length;
      const cell=Math.min(4.4,(CW-labelW)/cols-0.6), gapc=0.6;
      const every=Math.ceil(cols/8);
      matrix.days.forEach((dd,i)=>{
        if(i%every) return;
        txt(new Date(dd.t).toLocaleDateString("en-GB",{day:"2-digit"}),
            M+labelW+i*(cell+gapc)+cell/2,y,{size:5,font:"mono",color:INK4,align:"center"});
      });
      y+=2;
      const rows=problem.slice(0,22);
      rows.forEach((n,ri)=>{
        const ry=y+ri*(cell+1);
        txt(clip(n,labelW-3,6),M,ry+cell-1,{size:6,color:INK2});
        matrix.days.forEach((dd,ci)=>{
          const st=dd.status[n] ?? "na";
          const x=M+labelW+ci*(cell+gapc);
          if(st==="green"){
            rect(x,ry,cell,cell,OKBG);
            doc.setDrawColor(...LINE);doc.setLineWidth(0.1);doc.rect(x,ry,cell,cell,"S");
          } else rect(x,ry,cell,cell,statusRGB[st]);
        });
      });
      y+=rows.length*(cell+1)+3;
      const clean=matrix.facilities.length-problem.length;
      if(clean>0) txt(`${clean} further facilit${clean===1?"y":"ies"} remained fully operational throughout.`,
                      M,y,{size:6.4,color:INK4});
      y+=5;
      let lx=M;
      for(const g of [{c:OKBG,l:"Operational"},{c:WARN,l:"Degraded"},{c:CRIT,l:"Critical"},{c:NONE,l:"Not set"}]){
        rect(lx,y-2.2,2.2,2.2,g.c);
        txt(g.l,lx+3.2,y,{size:6,color:INK3});
        doc.setFont("helvetica","normal");doc.setFontSize(6);
        lx+=3.2+doc.getTextWidth(g.l)+6;
      }
      y+=8;
    }

    // register, two columns to halve its height
    eyebrow("Facility register",M,y); y+=4;
    txt(`Current service state for all ${fac.length} facilities in scope.`,M,y+2,{size:6.8,color:INK3});
    y+=7;

    const ordered=[...fac].sort((a,b)=>{
      const r={red:0,amber:1,na:2,green:3} as Record<RAG,number>;
      const sa=state[a.name], sb=state[b.name];
      return (sa?r[overallOf(sa)]:4)-(sb?r[overallOf(sb)]:4) || a.name.localeCompare(b.name);
    });
    const half=Math.ceil(ordered.length/2), regW=(CW-8)/2;
    const regHeader=(x:number,yy:number)=>{
      eyebrow("Facility",x+1,yy,INK3,5.2);
      eyebrow("Int",x+regW-30,yy,INK3,5.2);
      eyebrow("Bio",x+regW-20,yy,INK3,5.2);
      eyebrow("Prn",x+regW-10,yy,INK3,5.2);
      line(x,yy+1.6,x+regW,yy+1.6,INK3,0.35);
    };
    regHeader(M,y); regHeader(M+regW+8,y);
    const rowY=y+5.5;
    ordered.forEach((f,i)=>{
      const col=i<half?0:1, idx=i<half?i:i-half;
      const x=M+col*(regW+8), ry=rowY+idx*6.2;
      if(ry>PH-20) return;
      const s=state[f.name]; if(!s) return;
      if(idx%2===1) rect(x,ry-3,regW,6.2,WHITE);
      txt(clip(f.name,regW-36,6.6),x+1,ry,{size:6.6,color:INK});
      SERVICES.forEach((sv,k)=>{
        const cxp=x+regW-30+k*10, st=s[sv];
        fill(statusRGB[st],1); doc.circle(cxp+1.4,ry-1.1,1.15,"F"); A(1);
      });
    });
    footer();
  }
  // provenance
  txt(`System generated ${genDate} at ${genTime} · window ${fmtRange(R)} · ${log.length} logged events${hasHist?"":" · no recorded history in window"}`,
      M,PH-20,{size:6.4,color:INK4});

  doc.save(fileName);
  return fileName;

  // ── charts ────────────────────────────────────────────────────────────────


  /** Polygon-approximated arc segment, used for gauges. */
  function arcSeg(cx:number,cy:number,ro:number,ri:number,a1:number,a2:number,c:RGB){
    const steps=Math.max(6,Math.ceil(Math.abs(a2-a1)/4));
    const pts:[number,number][]=[];
    for(let i=0;i<=steps;i++){const a=(a1+i*(a2-a1)/steps)*Math.PI/180;pts.push([cx+ro*Math.cos(a),cy+ro*Math.sin(a)]);}
    for(let i=steps;i>=0;i--){const a=(a1+i*(a2-a1)/steps)*Math.PI/180;pts.push([cx+ri*Math.cos(a),cy+ri*Math.sin(a)]);}
    const rel:[number,number][]=[];
    for(let i=1;i<pts.length;i++) rel.push([pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]]);
    fill(c,1);
    (doc as any).lines(rel,pts[0][0],pts[0][1],[1,1],"F",true);
    A(1);
  }

  /** Ring gauge. Track plus a filled sweep proportional to `pct`. */
  function drawGauge(cx:number,cy:number,ro:number,ri:number,pct:number,c:RGB){
    arcSeg(cx,cy,ro,ri,-90,270,SOFT);
    if(pct>0.001) arcSeg(cx,cy,ro,ri,-90,-90+360*Math.min(pct,1),c);
  }

  /** Half-ring gauge — compact, used for the three service tiles. */
  function drawHalfGauge(cx:number,cy:number,ro:number,ri:number,pct:number,c:RGB){
    arcSeg(cx,cy,ro,ri,180,360,SOFT);
    if(pct>0.001) arcSeg(cx,cy,ro,ri,180,180+180*Math.min(pct,1),c);
  }

  /**
   * Ranked horizontal bars. Proper bars with a shared scale beat the meter
   * strips for comparison, because the eye compares lengths from a common
   * baseline rather than segment widths at different offsets.
   */
  function drawRankedBars(x:number,y:number,w:number,rows:{label:string;value:number;sub?:string;c:RGB;delta?:number|null}[],rowH=13){
    const labelW = 34, valueW = 26;
    const barW = w - labelW - valueW;
    // gridlines at 0 / 50 / 100
    for(let g=0;g<=2;g++){
      const gx = x+labelW+(barW*g)/2;
      line(gx,y-2,gx,y+rows.length*rowH-2,g===0?LINE:SOFT,0.2);
      txt(`${g*50}`,gx,y+rows.length*rowH+2.5,{size:5.4,font:"mono",color:INK4,align:"center"});
    }
    rows.forEach((r,i)=>{
      const ry=y+i*rowH;
      txt(clip(r.label,labelW-15,7.6),x,ry+3.6,{size:7.6,color:INK});
      if(r.sub) txt(r.sub,x+labelW-4,ry+3.6,{size:5.6,font:"mono",color:INK4,align:"right"});
      const bw=Math.max(barW*(Math.min(r.value,100)/100),0.6);
      rect(x+labelW,ry,bw,5.2,r.c);
      txt(`${Math.round(r.value)}%`,x+labelW+barW+valueW-2,ry+4,{size:8.5,font:"mono",color:r.c,align:"right"});
      if(r.delta!==null&&r.delta!==undefined) delta(r.delta,x+labelW+barW+2,ry+4,6.4);
    });
  }

  /** Stacked status composition across the window. */
  function drawStack(x:number,y:number,w:number,h:number,pts:HealthPoint[],tot:number){
    rect(x,y,w,h,WHITE);
    const padL=11, padB=7, padT=3;
    const iw=w-padL-2, ih=h-padB-padT;
    const px=(i:number)=>x+padL+(i/Math.max(pts.length-1,1))*iw;
    const py=(val:number)=>y+padT+ih-(val/tot)*ih;

    for(let g=0;g<=2;g++){
      const val=(tot*g)/2, gy=py(val);
      line(x+padL,gy,x+w-2,gy,g===0?LINE:SOFT,0.2);
      txt(String(Math.round(val)),x+padL-2,gy+1.4,{size:5.6,font:"mono",color:INK4,align:"right"});
    }

    let base=pts.map(()=>0);
    for(const b of [{k:"green",c:OK},{k:"na",c:NONE},{k:"amber",c:WARN},{k:"red",c:CRIT}] as const){
      const top=pts.map((p,i)=>base[i]+(p as any)[b.k]);
      if(top.every((t,i)=>t===base[i])){ base=top; continue; }
      const poly:[number,number][]=[];
      pts.forEach((_,i)=>poly.push([px(i),py(top[i])]));
      for(let i=pts.length-1;i>=0;i--) poly.push([px(i),py(base[i])]);
      const rel:[number,number][]=[];
      for(let i=1;i<poly.length;i++) rel.push([poly[i][0]-poly[i-1][0],poly[i][1]-poly[i-1][1]]);
      fill(b.c,1);
      (doc as any).lines(rel,poly[0][0],poly[0][1],[1,1],"F",true);
      A(1);
      base=top;
    }
    const assumed=Math.max(0,1-Math.min(hist.coverage,1))*iw;
    if(assumed>1) rect(x+padL,y+padT,assumed,ih,PAPER,0.72);
    doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(x+padL,y+padT,iw,ih,"S");
    txt(new Date(R.from).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),
        x+padL,y+h-1.5,{size:5.8,font:"mono",color:INK4});
    txt(new Date(R.to).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),
        x+w-2,y+h-1.5,{size:5.8,font:"mono",color:INK4,align:"right"});
  }

  /** Diverging daily churn: recoveries up, regressions down. */
  function drawChurn(x:number,y:number,w:number,h:number,data:{recovered:number;regressed:number;label:string}[]){
    rect(x,y,w,h,WHITE);
    const padL=10, padB=6, padT=3;
    const iw=w-padL-2, ih=h-padB-padT, mid=y+padT+ih/2;
    const max=Math.max(...data.flatMap(dd=>[dd.recovered,dd.regressed]),1);
    const gap=data.length>18?0.4:1;
    const bw=Math.max((iw-gap*(data.length-1))/data.length,0.8);
    const sc=(val:number)=>(val/max)*(ih/2-1);

    txt(String(max),x+padL-2,y+padT+3,{size:5.4,font:"mono",color:OK,align:"right"});
    txt(String(max),x+padL-2,y+padT+ih,{size:5.4,font:"mono",color:CRIT,align:"right"});
    line(x+padL,mid,x+w-2,mid,INK4,0.3);

    const every=Math.ceil(data.length/7);
    data.forEach((dd,i)=>{
      const bx=x+padL+i*(bw+gap);
      if(dd.recovered>0) rect(bx,mid-sc(dd.recovered)-0.4,bw,sc(dd.recovered),OK);
      if(dd.regressed>0) rect(bx,mid+0.4,bw,sc(dd.regressed),CRIT);
      if(i%every===0) txt(dd.label.split(" ")[0],bx+bw/2,y+h-1.5,{size:5.2,font:"mono",color:INK4,align:"center"});
    });
    doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(x,y,w,h,"S");
  }

  function drawSpark(x:number,y:number,w:number,h:number,data:number[],c:RGB){
    if(data.length<2) return;
    const lo=Math.min(...data), hi=Math.max(...data), span=(hi-lo)||1;
    const px=(i:number)=>x+(i/(data.length-1))*w;
    const py=(val:number)=>y+(1-(val-lo)/span)*h;
    doc.setDrawColor(...c); doc.setLineWidth(0.45);
    for(let i=1;i<data.length;i++) doc.line(px(i-1),py(data[i-1]),px(i),py(data[i]));
    fill(c,1); doc.circle(px(data.length-1),py(data[data.length-1]),0.7,"F"); A(1);
  }
}
