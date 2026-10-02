'use client';
import {useState} from 'react';
export default function VisualBaselineControls(){const [msg,setMsg]=useState('');async function reset(){if(!confirm('Reset all visual baselines? The next synthetic run will create new baselines.'))return;setMsg('Resetting…');const r=await fetch('/api/visual-baseline',{method:'DELETE'});setMsg(r.ok?'Baselines reset — run the monitors to create new ones.':'Could not reset baselines')}return <div className="actions"><button className="button" onClick={reset}>Reset visual baselines</button><span className="muted">{msg}</span></div>}
