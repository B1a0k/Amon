import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { Operation } from "@opencode/schema/operation"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { Money } from "@opencode/schema/money"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { SessionEvent } from "@opencode/schema/session-event"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { Service, node } from "@opencode/core/operation"
import { apply, empty, redact, review } from "@opencode/core/operation/model"
import { select } from "@opencode/core/operation/query"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStore } from "@opencode/core/session/store"
import { Tool } from "@opencode/core/tool"
import { OperationTools } from "@opencode/core/tool/plugin/operation"
import { registerToolPlugin, codeModeListings } from "./lib/tool"
import { KV } from "@opencode/core/kv"
import { ProjectTable } from "@opencode/core/project/sql"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const observation: Operation.Command = {
  type: "report_asset_observations",
  input: {
    observations: [
      {
        asset_id: "a/host",
        display_name: "Gateway",
        scope_id: "unit-a",
        identifiers: [{ kind: "ip", value: "10.1.1.1" }],
        services: [{ id: "a/ssh", port: 22, name: "ssh" }],
      },
      {
        asset_id: "b/host",
        display_name: "Independent",
        scope_id: "unit-b",
        identifiers: [{ kind: "ip", value: "10.1.1.1" }],
      },
    ],
  },
}

describe("Operation domain", () => {
  test("updates stable facts and deduplicates retries without losing scope or evidence", () => {
    const first = apply(empty("session"), observation, "call-a", 1000)
    const retry = apply(first.document, observation, "call-a", 2000)
    expect(first.document.operation.assets).toHaveLength(2)
    expect(retry.changes.every((change) => change.disposition === "noop")).toBe(true)
    expect(retry.document).toEqual(first.document)
    expect(apply(first.document, observation, "another-write", 3000).document).toEqual(first.document)
    const foreign = apply(
      retry.document,
      {
        type: "report_asset_observations",
        input: { observations: [{ asset_id: "a/host", display_name: "Wrong", scope_id: "unit-b" }] },
      },
      "call-b",
    )
    expect(foreign.changes[0].disposition).toBe("rejected")
    expect(foreign.document.operation.assets[0].displayName).toBe("Gateway")
    expect(first.document.operation.relations).toEqual([])
    expect(review(first.document)).toEqual([])
  })

  test("merges observations and explicitly corrects ownership and identity scope without duplicate facts", () => {
    const first = apply(empty("session"), observation, "first").document
    const added = apply(
      first,
      {
        type: "report_asset_observations",
        input: {
          observations: [
            { asset_id: "a/host", display_name: "Gateway", identifiers: [{ kind: "dns", value: "gateway.example" }] },
          ],
        },
      },
      "observe",
    ).document
    expect(added.operation.assets[0].identifiers).toHaveLength(2)
    const corrected = apply(
      added,
      {
        type: "revise_operation_records",
        input: {
          updates: [
            {
              entity_type: "service",
              id: "a/ssh",
              asset_id: "b/host",
              rationale: "Corrected attribution from original banner",
            },
            { entity_type: "asset", id: "a/host", scope_id: "verified-c", rationale: "Verified identity namespace" },
          ],
        },
      },
      "correct",
    )
    expect(corrected.document.operation.services).toHaveLength(1)
    expect(corrected.document.operation.services[0].assetId).toBe("b/host")
    expect(corrected.document.operation.assets[0].scopeId).toBe("verified-c")
    expect(corrected.changes[0].summary).toBe("Corrected attribution from original banner")
  })

  test("keeps exact long credentials, masks normal reads and preserves rotation history", () => {
    const secret = "  prefix...literal" + "a".repeat(24000) + "\ntrailing  "
    const command: Operation.Command = {
      type: "record_credential",
      input: { credential_id: "secret", kind: "token", principal: "operator", exact_value: secret },
    }
    const stored = apply(empty("session"), command, "call")
    expect(stored.document.operation.credentials[0].secret).toBe(secret)
    expect(redact(stored.document).operation.credentials[0]).not.toHaveProperty("secret")
    const rotated = apply(stored.document, { ...command, input: { ...command.input, exact_value: "new" } }, "rotation")
    expect(rotated.changes[0].disposition).toBe("rejected")
    expect(rotated.document.operation.credentials[0].secret).toBe(secret)
  })

  test("reviews declared references without requiring independent nodes to connect", () => {
    const first = apply(empty("session"), observation, "call").document
    const result = apply(
      first,
      {
        type: "report_relationships",
        input: {
          relations: [
            {
              id: "probe",
              from: "asset/a/host",
              to: "asset/missing",
              kind: "connects_to",
              state: "observed",
              rationale: "Reply on TCP/22 from this source only",
            },
          ],
        },
      },
      "probe",
    )
    expect(result.unresolved).toEqual([{ id: "probe", reference: "asset/missing" }])
    expect(result.document.operation.relations[0].state).toBe("observed")
    const again = apply(
      result.document,
      { type: "report_relationships", input: { relations: result.document.operation.relations } },
      "probe",
    )
    expect(again.changes[0].disposition).toBe("noop")
  })

  test("clears wrong bindings, replaces identifiers, retires relationships and rejects invalid lifecycle transitions", () => {
    const first = apply(empty("session"), observation, "call").document
    const second = apply(
      first,
      {
        type: "report_asset_observations",
        input: {
          observations: [
            { asset_id: "a/host", display_name: "Gateway", zone: "unverified", parent_asset_id: "b/host" },
          ],
        },
      },
      "update",
    ).document
    const result = apply(
      second,
      {
        type: "revise_operation_records",
        input: {
          updates: [
            {
              entity_type: "asset",
              id: "a/host",
              clear_fields: ["zone", "parentAssetId"],
              identifiers: [],
              state: "stale",
            },
          ],
        },
      },
      "maintain",
    )
    expect(result.document.operation.assets[0]).not.toHaveProperty("parentAssetId")
    expect(result.document.operation.assets[0].identifiers).toEqual([])
    expect(result.document.operation.assets[0].state).toBe("stale")
    const invalid = apply(
      result.document,
      {
        type: "revise_operation_records",
        input: { updates: [{ entity_type: "asset", id: "a/host", state: "validated" }] },
      },
      "invalid",
    )
    expect(invalid.changes[0].disposition).toBe("rejected")
    expect(invalid.document.operation.assets[0].state).toBe("stale")
  })

  test("preserves authored diagrams alongside facts and deletes drawings without deleting assets", () => {
    const first = apply(empty("session"), observation, "call").document
    const draw: Operation.Command = {
      type: "draw_canvas",
      input: {
        operations: [
          { type: "upsert_board", id: "path", title: "Main path" },
          {
            type: "upsert_node",
            id: "gateway",
            board: "path",
            title: "Gateway",
            detail: "SSH",
            kind: "host",
            highlight: true,
            entityType: "asset",
            entityId: "a/host",
            x: 100,
            y: 200,
          },
          {
            type: "upsert_table",
            id: "tests",
            board: "path",
            title: "Checks",
            columns: ["Result"],
            rows: [{ id: "test", cells: ["Unknown"] }],
          },
        ],
      },
    }
    const saved = apply(first, draw, "draw", 1000)
    expect(apply(saved.document, draw, "draw", 2000).changes.every((item) => item.disposition === "noop")).toBe(true)
    const removed = apply(
      saved.document,
      { type: "draw_canvas", input: { operations: [{ type: "clear_board", id: "path" }] } },
      "clear",
    )
    expect(removed.document.nodes).toEqual([])
    expect(removed.document.tables).toEqual([])
    expect(removed.document.operation.assets).toEqual(first.operation.assets)
  })

  test("queries exact entity kinds, scoped service credentials and changed records with pagination", () => {
    const first = apply(empty("session"), observation, "call").document
    const credential = apply(
      first,
      {
        type: "record_credential",
        input: {
          credential_id: "ssh-key",
          kind: "key",
          principal: "test",
          exact_value: "secret",
          valid_for: ["service/a/ssh"],
        },
      },
      "key",
    ).document
    const scope = select(redact(credential), { scope_id: "unit-a" })
    expect(scope.records.map((entry) => entry.record.id)).toEqual(["a/host", "a/ssh", "ssh-key"])
    expect(
      select(redact(credential), { since_revision: first.operation.revision }).records.map((entry) => entry.record.id),
    ).toEqual(["ssh-key"])
    expect(select(credential, { entity_ids: ["credential/ssh-key"] }).records).toHaveLength(1)
    const page = select(credential, { limit: 1 })
    expect(page.records).toHaveLength(1)
    expect(page.next).toBe(1)
    expect(JSON.stringify(Schema.encodeSync(Schema.toCodecJson(Operation.Document))(redact(credential)))).not.toContain(
      '"secret":"secret"',
    )
  })
})

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([node, SessionProjector.node, Bus.node, Database.node, KV.node, SessionStore.node]),
  ),
)
const create = Effect.fn(function* (parentID?: Session.ID) {
  const database = yield* Database.Service
  const bus = yield* Bus.Service
  const sessionID = Session.ID.create()
  yield* database.db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/operation-test"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* bus.publish(SessionEvent.Created, {
    sessionID,
    projectID: Project.ID.global,
    location: { directory: AbsolutePath.make("/operation-test") },
    slug: "operation-test",
    version: "test",
    ...(parentID ? { parentID } : {}),
  })
  return sessionID
})

