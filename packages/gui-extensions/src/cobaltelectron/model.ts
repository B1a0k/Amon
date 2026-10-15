import type { SetupContext, MountedSession } from "../sdk"
import type definition from "./index"

/** One project-directory choice on its OpenCode server, independent of conversation view state. */
export function binding(ctx: SetupContext<typeof definition>, session: MountedSession) {
  const live = ctx.uses.projects()

  if (live.status !== "active") throw new Error("unavailable")

  return live.value.binding(session)
}

/** Reads the native IPC generation; unavailable is a visible state, not a fallback connection. */
export function client(ctx: SetupContext<typeof definition>) {
  const live = ctx.uses.audit()

  return live.status === "active" ? live.value : undefined
}

export function errorKey(cause: unknown) {
  const code = cause instanceof Error ? cause.message : "connection"

  return [
    "connection",
    "authentication",
    "conflict",
    "limited",
    "password",
    "protocol",
    "syncTimeout",
    "endpoint",
    "certificate",
    "storage",
    "input",
    "missing",
  ].includes(code)
    ? `error.${code}`
    : "error.connection"
}
