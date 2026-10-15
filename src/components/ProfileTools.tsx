import { lazy, Suspense, useState } from 'react'
import { Download, LoaderCircle, QrCode } from 'lucide-react'
import './profile-tools.css'
const QRCodeDialog=lazy(()=>import('./QRCodeDialog').then(m=>({default:m.QRCodeDialog})))
const ExportProfileDialog=lazy(()=>import('./ExportProfileDialog').then(m=>({default:m.ExportProfileDialog})))
export function ProfileTools({userId,handle,published}:{userId?:string;handle:string;published:boolean}){
 const [dialog,setDialog]=useState<'qr'|'export'|null>(null)
 return <div className="profile-tools"><button className="button button--secondary button--small" onClick={()=>setDialog('qr')}><QrCode size={16}/>QR-код / Поделиться</button>{userId&&<button className="button button--secondary button--small" onClick={()=>setDialog('export')}><Download size={16}/>Экспорт данных</button>}
 <Suspense fallback={<LoaderCircle aria-label="Загрузка" className="spin" size={20}/>}>{dialog==='qr'&&<QRCodeDialog handle={handle} published={published} onClose={()=>setDialog(null)}/>} {dialog==='export'&&userId&&<ExportProfileDialog userId={userId} onClose={()=>setDialog(null)}/>}</Suspense></div>
}
