import { registerCustomTheme } from "@pierre/diffs"
import { AmonTheme } from "./marked-theme"

let registered = false

export function registerAmonTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("Amon", () => Promise.resolve(AmonTheme))
}
