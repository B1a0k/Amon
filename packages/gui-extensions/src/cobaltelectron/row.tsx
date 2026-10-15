import { createMemo, For, Show } from "solid-js"
import { Popover } from "@kobalte/core/popover"
import { Icon } from "@opencode/ui/icon"
import { Button } from "@opencode/ui/button"
import { Menu } from "@opencode/ui/menu"
import { createVisitState, useExtension, type MountedSession } from "../sdk"
import type definition from "./index"
import { binding, client } from "./model"
import { ConnectionDialog } from "./dialog"

export default function Row(props: { session: MountedSession; shown: boolean }) {
  const ctx = useExtension<typeof definition>()
  const choice = createMemo(() => binding(ctx, props.session))
  const [openMenu, setOpenMenu] = createVisitState(false)

  const selected = () =>
    client(ctx)
      ?.state()
      ?.connections.find((item) => item.profile.id === choice().value?.id)

  const open = () => ctx.layout.open(`${ctx.id}:main`, props.session)

  return (
    <Popover
      open={props.shown && openMenu()}
      onOpenChange={setOpenMenu}
      placement="right-start"
      gutter={4}
      modal={false}
    >
      <Popover.Trigger as="button" type="button" class="session-summary-row">
        <Icon name="monitor" class="shrink-0 text-v2-icon-icon-muted" />
        <span class="session-summary-label">{ctx.t("name")}</span>
        <Icon name="fill-triangle-down" class="session-summary-menu-indicator shrink-0 text-v2-icon-icon-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="session-service-menu ce-connection-menu" aria-label={ctx.t("name")}>
          <Show when={client(ctx)} fallback={<p role="alert">{ctx.t("unavailable")}</p>}>
            <Menu appearance="standard">
              <Menu.Trigger as={Button} variant="ghost">
                {selected()?.profile.name ?? ctx.t("choose")}
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content>
                  <Menu.Item
                    onSelect={() =>
                      void choice().update((draft) => {
                        draft.id = ""
                      })
                    }
                  >
                    {ctx.t("none")}
                  </Menu.Item>
                  <For each={client(ctx)?.state()?.connections}>
                    {(item) => (
                      <Menu.Item
                        onSelect={() =>
                          void choice().update((draft) => {
                            draft.id = item.profile.id
                          })
                        }
                      >
                        {item.profile.name}
                      </Menu.Item>
                    )}
                  </For>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
            <Show when={selected()}>
              {(item) => (
                <div class="ce-connection-actions">
                  <span>{ctx.t(`status.${item().status}`)}</span>
                  <Show when={item().error}>
                    <p role="alert">{ctx.t(`error.${item().error}`)}</p>
                  </Show>
                  <Button variant="ghost" onClick={open}>
                    {ctx.t("open")}
                  </Button>
                  <Show
                    when={["connected", "syncing", "connecting", "reconnecting"].includes(item().status)}
                    fallback={
                      <Button
                        variant="ghost"
                        onClick={() =>
                          ctx.dialogs.open(() => <ConnectionDialog connection={item()} saved={() => open()} />)
                        }
                      >
                        {ctx.t("connect")}
                      </Button>
                    }
                  >
                    <Button variant="ghost" onClick={() => void client(ctx)?.disconnect({ id: item().profile.id })}>
                      {ctx.t("disconnect")}
                    </Button>
                  </Show>
                </div>
              )}
            </Show>
            <Button
              variant="ghost"
              onClick={() =>
                ctx.dialogs.open(() => (
                  <ConnectionDialog
                    saved={(id) => {
                      void choice().update((draft) => {
                        draft.id = id
                      })
                      open()
                    }}
                  />
                ))
              }
            >
              {ctx.t("add")}
            </Button>
            <Button variant="ghost" onClick={() => ctx.layout.settings(ctx.id)}>
              {ctx.t("configure")}
            </Button>
          </Show>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}
