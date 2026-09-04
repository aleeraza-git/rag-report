// ─────────────────────────────────────────────────────────────────────────────
// Estate Reliability Report — multi-page executive document.
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
  sections: { summary:boolean; performance:boolean; exceptions:boolean; appendix:boolean };
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
  const fileName = `Imarat_Estate_Reliability_${stamp}.pdf`;

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
    txt("Estate Reliability Report",M+30,13,{size:7.5,color:INK3});
    txt(title,PW-M,13,{size:7.5,color:INK3,align:"right"});
    line(M,16,PW-M,16);
    return 25;
  };
  const footer=()=>{
    const y=PH-12;
    line(M,y-5,PW-M,y-5);
    txt(`${o.org} · IT Department`,M,y,{size:6.8,color:INK4});
    if(o.confidential) txt("CONFIDENTIAL",PW/2,y,{size:6.8,color:INK4,align:"center"});
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
  // PAGE 1 — EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    let y = newPage("Executive summary");
    eyebrow("Executive summary",M,y); y+=6;
    txt(`${fmtRange(R)}  ·  ${days} day${days>1?"s":""}`,M,y,{size:8,font:"mono",color:INK3}); y+=11;

    for(const l of wrap(v.headline,CW,18,"serif")){ txt(l,M,y,{size:18,font:"serif",color:INK}); y+=8; }
    y+=2.5;
    for(const l of wrap(v.sub,CW-4,9,"sans")){ txt(l,M,y,{size:9,color:INK2}); y+=4.9; }
    y+=7;

    // KPI band
    const kpis:{l:string;v:string;d:number|null;c:RGB}[]=[
      { l:"Capacity",    v:`${Math.round(health*100)}%`, d:cmp.deltaPts, c:statusRGB[v.tone] },
      { l:"Operational", v:`${counts.green}/${total}`,   d:null,         c:OK },
      { l:"Critical",    v:String(counts.red),           d:null,         c:counts.red?CRIT:INK3 },
      { l:"Degraded",    v:String(counts.amber),         d:null,         c:counts.amber?WARN:INK3 },
    ];
    const kw=CW/4;
    rect(M,y,CW,23,WHITE); line(M,y,PW-M,y); line(M,y+23,PW-M,y+23);
    kpis.forEach((k,i)=>{
      const x=M+i*kw;
      if(i) line(x,y+4,x,y+19,LINE);
      eyebrow(k.l,x+6,y+8);
      txt(k.v,x+6,y+18,{size:16,font:"mono",color:k.c});
      if(k.d!==null&&hasHist){
        doc.setFont("courier","normal");doc.setFontSize(16);
        delta(k.d,x+8+doc.getTextWidth(k.v),y+18);
      }
    });
    y+=32;

    // status composition
    eyebrow("Status composition across the period",M,y); y+=5;
    if(hasHist){
      drawStack(M,y,CW,50,hist.points,total);
      y+=54;
      let lx=M;
      for(const g of [{c:OK,l:"Operational",n:counts.green},{c:WARN,l:"Degraded",n:counts.amber},
                      {c:CRIT,l:"Critical",n:counts.red},{c:NONE,l:"Not set",n:counts.na}]){
        fill(g.c,1); doc.rect(lx,y-2.4,2.4,2.4,"F"); A(1);
        txt(g.l,lx+3.6,y,{size:7,color:INK3});
        doc.setFont("helvetica","normal");doc.setFontSize(7);
        lx += 3.6 + doc.getTextWidth(g.l) + 2.5;
        txt(String(g.n),lx,y,{size:7,font:"mono",color:INK2});
        doc.setFont("courier","normal");doc.setFontSize(7);
        lx += doc.getTextWidth(String(g.n)) + 8;
      }
      y+=9;
    } else {
      rect(M,y,CW,22,WHITE); line(M,y,PW-M,y); line(M,y+22,PW-M,y+22);
      txt("No status changes recorded inside this window.",M+6,y+13,{size:8.5,color:INK4});
      y+=30;
    }

    // versus previous period — pinned to the foot of the page
    y = PH - 62;
    eyebrow(`Versus the previous ${days} day${days>1?"s":""}`,M,y); y+=6;
    const comps=[
      { l:"Capacity",   now:`${Math.round(cmp.currentHealth*100)}%`, was:`${Math.round(cmp.previousHealth*100)}%`,
        d:cmp.deltaPts, inv:false },
      { l:"Recoveries", now:String(cmp.currentChanges.recovered), was:String(cmp.previousChanges.recovered),
        d:cmp.currentChanges.recovered-cmp.previousChanges.recovered, inv:false },
      { l:"Regressions",now:String(cmp.currentChanges.degraded),  was:String(cmp.previousChanges.degraded),
        d:cmp.currentChanges.degraded-cmp.previousChanges.degraded, inv:true },
    ];
    const cwid=(CW-8)/3;
    comps.forEach((c,i)=>{
      const x=M+i*(cwid+4);
      rect(x,y,cwid,20,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(x,y,cwid,20,"S");
      eyebrow(c.l,x+5,y+6,INK3,6);
      txt(c.now,x+5,y+14,{size:13,font:"mono",color:INK});
      doc.setFont("courier","normal");doc.setFontSize(13);
      delta(c.d,x+7+doc.getTextWidth(c.now),y+14,7,c.inv);
      txt(`was ${c.was}`,x+cwid-5,y+14,{size:6.5,color:INK4,align:"right"});
    });
    footer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  if(o.sections.performance){
    let y=newPage("Performance");
    eyebrow("Performance",M,y); y+=7;

    txt("Division comparison",M,y,{size:13,font:"serif",color:INK}); y+=4;
    txt("Ranked weakest first. Delta compares the end of the window against its start.",M,y+2.5,{size:7.5,color:INK3});
    y+=10;

    const dw=(CW-6)/2;
    divs.forEach((dv,i)=>{
      const col=i%2, row=Math.floor(i/2);
      const x=M+col*(dw+6), ry=y+row*26;
      const c:RGB = dv.health>=0.8?OK:dv.health>=0.5?WARN:CRIT;
      txt(dv.cat,x,ry+3.5,{size:9.5,weight:"bold",color:INK});
      txt(`${Math.round(dv.health*100)}%`,x+dw-16,ry+3.5,{size:11,font:"mono",color:c,align:"right"});
      if(dv.delta!==null&&hasHist) delta(dv.delta,x+dw-14,ry+3.5,7);
      const ser=divSer.find(s=>s.cat===dv.cat);
      if(hasHist&&ser&&ser.series.length>1) drawSpark(x,ry+5.5,dw,9,ser.series,c);
      meter(x,ry+16.5,dw,2.2,[{v:dv.green,c:OK},{v:dv.amber,c:WARN},{v:dv.red,c:CRIT},{v:dv.na,c:NONE}]);
      txt(`${dv.green} of ${dv.total} operational`,x,ry+22.5,{size:6.8,color:INK4});
    });
    y+=Math.ceil(divs.length/2)*26+8;

    txt("Service reliability and recovery",M,y,{size:13,font:"serif",color:INK}); y+=4;
    txt(`Availability across ${total} sites. Recovery time is measured from each fault to its fix, for outages resolved inside the window.`,
        M,y+2.5,{size:7.5,color:INK3});
    y+=10;

    const sw=(CW-12)/3;
    svcs.forEach((s,i)=>{
      const x=M+i*(sw+6);
      const c:RGB = s.availability>=0.8?OK:s.availability>=0.5?WARN:CRIT;
      const m = mttr.find(z=>z.service===s.service);
      rect(x,y,sw,46,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(x,y,sw,46,"S");
      txt(SERVICE_LABEL[s.service],x+5,y+7,{size:9,weight:"bold",color:INK});
      if(s.delta!==null&&hasHist) delta(s.delta,x+sw-13,y+7,7);
      txt(`${Math.round(s.availability*100)}%`,x+5,y+17,{size:15,font:"mono",color:c});
      if(hasHist&&s.series.length>1) drawSpark(x+5,y+19.5,sw-10,8,s.series,c);
      line(x+5,y+31,x+sw-5,y+31,SOFT);
      eyebrow("Mean recovery",x+5,y+35.5,INK3,5.8);
      txt(durLabel(m?.meanMs ?? null),x+5,y+42,{size:10,font:"mono",color:INK});
      txt(m?.count ? `${m.count} outage${m.count>1?"s":""}` : "none resolved",
          x+sw-5,y+42,{size:6.5,color:INK4,align:"right"});
    });
    y+=54;

    txt("Fault and recovery volume",M,y,{size:13,font:"serif",color:INK}); y+=4;
    txt("Recoveries above the line, regressions below. A period fixing faster than it breaks sits mostly above.",
        M,y+2.5,{size:7.5,color:INK3});
    y+=9;
    if(churn.some(c=>c.recovered||c.regressed)){
      drawChurn(M,y,CW,40,churn);
      y+=46;
      fill(OK,1); doc.rect(M,y-2.4,2.4,2.4,"F"); A(1);
      txt(`Recovered ${change.recovered}`,M+3.6,y,{size:7,color:INK3});
      fill(CRIT,1); doc.rect(M+40,y-2.4,2.4,2.4,"F"); A(1);
      txt(`Regressed ${change.degraded}`,M+43.6,y,{size:7,color:INK3});
      y+=8;
    } else {
      rect(M,y,CW,18,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(M,y,CW,18,"S");
      txt("No status changes recorded inside this window.",M+6,y+11,{size:8,color:INK4});
      y+=24;
    }

    if(flappy.length && y < PH-44){
      txt("Instability",M,y,{size:13,font:"serif",color:INK}); y+=4;
      txt("Sites that changed state most often. Repeated flapping usually indicates an unresolved root cause.",
          M,y+2.5,{size:7.5,color:INK3}); y+=9;
      flappy.slice(0,3).forEach((f,i)=>{
        const ry=y+i*8;
        txt(clip(f.facility,120,8.5),M+1,ry,{size:8.5,color:INK});
        txt(`${f.flips} changes`,PW-M-1,ry,{size:8,font:"mono",color:WARN,align:"right"});
        line(M,ry+2.5,PW-M,ry+2.5,SOFT);
      });
    }
    footer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — EXCEPTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  if(o.sections.exceptions){
    let y=newPage("Exceptions");
    eyebrow("Exceptions",M,y); y+=7;
    txt("What needs attention",M,y,{size:13,font:"serif",color:INK}); y+=4;
    txt("Ranked by severity, then how long the fault has persisted, then instability.",M,y+2.5,{size:7.5,color:INK3});
    y+=10;

    if(!attn.length){
      rect(M,y,CW,22,OKBG);
      txt("No exceptions. Every monitored facility reported all services operational at the end of the window.",
          M+6,y+13,{size:8.5,color:OK});
      y+=30;
    } else {
      const c0=M+1, c1=M+66, c2=M+104, c3=M+128, c4=M+148;
      eyebrow("Facility",c0,y,INK3,6); eyebrow("Fault",c1,y,INK3,6);
      eyebrow("Since",c2,y,INK3,6);   eyebrow("Flips",c3,y,INK3,6);
      eyebrow("Status",c4,y,INK3,6);
      y+=2.5; line(M,y,PW-M,y,INK3,0.4); y+=5;

      attn.slice(0,14).forEach((it,i)=>{
        if(i%2===1) rect(M,y-3.6,CW,8.4,WHITE);
        txt(clip(it.facility,62,8),c0,y,{size:8,color:INK});
        txt(it.cat,c0,y+3.3,{size:6.2,color:INK4});
        fill(statusRGB[it.status],1); doc.circle(c1+1,y-1,1,"F"); A(1);
        txt(clip(it.reason,32,7.4),c1+3.4,y,{size:7.4,color:INK2});
        txt(it.since?fmtDuration(Date.now()-it.since):"—",c2,y,{size:7.4,font:"mono",color:INK2});
        txt(it.flips?String(it.flips):"—",c3,y,{size:7.4,font:"mono",color:it.flips>=3?WARN:INK3});
        rrect(c4,y-3,20,4.6,1,statusBGRGB[it.status]);
        txt(statusText[it.status],c4+10,y+0.2,{size:5.8,color:statusRGB[it.status],align:"center",weight:"bold"});
        y+=8.4;
      });
      line(M,y-3,PW-M,y-3);
      if(attn.length>14){ y+=2; txt(`+ ${attn.length-14} further exceptions.`,M,y,{size:7,color:INK4}); }
      y+=9;
    }

    if(worst.length && y < PH-68){
      txt("Least reliable sites across the window",M,y,{size:13,font:"serif",color:INK}); y+=4;
      txt(`Share of the ${days}-day window each site spent below fully operational.`,M,y+2.5,{size:7.5,color:INK3});
      y+=9;
      const shown=worst.slice(0,6);
      shown.forEach((w,i)=>{
        const ry=y+i*8.4;
        txt(clip(w.facility,74,8),M+1,ry,{size:8,color:INK});
        meter(M+80,ry-2.2,66,2.4,[{v:w.critShare,c:CRIT},{v:w.badShare-w.critShare,c:WARN},
                                  {v:Math.max(1-w.badShare,0),c:SOFT}]);
        txt(`${Math.round(w.badShare*100)}%`,PW-M-1,ry,
            {size:8,font:"mono",color:w.critShare>0?CRIT:WARN,align:"right"});
        line(M,ry+2.6,PW-M,ry+2.6,SOFT);
      });
      y+=shown.length*8.4+8;
    }

    if(bwDef.length && y < PH-48){
      txt("Capacity risk",M,y,{size:13,font:"serif",color:INK}); y+=4;
      txt("Sites currently operating below their stated bandwidth requirement.",M,y+2.5,{size:7.5,color:INK3});
      y+=9;
      bwDef.slice(0,5).forEach((b,i)=>{
        const ry=y+i*8.4;
        txt(clip(b.facility,64,8),M+1,ry,{size:8,color:INK});
        txt(`${b.current} / ${b.required} Mbps`,M+70,ry,{size:7,font:"mono",color:INK3});
        meter(M+108,ry-2.2,38,2.4,[{v:b.ratio,c:b.ratio<0.6?CRIT:WARN},{v:Math.max(1-b.ratio,0),c:SOFT}]);
        txt(`${Math.round(b.ratio*100)}%`,PW-M-1,ry,
            {size:8,font:"mono",color:b.ratio<0.6?CRIT:WARN,align:"right"});
        line(M,ry+2.6,PW-M,ry+2.6,SOFT);
      });
    }
    footer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4+ — AVAILABILITY GRID & REGISTER
  // ═══════════════════════════════════════════════════════════════════════════
  if(o.sections.appendix){
    let y=newPage("Availability");
    eyebrow("Availability",M,y); y+=7;
    txt("Day-by-day availability",M,y,{size:13,font:"serif",color:INK}); y+=4;
    txt("One column per day, one row per site. Sites never impaired are summarised beneath the grid.",
        M,y+2.5,{size:7.5,color:INK3});
    y+=10;

    const matrix = facilityDayMatrix(fac,state,log,R,Math.min(days,21));
    const rank = (n:string) => matrix.days.reduce((s,dd)=>{
      const st=dd.status[n]; return s + (st==="red"?3:st==="amber"?2:st==="na"?1:0);
    },0);
    const problem = matrix.facilities.filter(n=>rank(n)>0).sort((a,b)=>rank(b)-rank(a));

    if(problem.length===0 || matrix.days.length===0){
      rect(M,y,CW,20,OKBG);
      txt("Every facility remained fully operational for the whole window.",M+6,y+12,{size:8.5,color:OK});
      y+=28;
    } else {
      const labelW=54, cols=matrix.days.length;
      const cell=Math.min(4.6,(CW-labelW)/cols-0.6), gapc=0.6;
      const every=Math.ceil(cols/7);
      matrix.days.forEach((dd,i)=>{
        if(i%every) return;
        txt(new Date(dd.t).toLocaleDateString("en-GB",{day:"2-digit"}),
            M+labelW+i*(cell+gapc)+cell/2,y,{size:5.4,font:"mono",color:INK4,align:"center"});
      });
      y+=2.5;
      const rows=problem.slice(0,18);
      rows.forEach((n,ri)=>{
        const ry=y+ri*(cell+1.1);
        txt(clip(n,labelW-3,6.4),M,ry+cell-1,{size:6.4,color:INK2});
        matrix.days.forEach((dd,ci)=>{
          const st=dd.status[n] ?? "na";
          const x=M+labelW+ci*(cell+gapc);
          if(st==="green"){
            rect(x,ry,cell,cell,OKBG);
            doc.setDrawColor(...LINE);doc.setLineWidth(0.1);doc.rect(x,ry,cell,cell,"S");
          } else rect(x,ry,cell,cell,statusRGB[st]);
        });
      });
      y+=rows.length*(cell+1.1)+3;
      const clean=matrix.facilities.length-problem.length;
      if(clean>0) txt(`${clean} further facilit${clean===1?"y":"ies"} remained fully operational throughout.`,
                      M,y,{size:6.8,color:INK4});
      y+=6;
      let lx=M;
      for(const g of [{c:OKBG,l:"Operational"},{c:WARN,l:"Degraded"},{c:CRIT,l:"Critical"},{c:NONE,l:"Not set"}]){
        rect(lx,y-2.4,2.4,2.4,g.c);
        txt(g.l,lx+3.4,y,{size:6.5,color:INK3});
        doc.setFont("helvetica","normal");doc.setFontSize(6.5);
        lx+=3.4+doc.getTextWidth(g.l)+7;
      }
      y+=10;
    }

    if(y > PH-60){ footer(); y=newPage("Register"); y+=2; }
    txt("Facility register",M,y,{size:13,font:"serif",color:INK}); y+=4;
    txt(`Current service state for all ${fac.length} facilities in scope.`,M,y+2.5,{size:7.5,color:INK3});
    y+=10;

    const c0=M+1, c1=M+72, c2=M+106, c3=M+132, c4=M+158;
    const header=()=>{
      eyebrow("Facility",c0,y,INK3,6); eyebrow("Division",c1,y,INK3,6);
      eyebrow("Internet",c2,y,INK3,6); eyebrow("Biometric",c3,y,INK3,6); eyebrow("Printing",c4,y,INK3,6);
      y+=2.5; line(M,y,PW-M,y,INK3,0.4); y+=5;
    };
    header();

    const ordered=[...fac].sort((a,b)=>{
      const r={red:0,amber:1,na:2,green:3} as Record<RAG,number>;
      const sa=state[a.name], sb=state[b.name];
      return (sa?r[overallOf(sa)]:4)-(sb?r[overallOf(sb)]:4) || a.name.localeCompare(b.name);
    });

    ordered.forEach((f,i)=>{
      if(y>PH-24){ footer(); y=newPage("Register (continued)"); y+=2; header(); }
      const s=state[f.name]; if(!s) return;
      if(i%2===1) rect(M,y-3.4,CW,7.4,WHITE);
      txt(clip(f.name,68,8),c0,y,{size:8,color:INK});
      txt(f.cat,c1,y,{size:7.2,color:INK3});
      SERVICES.forEach((sv,k)=>{
        const cx=[c2,c3,c4][k], st=s[sv];
        fill(statusRGB[st],1); doc.circle(cx+1.2,y-1,1,"F"); A(1);
        txt(st==="green"?"OK":st==="na"?"—":statusText[st],cx+3.8,y,
            {size:7,color:st==="green"?INK3:statusRGB[st],weight:st==="green"?"normal":"bold"});
      });
      y+=7.4;
    });
    line(M,y-3,PW-M,y-3);
    footer();
  }

  // provenance
  txt(`Generated ${genDate} at ${genTime} · window ${fmtRange(R)} · ${log.length} logged events${hasHist?"":" · no recorded history in window"}`,
      M,PH-20,{size:6.4,color:INK4});

  doc.save(fileName);
  return fileName;

  // ── charts ────────────────────────────────────────────────────────────────

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
