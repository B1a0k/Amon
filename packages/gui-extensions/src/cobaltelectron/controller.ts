import { randomUUID } from "node:crypto"
import type WebSocket from "ws"
import { Agent } from "node:https"
import type { Connection, Output, Profile, Session } from "./contract"
import { frame, object, output, session, text } from "./protocol"
import { authenticate, endpoint, receive } from "./transport"
import { Match } from "effect"

export type Saved = { profile: Profile; secret: string }

type Runtime = {
  saved: Saved
  status: Connection["status"]
  error: string
  rows: Map<string, Session>
  logs: Output[]
  seen: Set<string>
  dropped: Map<string, number>
  bytes: number
  sequence: number
  revision: number
  logRevision: number
  received: number
  serverId: string
  clientInstanceId: string
  retry: number
  abort?: AbortController
  socket?: WebSocket
  agent?: Agent
  timer?: ReturnType<typeof setTimeout>
  heartbeat?: ReturnType<typeof setInterval>
  syncTimer?: ReturnType<typeof setTimeout>
}

type Lifetime = { closed: boolean; publish?: ReturnType<typeof setTimeout> }

/** Owns authentication and broadcast projection; all renderer operations are local/read-only. */
export function createAudit(input: {
  saved: readonly Saved[]
  persist: (profiles: Saved[]) => void
  secure: () => boolean
  encrypt: (password: string) => string
  decrypt: (secret: string) => string
  changed: () => void
}) {
  const connections = new Map<string, Runtime>()
  const state: Lifetime = { closed: false }

  const make = (saved: Saved): Runtime => ({
    saved,
    status: "disconnected",
    error: "",
    rows: new Map(),
    logs: [],
    seen: new Set(),
    dropped: new Map(),
    bytes: 0,
    sequence: 0,
    revision: 0,
    logRevision: 0,
    received: 0,
    serverId: "",
    clientInstanceId: randomUUID(),
    retry: 0,
  })

  input.saved.forEach((saved) => connections.set(saved.profile.id, make(saved)))

  const publish = () => {
    if (state.closed || state.publish) return
    // Coalesce batches without copying console history to every subscribed window.
    state.publish = setTimeout(() => {
      state.publish = undefined
      input.changed()
    }, 75)
  }

  const persist = () => input.persist([...connections.values()].map((item) => item.saved))

  const required = (id: string) => {
    const item = connections.get(id)

    if (!item || state.closed) throw new Error("missing")

    return item
  }

  const stop = (item: Runtime) => {
    item.abort?.abort()
    item.abort = undefined
    clearTimeout(item.timer)
    clearInterval(item.heartbeat)
    clearTimeout(item.syncTimer)
    item.socket?.terminate()
    item.socket = undefined
    item.agent?.destroy()
    item.agent = undefined
  }

  const syncProgress = (item: Runtime) => {
    clearTimeout(item.syncTimer)
    // A long initial replay may continue while progressing; heartbeat traffic cannot hide a stalled replay.
    item.syncTimer = setTimeout(() => {
      if (state.closed || item.status !== "syncing") return
      stop(item)
      item.status = "failed"
      item.error = "syncTimeout"
      publish()
    }, 120_000)
  }

  const append = (item: Runtime, entry: Omit<Output, "sequence">) => {
    const key = entry.when ? JSON.stringify([entry.session, entry.when, entry.type, entry.from, entry.text]) : ""

    if (key && item.seen.has(key)) return

    if (key) item.seen.add(key)
    item.logs.push({ ...entry, sequence: ++item.sequence })
    item.logRevision++
    item.bytes += Buffer.byteLength(entry.text)

    // Evict whole oldest entries, never shorten a credential or a line inside a retained output.
    while (item.logs.length > 1 && (item.logs.length > 10_000 || item.bytes > 32 * 1024 * 1024)) {
      const removed = item.logs.shift()

      if (!removed) break
      item.bytes -= Buffer.byteLength(removed.text)
      item.dropped.set(removed.session, (item.dropped.get(removed.session) ?? 0) + 1)

      if (removed.when)
        item.seen.delete(JSON.stringify([removed.session, removed.when, removed.type, removed.from, removed.text]))
    }
  }

  const project = (item: Runtime, payload: string) => {
    const message = frame(payload)

    if (!message) {
      stop(item)
      item.status = "failed"
      item.error = "protocol"
      publish()

      return
    }

    if (message.type === "error") {
      stop(item)
      item.status = "failed"
      item.error = message.errorCode === "USER_ALREADY_CONNECTED" ? "conflict" : "protocol"
      publish()

      return
    }

    item.received = Date.now()
    const data = object(message.data)

    if (message.type === "auth_success") item.status = "syncing"

    if (message.type === "sync_failed") {
      stop(item)
      item.status = "failed"
      item.error = "protocol"
      publish()

      return
    }

    if (message.type === "sync_complete") {
      clearTimeout(item.syncTimer)
      item.status = "connected"
      item.error = ""
      item.retry = 0
    }

    if (
      item.status === "syncing" &&
      (message.type === "auth_success" || message.type === "init" || message.type.startsWith("sync_"))
    )
      syncProgress(item)

    if (message.type === "init" && Array.isArray(data?.beacons)) {
      item.rows.clear()
      data.beacons.forEach((raw) => {
        const row = session(raw)

        if (row) item.rows.set(row.id, row)
      })
    }

    if (["beacon_initial", "beacon_checkin", "beacon_update"].includes(message.type)) {
      const id = text(data?.id)
      const row = session(message.data, item.rows.get(id))

      if (row) item.rows.set(row.id, row)
    }

    const updates = Match.value(message.type).pipe(
      Match.when("beacon_tick", () => data?.agents),
      Match.when("beacon_updates", () => data?.updates),
      Match.orElse(() => message.data),
    )

    if (["beacons_update", "beacon_updates", "beacon_tick"].includes(message.type) && Array.isArray(updates)) {
      updates.forEach((raw) => {
        const value = object(raw)
        const id = text(value?.id)
        const row = session(raw, item.rows.get(id))

        if (row) item.rows.set(row.id, row)
      })
    }

    if (message.type === "beacon_removed" && data?.id !== undefined) item.rows.delete(String(data.id))

    if (["beacon_exit", "agent_exit"].includes(message.type) && data) {
      const id = String(data.bid ?? data.id ?? "")
      const row = item.rows.get(id)

      if (row) item.rows.set(id, { ...row, alive: false, connected: false })
    }

    if (message.type === "sync_beacon_outputs" && data) {
      Object.entries(data).forEach(([id, entries]) => {
        if (!Array.isArray(entries)) return
        entries.forEach((raw) => {
          const entry = output(raw, id)

          if (entry) append(item, entry)
        })
      })
    }

    if (["beacon_output", "beacon_async_bof_output"].includes(message.type)) {
      const entry = output(message.data)

      if (entry) append(item, entry)
    }

    // Unknown broadcast categories are deliberately not interpreted as command or UI instructions.
    item.revision++
    publish()
  }

  const start = async (item: Runtime, password: string, retry = false): Promise<void> => {
    stop(item)
    const abort = new AbortController()
    item.abort = abort
    item.status = retry ? "reconnecting" : "connecting"
    item.error = ""
    publish()
    const valid = () => !state.closed && !abort.signal.aborted && item.abort === abort

    const failed = (error: string, reconnect: boolean) => {
      if (!valid()) return
      clearInterval(item.heartbeat)
      clearTimeout(item.syncTimer)
      item.status = reconnect ? "reconnecting" : "failed"
      item.error = error
      publish()

      if (!reconnect) return
      item.timer = setTimeout(
        () => {
          if (valid()) void start(item, password, true)
        },
        Math.min(30_000, 1000 * 2 ** Math.min(item.retry++, 5)),
      )
    }

    await Promise.resolve()
      .then(() => {
        if (!password) throw new Error("password")
        // Match CE's TeamServer policy on this connection only; HTTPS and WSS share the scoped agent.
        item.agent = new Agent({ rejectUnauthorized: false })

        return authenticate(item.saved.profile, password, item.clientInstanceId, abort.signal, item.agent)
      })
      .then((login) => {
        if (!valid()) return

        if (item.serverId && item.serverId !== login.serverId) {
          item.rows.clear()
          item.logs = []
          item.seen.clear()
          item.dropped.clear()
          item.bytes = 0
          item.logRevision++
        }

        item.serverId = login.serverId
        const socket = receive(login.url, item.agent!)
        item.socket = socket
        socket.on("open", () => {
          if (!valid()) return
          item.status = "syncing"
          syncProgress(item)
          // Exactly one outbound business envelope is permitted: the existing lease heartbeat.
          item.heartbeat = setInterval(() => {
            if (valid() && socket.readyState === 1)
              socket.send(JSON.stringify({ type: "ping", data: { t: Date.now() } }))
          }, 15_000)
          publish()
        })
        socket.on("message", (data, binary) => {
          if (valid() && !binary) project(item, data.toString())
        })
        socket.on("error", () => {
          if (valid()) item.error = "connection"
        })
        socket.on("close", (code) =>
          failed(code === 4409 ? "conflict" : "connection", code !== 4409 && code !== 1008 && code !== 4401),
        )
      })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : "connection"

        const terminal = [
          "authentication",
          "conflict",
          "limited",
          "password",
          "protocol",
          "endpoint",
          "certificate",
        ].includes(message)

        const tls = cause instanceof Error && /CERT|certificate|self.signed|hostname/i.test(cause.message)
        failed(tls ? "certificate" : terminal ? message : "connection", retry && !terminal && !tls)
      })
  }

  return {
    state: () => ({
      secureStorage: input.secure(),
      connections: [...connections.values()].map(
        (item): Connection => ({
          profile: item.saved.profile,
          status: item.status,
          error: item.error,
          savedPassword: !!item.saved.secret,
          sessions: [...item.rows.values()],
          revision: item.revision,
          logRevision: item.logRevision,
          received: item.received,
          serverId: item.serverId,
        }),
      ),
    }),
    save: (value: { profile: Profile; password: string; remember: boolean }) => {
      endpoint(value.profile.url)

      if (!value.profile.id || !value.profile.name.trim() || !value.profile.user.trim()) throw new Error("input")

      if (value.remember && !input.secure()) throw new Error("storage")
      const previous = connections.get(value.profile.id)

      const secret = value.remember
        ? value.password
          ? input.encrypt(value.password)
          : (previous?.saved.secret ?? "")
        : ""

      if (previous) stop(previous)

      const current =
        previous &&
        previous.saved.profile.url === value.profile.url &&
        previous.saved.profile.user === value.profile.user
          ? previous
          : make({ profile: value.profile, secret })

      current.saved = { profile: value.profile, secret }
      current.status = "disconnected"
      current.error = ""
      connections.set(value.profile.id, current)
      persist()
      publish()
    },
    connect: async (value: { id: string; password?: string }) => {
      const item = required(value.id)

      await start(item, value.password || (item.saved.secret ? input.decrypt(item.saved.secret) : ""))

      if (item.status === "failed") throw new Error(item.error || "connection")
    },
    disconnect: (id: string) => {
      const item = required(id)
      stop(item)
      item.status = "disconnected"
      item.error = ""
      publish()
    },
    remove: (id: string) => {
      stop(required(id))
      connections.delete(id)
      persist()
      publish()
    },
    outputs: (value: { id: string; session: string; before?: number }) => {
      const item = required(value.id)

      const entries = item.logs.filter(
        (entry) => entry.session === value.session && (value.before === undefined || entry.sequence < value.before),
      )

      return { entries: entries.slice(-500), more: entries.length > 500, dropped: item.dropped.get(value.session) ?? 0 }
    },
    close: () => {
      state.closed = true
      clearTimeout(state.publish)
      connections.forEach(stop)
    },
  }
}
