import { useEffect, useState } from 'react'
import { BarChart3, LoaderCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Statistics {
  from?: string
  to?: string
  views: number
  clicks: number
  visitors: number
  daily: { date: string; views: number; clicks: number }[]
  links: { id: string; label: string; clicks: number }[]
}

const count = (value: number) => Number(value).toLocaleString('ru-RU')
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
const PAGE_SIZE = 30

export function StatisticsPanel({ profileId }: { profileId: string }) {
  const [days, setDays] = useState(0)
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<Statistics | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    let active = true
    void Promise.resolve(supabase.rpc('get_profile_statistics', { p_days: days })).then(result => {
      if (!active) return
      if (result.error || !result.data || !Array.isArray(result.data.daily)) {
        setError('Не удалось загрузить статистику. Попробуйте обновить данные.')
      } else {
        setData(result.data as Statistics)
        setError('')
      }
      setBusy(false)
    }).catch(() => {
      if (active) { setError('Не удалось загрузить статистику.'); setBusy(false) }
    })
    return () => { active = false }
  }, [profileId, days, refresh])

  const update = () => { setBusy(true); setRefresh(value => value + 1) }
  const max = data?.daily.reduce((value, day) => Math.max(value, day.views, day.clicks), 1) ?? 1
  const pages = Math.max(1, Math.ceil((data?.daily.length ?? 0) / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  return <div className="editor-stack statistics" aria-busy={busy}>
    <section className="settings-card">
      <div className="statistics__toolbar">
        <label>Период<select aria-label="Период статистики" value={days} onChange={event => { setBusy(true); setData(null); setPage(0); setDays(Number(event.target.value)) }}>
          {[7, 30, 90, 180].map(value => <option key={value} value={value}>{value} дней</option>)}
          <option value={-1}>Год · 365/366 дней</option>
          <option value={0}>Всё время · с регистрации</option>
        </select></label>
        <button className="button button--secondary button--small" onClick={update} disabled={busy}><RefreshCw size={15} />Обновить</button>
      </div>
      <p className="statistics__note">За всё время показываются все собранные данные с регистрации. Ваши просмотры и переходы в предпросмотре не учитываются. Повтор в течение минуты считается один раз. Посетители считаются по сессиям браузера. Дни — по московскому времени.</p>
      {error && <div className="toast toast--error" role="alert">{error}</div>}
      {busy ? <p className="statistics__loading" role="status"><LoaderCircle className="spin" size={18} />Загружаем статистику…</p> : data && <>
        {data.from && data.to && <p className="statistics__note">{dateLabel(data.from)} — {dateLabel(data.to)}</p>}
        <div className="statistics__metrics">
          {[['Просмотры страницы', data.views], ['Посетители', data.visitors], ['Переходы по ссылкам', data.clicks]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{count(Number(value))}</strong></div>)}
        </div>
        {data.views === 0 && data.clicks === 0 && <p className="statistics__empty"><BarChart3 size={20} />Пока переходов нет. Поделитесь мастер-ссылкой — здесь появятся данные.</p>}
        <h2 className="statistics__heading">По дням</h2>
        <div className="statistics__table-wrap"><table className="statistics__table"><thead><tr><th>Дата</th><th>Просмотры</th><th>Переходы</th></tr></thead><tbody>
          {data.daily.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(day => <tr key={day.date}><th>{dateLabel(day.date)}</th><td><span className="statistics__bar" aria-hidden style={{ width: `${Number(day.views) / max * 100}%` }} /><span>{count(day.views)}</span></td><td>{count(day.clicks)}</td></tr>)}
        </tbody></table></div>
        {pages > 1 && <div className="statistics__pagination"><button className="button button--secondary button--small" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>Предыдущие</button><span>{currentPage + 1} / {pages}</span><button className="button button--secondary button--small" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pages - 1}>Следующие</button></div>}
      </>}
    </section>
    {!busy && data && <section className="settings-card"><h2 className="statistics__heading">Переходы по каждой ссылке</h2>
      {data.links.length ? <div className="statistics__table-wrap"><table className="statistics__table"><thead><tr><th>Ссылка</th><th>Переходы</th></tr></thead><tbody>{data.links.map(link => <tr key={link.id}><th>{link.label}</th><td>{count(link.clicks)}</td></tr>)}</tbody></table></div> : <p className="statistics__note">Добавьте и сохраните ссылки в редакторе.</p>}
    </section>}
  </div>
}
