import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Selection = { value: string; latitude: number; longitude: number }
type Result = { lat: string; lon: string; display_name: string }
const searchCache = new Map<string, Result[]>()
export default function AddressPicker({ value, latitude, longitude, onSelect }: {
  value: string; latitude?: number | null; longitude?: number | null; onSelect: (selection: Selection) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.CircleMarker | null>(null)
  const callback = useRef(onSelect)
  const lastRequest = useRef(0)
  const request = useRef<AbortController | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { callback.current = onSelect }, [onSelect])
  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([55.75, 37.62], 10)
    map.current = instance
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance)
    tiles.on('tileerror', () => setError('Карта не загрузилась. Можно ввести адрес вручную или повторить позже.'))
    instance.on('click', (event: L.LeafletMouseEvent) => {
      const latitude = Number(event.latlng.lat.toFixed(6)), longitude = Number(event.latlng.wrap().lng.toFixed(6))
      if (Math.abs(latitude) <= 90) callback.current({ latitude, longitude, value: `${latitude}, ${longitude}` })
    })
    return () => { request.current?.abort(); instance.remove(); map.current = null; marker.current = null }
  }, [])
  useEffect(() => {
    if (!map.current) return
    if (latitude == null || longitude == null) { marker.current?.remove(); marker.current = null; return }
    const point: L.LatLngExpression = [latitude, longitude]
    if (marker.current) marker.current.setLatLng(point)
    else marker.current = L.circleMarker(point, { radius: 9, weight: 3, color: '#fff', fillColor: '#145acb', fillOpacity: 1 }).addTo(map.current)
    map.current.setView(point, Math.max(15, map.current.getZoom()))
  }, [latitude, longitude])
  const search = async () => {
    if (value.trim().length < 3 || busy || Date.now() - lastRequest.current < 1100) return
    lastRequest.current = Date.now(); setBusy(true); setError(''); setResults([])
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    try {
      const query = value.trim()
      const cached = searchCache.get(query)
      if (cached) { setResults(cached); return }
      // Search is explicit, never sent on each keystroke.
      const response = await fetch(`https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(query)}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Поиск адреса недоступен. Выберите точку на карте или введите адрес вручную.')
      const body = await response.json() as { features: { geometry: { coordinates: number[] }; properties: Record<string, string> }[] }
      const found = body.features.map(({ geometry, properties }) => ({ lat: String(geometry.coordinates[1]), lon: String(geometry.coordinates[0]), display_name: [...new Set([properties.name, properties.street, properties.housenumber, properties.city, properties.state, properties.country].filter(Boolean))].join(', ') })).filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
      if (searchCache.size >= 30) searchCache.clear()
      searchCache.set(query, found)
      setResults(found)
      if (!found.length) setError('Адрес не найден. Уточните город и улицу или выберите точку на карте.')
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Не удалось найти адрес.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <div className="address-picker">
    <button type="button" className="onboarding-add" disabled={busy || value.trim().length < 3} onClick={() => void search()}>{busy ? 'Ищем…' : 'Найти адрес на карте'}</button>
    {results.length > 0 && <ul className="address-results">{results.map(result => <li key={`${result.lat},${result.lon}`}><button type="button" onClick={() => { onSelect({ value: result.display_name.slice(0, 500), latitude: Number(result.lat), longitude: Number(result.lon) }); setResults([]) }}>{result.display_name}</button></li>)}</ul>}
    <div ref={container} className="address-map" aria-label="Выбор адреса на карте" />
    <button type="button" className="onboarding-add" onClick={() => { const point = map.current?.getCenter(); if (point) onSelect({ value: `${point.lat.toFixed(6)}, ${point.wrap().lng.toFixed(6)}`, latitude: Number(point.lat.toFixed(6)), longitude: Number(point.wrap().lng.toFixed(6)) }) }}>Выбрать центр карты</button>
    <small>Нажмите на карту, чтобы поставить точку. Карту можно двигать стрелками и масштабировать кнопками + и −.</small>
    {latitude != null && longitude != null && <small className="field-hint--valid">Точка выбрана: {latitude.toFixed(5)}, {longitude.toFixed(5)}</small>}
    {error && <small role="status" className="field-hint--error">{error}</small>}
  </div>
}
