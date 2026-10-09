/** A random browser-session id; no IP address, contact data or fingerprint is stored. */
let volatileVisitor = ''
const sent = new Map<string, number>()
const visitorId = () => {
  try {
    const saved = sessionStorage.getItem('mylinks:visitor')
    if (saved) return saved
    const id = crypto.randomUUID()
    sessionStorage.setItem('mylinks:visitor', id)
    return id
  } catch {
    volatileVisitor ||= crypto.randomUUID()
    return volatileVisitor
  }
}

export function recordProfileEvent(profileId: string, linkId: string | null = null) {
  if (/bot|crawler|spider|preview/i.test(navigator.userAgent)) return
  const key = `${profileId}:${linkId ?? 'view'}`
  const now = Date.now()
  // Avoid duplicate effects and double taps; the database also deduplicates each minute.
  if (now - (sent.get(key) ?? 0) < 60_000) return
  sent.set(key, now)
  void fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/record_profile_event`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_profile_id: profileId, p_link_id: linkId, p_visitor_id: visitorId() }),
  }).catch(() => { sent.delete(key) })
}
