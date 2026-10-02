import db from './db';

export type WindowKey = '24h'|'7d'|'30d';
const windows: Record<WindowKey,string> = {'24h':'-24 hours','7d':'-7 days','30d':'-30 days'};
export function percentile(values:number[], p:number){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(a.length*p)-1))]}
export function windowStats(window:WindowKey){
  const since=windows[window];
  const rows=db.prepare(`SELECT cr.* FROM check_results cr JOIN runs r ON r.id=cr.run_id WHERE datetime(r.started_at)>=datetime('now',?) ORDER BY cr.id`).all(since) as any[];
  const groups=new Map<string,any[]>();for(const r of rows){const k=`${r.monitor}|${r.device}`;groups.set(k,[...(groups.get(k)||[]),r])}
  return [...groups.entries()].map(([key,rs])=>{const [monitor,device]=key.split('|');const d=rs.map(r=>Number(r.duration_ms)||0).filter(Boolean);const passed=rs.filter(r=>r.status==='pass').length;return {monitor,device,samples:rs.length,availability:rs.length?Math.round(passed/rs.length*100000)/1000:100,p50:percentile(d,.5),p95:percentile(d,.95),p99:percentile(d,.99),avg:d.length?Math.round(d.reduce((a,b)=>a+b,0)/d.length):0};});
}
export function slaSummary(window:WindowKey,target=99.9){const stats=windowStats(window);const total=stats.reduce((a,s)=>a+s.samples,0);const passed=stats.reduce((a,s)=>a+Math.round(s.samples*s.availability/100),0);const availability=total?passed/total*100:100;const allowedFailurePct=100-target;const consumed=Math.max(0,100-availability);const budgetRemaining=allowedFailurePct<=0?100:Math.max(0,Math.min(100,(1-consumed/allowedFailurePct)*100));return {target,availability:Math.round(availability*1000)/1000,budgetRemaining:Math.round(budgetRemaining*10)/10,total,stats};}
export function incidentStats(window:WindowKey){const since=windows[window];const rows=db.prepare(`SELECT * FROM incidents WHERE datetime(opened_at)>=datetime('now',?) ORDER BY id DESC`).all(since) as any[];const now=Date.now();const durations=rows.map(r=>Math.max(0,(r.resolved_at?Date.parse(r.resolved_at):now)-Date.parse(r.opened_at)));return {count:rows.length,open:rows.filter(r=>r.status==='open').length,avgDuration:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0,rows};}
