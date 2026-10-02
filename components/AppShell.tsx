'use client';import {usePathname} from 'next/navigation';import Sidebar from './Sidebar';
export default function AppShell({children}:{children:React.ReactNode}){const p=usePathname();const pub=p==='/'||p==='/login'||p==='/register';if(pub)return <>{children}</>;return <div className="shell"><Sidebar/><main className="main">{children}</main></div>}
