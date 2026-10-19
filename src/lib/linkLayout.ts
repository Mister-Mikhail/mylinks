import type { EditableLink, LinkLayout, LinkLayoutBlock } from '../types'
export const linkKey=(link:EditableLink)=>link.id || link.localId
export function layoutFor(links:EditableLink[],layout?:LinkLayout|null):LinkLayoutBlock[] {
 const available=new Set(links.map(linkKey)),seen=new Set<string>()
 if(!layout || layout.version!==1 || !Array.isArray(layout.blocks))return links.map(link=>({id:linkKey(link),type:'link',link_id:linkKey(link)}))
 const keep=(id:string)=>{if(!available.has(id)||seen.has(id))return false;seen.add(id);return true}
 const blocks=layout.blocks.flatMap((block):LinkLayoutBlock[]=>{
  if(block.type==='link')return keep(block.link_id)?[{...block}]:[]
  if(block.type==='group')return [{...block,link_ids:block.link_ids.filter(keep)}]
  return [{...block}]
 })
 return [...links.filter(link=>!seen.has(linkKey(link))).map(link=>({id:linkKey(link),type:'link' as const,link_id:linkKey(link)})),...blocks]
}
export function moveLayoutLink(layout:LinkLayout,links:EditableLink[],id:string,direction:-1|1):LinkLayout {
 const blocks=layoutFor(links,layout)
 const group=blocks.find(block=>block.type==='group'&&block.link_ids.includes(id))
 if(group?.type==='group'){const i=group.link_ids.indexOf(id),to=i+direction;if(to>=0&&to<group.link_ids.length)[group.link_ids[i],group.link_ids[to]]=[group.link_ids[to],group.link_ids[i]]}
 else{const i=blocks.findIndex(block=>block.type==='link'&&block.link_id===id),to=i+direction;if(i>=0&&to>=0&&to<blocks.length)[blocks[i],blocks[to]]=[blocks[to],blocks[i]]}
 return {version:1,blocks}
}
