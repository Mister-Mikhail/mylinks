import { useEffect, useRef, type ReactNode } from 'react'

export function Modal({ children, titleId, onClose, busy = false, className = 'profile-dialog' }: { children: ReactNode; titleId: string; onClose: () => void; busy?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.showModal()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return <dialog ref={dialog} className={className} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>{children}</dialog>
}
