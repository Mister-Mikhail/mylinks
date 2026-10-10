import { useCallback, useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { deactivateStaffAccount, staffError, staffReports, staffReviewReport, type StaffReport } from '../lib/staff'
import './admin.css'

const formatDate = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(value))
const categoryLabels: Record<StaffReport['category'], string> = {
  spam: 'Спам или обман', scam: 'Мошенничество', abuse: 'Оскорбления или угрозы',
  adult: 'Недопустимый контент', copyright: 'Авторские права', other: 'Другое',
}

export function ReportsPanel() {
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ total: number; reports: StaffReport[] } | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await staffReports(page)) } catch (caught) { setError(staffError(caught)) }
    finally { setLoading(false) }
  }, [page])
  useEffect(() => { void load() }, [load])

  const review = async (report: StaffReport, status: string, action: string) => {
    const reason = (reasons[report.id] || '').trim()
    if (reason.length < 3) { setError('Добавьте краткую причину решения (не менее 3 символов).'); return }
    setBusyId(report.id); setError(''); setNotice('')
    try {
      if (action === 'deactivate_account' && report.profile_id) {
        await deactivateStaffAccount(report.profile_id, reason)
        await staffReviewReport(report.id, 'resolved', 'none', reason)
      } else {
        await staffReviewReport(report.id, status, action, reason)
      }
      setNotice('Решение сохранено в журнале действий.')
      await load()
    } catch (caught) { setError(staffError(caught)) }
    finally { setBusyId('') }
  }

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / 25))
  return <section className="staff-reports">
    <div className="staff-reports__top"><p>Поступило жалоб: <strong>{data?.total ?? '—'}</strong></p><button className="button button--secondary button--small" disabled={loading} onClick={() => void load()}>{loading ? 'Обновляем…' : 'Обновить'}</button></div>
    {error && <div className="staff-error" role="alert">{error}</div>}
    {notice && <div className="staff-notice" role="status"><Check size={17} />{notice}</div>}
    {loading && !data && <div className="staff-empty"><LoaderCircle className="spin" />Загружаем жалобы…</div>}
    {data?.reports.length === 0 && <div className="staff-empty">Жалоб пока нет.</div>}
    {data?.reports.map(report => <article className="staff-report-card" key={report.id}>
      <header><div><span className={'staff-pill ' + (report.status === 'new' ? 'staff-pill--warn' : '')}>{report.status === 'new' ? 'Новая' : report.status === 'reviewing' ? 'На проверке' : report.status === 'resolved' ? 'Решена' : 'Отклонена'}</span><strong>{categoryLabels[report.category]}</strong></div><time>{formatDate(report.created_at)}</time></header>
      <p className="staff-report-target">{report.display_name || 'Пользователь'} · {report.handle && report.profile_id ? <Link to={'/admin/users/' + report.profile_id}>@{report.handle}</Link> : 'страница удалена'}{report.link_label && <span> · ссылка: {report.link_label}</span>}</p>
      {report.details && <p className="staff-report-details">{report.details}</p>}
      <p className="staff-report-contact">Для связи: <a href={'mailto:' + report.reporter_email}>{report.reporter_email}</a></p>
      {report.profile_id && <Link className="staff-muted-link" to={'/admin/users/' + report.profile_id}>Открыть карточку пользователя и все ссылки</Link>}
      {report.staff_note && <p className="staff-report-note">Решение: {report.staff_note}</p>}
      {report.status !== 'resolved' && report.status !== 'dismissed' && <div className="staff-report-actions">
        <label>Причина решения<textarea value={reasons[report.id] || ''} onChange={event => setReasons(current => ({ ...current, [report.id]: event.target.value }))} maxLength={1000} placeholder="Кратко зафиксируйте, что проверили" /></label>
        <div>
          <button className="button button--secondary button--small" disabled={Boolean(busyId) || loading} onClick={() => void review(report,'reviewing','none')}>В работу</button>
          <button className="button button--secondary button--small" disabled={Boolean(busyId) || loading} onClick={() => void review(report,'dismissed','none')}>Отклонить</button>
          <button className="button button--secondary button--small" disabled={Boolean(busyId) || loading} onClick={() => void review(report,'resolved','warn')}>Предупредить</button>
          <button className="button button--secondary button--small" disabled={Boolean(busyId) || loading} onClick={() => void review(report,'resolved','restrict_profile')}>Ограничить страницу</button>
          {report.profile_id && <button className="button button--secondary button--small" disabled={Boolean(busyId) || loading} onClick={() => void review(report,'resolved','deactivate_account')}>Деактивировать аккаунт</button>}
          {report.link_id && <button className="button button--secondary button--small" disabled={Boolean(busyId) || loading} onClick={() => void review(report,'resolved','restrict_link')}>Ограничить ссылку</button>}
          {report.link_id && <button className="button button--secondary button--small" disabled={Boolean(busyId) || loading} onClick={() => void review(report,'resolved','remove_link')}>Удалить ссылку и предупредить</button>}
        </div>
        {busyId === report.id && <small>Сохраняем решение…</small>}
      </div>}
    </article>)}
    {data && <footer className="staff-pagination"><span>{data.total ? 'Страница ' + (page + 1) + ' из ' + totalPages : '0 записей'}</span><div><button className="button button--secondary button--small" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Назад</button><button className="button button--secondary button--small" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Далее</button></div></footer>}
  </section>
}
