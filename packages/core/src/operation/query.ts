import { Operation } from "@opencode/schema/operation"

export function select(document: Operation.Document, input: Operation.Read) {
  const op = document.operation
  const entries = [
    ...op.assets.map((record) => ({ kind: "asset", collection: "assets", record })),
    ...op.services.map((record) => ({ kind: "service", collection: "services", record })),
    ...op.surfaces.map((record) => ({ kind: "surface", collection: "surfaces", record })),
    ...op.credentials.map((record) => ({ kind: "credential", collection: "credentials", record })),
    ...op.access.map((record) => ({ kind: "access", collection: "access", record })),
    ...op.findings.map((record) => ({ kind: "finding", collection: "findings", record })),
    ...op.hypotheses.map((record) => ({ kind: "hypothesis", collection: "hypotheses", record })),
    ...op.relations.map((record) => ({ kind: "relation", collection: "relations", record })),
  ]
  const owners = new Map<string, Set<string>>()
  const aliases = new Map<string, string[]>()
  entries.forEach((entry) =>
    aliases.set(entry.record.id, [...(aliases.get(entry.record.id) ?? []), `${entry.kind}/${entry.record.id}`]),
  )
  const resolve = (ref: string) =>
    owners.get(ref) ??
    (aliases.get(ref)?.length === 1 ? owners.get(aliases.get(ref)![0]) : undefined) ??
    new Set<string>()
  op.assets.forEach((record) => owners.set(`asset/${record.id}`, new Set([record.id])))
  op.services.forEach((record) => owners.set(`service/${record.id}`, new Set([record.assetId])))
  op.surfaces.forEach((record) => owners.set(`surface/${record.id}`, new Set([record.assetId])))
  op.access.forEach((record) => owners.set(`access/${record.id}`, new Set([record.assetId])))
  op.credentials.forEach((record) =>
    owners.set(
      `credential/${record.id}`,
      new Set([
        ...record.validFor.flatMap((ref) => [...resolve(ref)]),
        ...op.access.flatMap((access) => (access.credentialId === record.id ? [access.assetId] : [])),
      ]),
    ),
  )
  op.findings.forEach((record) =>
    owners.set(
      `finding/${record.id}`,
      new Set([...(record.assetId ? [record.assetId] : []), ...resolve(`surface/${record.surfaceId}`)]),
    ),
  )
  op.hypotheses.forEach((record) =>
    owners.set(
      `hypothesis/${record.id}`,
      new Set([...resolve(record.sourceId ?? ""), ...resolve(record.targetId ?? "")]),
    ),
  )
  op.relations.forEach((record) =>
    owners.set(`relation/${record.id}`, new Set([...resolve(record.from), ...resolve(record.to)])),
  )
  const assets = new Set(op.assets.flatMap((record) => (record.scopeId === input.scope_id ? [record.id] : [])))
  const changed =
    input.since_revision === undefined
      ? undefined
      : new Set(
          op.changes.flatMap((change) =>
            change.revision > input.since_revision! ? [`${change.entityType}/${change.entityId}`] : [],
          ),
        )
  const kinds =
    input.view === "findings"
      ? ["finding", "relation"]
      : input.view === "path"
        ? ["hypothesis", "access", "relation"]
        : input.view === "assets"
          ? ["asset", "service", "surface", "credential", "access", "relation"]
          : undefined
  const selected = entries.filter((entry) => {
    const ref = `${entry.kind}/${entry.record.id}`
    return (
      (!kinds || kinds.includes(entry.kind)) &&
      (!input.entity_ids || input.entity_ids.includes(ref) || input.entity_ids.includes(entry.record.id)) &&
      (!input.scope_id || [...resolve(ref)].some((id) => assets.has(id))) &&
      (!changed || changed.has(ref))
    )
  })
  const offset = input.offset ?? 0,
    limit = input.limit ?? 100
  return {
    revision: op.revision,
    counts: Object.fromEntries(
      ["assets", "services", "surfaces", "credentials", "access", "findings", "hypotheses", "relations"].map((name) => [
        name,
        selected.filter((item) => item.collection === name).length,
      ]),
    ),
    total: selected.length,
    next: offset + limit < selected.length ? offset + limit : null,
    records:
      input.view === "summary"
        ? []
        : selected.slice(offset, offset + limit).map(({ collection, record }) => ({ collection, record })),
    changes: op.changes
      .filter(
        (item) =>
          (input.since_revision === undefined || item.revision > input.since_revision) &&
          (!input.entity_ids ||
            input.entity_ids.includes(item.entityId) ||
            input.entity_ids.includes(`${item.entityType}/${item.entityId}`)) &&
          (!input.scope_id || [...resolve(`${item.entityType}/${item.entityId}`)].some((id) => assets.has(id))),
      )
      .slice(offset, offset + limit),
  }
}
