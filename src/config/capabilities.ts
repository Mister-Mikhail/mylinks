export interface Capabilities {
  maxLinks: number
  customBackgrounds: boolean
  advancedAnalytics: boolean
  removeBranding: boolean
}

export const FREE_CAPABILITIES: Capabilities = {
  maxLinks: 20,
  customBackgrounds: false,
  advancedAnalytics: false,
  removeBranding: false,
}

// A payment provider can map plans to capabilities later without changing UI flows.
export const capabilitiesForTier = (tierKey = 'free'): Capabilities => {
  if (tierKey === 'free') return FREE_CAPABILITIES
  return FREE_CAPABILITIES
}
