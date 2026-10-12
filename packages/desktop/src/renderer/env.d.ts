import type { ElectronNative } from "../preload/types"

declare global {
  interface ImportMetaEnv {
    readonly AMON_TEST_ONBOARDING: boolean
  }

  interface Window {
    electron: ElectronNative
    __AMON__?: {
      deepLinks?: string[]
    }
  }
}
