import { useAppStore } from './appStore'

export async function setKioskMode(on: boolean) {
  const { setConfig, setView } = useAppStore.getState()
  setConfig({ kioskMode: on })
  if (on) setView('gallery')
  window.electronAPI?.setFullscreen(on)
  try {
    const existing = await window.electronAPI.readConfig()
    await window.electronAPI.writeConfig({ ...existing, kioskMode: on })
  } catch {
    // ignore persist errors
  }
}
