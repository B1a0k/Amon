export * as Operation from "./operation.js"

import { Schema } from "effect"
import { optional } from "./schema.js"
import { SessionMessage } from "./session-message.js"
import { SessionID } from "./session-id.js"
import { Event } from "./event.js"

const Text = Schema.String
const Strings = Schema.Array(Text)
const Maybe = Text.pipe(optional)
const State = Schema.Literals(["observed", "confirmed", "stale", "retired", "conflicted"])
const Outcome = Schema.Literals(["queued", "running", "succeeded", "failed", "disproved", "blocked", "interrupted"])
const RelationKind = Schema.Literals([
  "contains",
  "connects_to",
  "pivots_to",
  "authenticates_to",
  "leads_to",
  "depends_on",
])
const RelationState = Schema.Literals(["observed", "confirmed", "disproved", "stale"])
const Base = { id: Text, evidence: Strings, createdAt: Schema.Finite, updatedAt: Schema.Finite }

export const Asset = Schema.Struct({
  ...Base,
  kind: Schema.Literals(["host", "device", "domain", "application", "network", "unknown"]),
  displayName: Text,
  identifiers: Schema.Array(Schema.Struct({ kind: Text, value: Text })),
  scopeId: Maybe,
  zone: Maybe,
  parentAssetId: Maybe,
  membershipState: RelationState.pipe(optional),
  membershipRationale: Maybe,
  role: Maybe,
  os: Maybe,
  state: State,
}).annotate({ identifier: "Operation.Asset" })
export interface Asset extends Schema.Schema.Type<typeof Asset> {}

export const Service = Schema.Struct({
  ...Base,
  assetId: Text,
  transport: Text,
  port: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 })),
  instance: Text,
  name: Maybe,
  product: Maybe,
  version: Maybe,
  banner: Maybe,
  state: State,
}).annotate({ identifier: "Operation.Service" })
export interface Service extends Schema.Schema.Type<typeof Service> {}

export const Surface = Schema.Struct({
  ...Base,
  assetId: Text,
  serviceId: Maybe,
  kind: Text,
  value: Text,
  method: Maybe,
  state: State,
}).annotate({ identifier: "Operation.Surface" })
export interface Surface extends Schema.Schema.Type<typeof Surface> {}

export const Credential = Schema.Struct({
  ...Base,
  kind: Schema.Literals(["password", "hash", "token", "key", "cookie", "ticket", "other"]),
  principal: Text,
  realm: Text,
  secret: Maybe,
  secretRef: Maybe,
  fingerprint: Text,
  source: Text,
  validFor: Strings,
  state: Schema.Literals(["unverified", "valid", "invalid", "revoked", "stale"]),
}).annotate({ identifier: "Operation.Credential" })
export interface Credential extends Schema.Schema.Type<typeof Credential> {}

export const Access = Schema.Struct({
  ...Base,
  assetId: Text,
  identity: Text,
  credentialId: Maybe,
  sessionRef: Maybe,
  kind: Text,
  privilege: Text,
  state: Schema.Literals(["active", "stale", "dead"]),
}).annotate({ identifier: "Operation.Access" })
export interface Access extends Schema.Schema.Type<typeof Access> {}

export const Finding = Schema.Struct({
  ...Base,
  assetId: Maybe,
  surfaceId: Maybe,
  title: Text,
  vulnerabilityClass: Text,
  parameter: Maybe,
  severity: Schema.Literals(["critical", "high", "medium", "low", "info"]),
  confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  state: Schema.Literals(["candidate", "validated", "rejected", "mitigated", "stale"]),
  impact: Text,
  reproduction: Strings,
}).annotate({ identifier: "Operation.Finding" })
export interface Finding extends Schema.Schema.Type<typeof Finding> {}

export const Hypothesis = Schema.Struct({
  ...Base,
  title: Text,
  sourceId: Maybe,
  targetId: Maybe,
  technique: Text,
  rationale: Text,
  outcome: Outcome,
  summary: Text,
  attemptIds: Strings,
}).annotate({ identifier: "Operation.Hypothesis" })
export interface Hypothesis extends Schema.Schema.Type<typeof Hypothesis> {}

