import type { Data } from "@opencode/client/solid"
import { OpenCode } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import {
  Panel,
  Slot,
  type Context,
  type Definition,
  type MountedSession,
  type ServerRef,
} from "@opencode/gui-extensions/sdk"
import { builtins } from "@opencode/gui-extensions/renderer"
import { mountSessionRegion } from "./extension-host.fixture"

declare global {
  interface Window {
    operationHost?: ReturnType<typeof mountOperation>
  }
}

export function mountOperation(input: { language?: "en" | "zh"; neighbors?: boolean } = {}) {
  const definition = builtins.find((entry) => entry.id === "operation")

  if (!definition) throw new Error("Situation extension is not in the production composition")
  const listeners = new Set<Parameters<Data["listen"]>[0]>()
  const writes: string[] = []

  // SAFETY: this isolated host test exercises production Operation, which consumes only the event listener from Data;
  // the API methods are the real generated client and HTTP is intercepted by the keeper suite.
  const data = {
    listen: (listener: Parameters<Data["listen"]>[0]) => {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
  } as Data

  const server: ServerRef = {
    id: "operation-test",
    name: "Operation test",
    url: location.origin,
    client: OpenCode.make({ baseUrl: location.origin }),
    data,
    local: true,
    builtin: false,
    compatible: true,
    connected: true,
  }

  const session = (id: string): MountedSession => ({
    id: `ses_${id}`,
    key: `${server.id}\n${id}`,
    tab: id,
    server,
    pending: false,
    location: { directory: "/test" },
    directory: "/test",
    project: undefined,
    listedProject: undefined,
    local: true,
    background: [],
    visit: {},
  })

  const host = mountSessionRegion({
    definitions: [
      definition,
      ...(input.neighbors
        ? [
            {
              id: "neighbor",
              renderer: async () => ({
                default: (ctx: Context) => {
                  ctx.add(Slot, {
                    at: "session.header",
                    order: 10,
                    render: (slot) => (
                      <IconButton
                        variant="ghost-muted"
                        size="large"
                        icon={<Icon name="status" />}
                        aria-label="Neighbor panel"
                        onClick={() => ctx.layout.open("neighbor:main", slot.session)}
                      />
                    ),
                  })
                  ctx.add(Panel, {
                    id: "main",
                    region: "side",
                    list: () => [{ id: "main", title: "Neighbor", fallback: true }],
                    render: () => (
                      <div role="region" aria-label="Neighbor content">
                        Independent original panel
                      </div>
                    ),
                  })
                },
              }),
            } satisfies Definition,
          ]
        : []),
    ],
    language: input.language,
    interactive: true,
    active: "operation:main",
    session,
    layout: {
      ready: () => true,
      open: (_id, session) => void writes.push(session?.id ?? ""),
      close() {},
      toggle: (_id, input) => void writes.push(input?.id ?? ""),
      state: () => "visible",
      stored: () => ["operation:main"],
      side: { opened: () => true, toggle() {} },
      sidebar: { opened: () => false },
      dock: { opened: () => false, placement: () => "bottom" },
      scroll: { get: () => undefined, set() {} },
    },
  })

  host.container.setAttribute("aria-label", "Operation test workspace")
  host.container.style.cssText =
    "position:fixed;inset:0;background:var(--background-base);padding:16px;display:flex;flex-direction:column;z-index:10;min-width:0"
  const controls = document.createElement("div")
  controls.style.cssText = "display:flex;gap:8px"
  ;["a", "b"].forEach((id) => {
    const button = document.createElement("button")
    button.textContent = `Session ${id}`
    button.onclick = () => host.route(id)
    controls.appendChild(button)
  })
  host.container.prepend(controls)

  return {
    ...host,
    writes,
    listeners,
    refresh: (sessionID: string) =>
      listeners.forEach((listener) =>
        listener({
          name: "operation.updated",
          details: {
            type: "operation.updated",
            id: "evt_operation-refresh",
            created: 0,
            data: { sessionID, revision: 2 },
          },
        }),
      ),
  }
}
