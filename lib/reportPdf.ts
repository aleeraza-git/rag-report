// ─────────────────────────────────────────────────────────────────────────────
// Estate Reliability Report — multi-page executive document.
//
// Portrait A4, because this is a document that gets emailed, printed and read
// in a meeting — not a landscape dashboard poster. Structure follows the way a
// decision-maker reads: verdict first, then evidence, then exceptions, then the
// full record in an appendix they can ignore.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import {
  reconstructHistory, attentionQueue, changesSince, divisionPerformance,
  serviceStats, repeatOffenders, bandwidthDeficits, verdict, overallOf,
  fmtDuration, SERVICES, SERVICE_LABEL,
  type FacState, type LogEntry, type RAG,
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
  windowDays: number;
  divFilter: string;
  sections: { summary:boolean; performance:boolean; exceptions:boolean; appendix:boolean };
  confidential: boolean;
}

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
  const dateStr = d.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"});
  const timeStr = d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
  const fileName = `Imarat_Estate_Reliability_${d.toISOString().slice(0,10)}.pdf`;

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
  const eyebrow=(s:string,x:number,y:number,color:RGB=INK3)=>{
    doc.setFont("helvetica","bold");doc.setFontSize(6.6);doc.setTextColor(...color);
    doc.text(s.toUpperCase(),x,y,{charSpace:0.5});
  };
  const meter=(x:number,y:number,w:number,h:number,segs:{v:number;c:RGB}[])=>{
    rrect(x,y,w,h,h/2,SOFT);
    const tot=segs.reduce((s,r)=>s+r.v,0)||1;
    let bx=x;
    for(const s of segs){ if(s.v<=0)continue; const bw=w*s.v/tot; fill(s.c,1); doc.rect(bx,y,bw,h,"F"); bx+=bw; }
    A(1);
  };

  // ── page chrome ───────────────────────────────────────────────────────────
  let page=0;
  const pageTitles:string[]=[];
  const newPage=(title:string)=>{
    if(page>0) doc.addPage();
    page++; pageTitles.push(title);
    rect(0,0,PW,PH,PAPER);
    // running header
    txt("IMARAT GROUP",M,13,{size:7.5,font:"sans",weight:"bold",color:INK});
    txt("Estate Reliability Report",M+30,13,{size:7.5,color:INK3});
    txt(title,PW-M,13,{size:7.5,color:INK3,align:"right"});
    line(M,16,PW-M,16);
    return 26; // content top
  };
  const footer=()=>{
    const y=PH-12;
    line(M,y-5,PW-M,y-5);
    txt(`${o.org} · IT Department`,M,y,{size:6.8,color:INK4});
    if(o.confidential) txt("CONFIDENTIAL",PW/2,y,{size:6.8,color:INK4,align:"center"});
    txt(String(page),PW-M,y,{size:7.5,font:"mono",color:INK3,align:"right"});
  };

  // ── analysis ──────────────────────────────────────────────────────────────
  const fac = facilities.filter(f=>o.divFilter==="all"||f.cat===o.divFilter);
  const hist = reconstructHistory(fac,state,log,o.windowDays);
  const attn = attentionQueue(fac,state,log,7);
  const change = changesSince(log,Date.now()-864e5);
  const divs = divisionPerformance(fac,state,log,o.windowDays);
  const svcs = serviceStats(fac,state,hist);
  const flappy = repeatOffenders(log,7,6);
  const bwDef = bandwidthDeficits(fac,state);
  const series = hist.points.map(p=>p.health);
  const health = series[series.length-1]??0;
  const trend = hist.coverage>0&&series.length>1 ? (health-series[0])*100 : null;
  const v = verdict(health,attn,change,trend);
  const latest = hist.points[hist.points.length-1];
  const hasHist = hist.coverage>0.02;

  const counts = { green:0, amber:0, red:0, na:0 } as Record<RAG,number>;
  for(const f of fac){ const s=state[f.name]; if(s) counts[overallOf(s)]++; }
  const total = fac.length||1;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    let y = newPage("Executive summary");

    eyebrow("Executive summary",M,y); y+=7;
    txt(o.period||dateStr,M,y,{size:8,color:INK3}); y+=11;

    // verdict — the whole point of the page
    const hl = wrap(v.headline,CW,19,"serif","normal");
    for(const l of hl){ txt(l,M,y,{size:19,font:"serif",color:INK}); y+=8.4; }
    y+=2.5;
    const sub = wrap(v.sub,CW-4,9.5,"sans");
    for(const l of sub){ txt(l,M,y,{size:9.5,color:INK2}); y+=5.1; }
    y+=8;

    // KPI band — four figures, deltas where real
    const kpis:{label:string;value:string;delta:number|null;c:RGB}[]=[
      { label:"Operational capacity", value:`${Math.round(health*100)}%`, delta:trend, c:statusRGB[v.tone] },
      { label:"Sites operational",    value:`${counts.green}/${total}`,   delta:null,  c:OK },
      { label:"Critical",             value:String(counts.red),           delta:null,  c:counts.red?CRIT:INK3 },
      { label:"Degraded",             value:String(counts.amber),         delta:null,  c:counts.amber?WARN:INK3 },
    ];
    const kw=CW/4;
    rect(M,y,CW,24,WHITE); line(M,y,PW-M,y); line(M,y+24,PW-M,y+24);
    kpis.forEach((k,i)=>{
      const x=M+i*kw;
      if(i) line(x,y+4,x,y+20,LINE);
      eyebrow(k.label,x+6,y+8);
      txt(k.value,x+6,y+18.5,{size:17,font:"mono",color:k.c});
      if(k.delta!==null&&hasHist){
        const dw=doc.getTextWidth(k.value);
        const good=k.delta>0, flat=Math.abs(k.delta)<0.05;
        txt(`${flat?"→":good?"▲":"▼"} ${k.delta>0?"+":""}${k.delta.toFixed(1)}`,
            x+8+dw,y+18.5,{size:7.5,font:"mono",color:flat?INK3:good?OK:CRIT});
      }
    });
    y+=34;

    // hero trend
    eyebrow(`Operational capacity · last ${o.windowDays} days`,M,y); y+=6;
    if(hasHist){
      drawTrend(M,y,CW,46,series,hist,statusRGB[v.tone]);
      y+=54;
    } else {
      rect(M,y,CW,30,WHITE); line(M,y,PW-M,y); line(M,y+30,PW-M,y+30);
      txt("No status changes recorded yet — trend becomes available once the activity log has history.",
          M+6,y+17,{size:8.5,color:INK4});
      y+=38;
    }

    // movement strip
    eyebrow("Movement · last 24 hours",M,y); y+=6.5;
    txt(`${change.recovered}`,M,y+2,{size:14,font:"mono",color:change.recovered?OK:INK4});
    txt("recovered",M+ (change.recovered>9?11:7),y+2,{size:8.5,color:INK2});
    const mx=M+52;
    txt(`${change.degraded}`,mx,y+2,{size:14,font:"mono",color:change.degraded?CRIT:INK4});
    txt("regressed",mx+(change.degraded>9?11:7),y+2,{size:8.5,color:INK2});
    if(change.events.length){
      const names=[...new Set(change.events.slice(0,4).map(e=>e.facility))].join(", ");
      const t=wrap(names,CW-108,8,"sans");
      txt(t[0]+(t.length>1?"…":""),M+108,y+2,{size:8,color:INK3});
    }
    footer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  if(o.sections.performance){
    let y=newPage("Performance");
    eyebrow("Performance",M,y); y+=8;
    txt("Division comparison",M,y,{size:14,font:"serif",color:INK}); y+=4;
    txt("Ranked weakest first. Delta compares against the start of the window.",M,y+2.5,{size:8,color:INK3});
    y+=11;

    rect(M,y,CW,divs.length*17+6,WHITE);
    line(M,y,PW-M,y);
    divs.forEach((dv,i)=>{
      const ry=y+6+i*17;
      const c:RGB = dv.health>=0.8?OK:dv.health>=0.5?WARN:CRIT;
      txt(dv.cat,M+6,ry+3,{size:10,color:INK,weight:"bold"});
      txt(`${dv.green} of ${dv.total} operational`,M+6,ry+8,{size:7.5,color:INK3});
      txt(`${Math.round(dv.health*100)}%`,PW-M-6,ry+4,{size:13,font:"mono",color:c,align:"right"});
      if(dv.delta!==null&&hasHist){
        const good=dv.delta>0, flat=Math.abs(dv.delta)<0.05;
        txt(`${flat?"→":good?"▲":"▼"} ${dv.delta>0?"+":""}${dv.delta.toFixed(1)} pts`,
            PW-M-6,ry+9,{size:7,font:"mono",color:flat?INK3:good?OK:CRIT,align:"right"});
      }
      meter(M+6,ry+10.5,CW-46,2.4,[{v:dv.green,c:OK},{v:dv.amber,c:WARN},{v:dv.red,c:CRIT},{v:dv.na,c:NONE}]);
      if(i<divs.length-1) line(M+6,ry+14.5,PW-M-6,ry+14.5,SOFT);
    });
    line(M,y+divs.length*17+6,PW-M,y+divs.length*17+6);
    y+=divs.length*17+18;

    txt("Service reliability",M,y,{size:14,font:"serif",color:INK}); y+=4;
    txt(`Availability across ${total} monitored sites over ${o.windowDays} days.`,M,y+2.5,{size:8,color:INK3});
    y+=11;

    const sw=(CW-12)/3;
    svcs.forEach((s,i)=>{
      const x=M+i*(sw+6);
      const c:RGB = s.availability>=0.8?OK:s.availability>=0.5?WARN:CRIT;
      rect(x,y,sw,60,WHITE);
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.rect(x,y,sw,60,"S");
      txt(SERVICE_LABEL[s.service],x+5,y+8,{size:9.5,weight:"bold",color:INK});
      txt(`${Math.round(s.availability*100)}%`,x+5,y+20,{size:18,font:"mono",color:c});
      if(s.delta!==null&&hasHist){
        const good=s.delta>0, flat=Math.abs(s.delta)<0.05;
        txt(`${flat?"→":good?"▲":"▼"} ${s.delta>0?"+":""}${s.delta.toFixed(1)}`,
            x+sw-5,y+20,{size:7.5,font:"mono",color:flat?INK3:good?OK:CRIT,align:"right"});
      }
      txt(`${s.ok} of ${s.total} sites`,x+5,y+26,{size:7.5,color:INK3});
      if(hasHist) drawSpark(x+5,y+30,sw-10,14,s.series,c);
      meter(x+5,y+48,sw-10,2.4,[{v:s.ok,c:OK},{v:s.degraded,c:WARN},{v:s.down,c:CRIT}]);
      txt(`${s.degraded} degraded · ${s.down} down`,x+5,y+56,{size:7,color:INK3});
    });
    y+=70;

    if(flappy.length){
      txt("Instability",M,y,{size:14,font:"serif",color:INK}); y+=4;
      txt("Sites that changed state most often in the last 7 days. Repeated flapping often indicates an unresolved root cause.",
          M,y+2.5,{size:8,color:INK3}); y+=10;
      flappy.slice(0,5).forEach((f,i)=>{
        const ry=y+i*9;
        txt(f.facility,M+2,ry,{size:9,color:INK});
        txt(`${f.flips} changes`,PW-M-2,ry,{size:8.5,font:"mono",color:WARN,align:"right"});
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
    eyebrow("Exceptions",M,y); y+=8;
    txt("What needs attention",M,y,{size:14,font:"serif",color:INK}); y+=4;
    txt("Ranked by severity, then how long the fault has persisted, then instability.",M,y+2.5,{size:8,color:INK3});
    y+=11;

    if(!attn.length){
      rect(M,y,CW,26,OKBG);
      txt("No exceptions. Every monitored facility is reporting all services operational.",
          M+6,y+15,{size:9.5,color:OK});
      y+=34;
    } else {
      const cols=[M+2, M+62, M+92, M+120, M+142, M+162];
      eyebrow("Facility",cols[0],y); eyebrow("Fault",cols[1],y);
      eyebrow("Since",cols[2],y);    eyebrow("Flips",cols[3],y);
      eyebrow("Capacity",cols[4],y); eyebrow("Status",cols[5],y);
      y+=3; line(M,y,PW-M,y,INK3,0.4); y+=5;

      const rows=attn.slice(0,22);
      rows.forEach((it,i)=>{
        if(i%2===1) rect(M,y-3.6,CW,8,WHITE);
        const nm=wrap(it.facility,58,8)[0];
        txt(nm,cols[0],y,{size:8,color:INK});
        txt(it.cat,cols[0],y+3.4,{size:6.4,color:INK4});
        txt(wrap(it.reason,28,7.6)[0],cols[1],y,{size:7.6,color:INK2});
        txt(it.since?fmtDuration(Date.now()-it.since):"—",cols[2],y,{size:7.6,font:"mono",color:INK2});
        txt(it.flips?String(it.flips):"—",cols[3],y,{size:7.6,font:"mono",color:it.flips>=3?WARN:INK3});
        txt(it.bwRatio!==null?`${Math.round(it.bwRatio*100)}%`:"—",cols[4],y,
            {size:7.6,font:"mono",color:it.bwRatio!==null&&it.bwRatio<0.7?WARN:INK3});
        const sc=statusRGB[it.status];
        rrect(cols[5],y-3,17,4.6,1,statusBGRGB[it.status]);
        txt(statusText[it.status],cols[5]+8.5,y+0.2,{size:6,color:sc,align:"center",weight:"bold"});
        y+=8.6;
      });
      line(M,y-3,PW-M,y-3);
      if(attn.length>rows.length){
        y+=2; txt(`+ ${attn.length-rows.length} further exceptions — see appendix.`,M,y,{size:7.5,color:INK4});
      }
      y+=10;
    }

    if(bwDef.length){
      txt("Capacity risk",M,y,{size:14,font:"serif",color:INK}); y+=4;
      txt("Sites operating below their stated bandwidth requirement.",M,y+2.5,{size:8,color:INK3}); y+=10;
      bwDef.slice(0,8).forEach((b,i)=>{
        const ry=y+i*10;
        txt(wrap(b.facility,72,8.5)[0],M+2,ry,{size:8.5,color:INK});
        txt(`${b.current} of ${b.required} Mbps`,M+80,ry,{size:7.5,font:"mono",color:INK3});
        meter(M+118,ry-2.4,44,2.4,[{v:b.ratio,c:b.ratio<0.6?CRIT:WARN},{v:Math.max(1-b.ratio,0),c:SOFT}]);
        txt(`${Math.round(b.ratio*100)}%`,PW-M-2,ry,
            {size:8.5,font:"mono",color:b.ratio<0.6?CRIT:WARN,align:"right"});
        line(M,ry+3,PW-M,ry+3,SOFT);
      });
    }
    footer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4+ — APPENDIX
  // ═══════════════════════════════════════════════════════════════════════════
  if(o.sections.appendix){
    let y=newPage("Appendix");
    eyebrow("Appendix",M,y); y+=8;
    txt("Full facility register",M,y,{size:14,font:"serif",color:INK}); y+=4;
    txt(`All ${fac.length} monitored facilities and their current service state.`,M,y+2.5,{size:8,color:INK3});
    y+=11;

    const c0=M+2, c1=M+72, c2=M+104, c3=M+130, c4=M+156;
    const header=()=>{
      eyebrow("Facility",c0,y); eyebrow("Division",c1,y);
      eyebrow("Internet",c2,y); eyebrow("Biometric",c3,y); eyebrow("Printing",c4,y);
      y+=3; line(M,y,PW-M,y,INK3,0.4); y+=5;
    };
    header();

    const ordered=[...fac].sort((a,b)=>{
      const sa=state[a.name],sb=state[b.name];
      const va=sa?({red:0,amber:1,na:2,green:3} as any)[overallOf(sa)]:4;
      const vb=sb?({red:0,amber:1,na:2,green:3} as any)[overallOf(sb)]:4;
      return va-vb || a.name.localeCompare(b.name);
    });

    ordered.forEach((f,i)=>{
      if(y>PH-26){ footer(); y=newPage("Appendix (continued)"); y+=2; header(); }
      const s=state[f.name];
      if(!s) return;
      if(i%2===1) rect(M,y-3.4,CW,7.6,WHITE);
      txt(wrap(f.name,66,8)[0],c0,y,{size:8,color:INK});
      txt(f.cat,c1,y,{size:7.4,color:INK3});
      SERVICES.forEach((sv,k)=>{
        const cx=[c2,c3,c4][k];
        const st=s[sv];
        fill(statusRGB[st],1); doc.circle(cx+1.4,y-1.1,1.05,"F"); A(1);
        txt(st==="green"?"OK":st==="na"?"—":statusText[st],cx+4.2,y,
            {size:7.2,color:st==="green"?INK3:statusRGB[st],weight:st==="green"?"normal":"bold"});
      });
      y+=7.6;
    });
    line(M,y-3,PW-M,y-3);
    footer();
  }

  // provenance note on the final page
  {
    const y=PH-22;
    txt(`Generated ${dateStr} at ${timeStr} · window ${o.windowDays} days · ${log.length} logged events${hasHist?"":" · trend unavailable (no recorded history)"}`,
        M,y,{size:6.6,color:INK4});
  }

  doc.save(fileName);
  return fileName;

  // ── charts ────────────────────────────────────────────────────────────────

  /** Full trend chart with axes, gridlines, area, endpoint and date labels. */
  function drawTrend(x:number,y:number,w:number,h:number,data:number[],hres:{coverage:number;points:{t:number}[]},c:RGB){
    rect(x,y,w,h,WHITE);
    const padL=13, padR=4, padT=5, padB=9;
    const iw=w-padL-padR, ih=h-padT-padB;
    // scale: always include the full 0..100 band when the data is tight, so the
    // reader is not misled by an exaggerated y-zoom
    const lo=Math.min(...data), hi=Math.max(...data);
    const mid=(lo+hi)/2;
    const half=Math.max((hi-lo)/2, 0.08);
    const y0=Math.max(0,mid-half*1.4), y1=Math.min(1,mid+half*1.4);
    const span=(y1-y0)||1;
    const px=(i:number)=>x+padL+(i/Math.max(data.length-1,1))*iw;
    const py=(v:number)=>y+padT+(1-(v-y0)/span)*ih;

    // gridlines + y labels
    for(let g=0;g<=2;g++){
      const val=y0+(span*g)/2;
      const gy=py(val);
      line(x+padL,gy,x+w-padR,gy,g===0?LINE:SOFT,0.2);
      txt(`${Math.round(val*100)}`,x+padL-2.5,gy+1.5,{size:6,font:"mono",color:INK4,align:"right"});
    }
    // coverage shading — the assumed portion
    const assumed=Math.max(0,1-Math.min(hres.coverage,1))*iw;
    if(assumed>1){ rect(x+padL,y+padT,assumed,ih,PAPER); }
    // area
    fill(c,0.12);
    const pts:[number,number][]=data.map((v,i)=>[px(i),py(v)]);
    const poly:[number,number][]=[...pts,[px(data.length-1),y+padT+ih],[px(0),y+padT+ih]];
    const rel:[number,number][]=[];
    for(let i=1;i<poly.length;i++) rel.push([poly[i][0]-poly[i-1][0],poly[i][1]-poly[i-1][1]]);
    (doc as any).lines(rel,poly[0][0],poly[0][1],[1,1],"F",true);
    A(1);
    // line
    doc.setDrawColor(...c); doc.setLineWidth(0.7);
    for(let i=1;i<pts.length;i++) doc.line(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);
    // endpoint
    fill(c,1); doc.circle(pts[pts.length-1][0],pts[pts.length-1][1],1.1,"F"); A(1);
    // x labels
    const first=new Date(hres.points[0].t).toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
    txt(first,x+padL,y+h-2.5,{size:6,font:"mono",color:INK4});
    txt("today",x+w-padR,y+h-2.5,{size:6,font:"mono",color:INK4,align:"right"});
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.rect(x,y,w,h,"S");
  }

  function drawSpark(x:number,y:number,w:number,h:number,data:number[],c:RGB){
    if(!data.length) return;
    const lo=Math.min(...data), hi=Math.max(...data), span=(hi-lo)||1;
    const px=(i:number)=>x+(i/Math.max(data.length-1,1))*w;
    const py=(v:number)=>y+(1-(v-lo)/span)*h;
    doc.setDrawColor(...c); doc.setLineWidth(0.5);
    for(let i=1;i<data.length;i++) doc.line(px(i-1),py(data[i-1]),px(i),py(data[i]));
    fill(c,1); doc.circle(px(data.length-1),py(data[data.length-1]),0.8,"F"); A(1);
  }
}
