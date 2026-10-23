import { useEffect, useRef, type Dispatch, type SetStateAction, type RefObject, type PointerEvent, type KeyboardEvent } from 'react'
import type { Point } from '../lib/imageCrop'

/** Shared by avatar, background and card editors. Offsets are viewport pixels;
 * callers persist fractions so resizing cannot change the selected composition. */
export function useCropGestures({viewportRef,enabled,zoom,setZoom,offset,setOffset,normalized=false}:{normalized?:boolean;viewportRef:RefObject<HTMLDivElement|null>;enabled:boolean;zoom:number;setZoom:Dispatch<SetStateAction<number>>;offset:Point;setOffset:Dispatch<SetStateAction<Point>>}) {
 const pixels=(point:Point):Point=>{const rect=viewportRef.current?.getBoundingClientRect();return normalized&&rect?{x:point.x*rect.width,y:point.y*rect.height}:point}
 const units=(point:Point):Point=>{const rect=viewportRef.current?.getBoundingClientRect();return normalized&&rect?{x:Math.min(2,Math.max(-2,point.x/rect.width)),y:Math.min(2,Math.max(-2,point.y/rect.height))}:point}
 const dragRef=useRef<{pointerX:number;pointerY:number;offset:Point}|null>(null)
 const pointers=useRef(new Map<number,Point>())
 const pinch=useRef<{distance:number;center:Point;offset:Point;zoom:number}|null>(null)
 useEffect(()=>{
  const viewport=viewportRef.current;if(!viewport||!enabled)return
  const wheel=(event:WheelEvent)=>{event.preventDefault();setZoom(current=>Math.min(3,Math.max(.25,current*Math.exp(-event.deltaY*.002))))}
  viewport.addEventListener('wheel',wheel,{passive:false})
  return ()=>viewport.removeEventListener('wheel',wheel)
 },[viewportRef,enabled,setZoom])
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const rect = event.currentTarget.getBoundingClientRect()
      pinch.current = { distance: Math.hypot(b.x - a.x, b.y - a.y), center: { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height / 2 }, zoom, offset: pixels(offset) }
      dragRef.current = null
      return
    }
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, offset: pixels(offset) }
  }

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const rect = event.currentTarget.getBoundingClientRect()
      const initial = pinch.current
      const nextZoom = Math.min(3, Math.max(.25, initial.zoom * Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, initial.distance)))
      const ratio = nextZoom / initial.zoom
      const center = { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height / 2 }
      setZoom(nextZoom)
      setOffset(units({ x: center.x - (initial.center.x - initial.offset.x) * ratio, y: center.y - (initial.center.y - initial.offset.y) * ratio }))
      return
    }
    if (!dragRef.current) return
    const nextOffset = {
      x: dragRef.current.offset.x + event.clientX - dragRef.current.pointerX,
      y: dragRef.current.offset.y + event.clientY - dragRef.current.pointerY,
    }
    setOffset(units(nextOffset))
  }

  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key]
    if (!delta || !enabled) return
    event.preventDefault()
    setOffset(current => {const p=pixels(current);return units({x:p.x+delta[0],y:p.y+delta[1]})})
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    pinch.current = null
    const remaining = [...pointers.current.values()][0]
    dragRef.current = remaining ? { pointerX: remaining.x, pointerY: remaining.y, offset: pixels(offset) } : null
  }


 return {startDrag,drag,stopDrag,moveWithKeyboard,resetPointers:()=>{pointers.current.clear();pinch.current=null;dragRef.current=null}}
}
