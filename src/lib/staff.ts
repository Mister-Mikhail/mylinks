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
export interface StaffReport {
  id: string
  profile_id: string | null
  handle: string | null
  display_name: string | null
  link_id: string | null
  link_label: string | null
  link_url: string | null
  category: 'spam' | 'scam' | 'abuse' | 'adult' | 'copyright' | 'other'
  details: string
  reporter_email: string
  status: 'new' | 'reviewing' | 'resolved' | 'dismissed'
  created_at: string
  staff_note: string
}
export interface StaffReports { total: number; reports: StaffReport[] }
export interface TemporaryCredentials { login: string; password: string; handle: string; display_name: string; expires_after_logins: number; expires_after_days: number }
export interface StaffDetail {
  user: StaffUser | null
  profile: { display_name: string; handle: string; bio: string } | null
  links: ModeratedLink[]
}
export type StaffAction = UserRole | 'restrict_profile' | 'restore_profile' | 'restrict_link' | 'restore_link' | 'deactivate_account'
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
  restrict_link: 'Ссылка ограничена', restore_link: 'Ссылка восстановлена', deactivate_account: 'Аккаунт деактивирован',
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
export async function staffReports(page: number): Promise<StaffReports> {
  const { data, error } = await supabase.rpc('staff_reports', { page })
  if (error) throw error
  return data as StaffReports
}
export async function staffReviewReport(report_id: string, next_status: string, action: string, reason: string) {
  const { error } = await supabase.rpc('staff_review_report', { report_id, next_status, action, reason })
  if (error) throw error
}
export async function createTemporaryAccount(handle: string, display_name: string): Promise<TemporaryCredentials> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: { handle, display_name } })
  if (error) throw error
  if (!data?.login || !data?.password) throw new Error(data?.error || 'Не удалось создать временный аккаунт.')
  return data as TemporaryCredentials
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

export async function deactivateStaffAccount(target_id: string, reason: string) {
  const { data, error } = await supabase.functions.invoke('staff-deactivate-account', { body: { target_id, reason } })
  if (error) throw error
  if (!data?.deactivated) throw new Error(data?.error || 'Не удалось деактивировать аккаунт.')
}

export async function deleteStaffUser(target_id: string, expected_handle: string, reason: string) {
  const { data, error } = await supabase.functions.invoke('admin-delete-user', {
    body: { target_id, expected_handle, reason },
  })
  if (error) {
    const response = (error as { context?: Response }).context
    const details = response?.json ? await response.json().catch(() => null) as { error?: string } | null : null
    throw new Error(details?.error || error.message)
  }
  if (!data?.deleted) throw new Error(data?.error || 'Не удалось удалить пользователя.')
}
