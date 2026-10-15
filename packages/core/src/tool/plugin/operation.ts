export * as OperationTools from "./operation.js"

import { SystemPart, ToolFailure } from "@opencode/ai"
import type { Context } from "@opencode/plugin/effect/plugin"
import { SessionMessage } from "@opencode/schema/session-message"
import { Operation } from "@opencode/schema/operation"
import { Effect, Schema } from "effect"
import { Service } from "../../operation.js"
import { select } from "../../operation/query.js"

const guidance = `Operation tools keep reusable security observations and an authored diagram for this conversation, including long tasks and delegated work. Use tools.operation through execute when the task produces relevant findings; ordinary questions do not need a database.
- Read relevant state on first use, after compaction, when switching targets or when facts may be stale. Use stable IDs, entity filters, scopes, revision cursors and pagination; a reliable recent receipt can be reused without reading everything again.
- Record discovered assets, services and entry points. Merge observed aliases; use maintenance to replace or clear incorrect bindings explicitly. A logical host/application is an asset; IP/FQDN/NetBIOS are identifiers; a port instance is a service; paths, vhosts, APIs and shares are surfaces. Update the same fact instead of repeatedly appending it. Preserve failures and unknowns with their conditions.
- A conversation may span several organizations, independent networks, overlapping private addresses, VPNs and pivots. scope_id distinguishes evidenced identity namespaces, not every subnet or observation viewpoint. Unknown scope is valid. Equal addresses or zone labels do not prove identical hosts. Evidence can support real cross-scope relationships.
- Scan replies, HTTP responses, connections and authentication exchanges can support directed reachability in their observed source/protocol/port/path/time scope. A failed authentication can demonstrate network contact without authentication success. Organization membership supports contains; network observations support connects_to. Do not expand one observation into all hosts, reverse reachability or every service.
- Save worthwhile relationships and their rationale with evidence references. Use explicit typed references when an ID is ambiguous. A receipt reviews declared references only: independent nodes, missing ownership and unknown topology are valid. Do not create relationships just to remove a warning or make the diagram look connected.
- Save credentials with the exact unshortened value or a retrievable secret_ref; do not mask, reconstruct or abbreviate them. Literal punctuation is valid. Put credentials in their own records, not graph labels. Rotation uses a new ID and revises the old state, preserving history.
- Record access and privilege changes, candidate/validated findings, and useful hypotheses with outcomes and checkpoints. One failure does not disprove the whole direction; a temporary switch need not terminate a running branch. Evidence sufficient for a configuration/exposure finding does not require additional destructive exploitation.
- Maintenance is as important as discovery: revise states, clear incorrect optional bindings, replace stale identifiers and retire outdated services/access/relations when supported. A single missed probe does not invalidate all prior facts.
- Use draw_canvas to maintain the important main path, nodes, edges, tables and explanations. Linked drawing nodes inherit factual relations. UI grouping does not require model-created subnet nodes and does not imply host-to-host reachability.
- Reuse and maintain relevant records before changing phase or finishing when the task warrants it. Do not poll state or repeat logs as new facts; keep tool receipts and model context concise.`

const tools = [
  [
    "report_asset_observations",
    Operation.ReportAssets,
    "Save or update discovered assets, services and surfaces in batches. Use stable asset_id values and optional evidenced scope/ownership. Unknown scope/ownership is valid. When observations establish reachability or membership, record its source and limits with report_relationships.",
  ],
  [
    "record_credential",
    Operation.RecordCredential,
    "Record a complete credential or original secret_ref before relying on it elsewhere. Never replace long values with ellipses. Keep punctuation exactly; rotate into a new credential ID and maintain the old status.",
  ],
  [
    "record_access",
    Operation.RecordAccess,
    "Save or update an observed session, foothold, identity or privilege level, with target and evidence. Mark it stale/dead when supported instead of appending duplicates.",
  ],
  [
    "report_finding",
    Operation.ReportFinding,
    "Save or update a candidate, validated or rejected vulnerability. Include impact, reproduction and evidence; confidence applies only to the verified scope.",
  ],
  [
    "resolve_hypothesis",
    Operation.ResolveHypothesis,
    "Maintain a useful test direction and checkpoint. Keep pending/running work, limitations, result and next step; a failed attempt does not automatically disprove the entire hypothesis.",
  ],
  [
    "report_relationships",
    Operation.ReportRelationships,
    "Save evidenced membership, directed reachability, pivots, authentication, causality or dependencies. Explain source, direction, protocol/port, time/path and conclusion boundaries. Cross-scope evidence is allowed; equal addresses/labels do not imply a relationship. Reuse relation IDs.",
  ],
  [
    "revise_operation_records",
    Operation.Revise,
    "Maintain existing records: update states, retire stale relationships, clear erroneous optional camelCase fields, correct ownership with asset_id or identity scope with scope_id and an explanation, replace identifiers or valid_for (empty arrays remove bindings). Do not erase history or broadly invalidate facts from a single unsuccessful probe.",
  ],
  [
    "draw_canvas",
    Operation.DrawInput,
    "Incrementally author the main path and explanations using board/node/edge/card/table operations. Every node/edge supplies its presentation fields. Link factual nodes using entityType/entityId; leave credentials out of labels. Stable IDs preserve layout; deletion edits drawings, not facts.",
  ],
] as const

