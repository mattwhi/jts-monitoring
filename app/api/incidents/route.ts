import {apiUser} from '@/lib/auth';
import db from '@/lib/db'; export const dynamic='force-dynamic'; export async function GET(){if(!await apiUser())return Response.json({error:'Unauthorized'},{status:401});return Response.json(db.prepare('SELECT * FROM incidents ORDER BY id DESC LIMIT 100').all())}
