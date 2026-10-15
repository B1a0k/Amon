import { Operation } from "@opencode/schema/operation"

export type Ref = { kind: Operation.EntityKind | "drawing"; id: string }

export type Node = {
  id: string
  ref: Ref
  title: string
  detail: string
  state: string
  scope?: string
  bucket?: string
  category?: string
  contextual?: boolean
  highlight?: boolean
  x?: number
  y?: number
  group?: {
    key: string
    members: readonly string[]
    counts: ReadonlyMap<string, number>
    states: ReadonlyMap<string, number>
    internal: number
    incoming: number
    outgoing: number
    preview: readonly string[]
  }
}

export type Edge = {
  id: string
  from: string
  to: string
  kind: string
  state: string
  label: string
  line?: "solid" | "dashed"
  path?: "curve" | "elbow" | "straight"
  count?: number
}

export type Graph = { nodes: readonly Node[]; edges: readonly Edge[]; unresolved: number }

export function graph(
  document: Operation.Document,
  mode: "overview" | "assets" | "path" | "drawing" = "overview",
): Graph {
  const op = document.operation
  const nodes = new Map<string, Node>()
  const edges: Edge[] = []
  const owners = new Map<string, string>()
  const surfaces = new Map(op.surfaces.map((item) => [item.id, item]))
  const assets = new Map(op.assets.map((item) => [item.id, item]))

  const buckets = new Map(
    op.assets.map((item) => [item.id, addressBucket(item.identifiers.map((entry) => entry.value))]),
  )

  const add = (
    kind: Ref["kind"],
    id: string,
    title: string,
    detail: string,
    state: string,
    owner?: string,
    highlight = false,
  ) => {
    nodes.set(`${kind}/${id}`, {
      id: `${kind}/${id}`,
      ref: { kind, id },
      title,
      detail,
      state,
      scope: assets.get(owner ?? id)?.scopeId,
      bucket: buckets.get(owner ?? id),
      highlight,
    })

    if (owner) owners.set(`${kind}/${id}`, owner)
  }

  op.assets.forEach((item) =>
    add(
      "asset",
      item.id,
      item.displayName,
      [item.identifiers.map((entry) => entry.value).join(" · "), item.os, item.role].filter(Boolean).join(" · "),
      item.state,
    ),
  )
  op.services.forEach((item) =>
    add(
      "service",
      item.id,
      `${item.transport}/${item.port} ${item.name ?? ""}`,
      [item.instance, item.product, item.version].filter(Boolean).join(" · "),
      item.state,
      item.assetId,
    ),
  )
  op.surfaces.forEach((item) =>
    add("surface", item.id, item.value, `${item.method ?? ""} ${item.kind}`, item.state, item.assetId),
  )
  op.credentials.forEach((item) =>
    add("credential", item.id, [item.realm, item.principal].filter(Boolean).join("\\"), item.kind, item.state),
  )
  op.access.forEach((item) =>
    add(
      "access",
      item.id,
      item.identity,
      `${item.kind} · ${item.privilege}`,
      item.state,
      item.assetId,
      item.state === "active",
    ),
  )
  op.findings.forEach((item) =>
    add(
      "finding",
      item.id,
      item.title,
      `${item.severity} · ${item.vulnerabilityClass}`,
      item.state,
      item.assetId ?? surfaces.get(item.surfaceId ?? "")?.assetId,
      item.state === "validated",
    ),
  )
  op.hypotheses.forEach((item) =>
    add(
      "hypothesis",
      item.id,
      item.title,
      item.summary,
      item.outcome,
      assets.has(item.targetId ?? "")
        ? item.targetId
        : (owners.get(item.targetId ?? "") ??
            (item.targetId?.startsWith("asset/") ? item.targetId.slice(6) : undefined)),
      item.outcome === "running",
    ),
  )
  const aliases = new Map<string, string | false>()
  nodes.forEach((item) => aliases.set(item.ref.id, aliases.has(item.ref.id) ? false : item.id))
  const resolve = (id: string) => (nodes.has(id) ? id : aliases.get(id) || undefined)

  const addEdge = (
    from: string | undefined,
    to: string | undefined,
    kind: string,
    state: string,
    id: string,
    label = kind,
    presentation?: Pick<Edge, "line" | "path">,
  ) => {
    if (!from || !to || from === to) return
    edges.push({ id, from, to, kind, state, label, ...presentation })
  }

  op.assets.forEach((item) => {
    if (item.parentAssetId)
      addEdge(
        resolve(`asset/${item.parentAssetId}`),
        resolve(`asset/${item.id}`),
        "contains",
        item.membershipState ?? "observed",
        `owner/${item.id}`,
      )
  })
  op.services.forEach((item) =>
    addEdge(
      resolve(`asset/${item.assetId}`),
      resolve(`service/${item.id}`),
      "contains",
      item.state === "confirmed" ? "confirmed" : "observed",
      `service/${item.id}`,
    ),
  )
  op.surfaces.forEach((item) =>
    addEdge(
      resolve(item.serviceId ? `service/${item.serviceId}` : `asset/${item.assetId}`),
      resolve(`surface/${item.id}`),
      "contains",
      item.state === "confirmed" ? "confirmed" : "observed",
      `surface/${item.id}`,
    ),
  )
  op.credentials.forEach((item) =>
    item.validFor.forEach((ref) =>
      addEdge(
        resolve(`credential/${item.id}`),
        resolve(ref),
        "credential_scope",
        item.state === "valid" ? "confirmed" : "observed",
        `credential-scope/${item.id}/${ref}`,
      ),
    ),
  )
  op.access.forEach((item) => {
    addEdge(
      resolve(`asset/${item.assetId}`),
      resolve(`access/${item.id}`),
      "contains",
      item.state === "active" ? "confirmed" : "stale",
      `access/${item.id}`,
    )

    if (item.credentialId)
      addEdge(
        resolve(`credential/${item.credentialId}`),
        resolve(`access/${item.id}`),
        "authenticates_to",
        item.state === "active" ? "confirmed" : "observed",
        `auth/${item.id}`,
      )
  })
  op.findings.forEach((item) =>
    addEdge(
      resolve(item.surfaceId ? `surface/${item.surfaceId}` : `asset/${item.assetId}`),
      resolve(`finding/${item.id}`),
      "contains",
      item.state === "validated" ? "confirmed" : "observed",
      `finding/${item.id}`,
    ),
  )
  op.hypotheses.forEach((item) => {
    addEdge(
      resolve(item.sourceId ?? ""),
      resolve(`hypothesis/${item.id}`),
      "leads_to",
      item.outcome === "succeeded" ? "confirmed" : "observed",
      `test/source/${item.id}`,
    )
    addEdge(
      resolve(`hypothesis/${item.id}`),
      resolve(item.targetId ?? ""),
      "leads_to",
      item.outcome === "succeeded" ? "confirmed" : "observed",
      `test/target/${item.id}`,
    )
  })
  const unresolved = op.relations.filter((item) => !resolve(item.from) || !resolve(item.to)).length
  op.relations.forEach((item) =>
    addEdge(resolve(item.from), resolve(item.to), item.kind, item.state, `relation/${item.id}`),
  )
  const drawing = new Map<string, string>()
  document.nodes.forEach((item) => {
    const linked = item.entityType && item.entityId ? resolve(`${item.entityType}/${item.entityId}`) : undefined
    const id = linked ?? `drawing/${item.id}`
    drawing.set(item.id, id)
    const prior = nodes.get(id)
    nodes.set(id, {
      ...prior,
      id,
      ref: prior?.ref ?? { kind: "drawing", id: item.id },
      title: item.title,
      detail: item.detail || prior?.detail || "",
      state: prior?.state ?? "observed",
      highlight: item.highlight || prior?.highlight,
      category:
        prior?.ref.kind ??
        new Map<string, string>([
          ["host", "asset"],
          ["domain", "asset"],
          ["network", "asset"],
          ["service", "service"],
          ["surface", "surface"],
          ["credential", "credential"],
          ["vulnerability", "finding"],
          ["finding", "finding"],
          ["access", "access"],
          ["foothold", "access"],
          ["hypothesis", "hypothesis"],
        ]).get(item.kind) ??
        "drawing",
      x: item.x ?? prior?.x,
      y: item.y ?? prior?.y,
    })
  })
  document.edges.forEach((item) => {
    const from = drawing.get(item.from),
      to = drawing.get(item.to)

    const fact = edges.find((edge) => edge.from === from && edge.to === to && edge.kind === item.relation)
    addEdge(
      from,
      to,
      item.relation ?? "drawing",
      fact?.state ?? (item.proven ? "confirmed" : "observed"),
      `drawing/${item.id}`,
      item.label,
      { line: item.line, path: item.path },
    )
  })

  const pathRefs = new Set([
    ...drawing.values(),
    ...edges.filter((edge) => edge.kind !== "contains").flatMap((edge) => [edge.from, edge.to]),
  ])

  const keep = (item: Node) =>
    mode === "overview" ||
    (mode === "assets" && ["asset", "service", "access", "finding"].includes(item.ref.kind)) ||
    (mode === "path" &&
      (pathRefs.has(item.id) || ["asset", "access", "finding", "hypothesis", "drawing"].includes(item.ref.kind))) ||
    (mode === "drawing" && [...drawing.values()].includes(item.id))

  const selected = [...nodes.values()].filter(keep)
  const ids = new Set(selected.map((item) => item.id))

  return { nodes: selected, edges: edges.filter((item) => ids.has(item.from) && ids.has(item.to)), unresolved }
}