export const Plugin = {
  id: "amon.tools.operation",
  effect: Effect.fn("OperationTools.Plugin")(function* (ctx: Context) {
    const operation = yield* Service
    const hook = (event: { system: SystemPart[] }) => Effect.sync(() => event.system.push(SystemPart.make(guidance)))
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.tool
      .transform((editor) => {
        editor.namespace({
          name: "operation",
          description:
            "Conversation-owned security situation workspace: assets, evidence, relationships, credentials, access, findings, test paths, lifecycle maintenance and authored diagrams. Read targeted state and use compact mutation receipts, not repeated full snapshots.",
        })
        tools.forEach(([name, input, description]) =>
          editor.add({
            name,
            input,
            description,
            output: Operation.Receipt,
            options: { namespace: "operation", codemode: true },
            execute: (value, context) => {
              // SAFETY: this fixed table pairs each command discriminator with its canonical validated input schema.
              const command = { type: name, input: value } as Operation.Command
              return operation
                .write({ sessionID: context.sessionID, messageID: context.messageID, source: context.id, command })
                .pipe(
                  Effect.map((output) => ({
                    output,
                    metadata: { operationRevision: output.revision, operationSessionID: output.sessionID },
                  })),
                  Effect.mapError(
                    (error) =>
                      new ToolFailure({ message: `Unable to maintain operation state for ${error.sessionID}`, error }),
                  ),
                )
            },
          }),
        )
        editor.add({
          name: "read_operation_state",
          input: Operation.Read,
          output: Schema.Json,
          description:
            "Read relevant current state after context recovery or when planning the next phase. Filter by view, scope_id, entity_ids, since_revision (changed records and journal entries) and offset/limit. Reads never include credential plaintext. Known recent receipts can be reused; do not repeatedly load the entire workspace.",
          options: { namespace: "operation", codemode: true },
          execute: (input, context) =>
            operation.read(context.sessionID).pipe(
              Effect.map((document) => ({
                output: Schema.encodeSync(Schema.toCodecJson(Schema.Json))(select(document, input)),
              })),
              Effect.mapError(
                (error) => new ToolFailure({ message: `Unable to read operation state for ${error.sessionID}`, error }),
              ),
            ),
        })
        editor.add({
          name: "read_execution_audit",
          input: Schema.Struct({ before: SessionMessage.ID.pipe(Schema.optionalKey) }),
          output: Operation.AuditPage,
          description:
            "Read paginated original tool execution states and source message IDs for this conversation. Use before from the prior next cursor for older history. Original content remains in the native conversation; avoid copying each command into situation facts.",
          options: { namespace: "operation", codemode: true },
          execute: (input, context) =>
            operation.audit(context.sessionID, input.before).pipe(
              Effect.map((output) => ({ output })),
              Effect.mapError(
                (error) => new ToolFailure({ message: `Unable to read execution audit for ${error.sessionID}`, error }),
              ),
            ),
        })
        editor.add({
          name: "read_canvas",
          input: Schema.Struct({}),
          output: Schema.Json,
          description:
            "Read existing authored boards/nodes/edges/cards/tables before editing. Factual relationships are projected separately; reuse drawing IDs instead of duplicating facts.",
          options: { namespace: "operation", codemode: true },
          execute: (_input, context) =>
            operation.read(context.sessionID).pipe(
              Effect.map((document) => ({
                output: {
                  boards: Schema.encodeSync(Schema.toCodecJson(Schema.Array(Operation.Board)))(document.boards),
                  nodes: Schema.encodeSync(Schema.toCodecJson(Schema.Array(Operation.Node)))(document.nodes),
                  edges: Schema.encodeSync(Schema.toCodecJson(Schema.Array(Operation.Edge)))(document.edges),
                  cards: Schema.encodeSync(Schema.toCodecJson(Schema.Array(Operation.Card)))(document.cards),
                  tables: Schema.encodeSync(Schema.toCodecJson(Schema.Array(Operation.Table)))(document.tables),
                },
              })),
              Effect.mapError(
                (error) => new ToolFailure({ message: `Unable to read drawing for ${error.sessionID}`, error }),
              ),
            ),
        })
      })
      .pipe(Effect.orDie)
  }),
}
