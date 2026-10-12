import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.AMON_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.AMON_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "Amon Dev",
  beta: "Amon Beta",
  prod: "Amon",
}

const appIDs: Record<string, string> = {
  dev: "ai.amon.desktop.dev",
  beta: "ai.amon.desktop.beta",
  prod: "ai.amon.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "Amon Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "ai.amon.desktop.dev"
