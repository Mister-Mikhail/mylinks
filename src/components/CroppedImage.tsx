import './image-crop.css'
import { cropImageStyle, type FrameCrop } from '../lib/imageCrop'
export function CroppedImage({src,crop,alt='',className='',overlay=0}:{src:string;crop:FrameCrop;alt?:string;className?:string;overlay?:number}) {
 return <span className={`cropped-image ${className}`} style={{aspectRatio:crop.aspect,background:crop.color}} data-crop={JSON.stringify(crop)}>
  {crop.fill==='blur'&&<img className="cropped-image__fill" src={src} alt="" aria-hidden draggable={false}/>}
  <img className="cropped-image__photo" src={src} alt={alt} draggable={false} style={cropImageStyle(crop)}/>
  {overlay>0&&<span className="cropped-image__overlay" style={{background:`rgb(0 0 0 / ${overlay/100})`}}/>}
 </span>
}