export const Attempt = Schema.Struct({
  id: Text,
  jobId: Maybe,
  hypothesisId: Maybe,
  toolName: Text,
  targetId: Maybe,
  summary: Text,
  status: Outcome,
  error: Maybe,
  startedAt: Schema.Finite,
  completedAt: Schema.Finite.pipe(optional),
  evidence: Strings,
}).annotate({ identifier: "Operation.Attempt" })
export interface Attempt extends Schema.Schema.Type<typeof Attempt> {}

export const Relation = Schema.Struct({
  ...Base,
  from: Text,
  to: Text,
  kind: RelationKind,
  state: RelationState,
  rationale: Text,
}).annotate({ identifier: "Operation.Relation" })
export interface Relation extends Schema.Schema.Type<typeof Relation> {}

export const Evidence = Schema.Struct({
  id: Text,
  sourceType: Schema.Literals(["tool", "message", "artifact", "manual"]),
  sourceId: Text,
  summary: Text,
  observedAt: Schema.Finite,
}).annotate({ identifier: "Operation.Evidence" })
export interface Evidence extends Schema.Schema.Type<typeof Evidence> {}

export const Change = Schema.Struct({
  id: Text,
  revision: Schema.Int,
  entityType: Text,
  entityId: Text,
  disposition: Schema.Literals(["created", "updated", "noop", "rejected"]),
  summary: Text,
  at: Schema.Finite,
}).annotate({ identifier: "Operation.Change" })
export interface Change extends Schema.Schema.Type<typeof Change> {}

export const EntityKind = Schema.Literals([
  "asset",
  "service",
  "surface",
  "credential",
  "access",
  "finding",
  "hypothesis",
])
export type EntityKind = typeof EntityKind.Type

export const Node = Schema.Struct({
  id: Text,
  board: Text,
  title: Text,
  kind: Text,
  detail: Text,
  highlight: Schema.Boolean,
  entityType: EntityKind.pipe(optional),
  entityId: Maybe,
  x: Schema.Finite.pipe(optional),
  y: Schema.Finite.pipe(optional),
}).annotate({ identifier: "Operation.Node" })
export interface Node extends Schema.Schema.Type<typeof Node> {}

export const Edge = Schema.Struct({
  id: Text,
  board: Text,
  from: Text,
  to: Text,
  label: Text,
  relation: Maybe,
  proven: Schema.Boolean,
  line: Schema.Literals(["solid", "dashed"]),
  path: Schema.Literals(["elbow", "straight", "curve"]),
}).annotate({ identifier: "Operation.Edge" })
export interface Edge extends Schema.Schema.Type<typeof Edge> {}

export const Board = Schema.Struct({ id: Text, title: Text }).annotate({ identifier: "Operation.Board" })
export const Card = Schema.Struct({ id: Text, board: Text, title: Text, body: Text, tone: Text }).annotate({
  identifier: "Operation.Card",
})
export const Table = Schema.Struct({
  id: Text,
  board: Text,
  title: Text,
  columns: Strings,
  rows: Schema.Array(Schema.Struct({ id: Text, cells: Strings })),
}).annotate({ identifier: "Operation.Table" })

export const Facts = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  engagementId: Text,
  revision: Schema.Int,
  assets: Schema.Array(Asset),
  services: Schema.Array(Service),
  surfaces: Schema.Array(Surface),
  credentials: Schema.Array(Credential),
  access: Schema.Array(Access),
  findings: Schema.Array(Finding),
  hypotheses: Schema.Array(Hypothesis),
  attempts: Schema.Array(Attempt),
  evidence: Schema.Array(Evidence),
  changes: Schema.Array(Change),
  relations: Schema.Array(Relation),
}).annotate({ identifier: "Operation.Facts" })
export interface Facts extends Schema.Schema.Type<typeof Facts> {}

export const Document = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  operation: Facts,
  boards: Schema.Array(Board),
  nodes: Schema.Array(Node),
  edges: Schema.Array(Edge),
  cards: Schema.Array(Card),
  tables: Schema.Array(Table),
}).annotate({ identifier: "Operation.Document" })
export interface Document extends Schema.Schema.Type<typeof Document> {}

