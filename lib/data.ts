import db from './db';
export function snapshot(){
  const runs:any[]=db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 288').all() as any[];
  const incidents:any[]=db.prepare('SELECT * FROM incidents ORDER BY id DESC LIMIT 50').all() as any[];
  const last=runs[0]||null;
  const pass=runs.filter(r=>r.status==='pass').length;
  const uptime=runs.length?Math.round(pass/runs.length*10000)/100:100;
  const durations=runs.filter(r=>r.duration_ms>0).map(r=>r.duration_ms).sort((a,b)=>a-b);
  const avg=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0;
  const p95=durations.length?durations[Math.min(durations.length-1,Math.ceil(durations.length*.95)-1)]:0;
  const settings=Object.fromEntries((db.prepare('SELECT key,value FROM settings').all() as any[]).map(x=>[x.key,x.value]));
  const pending=db.prepare("SELECT COUNT(*) c FROM run_requests WHERE status='pending'").get() as any;
  return {runs,incidents,last,uptime,avg,p95,settings,pending:pending?.c||0,status:incidents.some(i=>i.status==='open')?'down':'up'};
}
