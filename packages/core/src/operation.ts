export * as Operation from "./operation.js"

import { Operation } from "@opencode/schema/operation"
import { optional } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionEvent } from "@opencode/schema/session-event"
import { SessionMessage } from "@opencode/schema/session-message"
import { Context, Clock, DateTime, Effect, Layer, Schema } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { eq } from "drizzle-orm"
import { Database } from "./database/database.js"
import { SessionProjector } from "./session/projector.js"
import { SessionMessageTable } from "./session/sql.js"
import { KV } from "./kv.js"
import { Bus } from "./bus.js"
import { SessionStore } from "./session/store.js"
import { KeyedMutex } from "./effect/keyed-mutex.js"
import { apply, empty, redact } from "./operation/model.js"

const Journal = Schema.Struct({
  sessionID: Session.ID,
  messageID: SessionMessage.ID,
  source: Schema.String,
  at: Schema.Finite,
  anchorID: SessionMessage.ID.pipe(optional),
  command: Operation.Command,
})
const Stored = Schema.Struct({ document: Operation.Document, journal: Schema.Array(Journal) })

export class NotFound extends Schema.TaggedError<NotFound>()("Operation.SessionNotFound", { sessionID: Session.ID }) {}

export interface Interface {
  readonly read: (sessionID: Session.ID) => Effect.Effect<Operation.Document, NotFound>
  readonly audit: (sessionID: Session.ID, before?: SessionMessage.ID) => Effect.Effect<Operation.AuditPage, NotFound>
  readonly reveal: (sessionID: Session.ID, credentialID: string) => Effect.Effect<string | undefined, NotFound>
  readonly write: (input: {
    sessionID: Session.ID
    messageID: SessionMessage.ID
    source: string
    command: Operation.Command
  }) => Effect.Effect<Operation.Receipt, NotFound>
}
export class Service extends Context.Service<Service, Interface>()("@opencode/Operation") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const kv = yield* KV.Service
    const sessions = yield* SessionStore.Service
    const bus = yield* Bus.Service
    const locks = yield* KeyedMutex.make<Session.ID>()
    const key = (id: Session.ID) => `operation:session:${id}`
    const decode = Schema.decodeUnknownSync(Stored)
    const encode = Schema.encodeSync(Schema.toCodecJson(Stored))
    const read = Effect.fn("Operation.load")(function* (id: Session.ID) {
      const value = yield* kv.get(key(id))
      return value ? decode(value) : { document: empty(id), journal: [] }
    })
    const root: (id: Session.ID) => Effect.Effect<Session.ID, NotFound> = Effect.fn("Operation.root")(function* (id) {
      const session = yield* sessions.get(id)
      if (!session) return yield* new NotFound({ sessionID: id })
      if (session.parentID && !session.fork) return yield* root(session.parentID)
      return id
    })

    // The journal contains irreducible typed writes, so a historical fork never imports later facts.
    yield* bus.project(SessionEvent.Forked, (event) =>
      locks.withLock(event.data.sessionID)(
        Effect.gen(function* () {
          const owner = yield* root(event.data.parentID)
          const original = yield* read(owner)
          const parentRows = yield* database.db
            .select({ id: SessionMessageTable.id, seq: SessionMessageTable.seq })
            .from(SessionMessageTable)
            .where(eq(SessionMessageTable.session_id, event.data.parentID))
            .all()
            .pipe(Effect.orDie)
          const copiedRows = yield* database.db
            .select({ id: SessionMessageTable.id, seq: SessionMessageTable.seq })
            .from(SessionMessageTable)
            .where(eq(SessionMessageTable.session_id, event.data.sessionID))
            .all()
            .pipe(Effect.orDie)
          const bySequence = new Map(copiedRows.map((row) => [row.seq, row.id]))
          const remap = new Map(
            parentRows.flatMap((row) => (bySequence.has(row.seq) ? [[row.id, bySequence.get(row.seq)!] as const] : [])),
          )
          const journal = original.journal.flatMap((item) => {
            const messageID = remap.get(item.messageID) ?? (item.anchorID ? remap.get(item.anchorID) : undefined)
            return messageID ? [{ ...item, sessionID: event.data.sessionID, messageID, anchorID: undefined }] : []
          })
          const document = journal.reduce(
            (current, item) => apply(current, item.command, item.source, item.at).document,
            empty(event.data.sessionID),
          )
          yield* kv.set(key(event.data.sessionID), encode({ document, journal }))
        }).pipe(Effect.orDie),
      ),
    )
    yield* bus.project(SessionEvent.Deleted, (event) =>
      locks.withLock(event.data.sessionID)(kv.remove(key(event.data.sessionID))),
    )

    return Service.of({
      read: Effect.fn("Operation.read")(function* (sessionID) {
        const owner = yield* root(sessionID)
        return redact((yield* read(owner)).document)
      }),
      audit: Effect.fn("Operation.audit")(function* (sessionID, before) {
        yield* root(sessionID)
        const messages = yield* sessions
          .messages({
            sessionID,
            limit: 100,
            order: "desc",
            ...(before ? { cursor: { id: before, direction: "previous" } } : {}),
          })
          .pipe(Effect.orDie)
        return {
          records: messages.flatMap((message) =>
            message.type !== "assistant"
              ? []
              : message.content.flatMap((item) => {
                  if (item.type !== "tool") return []
                  const metadata = item.state.status === "streaming" ? undefined : item.state.metadata
                  // CodeMode metadata is the existing execution record; only project its names and states, never arguments.
                  const parsed = Schema.decodeUnknownOption(
                    Schema.Array(
                      Schema.Struct({
                        tool: Schema.String,
                        status: Schema.Literals(["running", "completed", "error"]),
                      }),
                    ),
                  )(metadata?.toolCalls)
                  const calls = parsed._tag === "Some" ? parsed.value : []
                  return [
                    {
                      id: item.id,
                      messageID: message.id,
                      toolName: item.name,
                      state:
                        item.state.status === "completed" && metadata?.error === true
                          ? ("error" as const)
                          : item.state.status,
                      startedAt: DateTime.toEpochMillis(item.time.ran ?? item.time.created),
                      ...(item.time.completed ? { completedAt: DateTime.toEpochMillis(item.time.completed) } : {}),
                      ...(item.state.status === "error" ? { error: item.state.error.message } : {}),
                      stepCount: calls.length,
                      steps: [...calls]
                        .sort(
                          (left, right) =>
                            Number(right.status === "error" || right.status === "running") -
                            Number(left.status === "error" || left.status === "running"),
                        )
                        .slice(0, 20)
                        .map((call) => ({ toolName: call.tool, state: call.status })),
                    },
                  ]
                }),
          ),
          ...(messages.length === 100 ? { next: messages.at(-1)!.id } : {}),
        }
      }),
      reveal: Effect.fn("Operation.reveal")(function* (sessionID, credentialID) {
        const owner = yield* root(sessionID)
        return (yield* read(owner)).document.operation.credentials.find((item) => item.id === credentialID)?.secret
      }),
      write: Effect.fn("Operation.write")(function* (input) {
        const owner = yield* root(input.sessionID)
        return yield* locks.withLock(owner)(
          Effect.gen(function* () {
            const prior = yield* read(owner)
            const at = yield* Clock.currentTimeMillis
            const anchor =
              input.sessionID === owner
                ? undefined
                : (yield* sessions
                    .messages({ sessionID: owner, type: "assistant", limit: 1, order: "desc" })
                    .pipe(Effect.orDie))[0]
            const result = apply(prior.document, input.command, input.source, at)
            if (result.document.operation.revision !== prior.document.operation.revision) {
              yield* kv.set(
                key(owner),
                encode({
                  document: result.document,
                  journal: [
                    ...prior.journal,
                    {
                      ...input,
                      at,
                      anchorID: anchor?.type === "assistant" && !anchor.time.completed ? anchor.id : undefined,
                    },
                  ],
                }),
              )
              yield* bus.publish(Operation.Updated, { sessionID: owner, revision: result.document.operation.revision })
            }
            return {
              sessionID: owner,
              revision: result.document.operation.revision,
              changes: result.changes,
              relation_review: {
                unresolved: result.unresolved.slice(0, 20),
                unresolvedCount: result.unresolved.length,
                truncated: result.unresolved.length > 20,
                instruction:
                  "This bounded receipt reviews declared references; independent records may remain unlinked. Read targeted state for more details when evidence permits. Independent nodes and unknown scope/ownership are valid. This receipt does not require new relationships.",
              },
            }
          }),
        )
      }),
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [KV.node, SessionStore.node, Bus.node, Database.node, SessionProjector.node],
})