const Source = { evidence_refs: Strings.pipe(optional), source_tool_call_id: Maybe }
const InputSurface = Schema.Struct({ id: Maybe, kind: Text, value: Text, method: Maybe })
const InputService = Schema.Struct({
  id: Maybe,
  transport: Maybe,
  port: Service.fields.port,
  instance: Maybe,
  name: Maybe,
  product: Maybe,
  version: Maybe,
  banner: Maybe,
  state: State.pipe(optional),
  surfaces: Schema.Array(InputSurface).pipe(optional),
})
export const ReportAssets = Schema.Struct({
  ...Source,
  observations: Schema.Array(
    Schema.Struct({
      asset_id: Text,
      display_name: Text,
      kind: Asset.fields.kind.pipe(optional),
      identifiers: Asset.fields.identifiers.pipe(optional),
      scope_id: Maybe,
      zone: Maybe,
      parent_asset_id: Maybe,
      membership_rationale: Maybe,
      membership_state: RelationState.pipe(optional),
      role: Maybe,
      os: Maybe,
      state: State.pipe(optional),
      services: Schema.Array(InputService).pipe(optional),
      surfaces: Schema.Array(InputSurface).pipe(optional),
    }),
  ).check(Schema.isMaxLength(100)),
}).annotate({ identifier: "Operation.ReportAssets" })
export interface ReportAssets extends Schema.Schema.Type<typeof ReportAssets> {}

export const RecordCredential = Schema.Struct({
  ...Source,
  credential_id: Text,
  kind: Credential.fields.kind,
  principal: Text,
  realm: Maybe,
  exact_value: Maybe,
  secret_ref: Maybe,
  source: Maybe,
  valid_for: Strings.pipe(optional),
  state: Credential.fields.state.pipe(optional),
}).annotate({ identifier: "Operation.RecordCredential" })
export interface RecordCredential extends Schema.Schema.Type<typeof RecordCredential> {}

export const RecordAccess = Schema.Struct({
  ...Source,
  access_id: Text,
  asset_id: Text,
  identity: Text,
  credential_id: Maybe,
  session_ref: Maybe,
  kind: Maybe,
  privilege: Maybe,
  state: Access.fields.state.pipe(optional),
}).annotate({ identifier: "Operation.RecordAccess" })
export interface RecordAccess extends Schema.Schema.Type<typeof RecordAccess> {}

export const ReportFinding = Schema.Struct({
  ...Source,
  finding_id: Text,
  asset_id: Maybe,
  surface_id: Maybe,
  title: Text,
  vulnerability_class: Maybe,
  parameter: Maybe,
  severity: Finding.fields.severity,
  confidence: Finding.fields.confidence.pipe(optional),
  state: Finding.fields.state,
  impact: Maybe,
  reproduction: Strings.pipe(optional),
}).annotate({ identifier: "Operation.ReportFinding" })
export interface ReportFinding extends Schema.Schema.Type<typeof ReportFinding> {}

export const ResolveHypothesis = Schema.Struct({
  ...Source,
  hypothesis_id: Text,
  title: Text,
  source_id: Maybe,
  target_id: Maybe,
  technique: Maybe,
  rationale: Maybe,
  outcome: Outcome,
  summary: Maybe,
  attempt_ids: Strings.pipe(optional),
}).annotate({ identifier: "Operation.ResolveHypothesis" })
export interface ResolveHypothesis extends Schema.Schema.Type<typeof ResolveHypothesis> {}

export const ReportRelationships = Schema.Struct({
  ...Source,
  relations: Schema.Array(
    Schema.Struct({
      id: Text,
      from: Text,
      to: Text,
      kind: RelationKind,
      state: RelationState,
      rationale: Text,
      evidence_refs: Strings.pipe(optional),
    }),
  ).check(Schema.isMaxLength(100)),
}).annotate({ identifier: "Operation.ReportRelationships" })
export interface ReportRelationships extends Schema.Schema.Type<typeof ReportRelationships> {}

export const Read = Schema.Struct({
  view: Schema.Literals(["summary", "path", "assets", "findings", "all"]).pipe(optional),
  entity_ids: Strings.pipe(optional),
  scope_id: Maybe,
  since_revision: Schema.Int.pipe(optional),
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(optional),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })).pipe(optional),
}).annotate({ identifier: "Operation.Read" })
export interface Read extends Schema.Schema.Type<typeof Read> {}

