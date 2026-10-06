/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    const copied = document.execCommand('copy')
    input.remove()
    return copied
  }
}

export const profileUrl = (handle: string) => `${window.location.origin}/${handle}`