describe("Operation persistent service", () => {
  it.effect(
    "serializes concurrent writes, shares delegated work, isolates unrelated sessions and deletes owned data",
    () =>
      Effect.gen(function* () {
        const operation = yield* Service
        const bus = yield* Bus.Service
        const kv = yield* KV.Service
        const parent = yield* create()
        const child = yield* create(parent)
        const independent = yield* create()
        yield* Effect.forEach(
          Array.from({ length: 20 }, (_, index) => index),
          (index) =>
            operation.write({
              sessionID: index % 2 ? child : parent,
              messageID: SessionMessage.ID.create(),
              source: `call/${index}`,
              command: {
                type: "report_asset_observations",
                input: { observations: [{ asset_id: `host/${index}`, display_name: `Host ${index}` }] },
              },
            }),
          { concurrency: "unbounded" },
        )
        expect((yield* operation.read(parent)).operation.assets).toHaveLength(20)
        expect(yield* operation.read(child)).toEqual(yield* operation.read(parent))
        expect((yield* operation.read(independent)).operation.assets).toEqual([])
        yield* bus.publish(SessionEvent.Deleted, { sessionID: child })
        expect((yield* operation.read(parent)).operation.assets).toHaveLength(20)
        yield* bus.publish(SessionEvent.Deleted, { sessionID: parent })
        expect(yield* kv.get(`operation:session:${parent}`)).toBeUndefined()
        expect((yield* Effect.flip(operation.read(parent)))._tag).toBe("Operation.SessionNotFound")
      }),
  )

  it.effect("forks only facts before the historical boundary, retaining original observation timestamps", () =>
    Effect.gen(function* () {
      const operation = yield* Service
      const bus = yield* Bus.Service
      const sessions = yield* SessionStore.Service
      const parent = yield* create()
      yield* bus.publish(SessionEvent.Synthetic, { sessionID: parent, text: "First phase" })
      const first = (yield* sessions.messages({ sessionID: parent, order: "asc" }))[0]
      yield* operation.write({ sessionID: parent, messageID: first.id, source: "first", command: observation })
      const snapshot = yield* operation.read(parent)
      yield* bus.publish(SessionEvent.Synthetic, { sessionID: parent, text: "Later phase" })
      const second = (yield* sessions.messages({ sessionID: parent, order: "asc" }))[1]
      yield* operation.write({
        sessionID: parent,
        messageID: second.id,
        source: "later",
        command: {
          type: "report_asset_observations",
          input: { observations: [{ asset_id: "later", display_name: "Later host" }] },
        },
      })
      const fork = Session.ID.create()
      yield* bus.publish(SessionEvent.Forked, {
        sessionID: fork,
        parentID: parent,
        boundary: { type: "before", messageID: second.id },
      })
      const inherited = yield* operation.read(fork)
      expect(inherited.operation.assets).toEqual(snapshot.operation.assets)
      expect(inherited.operation.revision).toBe(snapshot.operation.revision)
      expect(inherited.operation.engagementId).toBe(fork)
      const copiedFirst = (yield* sessions.messages({ sessionID: fork, order: "asc" }))[0]
      const nested = Session.ID.create()
      yield* bus.publish(SessionEvent.Forked, {
        sessionID: nested,
        parentID: fork,
        boundary: { type: "through", messageID: copiedFirst.id },
      })
      expect((yield* operation.read(nested)).operation.assets).toEqual(snapshot.operation.assets)
      yield* operation.write({
        sessionID: fork,
        messageID: copiedFirst.id,
        source: "fork",
        command: {
          type: "revise_operation_records",
          input: { updates: [{ entity_type: "asset", id: "a/host", state: "retired" }] },
        },
      })
      expect((yield* operation.read(parent)).operation.assets[0].state).toBe("observed")
    }),
  )
  it.effect("projects native running and failed tools without duplicating commands or leaking input secrets", () =>
    Effect.gen(function* () {
      const operation = yield* Service
      const bus = yield* Bus.Service
      const sessionID = yield* create()
      const assistantMessageID = SessionMessage.ID.create()
      yield* bus.publish(SessionEvent.Step.Started, {
        sessionID,
        assistantMessageID,
        agent: Agent.ID.make("test"),
        model: { id: Model.ID.make("test"), providerID: Provider.ID.make("test") },
        started: 0,
      })
      yield* bus.publish(SessionEvent.Tool.Input.Started, {
        sessionID,
        assistantMessageID,
        id: "terminal-call",
        name: "terminal",
      })
      yield* bus.publish(SessionEvent.Tool.Called, {
        sessionID,
        assistantMessageID,
        id: "terminal-call",
        input: { command: "do not duplicate", secret: "never in audit" },
        executed: true,
      })
      expect((yield* operation.audit(sessionID)).records[0]).toMatchObject({
        id: "terminal-call",
        toolName: "terminal",
        state: "running",
        messageID: assistantMessageID,
      })
      yield* bus.publish(SessionEvent.Tool.Failed, {
        sessionID,
        assistantMessageID,
        id: "terminal-call",
        error: { type: "Tool.Error", message: "Exit failed" },
        executed: true,
      })
      const audit = yield* operation.audit(sessionID)
      expect(audit.records[0]).toMatchObject({ state: "error", error: "Exit failed", completedAt: 0 })
      expect(JSON.stringify(audit)).not.toContain("never in audit")
      expect((yield* operation.read(sessionID)).operation.revision).toBe(0)
      yield* bus.publish(SessionEvent.Step.Ended, {
        sessionID,
        assistantMessageID,
        finish: "stop",
        cost: Money.USD.zero,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      })
    }),
  )
})

