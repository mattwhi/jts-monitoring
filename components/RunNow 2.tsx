'use client'; import {useState} from 'react';
export default function RunNow(){const [state,setState]=useState('Run now');async function go(){setState('Queuing…');const r=await fetch('/api/run-now',{method:'POST'});setState(r.ok?'Queued ✓':'Failed');setTimeout(()=>location.reload(),1800)}return <button className="button" onClick={go} disabled={state!=='Run now'}>{state}</button>}