/** Focuses an evidenced identity scope while retaining the endpoints of its declared boundary relationships. */
export function scopeGraph(input: Graph, scope: string): Graph {
  if (!scope) return input
  const owned = new Set(input.nodes.filter((node) => node.scope === scope).map((node) => node.id))
  const edges = input.edges.filter((edge) => owned.has(edge.from) || owned.has(edge.to))
  const included = new Set([...owned, ...edges.flatMap((edge) => [edge.from, edge.to])])

  return {
    nodes: input.nodes
      .filter((node) => included.has(node.id))
      .map((node) =>
        node.scope && node.scope !== scope
          ? { ...node, contextual: true, detail: `${node.scope} · ${node.detail}` }
          : node,
      ),
    edges,
    unresolved: input.unresolved,
  }
}

function addressBucket(values: readonly string[]) {
  const address = values.find((value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(value))

  if (!address || address.split(".").some((part) => Number(part) > 255)) return

  return `${address.split(".").slice(0, 3).join(".")}.0/24`
}

/** Visual grouping is a projection only: it never creates ownership or reachability facts. */
export function aggregate(input: Graph, expanded: ReadonlySet<string>, query = ""): Graph {
  if (input.nodes.length < 100 || query.trim()) return query.trim() ? search(input, query) : input
  const groups = new Map<string, Node[]>()
  const targets = new Map<string, string>()
  input.nodes.forEach((node) => {
    const scope = `scope/${node.scope ?? ""}`
    const bucket = `${scope}/address/${node.bucket ?? ""}`
    const key = !expanded.has(scope) ? scope : !expanded.has(bucket) ? bucket : node.id
    const members = groups.get(key) ?? []
    members.push(node)
    groups.set(key, members)
    targets.set(node.id, key)
  })
  const links = new Map<string, Edge>()
  const degrees = new Map<string, { internal: number; incoming: number; outgoing: number }>()
  groups.forEach((_members, key) => degrees.set(key, { internal: 0, incoming: 0, outgoing: 0 }))
  input.edges.forEach((edge) => {
    const from = targets.get(edge.from),
      to = targets.get(edge.to)

    if (!from || !to) return

    if (from === to) {
      degrees.get(from)!.internal++

      return
    }

    degrees.get(from)!.outgoing++
    degrees.get(to)!.incoming++
    const key = `${from}\0${to}\0${edge.kind}\0${edge.state}`
    const prior = links.get(key)
    links.set(key, { ...edge, id: key, from, to, count: (prior?.count ?? 0) + 1 })
  })

  const nodes = [...groups].map(([key, members]): Node => {
    if (members.length === 1) return { ...members[0], id: key }

    const counts = new Map<string, number>(),
      states = new Map<string, number>()

    members.forEach((item) => {
      counts.set(item.ref.kind, (counts.get(item.ref.kind) ?? 0) + 1)
      states.set(item.state, (states.get(item.state) ?? 0) + 1)
    })

    return {
      id: key,
      ref: { kind: "drawing", id: key },
      title: key.includes("/address/") ? (members[0].bucket ?? "") : (members[0].scope ?? ""),
      detail: "",
      state: "observed",
      highlight: members.some((item) => item.highlight),
      group: {
        key,
        members: members.map((item) => item.id),
        counts,
        states,
        ...degrees.get(key)!,
        preview: [...members]
          .sort((left, right) => Number(right.highlight) - Number(left.highlight))
          .slice(0, 4)
          .map((item) => item.title),
      },
    }
  })

  return { nodes, edges: [...links.values()], unresolved: input.unresolved }
}

function search(input: Graph, query: string): Graph {
  const matches = new Set(
    input.nodes
      .filter((item) =>
        `${item.title} ${item.detail} ${item.scope ?? ""} ${item.bucket ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .map((item) => item.id),
  )

  const edges = input.edges.filter((item) => matches.has(item.from) || matches.has(item.to))
  const included = new Set([...matches, ...edges.flatMap((item) => [item.from, item.to])])

  return { nodes: input.nodes.filter((item) => included.has(item.id)), edges, unresolved: input.unresolved }
}

export function positions(input: Graph): ReadonlyMap<string, { x: number; y: number }> {
  const adjacency = new Map<string, string[]>(input.nodes.map((item) => [item.id, []]))
  input.edges.forEach((item) => {
    adjacency.get(item.from)?.push(item.to)
  })
  const incoming = new Set(input.edges.map((item) => item.to))
  const roots = input.nodes.filter((item) => !incoming.has(item.id))
  const levels = new Map<string, number>()
  const queue = (roots.length ? roots : input.nodes.slice(0, 1)).map((item) => item.id)
  queue.forEach((id) => levels.set(id, 0))

  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]
    adjacency.get(id)?.forEach((next) => {
      if (!levels.has(next)) {
        levels.set(next, levels.get(id)! + 1)
        queue.push(next)
      }
    })
  }

  const rows = new Map<number, number>()
  const connected = new Set(input.edges.flatMap((edge) => [edge.from, edge.to]))
  const isolated = input.nodes.filter((node) => !connected.has(node.id))
  const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(isolated.length * 1.5))))
  const spacing = input.nodes.some((node) => node.group) ? 260 : 135
  const coordinates = new Map<string, { x: number; y: number }>()
  input.nodes.forEach((item) => {
    if (!connected.has(item.id)) return
    const level = levels.get(item.id) ?? 0
    const row = rows.get(level) ?? 0
    rows.set(level, row + 1)
    coordinates.set(item.id, { x: item.x ?? 145 + level * 275, y: item.y ?? 110 + row * spacing })
  })
  const bottom = connected.size ? Math.max(...[...coordinates.values()].map((point) => point.y)) + spacing : 110
  isolated.forEach((item, index) =>
    coordinates.set(item.id, {
      x: item.x ?? 145 + (index % columns) * 300,
      y: item.y ?? bottom + Math.floor(index / columns) * spacing,
    }),
  )

  return coordinates
}
