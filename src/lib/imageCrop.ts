import type { CSSProperties } from 'react'
export type Point = { x: number; y: number }
export type LegacyCrop = {version:1;mode:'legacy';x:number;y:number;zoom:number}
export type FrameCrop = {version:1;mode:'frame';x:number;y:number;zoom:number;aspect:number;sourceAspect:number;fill:'blur'|'color';color:string}
export type ImageCrop = LegacyCrop | FrameCrop
export const BACKGROUND_ASPECT = 9 / 19.5
export const CARD_ASPECT = 16 / 9
export const frameCrop = (aspect:number,sourceAspect=1):FrameCrop => ({version:1,mode:'frame',x:0,y:0,zoom:1,aspect,sourceAspect,fill:'blur',color:'#162638'})
export const isFrameCrop = (crop?:ImageCrop|null):crop is FrameCrop => crop?.mode==='frame' && Number.isFinite(crop.sourceAspect) && crop.sourceAspect>0 && Number.isFinite(crop.aspect) && crop.aspect>0
export function cropImageStyle(crop:FrameCrop):CSSProperties {
 return {position:'absolute',maxWidth:'none',width:`${Math.max(1,crop.sourceAspect/crop.aspect)*crop.zoom*100}%`,height:`${Math.max(1,crop.aspect/crop.sourceAspect)*crop.zoom*100}%`,left:`${50+crop.x*100}%`,top:`${50+crop.y*100}%`,transform:'translate(-50%, -50%)',objectFit:'fill'}
}
export function legacyToFrame(crop:LegacyCrop,aspect:number,sourceAspect:number):FrameCrop {
 return {...frameCrop(aspect,sourceAspect),zoom:crop.zoom,x:(1-Math.max(1,sourceAspect/aspect)*crop.zoom)*(crop.x-.5),y:(1-Math.max(1,aspect/sourceAspect)*crop.zoom)*(crop.y-.5)}
}
