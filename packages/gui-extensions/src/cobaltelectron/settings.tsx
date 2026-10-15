import { For, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useExtension } from "../sdk"
import type definition from "./index"
import { client } from "./model"
import { ConnectionDialog, RemoveDialog } from "./dialog"

export default function Settings() {
  const ctx = useExtension<typeof definition>()

  return (
    <div class="ce-settings" data-action="connections">
      <header>
        <h2>{ctx.t("name")}</h2>
        <Button variant="outline" onClick={() => ctx.dialogs.open(() => <ConnectionDialog />)} disabled={!client(ctx)}>
          {ctx.t("add")}
        </Button>
      </header>
      <Show when={client(ctx)} fallback={<p role="alert">{ctx.t("unavailable")}</p>}>
        <For each={client(ctx)?.state()?.connections}>
          {(item) => (
            <div class="ce-profile">
              <div>
                <strong>{item.profile.name}</strong>
                <span>
                  {item.profile.url} · {item.profile.user}
                </span>
                <span>{ctx.t(`status.${item.status}`)}</span>
                <Show when={item.error}>
                  <span role="alert">{ctx.t(`error.${item.error}`)}</span>
                </Show>
              </div>
              <div>
                <Show when={["connected", "syncing", "connecting", "reconnecting"].includes(item.status)}>
                  <Button variant="ghost" onClick={() => void client(ctx)?.disconnect({ id: item.profile.id })}>
                    {ctx.t("disconnect")}
                  </Button>
                </Show>
                <Button variant="ghost" onClick={() => ctx.dialogs.open(() => <ConnectionDialog connection={item} />)}>
                  {ctx.t("edit")}
                </Button>
                <Button variant="ghost" onClick={() => ctx.dialogs.open(() => <RemoveDialog id={item.profile.id} />)}>
                  {ctx.t("remove")}
                </Button>
              </div>
            </div>
          )}
        </For>
        <Show when={!client(ctx)?.state()?.connections.length}>
          <p>{ctx.t("empty")}</p>
        </Show>
      </Show>
    </div>
  )
}
