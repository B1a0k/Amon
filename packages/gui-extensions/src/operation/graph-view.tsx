import { createMemo, createUniqueId, For, onCleanup, Show, type JSX } from "solid-js"
import { Key } from "@solid-primitives/keyed"
import { createStore } from "solid-js/store"
import { Action } from "./action"
import { Tooltip } from "@opencode/ui/tooltip"
import { useExtension, createKeyed } from "../sdk"
import { aggregate, positions, type Edge, type Graph, type Node, type Ref } from "./graph"

type Gesture = { end?: () => void }

export function GraphView(props: { graph: Graph; query: string; navigate: (ref: Ref) => void }) {
  const ctx = useExtension()
  const marker = createUniqueId()
  let element: HTMLDivElement | undefined

  const [state, set] = createStore<{ expanded: string[]; zoom: number; x: number; y: number; arrangement: number }>({
    expanded: [],
    zoom: 1,
    x: 0,
    y: 0,
    arrangement: 0,
  })

  const drag: Gesture = {}
  onCleanup(() => drag.end?.())
  createKeyed(
    () => props.query,
    () => set({ x: 0, y: 0, zoom: 1 }),
  )
  const view = createMemo(() => aggregate(props.graph, new Set(state.expanded), props.query))

  const layout = createMemo(() =>
    positions(
      state.arrangement
        ? { ...view(), nodes: view().nodes.map((node) => ({ ...node, x: undefined, y: undefined })) }
        : view(),
    ),
  )

  const bounds = createMemo(() => {
    const points = [...layout().values()]
    const left = Math.min(0, ...points.map((item) => item.x - 140))
    const top = Math.min(0, ...points.map((item) => item.y - 80))

    return {
      left,
      top,
      width: Math.max(500, ...points.map((item) => item.x + 160 - left)),
      height: Math.max(360, ...points.map((item) => item.y + 195 - top)),
    }
  })

  const nodes = createMemo(() => new Map(view().nodes.map((node) => [node.id, node])))
  const title = (node: Node) => node.title || ctx.t(node.id.includes("/address/") ? "addressContext" : "unknownScope")

  const choose = (node: Node) => {
    if (!node.group) return props.navigate(node.ref)
    set({ expanded: [...state.expanded, node.group.key], x: 0, y: 0, zoom: 1 })
  }

  const down: JSX.EventHandler<SVGSVGElement, PointerEvent> = (event) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    drag.end?.()
    const svg = event.currentTarget
    svg.setPointerCapture(event.pointerId)
    const start = { x: event.clientX, y: event.clientY, tx: state.x, ty: state.y }

    const move = (next: PointerEvent) => {
      const rect = svg.getBoundingClientRect()
      set({
        x: start.tx + ((next.clientX - start.x) * bounds().width) / rect.width,
        y: start.ty + ((next.clientY - start.y) * bounds().height) / rect.height,
      })
    }

    const end = () => {
      svg.removeEventListener("pointermove", move)
      svg.removeEventListener("pointerup", end)
      svg.removeEventListener("pointercancel", end)
      drag.end = undefined

      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
    }

    drag.end = end
    svg.addEventListener("pointermove", move)
    svg.addEventListener("pointerup", end)
    svg.addEventListener("pointercancel", end)
  }

  return (
    <div class="op-graph" ref={element}>
      <div class="op-graph-controls">
        <Action
          icon="branch"
          label={ctx.t("relayout")}
          run={() => set({ x: 0, y: 0, zoom: 1, arrangement: state.arrangement + 1 })}
        />
        <Action icon="collapse" label={ctx.t("fit")} run={() => set({ x: 0, y: 0, zoom: 1 })} />
        <Action icon="dash" label={ctx.t("zoomOut")} run={() => set("zoom", (value) => Math.max(0.2, value / 1.2))} />
        <Action icon="plus" label={ctx.t("zoomIn")} run={() => set("zoom", (value) => Math.min(8, value * 1.2))} />
        <Action
          icon="expand"
          label={ctx.t("fullscreen")}
          run={() => {
            const host = element
            const result = document.fullscreenElement ? document.exitFullscreen() : host?.requestFullscreen()
            void result?.catch(() => undefined)
          }}
        />
        <Show when={state.expanded.length}>
          <Action icon="collapse" label={ctx.t("collapse")} run={() => set({ expanded: [], x: 0, y: 0, zoom: 1 })} />
        </Show>
      </div>
      <Show when={view().nodes.length === 0}>
        <p class="op-graph-empty">{ctx.t("noMatch")}</p>
      </Show>
      <svg
        viewBox={`${bounds().left} ${bounds().top} ${bounds().width} ${bounds().height}`}
        aria-label={ctx.t("graph")}
        onPointerDown={down}
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g
          transform={`translate(${state.x} ${state.y}) translate(${bounds().left + bounds().width / 2} ${bounds().top + bounds().height / 2}) scale(${state.zoom}) translate(${-bounds().left - bounds().width / 2} ${-bounds().top - bounds().height / 2})`}
        >
          <Key each={view().edges} by="id">
            {(edge) => {
              const from = () => layout().get(edge().from),
                to = () => layout().get(edge().to)

              return (
                <Show when={from() && to()}>
                  <>
                    <path
                      class={`op-edge kind-${edge().kind} state-${edge().state}${edge().line ? ` line-${edge().line}` : ""}`}
                      marker-end={`url(#${marker})`}
                      d={edgePath(edge(), layout(), nodes())}
                    >
                      <title>
                        {edge().label} · {ctx.t(`state.${edge().state}`)}
                        {edge().count ? ` · ${edge().count}` : ""}
                      </title>
                    </path>
                    <Show when={view().edges.length <= 60}>
                      <text class="op-edge-label" x={(from()!.x + to()!.x) / 2} y={(from()!.y + to()!.y) / 2 - 8}>
                        {edge().label === edge().kind ? ctx.t(`relation.${edge().kind}`) : edge().label}
                        {edge().count ? ` · ${edge().count}` : ""}
                      </text>
                    </Show>
                  </>
                </Show>
              )
            }}
          </Key>
          <Key each={view().nodes} by="id">
            {(node) => (
              <g
                transform={`translate(${layout().get(node().id)?.x ?? 0} ${layout().get(node().id)?.y ?? 0})`}
                class={`op-node kind-${node().category ?? node().ref.kind} state-${node().state}${node().group ? " is-group" : ""}${node().highlight ? " is-highlighted" : ""}${node().contextual ? " is-contextual" : ""}`}
                role="button"
                tabindex="0"
                aria-label={`${title(node())}${node().group ? ` · ${ctx.plural("members", node().group!.members.length)}` : ""}`}
                onClick={() => choose(node())}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    choose(node())
                  }
                }}
              >
                <title>
                  {[title(node()), node().detail, ...(node().group?.preview ?? [])].filter(Boolean).join("\n")}
                </title>
                <circle class="op-node-ring" r={node().group ? 43 : node().highlight ? 22 : 18} />
                <circle class="op-node-dot" r={node().group ? 32 : 12} />
                <Show when={node().ref.kind === "access" && node().state === "active"}>
                  <text class="op-node-star">★</text>
                </Show>
                <Show when={node().group}>
                  <circle class="op-node-halo" r="47" />
                  <text class="op-group-count" text-anchor="middle" dominant-baseline="central">
                    {node().group!.members.length}
                  </text>
                </Show>
                <text class="op-node-title" text-anchor="middle" y={node().group ? 66 : 40}>
                  {title(node()).length > 36 ? `${title(node()).slice(0, 35)}…` : title(node())}
                </text>
                <Show when={!node().group}>
                  <text class="op-node-detail" text-anchor="middle" y="57">
                    {node().detail.length > 42 ? `${node().detail.slice(0, 41)}…` : node().detail}
                  </text>
                </Show>
                <Show when={node().group}>
                  {(group) => (
                    <>
                      <text class="op-node-detail" text-anchor="middle" y="86">
                        {[...group().counts].map(([kind, count]) => `${ctx.t(`kind.${kind}`)} ${count}`).join(" · ")}
                      </text>
                      <text class="op-node-detail" text-anchor="middle" y="103">
                        {ctx.plural("internal", group().internal)}
                      </text>
                      <text class="op-node-detail" text-anchor="middle" y="120">
                        {ctx.t("boundaries", { incoming: group().incoming, outgoing: group().outgoing })}
                      </text>
                      <text class="op-node-detail" text-anchor="middle" y="138">
                        {[...group().states]
                          .flatMap(([key, count]) =>
                            ["observed", "unverified"].includes(key) ? [] : [`${ctx.t(`state.${key}`)} ${count}`],
                          )
                          .join(" · ")}
                      </text>
                      <For each={group().preview.slice(0, 2)}>
                        {(label, index) => (
                          <text class="op-node-detail" text-anchor="middle" y={156 + index() * 16}>
                            {label.length > 36 ? `${label.slice(0, 35)}…` : label}
                          </text>
                        )}
                      </For>
                    </>
                  )}
                </Show>
              </g>
            )}
          </Key>
        </g>
      </svg>
      <footer>
        <span>{ctx.plural("counts", props.graph.nodes.length, { edges: props.graph.edges.length })}</span>
        <Tooltip value={ctx.t("grouping")} placement="top">
          <div class="op-legend" aria-label={ctx.t("legend")}>
            <For each={["asset", "access", "finding"]}>
              {(kind) => (
                <span class={`kind-${kind}`}>
                  <i />
                  {ctx.t(`kind.${kind}`)}
                </span>
              )}
            </For>
          </div>
        </Tooltip>
      </footer>
    </div>
  )
}

function edgePath(edge: Edge, layout: ReadonlyMap<string, { x: number; y: number }>, nodes: ReadonlyMap<string, Node>) {
  const from = layout.get(edge.from)!,
    to = layout.get(edge.to)!

  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy) || 1

  const startRadius = nodes.get(edge.from)?.group ? 48 : 24,
    endRadius = nodes.get(edge.to)?.group ? 48 : 24

  const start = { x: from.x + (dx / length) * startRadius, y: from.y + (dy / length) * startRadius }
  const end = { x: to.x - (dx / length) * endRadius, y: to.y - (dy / length) * endRadius }

  if (edge.path === "straight") return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  const middle = (start.x + end.x) / 2

  if (edge.path === "elbow") return `M ${start.x} ${start.y} H ${middle} V ${end.y} H ${end.x}`

  return `M ${start.x} ${start.y} C ${middle} ${start.y}, ${middle} ${end.y}, ${end.x} ${end.y}`
}
