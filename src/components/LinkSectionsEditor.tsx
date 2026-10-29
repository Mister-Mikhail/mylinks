import { ArrowDown, ArrowUp, Layers3, ListMinus, ListTree, Plus, Trash2 } from 'lucide-react'
import { LinkIcon } from './LinkIcon'
import type { EditableLink, LinkLayout, LinkLayoutBlock } from '../types'
import { layoutFor, linkKey } from '../lib/linkLayout'

interface Props {
 links: EditableLink[]
 value?: LinkLayout | null
 onChange: (layout: LinkLayout | null) => void
 selectedLinkId?: string | null
 onSelectLink?: (localId: string) => void
}

/** The sole layout/order editor. Keeps existing link_layout IDs unchanged. */
export function LinkSectionsEditor({ links, value, onChange, selectedLinkId, onSelectLink }: Props) {
 const blocks = layoutFor(links, value)
 const byId = new Map(links.map(link => [linkKey(link), link]))
 const save = (next: LinkLayoutBlock[]) => onChange({ version: 1, blocks: next })
 const patch = (id: string, change: Partial<LinkLayoutBlock>) => save(blocks.map(block => block.id === id ? { ...block, ...change } as LinkLayoutBlock : block))
 const add = (type: 'heading' | 'divider' | 'group') => {
  if (blocks.length >= 100) return
  const id = crypto.randomUUID()
  save([...blocks, type === 'divider' ? { id, type } : type === 'group' ? { id, type, title: 'Новая группа', link_ids: [] } : { id, type, title: 'Новый заголовок' }])
 }
 const move = (index: number, direction: number) => {
  const next = [...blocks], to = index + direction
  if (to < 0 || to >= next.length) return
  ;[next[index], next[to]] = [next[to], next[index]]
  save(next)
 }
 const remove = (block: LinkLayoutBlock) => save(blocks.flatMap(item => item.id !== block.id ? [item] : item.type === 'group' ? item.link_ids.map(id => ({ id, type: 'link' as const, link_id: id })) : []))
 const placeInGroup = (groupId: string, linkId: string) => {
  if (!linkId) return
  const next = blocks.flatMap((block): LinkLayoutBlock[] =>
   block.type === 'link' && block.link_id === linkId ? [] :
    block.type === 'group' ? [{ ...block, link_ids: block.id === groupId ? [...block.link_ids.filter(id => id !== linkId), linkId] : block.link_ids.filter(id => id !== linkId) }] : [block])
  save(next)
 }
 const select = (id: string) => { const link = byId.get(id); if (link) onSelectLink?.(link.localId) }
 return <section className="settings-card link-sections-editor" aria-label="Порядок на странице">
  <div className="settings-card__title"><ListTree size={18}/><div><h2>Порядок на странице</h2><p>Ссылки, заголовки, разделители и группы отображаются в этом порядке на опубликованной странице.</p></div></div>
  <div className="section-editor__add">{([['heading', 'Заголовок'], ['divider', 'Разделитель'], ['group', 'Группа']] as const).map(([type, label]) =>
   <button key={type} type="button" className="button button--secondary button--small" disabled={blocks.length >= 100} onClick={() => add(type)}><Plus size={14}/>{label}</button>)}</div>
  <div className="section-editor__list">{blocks.map((block, index) => {
   const link = block.type === 'link' ? byId.get(block.link_id) : undefined
   return <article className={'section-editor__block' + (link && selectedLinkId === link.localId ? ' appearance-item--selected' : '')} key={block.id} data-block-id={block.id}>
    <div className="section-editor__heading">
     {link ? <span className="page-order__icon"><LinkIcon name={link.icon_key} url={link.url} size={20}/></span> :
      block.type === 'divider' ? <ListMinus size={18}/> : <Layers3 size={18}/>}
     {link ? <button className="appearance-item__select" type="button" aria-pressed={selectedLinkId === link.localId} onClick={() => select(linkKey(link))}>{link.label || link.url || 'Новая ссылка'}</button>
      : <span className="page-order__label">{block.type === 'divider' ? 'Разделитель' : 'title' in block ? block.title || (block.type === 'heading' ? 'Заголовок' : 'Группа') : 'Ссылка'}</span>}
     <button type="button" className="icon-button" disabled={index === 0} aria-label={link ? `Переместить ссылку выше: ${link.label || index + 1}` : `Поднять блок ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp size={16}/></button>
     <button type="button" className="icon-button" disabled={index === blocks.length - 1} aria-label={link ? `Переместить ссылку ниже: ${link.label || index + 1}` : `Опустить блок ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown size={16}/></button>
     {block.type !== 'link' && <button type="button" className="icon-button" aria-label={block.type === 'group' ? 'Разгруппировать' : 'Удалить блок'} onClick={() => remove(block)}><Trash2 size={16}/></button>}
    </div>
    {(block.type === 'heading' || block.type === 'group') && <label>Название<input aria-label={block.type === 'group' ? 'Название группы' : 'Текст заголовка'} value={block.title} maxLength={80} onChange={event => patch(block.id, { title: event.target.value })}/></label>}
    {block.type === 'group' && <details><summary>Ссылки группы · {block.link_ids.length}</summary>
     {block.link_ids.map((id, i) => <div className="section-editor__member" key={id}>
      <button type="button" className="appearance-item__select" onClick={() => select(id)}>{byId.get(id)?.label || 'Новая ссылка'}</button>
      <button type="button" className="icon-button" aria-label={`Выше в группе: ${byId.get(id)?.label}`} disabled={i === 0} onClick={() => { const ids = [...block.link_ids]; [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]]; patch(block.id, { link_ids: ids }) }}><ArrowUp size={14}/></button>
      <button type="button" className="icon-button" aria-label={`Ниже в группе: ${byId.get(id)?.label}`} disabled={i === block.link_ids.length - 1} onClick={() => { const ids = [...block.link_ids]; [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]]; patch(block.id, { link_ids: ids }) }}><ArrowDown size={14}/></button>
      <button type="button" className="button button--ghost button--small" onClick={() => save(blocks.flatMap(item => item.id === block.id ? [{ ...block, link_ids: block.link_ids.filter(value => value !== id) }, { id, type: 'link', link_id: id }] : [item]))}>Из группы</button>
     </div>)}
     <label>Добавить ссылку<select aria-label={`Добавить ссылку в группу: ${block.title}`} value="" onChange={event => placeInGroup(block.id, event.target.value)}><option value="">Выберите ссылку</option>{links.filter(link => !block.link_ids.includes(linkKey(link))).map(link => <option key={linkKey(link)} value={linkKey(link)}>{link.label || link.url || 'Новая ссылка'}</option>)}</select></label>
    </details>}
   </article>
  })}</div>
  {value && <button type="button" className="button button--ghost button--small" onClick={() => onChange(null)}>Убрать группы и разделители</button>}
 </section>
}
