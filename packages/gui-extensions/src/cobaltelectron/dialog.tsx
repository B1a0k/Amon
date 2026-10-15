import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { Switch } from "@opencode/ui/switch"
import { useDialog } from "@opencode/ui/context/dialog"
import { createStore } from "solid-js/store"
import { Show } from "solid-js"
import { useExtension } from "../sdk"
import type definition from "./index"
import type { Connection } from "./contract"
import { client, errorKey } from "./model"

export function ConnectionDialog(props: { connection?: Connection; saved?: (id: string) => void }) {
  const ctx = useExtension<typeof definition>()
  const dialog = useDialog()

  const [form, set] = createStore({
    id: props.connection?.profile.id ?? crypto.randomUUID(),
    name: props.connection?.profile.name ?? "",
    url: props.connection?.profile.url ?? "",
    user: props.connection?.profile.user ?? "",
    password: "",
    remember: props.connection?.savedPassword ?? false,
    busy: false,
    error: "",
  })

  const submit = async (connect: boolean) => {
    const api = client(ctx)

    if (!api || form.busy) return
    set({ busy: true, error: "" })
    await api
      .save({
        profile: {
          id: form.id,
          name: form.name.trim(),
          url: form.url.trim(),
          user: form.user.trim(),
          certificate: props.connection?.profile.certificate ?? "",
        },
        password: form.password,
        remember: form.remember,
      })
      .then(async () => {
        if (ctx.signal.aborted) return

        if (connect) {
          await api.connect({ id: form.id, password: form.password || undefined })

          // Older desktop providers resolve connect even when authentication failed; inspect their published result.
          const result = api.state()?.connections.find((item) => item.profile.id === form.id)

          if (result?.status === "failed") throw new Error(result.error || "connection")
        }

        if (ctx.signal.aborted) return
        props.saved?.(form.id)
        set("password", "")
        dialog.close()
      })
      .catch((cause) => {
        if (!ctx.signal.aborted) set("error", ctx.t(errorKey(cause)))
      })
      .finally(() => {
        if (!ctx.signal.aborted) set("busy", false)
      })
  }

  return (
    <Dialog fit containerClass="ce-connection-dialog" class="ce-dialog-content">
      <DialogHeader>
        <DialogTitle>{ctx.t(props.connection ? "edit" : "add")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="ce-dialog-body">
        <div class="ce-form">
          <label>
            {ctx.t("profile")}
            <TextInput
              aria-label={ctx.t("profile")}
              value={form.name}
              onInput={(event) => set("name", event.currentTarget.value)}
              disabled={form.busy}
            />
          </label>
          <label>
            {ctx.t("endpoint")}
            <TextInput
              aria-label={ctx.t("endpoint")}
              placeholder="https://teamserver.example:50050"
              value={form.url}
              onInput={(event) => set("url", event.currentTarget.value)}
              disabled={form.busy}
            />
          </label>
          <label>
            {ctx.t("username")}
            <TextInput
              aria-label={ctx.t("username")}
              value={form.user}
              onInput={(event) => set("user", event.currentTarget.value)}
              disabled={form.busy}
              autocomplete="username"
            />
          </label>
          <label>
            {ctx.t("password")}
            <TextInput
              aria-label={ctx.t("password")}
              type="password"
              placeholder={props.connection?.savedPassword ? ctx.t("passwordHint") : undefined}
              value={form.password}
              onInput={(event) => set("password", event.currentTarget.value)}
              disabled={form.busy}
              autocomplete="current-password"
            />
          </label>
          <Switch
            checked={form.remember}
            onChange={(checked) => set("remember", checked)}
            disabled={!client(ctx)?.state()?.secureStorage || form.busy}
          >
            {ctx.t("remember")}
          </Switch>
          <Show when={form.error}>
            <p role="alert">{form.error}</p>
          </Show>
          <Show when={!client(ctx)}>
            <p role="alert">{ctx.t("unavailable")}</p>
          </Show>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => dialog.close()}>
          {ctx.t("cancel")}
        </Button>
        <Button variant="outline" disabled={form.busy || !client(ctx)} onClick={() => void submit(false)}>
          {ctx.t("save")}
        </Button>
        <Button disabled={form.busy || !client(ctx)} onClick={() => void submit(true)}>
          {ctx.t("connect")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export function RemoveDialog(props: { id: string }) {
  const ctx = useExtension<typeof definition>()
  const dialog = useDialog()
  const [state, set] = createStore({ busy: false, error: "" })

  return (
    <Dialog fit containerClass="ce-connection-dialog" class="ce-dialog-content">
      <DialogHeader>
        <DialogTitle>{ctx.t("removeTitle")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="ce-dialog-body">
        <p>{ctx.t("removeDescription")}</p>
        <Show when={state.error}>
          <p role="alert">{state.error}</p>
        </Show>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => dialog.close()}>
          {ctx.t("cancel")}
        </Button>
        <Button
          disabled={state.busy || !client(ctx)}
          onClick={() => {
            set("busy", true)
            void client(ctx)
              ?.remove({ id: props.id })
              .then(() => dialog.close())
              .catch((cause) => set("error", ctx.t(errorKey(cause))))
              .finally(() => set("busy", false))
          }}
        >
          {ctx.t("remove")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export function ReferenceNotice() {
  const ctx = useExtension<typeof definition>()
  const dialog = useDialog()

  return (
    <Dialog fit containerClass="ce-connection-dialog" class="ce-dialog-content">
      <DialogHeader>
        <DialogTitle>{ctx.t("referenceUnavailable")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="ce-dialog-body">
        <p>{ctx.t("referenceUnavailableDescription")}</p>
      </DialogBody>
      <DialogFooter>
        <Button onClick={() => dialog.close()}>{ctx.t("common.close")}</Button>
      </DialogFooter>
    </Dialog>
  )
}
