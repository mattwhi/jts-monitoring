import db from '@/lib/db'; export const dynamic='force-dynamic'; export async function GET(){return Response.json(db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 100').all())}
