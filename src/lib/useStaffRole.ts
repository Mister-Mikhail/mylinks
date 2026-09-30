import { useEffect, useState } from 'react'
import { staffError, staffRole, type StaffRole } from './staff'

export function useStaffRole(userId: string | undefined) {
  const [state, setState] = useState<{ userId: string | undefined; role: StaffRole | null; loading: boolean; error: string }>({ userId, role: null, loading: Boolean(userId), error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async () => {
      try {
        const role = await staffRole()
        if (!cancelled) setState({ userId, role, loading: false, error: '' })
      } catch (error) {
        if (!cancelled) setState({ userId, role: null, loading: false, error: staffError(error) })
      }
    }
    void load()
    window.addEventListener('focus', load)
    return () => { cancelled = true; window.removeEventListener('focus', load) }
  }, [userId, retry])
  if (!userId) return { role: null, loading: false, error: '', retry: () => setRetry(n => n + 1) }
  if (state.userId !== userId) return { role: null, loading: true, error: '', retry: () => setRetry(n => n + 1) }
  return { ...state, retry: () => setRetry(n => n + 1) }
}
