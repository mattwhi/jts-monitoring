import {NextResponse} from 'next/server';import {slaSummary,incidentStats,type WindowKey} from '@/lib/metrics';import pkg from '../../../package.json';
export const dynamic='force-dynamic';
export async function GET(req:Request){const u=new URL(req.url);const w=(['24h','7d','30d'].includes(u.searchParams.get('window')||'')?u.searchParams.get('window'):'7d') as WindowKey;return NextResponse.json({service:'JTS Synthetic Monitoring',version:pkg.version,generated_at:new Date().toISOString(),window:w,sla:slaSummary(w,99.9),incidents:incidentStats(w)});}
