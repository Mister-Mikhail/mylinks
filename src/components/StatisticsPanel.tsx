import { useEffect, useState } from 'react'
import { BarChart3, LoaderCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Statistics {
  views: number
  clicks: number
  visitors: number
  daily: { date: string; views: number; clicks: number }[]
  links: { id: string; label: string; clicks: number }[]
}

const count = (value: number) => Number(value).toLocaleString('ru-RU')

export function StatisticsPanel({ profileId }: { profileId: string }) {
  const [days, setDays] = useState(30)
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
  const max = Math.max(1, ...(data?.daily.map(day => Math.max(day.views, day.clicks)) ?? []))
  return <div className="editor-stack statistics" aria-busy={busy}>
    <section className="settings-card">
      <div className="statistics__toolbar">
        <label>Период<select aria-label="Период статистики" value={days} onChange={event => { setBusy(true); setData(null); setDays(Number(event.target.value)) }}>
          {[7, 30, 90].map(value => <option key={value} value={value}>{value} дней</option>)}
        </select></label>
        <button className="button button--secondary button--small" onClick={update} disabled={busy}><RefreshCw size={15} />Обновить</button>
      </div>
      <p className="statistics__note">Счётчики работают с момента запуска статистики. Ваши просмотры из редактора и переходы в предпросмотре не учитываются. Повтор в течение минуты считается один раз. Посетители считаются по сессиям браузера. Дни — по московскому времени.</p>
      {error && <div className="toast toast--error" role="alert">{error}</div>}
      {busy ? <p className="statistics__loading" role="status"><LoaderCircle className="spin" size={18} />Загружаем статистику…</p> : data && <>
        <div className="statistics__metrics">
          {[['Просмотры страницы', data.views], ['Посетители', data.visitors], ['Переходы по ссылкам', data.clicks]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{count(Number(value))}</strong></div>)}
        </div>
        {data.views === 0 && data.clicks === 0 && <p className="statistics__empty"><BarChart3 size={20} />Пока переходов нет. Поделитесь мастер-ссылкой — здесь появятся данные.</p>}
        <h2 className="statistics__heading">По дням</h2>
        <div className="statistics__table-wrap"><table className="statistics__table"><thead><tr><th>Дата</th><th>Просмотры</th><th>Переходы</th></tr></thead><tbody>
          {data.daily.map(day => <tr key={day.date}><th>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</th><td><span className="statistics__bar" aria-hidden style={{ width: `${Number(day.views) / max * 100}%` }} /><span>{count(day.views)}</span></td><td>{count(day.clicks)}</td></tr>)}
        </tbody></table></div>
      </>}
    </section>
    {!busy && data && <section className="settings-card"><h2 className="statistics__heading">Переходы по каждой ссылке</h2>
      {data.links.length ? <div className="statistics__table-wrap"><table className="statistics__table"><thead><tr><th>Ссылка</th><th>Переходы</th></tr></thead><tbody>{data.links.map(link => <tr key={link.id}><th>{link.label}</th><td>{count(link.clicks)}</td></tr>)}</tbody></table></div> : <p className="statistics__note">Добавьте и сохраните ссылки в редакторе.</p>}
    </section>}
  </div>
}