const registry = testEffect(LayerNode.compile(LayerNode.group([node, Tool.node, Bus.node, Database.node])))
registry.effect("registers through the native CodeMode catalog and executes validated mutations and reads", () =>
  Effect.gen(function* () {
    const tools = yield* Tool.Service
    const operation = yield* Service
    const sessionID = yield* create()
    yield* registerToolPlugin(OperationTools.Plugin)
    const snapshot = yield* tools.snapshot()
    expect(snapshot.codeModeCatalog).toBeDefined()
    if (!snapshot.codeModeCatalog) throw new Error("Missing CodeMode catalog")
    expect(codeModeListings(snapshot.codeModeCatalog).some((entry) => entry.path === "operation.draw_canvas")).toBe(
      true,
    )
    const result = yield* snapshot.execute({
      sessionID,
      agent: Agent.ID.make("test"),
      messageID: SessionMessage.ID.create(),
      call: {
        type: "tool-call",
        id: "operation-registered",
        name: "execute",
        input: {
          code: `await tools.operation.report_asset_observations({ observations: [{ asset_id: "api-host", display_name: "API host" }] }); const state = await tools.operation.read_operation_state({ entity_ids: ["asset/api-host"] }); return state.total;`,
        },
      },
    })
    expect(result.content).toEqual([{ type: "text", text: "1" }])
    expect((yield* operation.read(sessionID)).operation.assets[0].displayName).toBe("API host")
  }),
)
