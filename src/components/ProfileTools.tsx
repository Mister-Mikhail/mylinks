import { lazy, Suspense, useState } from 'react'
import { Download, LoaderCircle, QrCode } from 'lucide-react'
import './profile-tools.css'
const QRCodeDialog=lazy(()=>import('./QRCodeDialog').then(m=>({default:m.QRCodeDialog})))
const ExportProfileDialog=lazy(()=>import('./ExportProfileDialog').then(m=>({default:m.ExportProfileDialog})))
export function ProfileTools({userId,handle,published,updatedAt,avatarPath,mode,onClose,hideButtons=false}:{userId?:string;handle:string;published:boolean;updatedAt?:string;avatarPath?:string|null;mode?:'qr'|'export'|null;onClose?:()=>void;hideButtons?:boolean}){
 const [dialog,setDialog]=useState<'qr'|'export'|null>(null)
 const active = mode === undefined ? dialog : mode
 const close = () => { setDialog(null); onClose?.() }
 return <div className="profile-tools">{!hideButtons && <><button className="button button--secondary button--small" onClick={()=>setDialog('qr')}><QrCode size={16}/>QR-код / Поделиться</button>{userId&&<button className="button button--secondary button--small" onClick={()=>setDialog('export')}><Download size={16}/>Экспорт данных</button>}</>}
 <Suspense fallback={<LoaderCircle aria-label="Загрузка" className="spin" size={20}/>}>{active==='qr'&&<QRCodeDialog handle={handle} published={published} updatedAt={updatedAt} avatarPath={avatarPath} onClose={close}/>} {active==='export'&&userId&&<ExportProfileDialog userId={userId} onClose={close}/>}</Suspense></div>
}
