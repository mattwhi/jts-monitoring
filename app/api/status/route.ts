import {apiUser} from '@/lib/auth';
import {snapshot} from '@/lib/data'; export const dynamic='force-dynamic'; export async function GET(){if(!await apiUser())return Response.json({error:'Unauthorized'},{status:401});return Response.json(snapshot())}
