import {apiUser} from '@/lib/auth';
import fs from 'fs'; import path from 'path';
export async function DELETE(){if(!await apiUser())return Response.json({error:'Unauthorized'},{status:401});const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');const baseline=path.join(dir,'visual-baselines');try{fs.rmSync(baseline,{recursive:true,force:true});fs.mkdirSync(baseline,{recursive:true});return Response.json({ok:true})}catch(e){return Response.json({ok:false,error:String(e)},{status:500})}}
