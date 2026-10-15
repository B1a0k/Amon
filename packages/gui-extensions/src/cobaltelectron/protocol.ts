import { Option, Schema } from "effect"
import type { Output, Session } from "./contract"

// SAFETY: these are CE wire parsers; each unknown input is decoded by a schema before field access or conversion.
// oxlint-disable anti-slop/no-unknown-parameters

const ObjectData = Schema.Record(Schema.String, Schema.Unknown)

const Frame = Schema.Struct({
  type: Schema.String,
  event: Schema.optional(Schema.String),
  data: Schema.optional(Schema.Unknown),
  errorCode: Schema.optional(Schema.String),
})

/** Validates untrusted wire JSON once, before the controller handles known event kinds. */
export function frame(text: string) {
  const message = Schema.decodeUnknownOption(Schema.fromJsonString(Frame))(text).pipe(Option.getOrUndefined)

  if (!message) return

  // TeamServer's send and broadcast both wrap event names separately from the envelope type.
  if (message.type !== "event") return message

  if (!message.event) return

  return { ...message, type: message.event }
}

/** Narrows a wire object without assuming the schema of unrelated broadcast payloads. */
export function object(input: unknown) {
  return Schema.decodeUnknownOption(ObjectData)(input).pipe(Option.getOrUndefined)
}

export const text = (input: unknown) =>
  Schema.decodeUnknownOption(Schema.Union([Schema.String, Schema.Number]))(input).pipe(
    Option.map(String),
    Option.getOrElse(() => ""),
  )

const number = (input: unknown) => {
  const value = Number(text(input))

  return Number.isFinite(value) ? value : 0
}

const boolean = (input: unknown) => Option.isSome(Schema.decodeUnknownOption(Schema.Literals([true, "true"]))(input))

/** Applies only supplied fields; a check-in cannot erase metadata omitted by the server. */
export function session(input: unknown, previous?: Session): Session | undefined {
  const data = object(input)

  if (!data || !text(data.id)) return

  const blank: Session = {
    id: text(data.id),
    type: "",
    external: "",
    internal: "",
    location: "",
    listener: "",
    user: "",
    computer: "",
    note: "",
    process: "",
    pid: "",
    arch: "",
    os: "",
    lastf: "",
    sleep: 0,
    jitter: 0,
    diff: 0,
    alive: true,
    admin: false,
    longConnection: false,
    connected: false,
    sleepMode: "",
    sleepDisplay: "",
    parentId: "",
    routeDepth: 0,
    routeState: "",
    state: "",
  }

  const result = { ...(previous ?? blank) }

  ;(
    [
      "type",
      "external",
      "internal",
      "location",
      "listener",
      "user",
      "computer",
      "note",
      "process",
      "pid",
      "os",
      "lastf",
      "sleepMode",
      "sleepDisplay",
      "routeState",
      "state",
    ] as const
  ).forEach((key) => {
    if (data[key] !== undefined) result[key] = text(data[key])
  })
  ;(["sleep", "jitter", "diff", "routeDepth"] as const).forEach((key) => {
    if (data[key] !== undefined) result[key] = number(data[key])
  })
  ;(["alive", "longConnection", "connected"] as const).forEach((key) => {
    if (data[key] !== undefined) result[key] = boolean(data[key])
  })

  if (data.barch !== undefined || data.arch !== undefined) result.arch = text(data.barch ?? data.arch)

  if (data.isAdmin !== undefined || data.is_admin !== undefined) result.admin = boolean(data.isAdmin ?? data.is_admin)

  if (data.parentId !== undefined || data.pbid !== undefined) result.parentId = text(data.parentId ?? data.pbid)

  return result
}

/** Keeps the server's original output text, author and timestamp. */
export function output(input: unknown, id?: string): Omit<Output, "sequence"> | undefined {
  const data = object(input)

  if (!data) return
  const session = id ?? text(data.bid ?? data.id)
  const value = Schema.decodeUnknownOption(Schema.String)(data.output).pipe(Option.getOrUndefined)

  if (!session || value === undefined) return

  return { session, type: text(data.type), text: value, from: text(data.from), when: number(data.when) }
}

/** CE's presentation rules, including millisecond sleep intervals and persistent sessions. */
export function timedOut(item: Session) {
  if (!item.alive) return false

  if (item.longConnection) return !item.connected

  return item.diff > (item.sleep > 0 ? item.sleep : 60_000) * (1 + item.jitter / 100) * 3
}

export const columns = [
  "external",
  "internal",
  "location",
  "listener",
  "user",
  "computer",
  "note",
  "process",
  "pid",
  "arch",
  "os",
  "last",
  "sleep",
] as const

export type Column = (typeof columns)[number]

export function cell(
  item: Session,
  column: Column,
  t: (key: "interactive" | "jitter" | "status.connected" | "status.disconnected") => string,
): string {
  if (column === "last") return item.longConnection && item.connected ? "-" : item.lastf

  if (column === "sleep") {
    if (item.longConnection) {
      const state = item.sleepDisplay || (item.alive ? "connected" : "disconnected")

      if (state === "connected" || state === "disconnected") return t(`status.${state}`)

      return state
    }

    if (item.sleepMode === "interactive") return t("interactive")

    return item.sleep ? `${Math.round(item.sleep / 1000)}s${item.jitter ? ` (${item.jitter}${t("jitter")})` : ""}` : ""
  }

  if (column === "external" && item.type === "gopher" && (item.parentId || item.routeDepth > 0) && item.external) {
    const broken = item.routeState === "unreachable" || item.state === "broken" || !item.connected

    if (item.external.includes("⚯")) return broken ? item.external.replace("⚯⚯", "⚯ ⚯") : item.external

    return `${item.external}${broken ? " ⚯ ⚯" : " ⚯⚯"}`
  }

  if (column === "os") {
    const os = item.os.toLowerCase()

    if (os.includes("linux")) return "Linux"

    if (os.includes("darwin") || os.includes("macos")) return "macOS"

    if (os.includes("windows") || (item.type !== "gopher" && item.os)) return "Windows"

    if (os.includes("freebsd")) return "FreeBSD"

    if (os.includes("openbsd")) return "OpenBSD"

    return item.os
  }

  return item[column]
}
