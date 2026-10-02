export const dynamic='force-dynamic';
import {requireUser} from '@/lib/auth';
import {snapshot} from '@/lib/data'; import RunNow from '@/components/RunNow'; import db from '@/lib/db';
const defs=[
  ['Homepage & Shop','Desktop Chromium','Availability and storefront rendering'],
  ['Homepage & Shop','Mobile Chromium','Mobile storefront rendering'],
  ['Guest Checkout','Desktop Chromium','Basket, checkout, CAPTCHA and payment UI'],
  ['Guest Checkout','Mobile Chromium','Mobile basket, checkout, CAPTCHA and payment UI'],
  ['Build-a-Treat-Box','Desktop Chromium','Bespoke treat-box page availability and rendering'],
  ['Build-a-Treat-Box','Mobile Chromium','Mobile treat-box page availability and rendering'],
];
export default async function Page(){await requireUser();const d=snapshot();const latest=db.prepare(`SELECT c.* FROM check_results c JOIN (SELECT monitor,device,MAX(id) id FROM check_results GROUP BY monitor,device) x ON c.id=x.id`).all() as any[];return <><div className="top"><div><div className="eyebrow">Production</div><h1 className="title">Monitors</h1><p className="muted">Customer-facing checks currently protecting Jasper's Treat Shop.</p></div><RunNow/></div><section className="monitorgrid">{defs.map((m,i)=>{const r=latest.find(x=>x.monitor===m[0]&&x.device===m[1]);return <div className="card monitor" key={i}><div className="split"><span className="monitoricon">{i<2?'↗':i<4?'◈':'□'}</span><span className={'status '+(r?.status==='fail'?'badbg':'')}>{r?.status||'waiting'}</span></div><h2>{m[0]}</h2><p>{m[1]}</p><p className="muted">{m[2]}</p>{r&&<p className="muted">Last: {(r.duration_ms/1000).toFixed(1)}s{r.failure_stage?` · ${r.failure_stage}`:''}</p>}<div className="monitorfoot"><span>Every {d.settings.interval_minutes} min</span><span>Production</span></div></div>})}</section></>}
