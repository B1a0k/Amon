import { For, Show } from "solid-js"
import { createVirtualizer } from "@tanstack/solid-virtual"
import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { useExtension } from "../sdk"
import type definition from "./index"
import type { Session } from "./contract"
import { cell, columns, timedOut, type Column } from "./protocol"

/** The viewport and its observer mount together, including a list restored after leaving Interact. */
export function SessionTable(props: {
  rows: readonly Session[]
  sort: string
  descending: boolean
  connected: boolean
  onSort: (column: Column) => void
  onInteract: (id: string) => void
  onAttach: (id: string) => void
}) {
  const ctx = useExtension<typeof definition>()
  let element: HTMLDivElement | undefined

  const virtualizer = createVirtualizer({
    get count() {
      return props.rows.length
    },
    getScrollElement: () => element ?? null,
    estimateSize: () => 32,
    overscan: 12,
  })

  return (
    <div class="ce-table-scroll" ref={element}>
      <table class="ce-table" aria-label={ctx.t("title")}>
        <thead>
          <tr>
            <th scope="col" aria-label={ctx.t("icon")} />
            <For each={columns}>
              {(column) => (
                <th
                  scope="col"
                  aria-sort={props.sort === column ? (props.descending ? "descending" : "ascending") : "none"}
                >
                  <button type="button" onClick={() => props.onSort(column)}>
                    {ctx.t(`field.${column}`)}
                    <Show when={props.sort === column}>
                      <Icon name={props.descending ? "chevron-down" : "chevron-up"} size="small" />
                    </Show>
                  </button>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <tr aria-hidden="true">
            <td
              colSpan={14}
              style={{ height: `${virtualizer.getVirtualItems()[0]?.start ?? 0}px`, padding: "0", border: "0" }}
            />
          </tr>
          <For each={virtualizer.getVirtualItems()}>
            {(virtual) => (
              <Show when={props.rows[virtual.index]}>
                {(item) => (
                  <Menu.Context appearance="standard">
                    <Menu.Context.Trigger
                      as="tr"
                      tabIndex={0}
                      data-unavailable={!props.connected || !item().alive || timedOut(item())}
                      onDblClick={() => props.onInteract(item().id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") props.onInteract(item().id)
                      }}
                    >
                      <td>
                        <span
                          class="ce-agent"
                          data-online={props.connected && item().alive && !timedOut(item())}
                          title={`${item().type} · ${item().os} · ${ctx.t(!props.connected || !item().alive ? "status.disconnected" : timedOut(item()) ? "timedOut" : "status.connected")}${item().admin ? ` · ${ctx.t("admin")}` : ""}`}
                        >
                          <Icon name={item().type === "gopher" ? "terminal" : "monitor"} size="small" />
                        </span>
                      </td>
                      <For each={columns}>
                        {(column) => (
                          <td title={cell(item(), column, ctx.t)}>
                            <Show when={column === "user" && item().admin} fallback={cell(item(), column, ctx.t)}>
                              <strong>{cell(item(), column, ctx.t)}</strong>
                            </Show>
                          </td>
                        )}
                      </For>
                    </Menu.Context.Trigger>
                    <Menu.Context.Portal>
                      <Menu.Context.Content>
                        <Menu.Item onSelect={() => props.onAttach(item().id)}>
                          <Icon name="plus" />
                          {ctx.t("attach")}
                        </Menu.Item>
                        <Menu.Separator />
                        <Menu.Item onSelect={() => props.onInteract(item().id)}>
                          <Icon name="terminal" />
                          {ctx.t("interact")}
                        </Menu.Item>
                      </Menu.Context.Content>
                    </Menu.Context.Portal>
                  </Menu.Context>
                )}
              </Show>
            )}
          </For>
          <tr aria-hidden="true">
            <td
              colSpan={14}
              style={{
                height: `${Math.max(0, virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0))}px`,
                padding: "0",
                border: "0",
              }}
            />
          </tr>
        </tbody>
      </table>
      <Show when={!props.rows.length}>
        <div class="ce-empty">{ctx.t("noSessions")}</div>
      </Show>
    </div>
  )
}
