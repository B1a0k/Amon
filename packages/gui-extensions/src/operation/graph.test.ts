import { expect, test } from "bun:test"
import { Operation } from "@opencode/schema/operation"
import { aggregate, graph, positions, scopeGraph } from "./graph"

function fixture(count = 1200): Operation.Document {
  return Operation.Document.make({
    schemaVersion: 1,
    boards: [],
    nodes: [],
    edges: [],
    cards: [],
    tables: [],
    operation: {
      schemaVersion: 2,
      engagementId: "test",
      revision: 1,
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
      assets: Array.from({ length: count }, (_, index) => ({
        id: `host/${index}`,
        displayName: `Host ${index}`,
        kind: "host",
        state: "observed",
        evidence: [],
        createdAt: 1,
        updatedAt: 1,
        scopeId: index < count / 2 ? "Organization A" : "Organization B",
        identifiers: [{ kind: "ip", value: `10.${Math.floor((index % (count / 2)) / 256)}.1.${index % 256}` }],
      })),
    },
  })
}

test("groups circular node data by identity scope, conserves every member and preserves independent topology", () => {
  const document = fixture()
  const topology = graph(document)
  expect(topology.edges).toEqual([])
  const grouped = aggregate(topology, new Set())
  expect(grouped.nodes).toHaveLength(2)
  expect(grouped.nodes.map((node) => node.group?.members.length)).toEqual([600, 600])
  expect(new Set(grouped.nodes.flatMap((node) => node.group?.members ?? []))).toHaveLength(1200)
  const ranges = aggregate(topology, new Set(["scope/Organization A"]))
  expect(ranges.nodes.filter((node) => node.group?.key.startsWith("scope/Organization A/address/"))).toHaveLength(3)
  expect(ranges.nodes.flatMap((node) => node.group?.members ?? [node.ref.id])).toHaveLength(1200)
  expect(grouped.nodes[0].group?.internal).toBe(0)
})

test("preserves observed cross-scope direction, state and internal relationships when aggregated", () => {
  const document = fixture()

  const related = {
    ...document,
    operation: {
      ...document.operation,
      relations: [
        Operation.Relation.make({
          id: "pivot",
          from: "asset/host/0",
          to: "asset/host/600",
          kind: "pivots_to",
          state: "observed",
          rationale: "Observed through VPN only",
          evidence: ["probe"],
          createdAt: 1,
          updatedAt: 1,
        }),
        Operation.Relation.make({
          id: "contact",
          from: "asset/host/0",
          to: "asset/host/1",
          kind: "connects_to",
          state: "confirmed",
          rationale: "TCP/22 connected",
          evidence: ["probe"],
          createdAt: 1,
          updatedAt: 1,
        }),
      ],
    },
  }

  const grouped = aggregate(graph(related), new Set())
  expect(grouped.edges).toHaveLength(1)
  expect(grouped.edges[0]).toMatchObject({
    from: "scope/Organization A",
    to: "scope/Organization B",
    kind: "pivots_to",
    state: "observed",
    count: 1,
  })
  expect(grouped.nodes[0].group).toMatchObject({ internal: 1, outgoing: 1, incoming: 0 })
  expect(grouped.nodes[1].group).toMatchObject({ internal: 0, outgoing: 0, incoming: 1 })
})

test("search reveals exact matching nodes and their declared neighbors without losing entity navigation", () => {
  const document = fixture()

  const related = {
    ...document,
    operation: {
      ...document.operation,
      relations: [
        Operation.Relation.make({
          id: "probe",
          from: "asset/host/0",
          to: "asset/host/600",
          kind: "connects_to",
          state: "observed",
          rationale: "Probe",
          evidence: [],
          createdAt: 1,
          updatedAt: 1,
        }),
      ],
    },
  }

  const result = aggregate(graph(related), new Set(), "Host 600")
  expect(result.nodes.map((node) => node.ref.id)).toEqual(["host/0", "host/600"])
  expect(result.nodes.every((node) => !node.group)).toBe(true)
})

test("supports linked authored nodes, exact detail content, cyclic relations and model layout", () => {
  const document = fixture(2)

  const linked = {
    ...document,
    nodes: [
      Operation.Node.make({
        id: "drawing",
        board: "path",
        title: "Main path host",
        detail: "Full evidence detail",
        kind: "host",
        highlight: true,
        entityType: "asset",
        entityId: "host/0",
        x: 300,
        y: 400,
      }),
    ],
    operation: {
      ...document.operation,
      relations: [
        Operation.Relation.make({
          id: "forward",
          from: "asset/host/0",
          to: "asset/host/1",
          kind: "connects_to",
          state: "confirmed",
          rationale: "Forward",
          evidence: [],
          createdAt: 1,
          updatedAt: 1,
        }),
        Operation.Relation.make({
          id: "reverse",
          from: "asset/host/1",
          to: "asset/host/0",
          kind: "connects_to",
          state: "observed",
          rationale: "Reverse",
          evidence: [],
          createdAt: 1,
          updatedAt: 1,
        }),
      ],
    },
  }

  const topology = graph(linked)
  expect(topology.nodes).toHaveLength(2)
  expect(topology.nodes[0]).toMatchObject({
    title: "Main path host",
    detail: "Full evidence detail",
    ref: { kind: "asset", id: "host/0" },
  })
  expect(positions(topology).get("asset/host/0")).toEqual({ x: 300, y: 400 })
  expect(positions(topology).size).toBe(2)
})

test("large graph projection retains 12000 records without manufacturing relationships", () => {
  const document = fixture(12000)
  const result = aggregate(graph(document), new Set())
  expect(result.nodes).toHaveLength(2)
  expect(result.nodes.flatMap((node) => node.group?.members ?? [])).toHaveLength(12000)
  expect(result.edges).toHaveLength(0)
})

test("scope focus preserves evidenced boundary endpoints and excludes unrelated hosts from another organization", () => {
  const document = fixture(4)

  const topology = graph({
    ...document,
    operation: {
      ...document.operation,
      relations: [
        Operation.Relation.make({
          id: "boundary",
          from: "asset/host/0",
          to: "asset/host/2",
          kind: "connects_to",
          state: "observed",
          rationale: "Response to TCP/22 from the declared source",
          evidence: ["probe"],
          createdAt: 1,
          updatedAt: 1,
        }),
      ],
    },
  })

  const selected = scopeGraph(topology, "Organization A")
  expect(selected.nodes.map((node) => node.ref.id)).toEqual(["host/0", "host/1", "host/2"])
  expect(selected.nodes[2]).toMatchObject({ contextual: true, scope: "Organization B" })
  expect(selected.edges).toHaveLength(1)
})
