import './image-crop.css'
import { useEffect, useRef, useState } from 'react'
import { cropImageStyle, type FrameCrop } from '../lib/imageCrop'
export function CroppedImage({src,crop,alt='',className='',overlay=0,fitContainer=false}:{src:string;crop:FrameCrop;alt?:string;className?:string;overlay?:number;fitContainer?:boolean}) {
 const container=useRef<HTMLSpanElement>(null)
 const [aspect,setAspect]=useState<number|null>(null)
 useEffect(()=>{
  if(!fitContainer||!container.current)return
  const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width>0&&height>0)setAspect(width/height)})
  observer.observe(container.current);return ()=>observer.disconnect()
 },[fitContainer])
 return <span ref={container} className={`cropped-image ${className}`} style={{aspectRatio:fitContainer?undefined:crop.aspect,height:fitContainer?'100%':undefined,background:crop.color}} data-crop={JSON.stringify(crop)}>
  {crop.fill==='blur'&&<img className="cropped-image__fill" src={src} alt="" aria-hidden draggable={false}/>}
  <img className="cropped-image__photo" src={src} alt={alt} draggable={false} style={cropImageStyle(crop,fitContainer?(aspect??crop.aspect):crop.aspect)}/>
  {overlay>0&&<span className="cropped-image__overlay" style={{background:`rgb(0 0 0 / ${overlay/100})`}}/>}
 </span>
}