export const Revise = Schema.Struct({
  ...Source,
  updates: Schema.Array(
    Schema.Struct({
      entity_type: Schema.Literals([...EntityKind.literals, "relation"]),
      id: Text,
      state: Maybe,
      asset_id: Maybe,
      scope_id: Maybe,
      clear_fields: Strings.pipe(optional),
      identifiers: Asset.fields.identifiers.pipe(optional),
      valid_for: Strings.pipe(optional),
      rationale: Maybe,
    }),
  ).check(Schema.isMaxLength(100)),
}).annotate({ identifier: "Operation.Revise" })
export interface Revise extends Schema.Schema.Type<typeof Revise> {}

export const Draw = Schema.Union([
  Schema.Struct({ type: Schema.Literal("upsert_board"), ...Board.fields }),
  Schema.Struct({ type: Schema.Literal("upsert_node"), ...Node.fields }),
  Schema.Struct({ type: Schema.Literal("upsert_edge"), ...Edge.fields }),
  Schema.Struct({ type: Schema.Literal("upsert_card"), ...Card.fields }),
  Schema.Struct({ type: Schema.Literal("upsert_table"), ...Table.fields }),
  Schema.Struct({
    type: Schema.Literal("delete_canvas_item"),
    id: Text,
    item_type: Schema.Literals(["node", "edge", "card", "table"]),
  }),
  Schema.Struct({ type: Schema.Literal("clear_board"), id: Text }),
])
export const DrawInput = Schema.Struct({
  ...Source,
  operations: Schema.Array(Draw).check(Schema.isMaxLength(100)),
}).annotate({ identifier: "Operation.DrawInput" })
export interface DrawInput extends Schema.Schema.Type<typeof DrawInput> {}

export const Command = Schema.Union([
  Schema.Struct({ type: Schema.Literal("report_asset_observations"), input: ReportAssets }),
  Schema.Struct({ type: Schema.Literal("record_credential"), input: RecordCredential }),
  Schema.Struct({ type: Schema.Literal("record_access"), input: RecordAccess }),
  Schema.Struct({ type: Schema.Literal("report_finding"), input: ReportFinding }),
  Schema.Struct({ type: Schema.Literal("resolve_hypothesis"), input: ResolveHypothesis }),
  Schema.Struct({ type: Schema.Literal("report_relationships"), input: ReportRelationships }),
  Schema.Struct({ type: Schema.Literal("revise_operation_records"), input: Revise }),
  Schema.Struct({ type: Schema.Literal("draw_canvas"), input: DrawInput }),
])
export type Command = typeof Command.Type

export const Receipt = Schema.Struct({
  sessionID: SessionID,
  revision: Schema.Int,
  changes: Schema.Array(Change),
  relation_review: Schema.Struct({
    unresolvedCount: Schema.Int,
    truncated: Schema.Boolean,
    unresolved: Schema.Array(Schema.Struct({ id: Text, reference: Text })),
    instruction: Text,
  }),
}).annotate({ identifier: "Operation.Receipt" })
export interface Receipt extends Schema.Schema.Type<typeof Receipt> {}

export const Updated = Event.ephemeral({
  type: "operation.updated",
  schema: { sessionID: SessionID, revision: Schema.Int },
})
export const Events = { Updated }

export const AuditEntry = Schema.Struct({
  id: Text,
  messageID: SessionMessage.ID,
  toolName: Text,
  state: Schema.Literals(["streaming", "running", "completed", "error"]),
  startedAt: Schema.Finite,
  completedAt: Schema.Finite.pipe(optional),
  error: Maybe,
  stepCount: Schema.Int,
  steps: Schema.Array(Schema.Struct({ toolName: Text, state: Schema.Literals(["running", "completed", "error"]) })),
}).annotate({ identifier: "Operation.AuditEntry" })
export const AuditPage = Schema.Struct({
  records: Schema.Array(AuditEntry),
  next: SessionMessage.ID.pipe(optional),
}).annotate({ identifier: "Operation.AuditPage" })
export interface AuditPage extends Schema.Schema.Type<typeof AuditPage> {}

export interface Board extends Schema.Schema.Type<typeof Board> {}

export interface Card extends Schema.Schema.Type<typeof Card> {}

export interface Table extends Schema.Schema.Type<typeof Table> {}

export interface AuditEntry extends Schema.Schema.Type<typeof AuditEntry> {}
