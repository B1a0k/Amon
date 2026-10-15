import { Schema } from "effect"
import { Contract, Ipc, type MountedSession, type Persisted } from "../sdk"

export const Selection = Schema.Struct({ id: Schema.String })

/** One shared native storage handle per project, so independent UI surfaces observe the same selection. */
export const Projects = Contract.define<
  {
    /** Opens the project-directory selection on its OpenCode server; never stores the session object. */
    binding(session: MountedSession): Persisted<typeof Selection.Type>
  },
  "cobaltelectron.projects"
>("cobaltelectron.projects")

export const Profile = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  url: Schema.String,
  user: Schema.String,
  // Retained for existing saved profiles and older desktop providers; current connections do not use it.
  certificate: Schema.String,
})

export type Profile = typeof Profile.Type

export const Session = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  external: Schema.String,
  internal: Schema.String,
  location: Schema.String,
  listener: Schema.String,
  user: Schema.String,
  computer: Schema.String,
  note: Schema.String,
  process: Schema.String,
  pid: Schema.String,
  arch: Schema.String,
  os: Schema.String,
  lastf: Schema.String,
  sleep: Schema.Number,
  jitter: Schema.Number,
  diff: Schema.Number,
  alive: Schema.Boolean,
  admin: Schema.Boolean,
  longConnection: Schema.Boolean,
  connected: Schema.Boolean,
  sleepMode: Schema.String,
  sleepDisplay: Schema.String,
  parentId: Schema.String,
  routeDepth: Schema.Number,
  routeState: Schema.String,
  state: Schema.String,
})

export type Session = typeof Session.Type

export const Output = Schema.Struct({
  sequence: Schema.Number,
  session: Schema.String,
  type: Schema.String,
  text: Schema.String,
  from: Schema.String,
  when: Schema.Number,
})

export type Output = typeof Output.Type

export const Connection = Schema.Struct({
  profile: Profile,
  status: Schema.Literals(["disconnected", "connecting", "syncing", "connected", "reconnecting", "failed"]),
  error: Schema.String,
  savedPassword: Schema.Boolean,
  sessions: Schema.Array(Session),
  revision: Schema.Number,
  // Desktop providers built before output revisions were split still publish only `revision`.
  logRevision: Schema.optional(Schema.Number),
  received: Schema.Number,
  serverId: Schema.String,
})

export type Connection = typeof Connection.Type

const Id = Schema.Struct({ id: Schema.String })

/** Desktop-owned, receive-only TeamServer audit connection. No arbitrary network send or task method exists. */
export const Audit = Ipc.define({
  id: "cobaltelectron.audit",
  state: Schema.Struct({ connections: Schema.Array(Connection), secureStorage: Schema.Boolean }),
  methods: {
    /** Saves metadata and optionally an OS-encrypted password; an empty password keeps an existing saved secret. */
    save: { input: Schema.Struct({ profile: Profile, password: Schema.String, remember: Schema.Boolean }) },
    /** Authenticates and receives the server's automatic snapshots and broadcasts. */
    connect: { input: Schema.Struct({ id: Schema.String, password: Schema.optional(Schema.String) }) },
    /** Cancels the connection and reconnect timer, preserving the local audit buffer. */
    disconnect: { input: Id },
    /** Disconnects and removes the profile, secret and local audit buffer. */
    remove: { input: Id },
    /** Reads retained local outputs for one connection and session; never sends a server request. */
    outputs: {
      input: Schema.Struct({ id: Schema.String, session: Schema.String, before: Schema.optional(Schema.Number) }),
      output: Schema.Struct({ entries: Schema.Array(Output), more: Schema.Boolean, dropped: Schema.Number }),
    },
  },
})
