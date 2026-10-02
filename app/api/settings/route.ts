import {apiUser} from '@/lib/auth';
import db from '@/lib/db';
const allowed=['interval_minutes','failure_threshold','retention_days','alerts_enabled','webhook_url','visual_enabled','visual_threshold'];
export async function GET(){if(!await apiUser())return Response.json({error:'Unauthorized'},{status:401});return Response.json(Object.fromEntries((db.prepare('SELECT key,value FROM settings').all() as any[]).map(x=>[x.key,x.value])))}
export async function POST(req:Request){if(!await apiUser())return Response.json({error:'Unauthorized'},{status:401});const body=await req.json();for(const [k,v] of Object.entries(body)){if(allowed.includes(k))db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(v))}return Response.json({ok:true})}
