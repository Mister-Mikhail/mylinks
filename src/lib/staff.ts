import { supabase } from './supabase'

export type StaffRole = 'admin' | 'moderator'
export type UserRole = StaffRole | 'user'
export type UserFilter = 'all' | 'new' | 'restricted' | 'staff'
export interface StaffUser {
  id: string
  email: string | null
  handle: string | null
  display_name: string | null
  bio: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  is_published: boolean
  role: UserRole
  restriction_reason: string | null
  link_count: number
}
export interface StaffUsers {
  total: number
  users: StaffUser[]
  stats: { total: number; today: number; week: number; restricted: number }
}
export interface ModeratedLink {
  id: string
  label: string
  url: string
  is_visible: boolean
  restriction_reason: string | null
}
export interface StaffDetail {
  user: StaffUser | null
  profile: { display_name: string; handle: string; bio: string } | null
  links: ModeratedLink[]
}
export type StaffAction = UserRole | 'restrict_profile' | 'restore_profile' | 'restrict_link' | 'restore_link'
export interface StaffEvent {
  id: number
  actor_handle: string | null
  actor_id: string | null
  target_id: string
  target_profile_id: string | null
  target_handle: string | null
  target_link_label: string | null
  action: StaffAction
  reason: string
  created_at: string
}
export const actionLabels: Record<StaffAction, string> = {
  admin: 'Назначен администратор', moderator: 'Назначен модератор', user: 'Снята роль сотрудника',
  restrict_profile: 'Публикация профиля ограничена', restore_profile: 'Публикация профиля восстановлена',
  restrict_link: 'Ссылка ограничена', restore_link: 'Ссылка восстановлена',
}
export const roleLabels: Record<UserRole, string> = { admin: 'Администратор', moderator: 'Модератор', user: 'Пользователь' }
export async function staffRole(): Promise<StaffRole | null> {
  const { data, error } = await supabase.rpc('staff_role')
  if (error) throw error
  return data === 'admin' || data === 'moderator' ? data : null
}
export async function staffUsers(q: string, state: UserFilter, page: number): Promise<StaffUsers> {
  const { data, error } = await supabase.rpc('staff_users', { q, state, page })
  if (error) throw error
  return data as StaffUsers
}
export async function staffDetail(target: string): Promise<StaffDetail> {
  const { data, error } = await supabase.rpc('staff_detail', { target })
  if (error) throw error
  return data as StaffDetail
}
export async function staffHistory(page: number): Promise<{ total: number; events: StaffEvent[] }> {
  const { data, error } = await supabase.rpc('staff_history', { page })
  if (error) throw error
  return data
}
export async function staffChange(target: string, action: StaffAction, reason: string) {
  const { error } = await supabase.rpc('staff_change', { target, action, reason })
  if (error) throw error
}
export function staffError(error: unknown): string {
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message
  if (message?.includes('Staff access required') || message?.includes('Admin access required')) return 'Недостаточно прав. Обновите страницу или войдите в другой аккаунт.'
  return message || 'Не удалось загрузить данные. Попробуйте ещё раз.'
}
