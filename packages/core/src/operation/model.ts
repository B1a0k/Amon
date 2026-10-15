import { Operation } from "@opencode/schema/operation"
import { Schema, type Types } from "effect"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

export function empty(sessionID: string): Operation.Document {
  return {
    schemaVersion: 1,
    boards: [],
    nodes: [],
    edges: [],
    cards: [],
    tables: [],
    operation: {
      schemaVersion: 2,
      engagementId: sessionID,
      revision: 0,
      assets: [],
      services: [],
      surfaces: [],
      credentials: [],
      access: [],
      findings: [],
      hypotheses: [],
      attempts: [],
      evidence: [],
      changes: [],
      relations: [],
    },
  }
}

export function apply(document: Operation.Document, command: Operation.Command, source: string, at = Date.now()) {
  // SAFETY: the schema-validated document is deeply cloned; mutation cannot alias a stored or caller-owned value.
  const next = structuredClone(document) as Types.DeepMutable<Operation.Document>
  const changed: Operation.Change[] = []
  const record = (kind: string, id: string, disposition: Operation.Change["disposition"], summary: string) => {
    if (disposition !== "noop") next.operation.revision++
    const change = {
      id: `${source}/${next.operation.revision}/${changed.length}`,
      revision: next.operation.revision,
      entityType: kind,
      entityId: id,
      disposition,
      summary,
      at,
    }
    changed.push(change)
    if (disposition !== "noop") next.operation.changes.push(change)
  }
  const evidence = [
    ...new Set([
      ...(command.input.evidence_refs ?? []),
      ...(command.input.source_tool_call_id ? [command.input.source_tool_call_id] : []),
    ]),
  ]
  const observed = new Set(evidence)
  const write = <T extends { id: string; evidence?: readonly string[] }>(
    rows: T[],
    kind: string,
    value: T,
    summary = "Saved",
  ) => {
    const index = rows.findIndex((item) => item.id === value.id)
    const before = rows[index]
    if (before && isDeepStrictEqual(before, value)) return record(kind, value.id, "noop", "Unchanged")
    const saved =
      value.evidence && !evidence.length ? { ...value, evidence: [...new Set([...value.evidence, source])] } : value
    saved.evidence?.forEach((id) => observed.add(id))
    if (index < 0) rows.push(saved)
    if (index >= 0) rows[index] = saved
    record(kind, value.id, before ? "updated" : "created", summary)
  }
  const base = (prior?: { createdAt: number; updatedAt: number; evidence: readonly string[] }) => ({
    createdAt: prior?.createdAt ?? at,
    updatedAt: prior?.updatedAt ?? at,
    evidence: [...new Set([...(prior?.evidence ?? []), ...(prior ? evidence : evidence.length ? evidence : [source])])],
  })
  const reject = (kind: string, id: string, summary: string) => record(kind, id, "rejected", summary)
  const op = next.operation
  if (command.type === "report_asset_observations") {
    command.input.observations.forEach((item) => {
      const prior = op.assets.find((asset) => asset.id === item.asset_id)
      if (prior?.scopeId && item.scope_id && prior.scopeId !== item.scope_id)
        return reject("asset", item.asset_id, "This ID belongs to another scope; use a distinct stable ID")
      if (item.parent_asset_id === item.asset_id) return reject("asset", item.asset_id, "An asset cannot own itself")
      const value = {
        ...prior,
        ...base(prior),
        id: item.asset_id,
        kind: item.kind ?? prior?.kind ?? "host",
        displayName: item.display_name,
        identifiers: [
          ...new Map(
            [...(prior?.identifiers ?? []), ...(item.identifiers ?? [])].map((entry) => [
              `${entry.kind}\0${entry.value}`,
              entry,
            ]),
          ).values(),
        ],
        state: item.state ?? prior?.state ?? "observed",
        ...(item.scope_id !== undefined ? { scopeId: item.scope_id } : {}),
        ...(item.zone !== undefined ? { zone: item.zone } : {}),
        ...(item.os !== undefined ? { os: item.os } : {}),
        ...(item.role !== undefined ? { role: item.role } : {}),
        ...(item.parent_asset_id !== undefined ? { parentAssetId: item.parent_asset_id || undefined } : {}),
        ...(item.membership_rationale !== undefined ? { membershipRationale: item.membership_rationale } : {}),
        ...(item.membership_state !== undefined ? { membershipState: item.membership_state } : {}),
      }
      write(op.assets, "asset", value)
      const surface = (
        entry: typeof item.surfaces extends readonly (infer S)[] | undefined ? S : never,
        serviceId?: string,
      ) => {
        const id = entry.id ?? `${item.asset_id}/surface/${serviceId ?? "host"}/${entry.kind}/${entry.value}`
        const old = op.surfaces.find((row) => row.id === id)
        if (old && old.assetId !== item.asset_id) return reject("surface", id, "Surface ID belongs to another asset")
        write(op.surfaces, "surface", {
          ...old,
          ...base(old),
          id,
          assetId: item.asset_id,
          kind: entry.kind,
          value: entry.value,
          state: old?.state ?? "observed",
          ...(serviceId ? { serviceId } : {}),
          ...(entry.method !== undefined ? { method: entry.method } : {}),
        })
      }
      item.services?.forEach((service) => {
        const id =
          service.id ??
          `${item.asset_id}/service/${service.transport ?? "tcp"}/${service.port}/${service.instance ?? ""}`
        const old = op.services.find((row) => row.id === id)
        if (old && old.assetId !== item.asset_id) return reject("service", id, "Service ID belongs to another asset")
        write(op.services, "service", {
          ...old,
          ...base(old),
          id,
          assetId: item.asset_id,
          port: service.port,
          transport: service.transport ?? old?.transport ?? "tcp",
          instance: service.instance ?? old?.instance ?? "",
          state: service.state ?? old?.state ?? "observed",
          ...(service.name !== undefined ? { name: service.name } : {}),
          ...(service.product !== undefined ? { product: service.product } : {}),
          ...(service.version !== undefined ? { version: service.version } : {}),
          ...(service.banner !== undefined ? { banner: service.banner } : {}),
        })
        service.surfaces?.forEach((entry) => surface(entry, id))
      })
      item.surfaces?.forEach((entry) => surface(entry))
    })
  }
  if (command.type === "record_credential") {
    const item = command.input
    const prior = op.credentials.find((row) => row.id === item.credential_id)
    if (!prior && item.exact_value === undefined && !item.secret_ref)
      reject("credential", item.credential_id, "Supply an exact value or a reference to the original value")
    else if (prior?.secret !== undefined && item.exact_value !== undefined && prior.secret !== item.exact_value)
      reject(
        "credential",
        item.credential_id,
        "A rotated secret needs a new credential ID; retain the old value and history",
      )
    else
      write(op.credentials, "credential", {
        ...prior,
        ...base(prior),
        id: item.credential_id,
        kind: item.kind,
        principal: item.principal,
        realm: item.realm ?? prior?.realm ?? "",
        source: item.source ?? prior?.source ?? source,
        state: item.state ?? prior?.state ?? "unverified",
        validFor: item.valid_for ? [...item.valid_for] : (prior?.validFor ?? []),
        ...(item.exact_value !== undefined ? { secret: item.exact_value } : {}),
        ...(item.secret_ref !== undefined ? { secretRef: item.secret_ref } : {}),
        fingerprint: createHash("sha256")
          .update(
            `${item.kind}\0${item.principal}\0${item.realm ?? prior?.realm ?? ""}\0${item.exact_value ?? prior?.secret ?? item.secret_ref ?? prior?.secretRef}`,
          )
          .digest("hex"),
      })
  }
  if (command.type === "record_access") {
    const item = command.input,
      prior = op.access.find((row) => row.id === item.access_id)
    if (prior && prior.assetId !== item.asset_id) reject("access", item.access_id, "Access ID belongs to another asset")
    else
      write(op.access, "access", {
        ...prior,
        ...base(prior),
        id: item.access_id,
        assetId: item.asset_id,
        identity: item.identity,
        kind: item.kind ?? prior?.kind ?? "session",
        privilege: item.privilege ?? prior?.privilege ?? "unknown",
        state: item.state ?? prior?.state ?? "active",
        ...(item.credential_id !== undefined ? { credentialId: item.credential_id } : {}),
        ...(item.session_ref !== undefined ? { sessionRef: item.session_ref } : {}),
      })
  }
  if (command.type === "report_finding") {
    const item = command.input,
      prior = op.findings.find((row) => row.id === item.finding_id)
    write(op.findings, "finding", {
      ...prior,
      ...base(prior),
      id: item.finding_id,
      title: item.title,
      vulnerabilityClass: item.vulnerability_class ?? prior?.vulnerabilityClass ?? "unknown",
      severity: item.severity,
      confidence: item.confidence ?? prior?.confidence ?? 0,
      state: item.state,
      impact: item.impact ?? prior?.impact ?? "",
      reproduction: item.reproduction ? [...item.reproduction] : (prior?.reproduction ?? []),
      ...(item.asset_id !== undefined ? { assetId: item.asset_id } : {}),
      ...(item.surface_id !== undefined ? { surfaceId: item.surface_id } : {}),
      ...(item.parameter !== undefined ? { parameter: item.parameter } : {}),
    })
  }
  if (command.type === "resolve_hypothesis") {
    const item = command.input,
      prior = op.hypotheses.find((row) => row.id === item.hypothesis_id)
    write(op.hypotheses, "hypothesis", {
      ...prior,
      ...base(prior),
      id: item.hypothesis_id,
      title: item.title,
      technique: item.technique ?? prior?.technique ?? "",
      rationale: item.rationale ?? prior?.rationale ?? "",
      outcome: item.outcome,
      summary: item.summary ?? prior?.summary ?? "",
      attemptIds: item.attempt_ids ? [...item.attempt_ids] : (prior?.attemptIds ?? []),
      ...(item.source_id !== undefined ? { sourceId: item.source_id } : {}),
      ...(item.target_id !== undefined ? { targetId: item.target_id } : {}),
    })
  }
  if (command.type === "report_relationships")
    command.input.relations.forEach((item) => {
      const prior = op.relations.find((row) => row.id === item.id)
      if (item.from === item.to) return reject("relation", item.id, "A relationship must have distinct endpoints")
      write(op.relations, "relation", {
        ...base(prior),
        id: item.id,
        from: item.from,
        to: item.to,
        kind: item.kind,
        state: item.state,
        rationale: item.rationale,
        evidence: [...new Set([...base(prior).evidence, ...(item.evidence_refs ?? [])])],
      })
    })
  if (command.type === "revise_operation_records")
    command.input.updates.forEach((item) => {
      const collection = {
        asset: op.assets,
        service: op.services,
        surface: op.surfaces,
        credential: op.credentials,
        access: op.access,
        finding: op.findings,
        hypothesis: op.hypotheses,
        relation: op.relations,
      }[item.entity_type]
      const prior = collection.find((row) => row.id === item.id)
      if (!prior) return reject(item.entity_type, item.id, "Record does not exist")
      const allowed: readonly string[] = {
        asset: ["scopeId", "zone", "parentAssetId", "membershipState", "membershipRationale", "role", "os"],
        service: ["name", "product", "version", "banner"],
        surface: ["method", "serviceId"],
        credential: ["secretRef"],
        access: ["credentialId", "sessionRef"],
        finding: ["parameter", "surfaceId", "assetId"],
        hypothesis: ["sourceId", "targetId"],
        relation: [],
      }[item.entity_type]
      const invalid = item.clear_fields?.find((field) => !allowed.includes(field))
      if (invalid) return reject(item.entity_type, item.id, `Cannot clear ${invalid}`)
      if (item.asset_id !== undefined && !["service", "surface", "access", "finding"].includes(item.entity_type))
        return reject(item.entity_type, item.id, "Only owned records accept asset_id corrections")
      if (item.scope_id !== undefined && item.entity_type !== "asset")
        return reject(item.entity_type, item.id, "Only assets own identity scopes")
      if (
        item.entity_type === "credential" &&
        item.clear_fields?.includes("secretRef") &&
        !("secret" in prior && prior.secret !== undefined)
      )
        return reject(
          item.entity_type,
          item.id,
          "Retain the original secret reference until its complete value is stored",
        )
      const patch = {
        ...prior,
        ...(item.asset_id !== undefined ? { assetId: item.asset_id } : {}),
        ...(item.scope_id !== undefined ? { scopeId: item.scope_id } : {}),
        evidence: [...new Set([...prior.evidence, ...evidence])],
        ...(item.state !== undefined
          ? item.entity_type === "hypothesis"
            ? { outcome: item.state }
            : { state: item.state }
          : {}),
        ...(item.entity_type === "asset" && item.identifiers ? { identifiers: [...item.identifiers] } : {}),
        ...(item.entity_type === "credential" && item.valid_for ? { validFor: [...item.valid_for] } : {}),
      }
      const cleared = Object.fromEntries(Object.entries(patch).filter(([key]) => !item.clear_fields?.includes(key)))
      const schema = {
        asset: Operation.Asset,
        service: Operation.Service,
        surface: Operation.Surface,
        credential: Operation.Credential,
        access: Operation.Access,
        finding: Operation.Finding,
        hypothesis: Operation.Hypothesis,
        relation: Operation.Relation,
      }[item.entity_type]
      const parsed = Schema.decodeUnknownOption(schema)(cleared)
      if (parsed._tag === "None") return reject(item.entity_type, item.id, "Invalid state or maintenance field")
      // SAFETY: the entity discriminator selected both the collection and its validating schema above.
      write(
        collection as Array<
          | Operation.Asset
          | Operation.Service
          | Operation.Surface
          | Operation.Credential
          | Operation.Access
          | Operation.Finding
          | Operation.Hypothesis
          | Operation.Relation
        >,
        item.entity_type,
        parsed.value,
        item.rationale ?? "Maintained",
      )
    })
  if (command.type === "draw_canvas")
    command.input.operations.forEach((item) => {
      if (item.type === "clear_board") {
        const before = next.nodes.length + next.edges.length + next.cards.length + next.tables.length
        next.nodes = next.nodes.filter((row) => row.board !== item.id)
        next.edges = next.edges.filter((row) => row.board !== item.id)
        next.cards = next.cards.filter((row) => row.board !== item.id)
        next.tables = next.tables.filter((row) => row.board !== item.id)
        return record(
          "board",
          item.id,
          before === next.nodes.length + next.edges.length + next.cards.length + next.tables.length
            ? "noop"
            : "updated",
          "Board content cleared",
        )
      }
      if (item.type === "delete_canvas_item") {
        const before = next.nodes.length + next.edges.length + next.cards.length + next.tables.length
        if (item.item_type === "node") {
          next.nodes = next.nodes.filter((row) => row.id !== item.id)
          next.edges = next.edges.filter((row) => row.from !== item.id && row.to !== item.id)
        }
        if (item.item_type === "edge") next.edges = next.edges.filter((row) => row.id !== item.id)
        if (item.item_type === "card") next.cards = next.cards.filter((row) => row.id !== item.id)
        if (item.item_type === "table") next.tables = next.tables.filter((row) => row.id !== item.id)
        return record(
          item.item_type,
          item.id,
          before === next.nodes.length + next.edges.length + next.cards.length + next.tables.length
            ? "noop"
            : "updated",
          "Removed from drawing",
        )
      }
      if (item.type === "upsert_board") write(next.boards, "board", { id: item.id, title: item.title })
      if (item.type === "upsert_node") {
        const prior = next.nodes.find((row) => row.id === item.id)
        write(next.nodes, "node", {
          id: item.id,
          board: item.board,
          title: item.title,
          kind: item.kind,
          detail: item.detail,
          highlight: item.highlight,
          entityType: item.entityType ?? prior?.entityType,
          entityId: item.entityId ?? prior?.entityId,
          x: item.x ?? prior?.x,
          y: item.y ?? prior?.y,
        })
      }
      if (item.type === "upsert_edge") {
        const prior = next.edges.find((row) => row.id === item.id)
        write(next.edges, "edge", {
          id: item.id,
          board: item.board,
          from: item.from,
          to: item.to,
          label: item.label,
          relation: item.relation ?? prior?.relation,
          proven: item.proven,
          line: item.line,
          path: item.path,
        })
      }
      if (item.type === "upsert_card") {
        const { type, ...value } = item
        write(next.cards, "card", { ...next.cards.find((row) => row.id === item.id), ...value })
      }
      if (item.type === "upsert_table")
        write(next.tables, "table", {
          id: item.id,
          board: item.board,
          title: item.title,
          columns: [...item.columns],
          rows: item.rows.map((row) => ({ ...row, cells: [...row.cells] })),
        })
    })
  if (changed.some((item) => item.disposition === "created" || item.disposition === "updated")) {
    const touched = new Set(
      changed.filter((item) => item.disposition !== "noop").map((item) => `${item.entityType}/${item.entityId}`),
    )
    const stamp = <T extends { id: string; updatedAt: number }>(rows: T[], kind: string) =>
      rows.forEach((row) => {
        if (touched.has(`${kind}/${row.id}`)) row.updatedAt = at
      })
    stamp(op.assets, "asset")
    stamp(op.services, "service")
    stamp(op.surfaces, "surface")
    stamp(op.credentials, "credential")
    stamp(op.access, "access")
    stamp(op.findings, "finding")
    stamp(op.hypotheses, "hypothesis")
    stamp(op.relations, "relation")
    observed.forEach((id) => {
      if (!op.evidence.some((item) => item.id === id))
        op.evidence.push({ id, sourceType: "tool", sourceId: id, summary: command.type, observedAt: at })
    })
  }
  return { document: Schema.decodeUnknownSync(Operation.Document)(next), changes: changed, unresolved: review(next) }
}

