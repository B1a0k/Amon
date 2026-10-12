import path from "node:path"
import { AMON_CHANNEL } from "./version"

export function databasePath(data: string) {
  const filename =
    process.env.AMON_DB ??
    (["latest", "dev", "beta", "next", "prod"].includes(AMON_CHANNEL) ||
    process.env.AMON_DISABLE_CHANNEL_DB === "1" ||
    process.env.AMON_DISABLE_CHANNEL_DB === "true"
      ? "amon.db"
      : `amon-${AMON_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
