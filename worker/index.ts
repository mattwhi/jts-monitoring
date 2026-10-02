import {spawn} from 'child_process';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dir=process.env.DATA_DIR||'/data';
fs.mkdirSync(dir,{recursive:true});
const db=new Database(path.join(dir,'jts-monitor.db'));
db.pragma('busy_timeout = 5000');
try { db.pragma('journal_mode = WAL'); } catch (error:any) { if(error?.code!=='SQLITE_BUSY') throw error; }
db.exec(`
CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL,duration_ms INTEGER DEFAULT 0,passed INTEGER DEFAULT 0,failed INTEGER DEFAULT 0,output TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS check_results(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id INTEGER NOT NULL,monitor TEXT NOT NULL,device TEXT NOT NULL,status TEXT NOT NULL,duration_ms INTEGER DEFAULT 0,failure_stage TEXT,error TEXT DEFAULT '',screenshot TEXT,trace TEXT,video TEXT,FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_check_results_run_id ON check_results(run_id);
CREATE INDEX IF NOT EXISTS idx_check_results_monitor_device ON check_results(monitor,device,id);
CREATE TABLE IF NOT EXISTS incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,opened_at TEXT NOT NULL,resolved_at TEXT,status TEXT NOT NULL,summary TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alert_events(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL,event_type TEXT NOT NULL,status TEXT NOT NULL,message TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,requested_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO settings(key,value) VALUES('interval_minutes','5');
INSERT OR IGNORE INTO settings(key,value) VALUES('failure_threshold','2');
INSERT OR IGNORE INTO settings(key,value) VALUES('retention_days','30');
INSERT OR IGNORE INTO settings(key,value) VALUES('alerts_enabled','0');
INSERT OR IGNORE INTO settings(key,value) VALUES('webhook_url','');
INSERT OR IGNORE INTO settings(key,value) VALUES('visual_enabled','1');
INSERT OR IGNORE INTO settings(key,value) VALUES('visual_threshold','5');
`);
function ensureColumn(table:string,column:string,definition:string){const cols=db.prepare(`PRAGMA table_info(${table})`).all() as any[];if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);}
ensureColumn('check_results','diagnostics_json',"TEXT DEFAULT '{}'");
ensureColumn('check_results','metrics_json',"TEXT DEFAULT '{}'");
ensureColumn('check_results','visual_json',"TEXT DEFAULT '{}'");
let busy=false;
function setting(key:string,fallback=''){const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any;return row?.value??fallback}
function numberSetting(key:string,fallback:number){return Number(setting(key,String(fallback)))||fallback}
function parseResults(out:string){const results:any[]=[];for(const line of out.split(/\r?\n/))if(line.startsWith('JTS_RESULT:')){try{results.push(JSON.parse(line.slice(11)))}catch{}}return results}
function friendlyMonitor(title:string){if(/homepage and shop/i.test(title))return 'Homepage & Shop';if(/guest can add/i.test(title))return 'Guest Checkout';if(/build-a-treat-box/i.test(title))return 'Build-a-Treat-Box';return title}
function friendlyDevice(project:string){return project.includes('mobile')?'Mobile Chromium':'Desktop Chromium'}
async function notify(eventType:'failure'|'recovery',message:string,details:any={}){
  if(setting('alerts_enabled','0')!=='1') return;
  const url=setting('webhook_url','').trim(); if(!url) return;
  try{
    const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:message,event:eventType,service:'JTS Synthetic Monitoring',...details})});
    db.prepare('INSERT INTO alert_events(created_at,event_type,status,message) VALUES(?,?,?,?)').run(new Date().toISOString(),eventType,res.ok?'sent':`http_${res.status}`,message);
  }catch(error){db.prepare('INSERT INTO alert_events(created_at,event_type,status,message) VALUES(?,?,?,?)').run(new Date().toISOString(),eventType,'error',String(error));}
}
async function finishRun(code:number|null,start:number,started:string,out:string,requestId?:number){
  const duration=Date.now()-start,results=parseResults(out);const passed=results.filter(r=>r.status==='pass').length,failed=results.filter(r=>r.status==='fail').length;const status=(code===0&&failed===0&&results.length>0)?'pass':'fail';
  const info=db.prepare('INSERT INTO runs(started_at,finished_at,status,duration_ms,passed,failed,output) VALUES(?,?,?,?,?,?,?)').run(started,new Date().toISOString(),status,duration,passed,failed,out.slice(-50000));const runId=Number(info.lastInsertRowid);
  const ins=db.prepare('INSERT INTO check_results(run_id,monitor,device,status,duration_ms,failure_stage,error,screenshot,trace,video,diagnostics_json,metrics_json,visual_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const r of results){const a=r.attachments||{};ins.run(runId,friendlyMonitor(r.title),friendlyDevice(r.project),r.status,r.duration_ms||0,r.failure_stage||null,r.error||'',a.screenshot||null,a.trace||null,a.video||null,JSON.stringify(r.diagnostics||{}),JSON.stringify(r.metrics||{}),JSON.stringify(r.visual||{}))}
  if(requestId)db.prepare("UPDATE run_requests SET status='done' WHERE id=?").run(requestId);
  const maintenance=db.prepare("SELECT id FROM maintenance_windows WHERE datetime('now') BETWEEN datetime(starts_at) AND datetime(ends_at) LIMIT 1").get() as any;const threshold=Math.max(1,numberSetting('failure_threshold',2));const recent=db.prepare('SELECT status FROM runs ORDER BY id DESC LIMIT ?').all(threshold) as any[];const open=db.prepare("SELECT id,opened_at FROM incidents WHERE status='open' ORDER BY id DESC LIMIT 1").get() as any;
  if(!maintenance&&recent.length===threshold&&recent.every(r=>r.status==='fail')&&!open){
    const summary=`Production synthetic monitoring failed ${threshold} consecutive runs`;db.prepare("INSERT INTO incidents(opened_at,status,summary) VALUES(?,'open',?)").run(new Date().toISOString(),summary);
    const failures=results.filter(r=>r.status==='fail').map(r=>`${friendlyMonitor(r.title)} — ${friendlyDevice(r.project)}${r.failure_stage?` (${r.failure_stage})`:''}`);
    await notify('failure',`JTS Monitor: ${summary}${failures.length?`\n${failures.join('\n')}`:''}`,{run_id:runId,failures});
  }
  if(status==='pass'&&open){db.prepare("UPDATE incidents SET status='resolved',resolved_at=? WHERE id=?").run(new Date().toISOString(),open.id);const mins=Math.max(1,Math.round((Date.now()-Date.parse(open.opened_at))/60000));await notify('recovery',`JTS Monitor: production monitoring recovered after ${mins} minute${mins===1?'':'s'}.`,{run_id:runId,incident_id:open.id});}
  const retention=Math.max(1,numberSetting('retention_days',30));db.prepare("DELETE FROM check_results WHERE run_id IN (SELECT id FROM runs WHERE datetime(started_at) < datetime('now', ?))").run(`-${retention} days`);db.prepare("DELETE FROM runs WHERE datetime(started_at) < datetime('now', ?)").run(`-${retention} days`);db.prepare("DELETE FROM alert_events WHERE datetime(created_at) < datetime('now', ?)").run(`-${retention} days`);db.prepare("DELETE FROM incidents WHERE status='resolved' AND datetime(resolved_at) < datetime('now', ?)").run(`-${retention} days`);busy=false;
}
async function run(requestId?:number){if(busy)return;busy=true;if(requestId)db.prepare("UPDATE run_requests SET status='running' WHERE id=?").run(requestId);const start=Date.now(),started=new Date().toISOString();let out='';const p=spawn('npx',['playwright','test','e2e/checkout.spec.ts','--reporter=./reporters/jts-reporter.ts'],{env:{...process.env,PLAYWRIGHT_HTML_OPEN:'never',JTS_VISUAL_ENABLED:setting('visual_enabled','1'),JTS_VISUAL_THRESHOLD:setting('visual_threshold','5')}});p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('close',code=>{void finishRun(code,start,started,out,requestId)});p.on('error',err=>{out+=`\nWorker spawn error: ${err.message}`;void finishRun(1,start,started,out,requestId)});}
let nextScheduled=0;setInterval(()=>{const req=db.prepare("SELECT id FROM run_requests WHERE status='pending' ORDER BY id LIMIT 1").get() as any;if(req&&!busy){void run(req.id);return;}const interval=Math.max(1,numberSetting('interval_minutes',5))*60000;if(Date.now()>=nextScheduled&&!busy){nextScheduled=Date.now()+interval;void run();}},1000);