export function review(document: Operation.Document) {
  const op = document.operation
  const entities = [op.assets, op.services, op.surfaces, op.credentials, op.access, op.findings, op.hypotheses]
  const kinds = ["asset", "service", "surface", "credential", "access", "finding", "hypothesis"]
  const refs = new Set(entities.flatMap((rows, index) => rows.map((row) => `${kinds[index]}/${row.id}`)))
  const resolve = (id: string) =>
    refs.has(id) || entities.reduce((count, rows) => count + Number(rows.some((row) => row.id === id)), 0) === 1
  const declared = [
    ...op.assets.flatMap((item) =>
      item.parentAssetId ? [{ id: item.id, reference: `asset/${item.parentAssetId}` }] : [],
    ),
    ...op.services.map((item) => ({ id: item.id, reference: `asset/${item.assetId}` })),
    ...op.surfaces.flatMap((item) => [
      { id: item.id, reference: `asset/${item.assetId}` },
      ...(item.serviceId ? [{ id: item.id, reference: `service/${item.serviceId}` }] : []),
    ]),
    ...op.access.flatMap((item) => [
      { id: item.id, reference: `asset/${item.assetId}` },
      ...(item.credentialId ? [{ id: item.id, reference: `credential/${item.credentialId}` }] : []),
    ]),
    ...op.findings.flatMap((item) => [
      ...(item.assetId ? [{ id: item.id, reference: `asset/${item.assetId}` }] : []),
      ...(item.surfaceId ? [{ id: item.id, reference: `surface/${item.surfaceId}` }] : []),
    ]),
    ...op.hypotheses.flatMap((item) =>
      [item.sourceId, item.targetId].flatMap((reference) => (reference ? [{ id: item.id, reference }] : [])),
    ),
    ...op.relations.flatMap((item) => [
      { id: item.id, reference: item.from },
      { id: item.id, reference: item.to },
    ]),
    ...op.credentials.flatMap((item) => item.validFor.map((reference) => ({ id: item.id, reference }))),
    ...document.nodes.flatMap((item) =>
      item.entityType && item.entityId ? [{ id: item.id, reference: `${item.entityType}/${item.entityId}` }] : [],
    ),
  ]
  return declared.filter((item) => !resolve(item.reference))
}

export function redact(document: Operation.Document): Operation.Document {
  return {
    ...document,
    operation: {
      ...document.operation,
      credentials: document.operation.credentials.map(({ secret, ...item }) => item),
    },
  }
}
