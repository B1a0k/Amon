import { batch, createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { createKeyed, createLatest, useExtension, type MountedSession, type SessionScreen } from "../sdk"
import type definition from "./index"
import { binding, client, errorKey } from "./model"
import { cell, columns } from "./protocol"
import { SessionTable } from "./table"
import { ConnectionDialog } from "./dialog"
import { hostNote } from "./reference"

export default function Workspace(props: { session: MountedSession; screen: SessionScreen }) {
  const ctx = useExtension<typeof definition>()
  const choice = createMemo(() => binding(ctx, props.session))
  const view = createMemo(() => ctx.stores.view(props.session))

  const connection = () =>
    client(ctx)
      ?.state()
      ?.connections.find((item) => item.profile.id === choice().value?.id)

  const selected = () => (view().value?.profile === connection()?.profile.id ? view().value?.session : "")

  const [state, set] = createStore<{
    before?: number
    copied: boolean
    error: string
    follow: boolean
    busy: boolean
    switching: boolean
  }>({
    copied: false,
    error: "",
    follow: true,
    busy: false,
    switching: false,
  })

  let log: HTMLDivElement | undefined

  const rows = createMemo(() => {
    const sort = columns.find((column) => column === view().value?.sort) ?? "internal"
    const comparator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

    return (connection()?.sessions ?? []).toSorted(
      (a, b) => comparator.compare(cell(a, sort, ctx.t), cell(b, sort, ctx.t)) * (view().value?.descending ? -1 : 1),
    )
  })

  const source = createMemo(() => {
    const item = connection()
    const id = selected()
    const api = client(ctx)

    return item && id && api
      ? {
          api,
          id: item.profile.id,
          session: id,
          revision: state.before === undefined ? (item.logRevision ?? item.revision) : 0,
          before: state.before,
        }
      : undefined
  })

  const outputs = createLatest(source, async (current, signal) => ({
    id: current.id,
    session: current.session,
    page: await current.api.outputs({ id: current.id, session: current.session, before: current.before }, { signal }),
  }))

  const page = () =>
    outputs.latest?.id === connection()?.profile.id && outputs.latest?.session === selected()
      ? outputs.latest?.page
      : undefined

  // Follow new output only while the user remains at the live tail; reading older text preserves the viewport.
  createKeyed(
    () => outputs.latest,
    () => {
      if (!state.follow || state.before !== undefined || !page()) return

      const frame = requestAnimationFrame(() => {
        if (log) log.scrollTop = log.scrollHeight
      })

      onCleanup(() => cancelAnimationFrame(frame))
    },
  )

  const interact = (id: string) => {
    set({ before: undefined, copied: false, error: "", follow: true })
    void view().update((draft) => {
      draft.profile = connection()?.profile.id ?? ""
      draft.session = id
    })
  }

  const attach = (id: string) => {
    const current = connection()
    const host = current?.sessions.find((item) => item.id === id)

    if (!current || !host) return

    const note = hostNote(
      current,
      host,
      ctx.id,
      ctx.t("attachComment", { id: host.id, connection: current.profile.name }),
    )

    // An explicit re-attachment refreshes this host's snapshot without stacking stale copies in the draft.
    batch(() => {
      props.screen.composer.detach(note.commentID)
      props.screen.composer.attach(note)
    })
  }

  const copy = async () => {
    await ctx.system
      .copy((page()?.entries ?? []).map((entry) => entry.text).join("\n"))
      .then(() => set("copied", true))
      .catch((cause) => set("error", ctx.t(errorKey(cause))))
  }

  const save = async () => {
    const current = source()

    if (!current) return
    const chunks: string[] = []
    let before: number | undefined
    let more = true

    while (more && !ctx.signal.aborted) {
      const result = await current.api.outputs(
        { id: current.id, session: current.session, before },
        { signal: ctx.signal },
      )

      chunks.unshift(
        result.entries.map((entry) => `[${entry.when || ""}] ${entry.from} ${entry.type}\n${entry.text}`).join("\n"),
      )
      more = result.more
      before = result.entries[0]?.sequence
    }

    if (ctx.signal.aborted) return
    await ctx.system.save({
      name: `audit-${current.session.replace(/[^\w.-]/g, "_")}.txt`,
      content: chunks.join("\n"),
    })
  }

  const reconnect = () => {
    const item = connection()
    const api = client(ctx)

    if (!item || !api || state.busy) return

    if (!item.savedPassword) {
      ctx.dialogs.open(() => <ConnectionDialog connection={item} />)

      return
    }

    set({ busy: true, error: "" })
    void api
      .connect({ id: item.profile.id }, { signal: ctx.signal })
      .catch((cause) => {
        if (!ctx.signal.aborted) set("error", ctx.t(errorKey(cause)))
      })
      .finally(() => {
        if (!ctx.signal.aborted) set("busy", false)
      })
  }

  return (
    <>
      <div class="ce-toolbar">
        <Show when={selected()}>
          <IconButton
            icon={<Icon name="arrow-left" />}
            variant="ghost-muted"
            aria-label={ctx.t("back")}
            onClick={() => {
              set({ before: undefined, copied: false, error: "", follow: true })
              void view().update((draft) => {
                draft.session = ""
              })
            }}
          />
        </Show>
        <span class="ce-heading">
          <Icon name="server" size="small" />
          <span title={connection()?.profile.name}>{connection()?.profile.name ?? ctx.t("none")}</span>
          <Show when={selected()}>
            <span class="ce-session-name">
              {connection()?.sessions.find((item) => item.id === selected())?.computer || selected()}
            </span>
          </Show>
        </span>
        <Show when={connection()}>
          {(item) => (
            <span class="ce-status" role="status">
              {ctx.t(`status.${item().status}`)}
            </span>
          )}
        </Show>
        <Menu appearance="standard" modal={false} placement="bottom-end" onOpenChange={() => set("switching", false)}>
          <Menu.Trigger
            as={IconButton}
            icon={<Icon name="outline-dots" />}
            variant="ghost-muted"
            aria-label={ctx.t("more")}
          />
          <Menu.Portal>
            <Menu.Content class="max-h-[66.667dvh] max-w-72 overflow-y-auto">
              <Show
                when={!state.switching}
                fallback={
                  <>
                    <Menu.Item closeOnSelect={false} onSelect={() => set("switching", false)}>
                      <Icon name="arrow-left" />
                      {ctx.t("backMenu")}
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.RadioGroup
                      value={choice().value?.id ?? ""}
                      onChange={(id) => {
                        set({ before: undefined, copied: false, error: "", follow: true })
                        void choice().update((draft) => {
                          draft.id = id
                        })
                      }}
                    >
                      <Menu.RadioItem value="" closeOnSelect>
                        {ctx.t("none")}
                      </Menu.RadioItem>
                      <For each={client(ctx)?.state()?.connections}>
                        {(item) => (
                          <Menu.RadioItem value={item.profile.id} closeOnSelect>
                            <span class="min-w-0 flex-1 truncate" title={item.profile.name}>
                              {item.profile.name}
                            </span>
                          </Menu.RadioItem>
                        )}
                      </For>
                    </Menu.RadioGroup>
                  </>
                }
              >
                <Show when={connection()}>
                  {(item) => (
                    <>
                      <Menu.Item disabled={state.busy || !client(ctx)} onSelect={reconnect}>
                        <Icon name="refresh" />
                        {ctx.t("reconnect")}
                      </Menu.Item>
                      <Menu.Item
                        disabled={state.busy || !client(ctx) || item().status === "disconnected"}
                        onSelect={() => {
                          set("error", "")
                          void client(ctx)
                            ?.disconnect({ id: item().profile.id }, { signal: ctx.signal })
                            .catch((cause) => {
                              if (!ctx.signal.aborted) set("error", ctx.t(errorKey(cause)))
                            })
                        }}
                      >
                        <Icon name="circle-xmark" />
                        {ctx.t("disconnect")}
                      </Menu.Item>
                    </>
                  )}
                </Show>
                <Menu.Item
                  closeOnSelect={false}
                  disabled={state.busy || !client(ctx)}
                  onSelect={() => set("switching", true)}
                >
                  <Icon name="server" />
                  {ctx.t("switch")}
                </Menu.Item>
                <Menu.Separator />
                <Show when={selected()}>
                  <Menu.Item
                    disabled={!connection()?.sessions.some((item) => item.id === selected())}
                    onSelect={() => attach(selected() ?? "")}
                  >
                    <Icon name="plus" />
                    {ctx.t("attach")}
                  </Menu.Item>
                  <Menu.Item onSelect={() => void copy()}>
                    <Icon name="copy" />
                    {ctx.t(state.copied ? "copied" : "copy")}
                  </Menu.Item>
                  <Menu.Item onSelect={() => void save().catch((cause) => set("error", ctx.t(errorKey(cause))))}>
                    <Icon name="download" />
                    {ctx.t("export")}
                  </Menu.Item>
                  <Menu.Separator />
                </Show>
                <Menu.Item
                  disabled={state.busy || !client(ctx)}
                  onSelect={() =>
                    ctx.dialogs.open(() => (
                      <ConnectionDialog
                        saved={(id) =>
                          void choice().update((draft) => {
                            draft.id = id
                          })
                        }
                      />
                    ))
                  }
                >
                  <Icon name="plus" />
                  {ctx.t("add")}
                </Menu.Item>
                <Menu.Item onSelect={() => ctx.layout.settings(ctx.id)}>
                  <Icon name="settings-gear" />
                  {ctx.t("configure")}
                </Menu.Item>
              </Show>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
      </div>
      <Show when={!client(ctx)}>
        <p class="ce-message" role="alert">
          {ctx.t("unavailable")}
        </p>
      </Show>
      <Show when={connection()?.error}>
        <p class="ce-message" role="alert">
          {ctx.t(`error.${connection()?.error}`)}
        </p>
      </Show>
      <Show when={state.error}>
        <p class="ce-message" role="alert">
          {state.error}
        </p>
      </Show>
      <Show
        when={connection()}
        fallback={
          <div class="ce-empty">
            <Icon name="monitor" size="large" />
            <h3>{ctx.t("empty")}</h3>
            <p>{ctx.t("emptyDescription")}</p>
            <Button
              variant="ghost"
              disabled={!client(ctx)}
              onClick={() =>
                ctx.dialogs.open(() => (
                  <ConnectionDialog
                    saved={(id) =>
                      void choice().update((draft) => {
                        draft.id = id
                      })
                    }
                  />
                ))
              }
            >
              {ctx.t("add")}
            </Button>
          </div>
        }
      >
        <Show when={connection()?.status !== "connected" && connection()?.sessions.length}>
          <p class="ce-message">{ctx.t("stale")}</p>
        </Show>
        <Show
          when={selected()}
          fallback={
            <>
              <SessionTable
                rows={rows()}
                connected={connection()?.status === "connected"}
                sort={view().value?.sort ?? ""}
                descending={view().value?.descending ?? false}
                onSort={(column) =>
                  void view().update((draft) => {
                    draft.descending = draft.sort === column ? !draft.descending : false
                    draft.sort = column
                  })
                }
                onInteract={interact}
                onAttach={attach}
              />
            </>
          }
        >
          <Show when={!connection()?.sessions.some((item) => item.id === selected())}>
            <p class="ce-message">{ctx.t("removed")}</p>
          </Show>
          <Show when={outputs.error}>
            <p class="ce-message" role="alert">
              {ctx.t("error.connection")}
            </p>
          </Show>
          <Show when={page()?.dropped}>
            <p class="ce-message">{ctx.t("dropped", { count: page()?.dropped ?? 0 })}</p>
          </Show>
          <div
            class="ce-log"
            ref={log}
            role="log"
            aria-label={ctx.t("audit")}
            onScroll={(event) => {
              const element = event.currentTarget
              set("follow", element.scrollHeight - element.scrollTop - element.clientHeight < 32)
            }}
          >
            <Show when={page()?.more}>
              <Button variant="ghost" onClick={() => set({ before: page()?.entries[0]?.sequence, follow: false })}>
                {ctx.t("history")}
              </Button>
            </Show>
            <Show when={state.before !== undefined || !state.follow}>
              <Button
                variant="ghost"
                onClick={() => {
                  set({ before: undefined, follow: true })

                  if (log) log.scrollTop = log.scrollHeight
                }}
              >
                {ctx.t("latest")}
              </Button>
            </Show>
            <For each={page()?.entries}>
              {(entry) => (
                <div class="ce-log-entry" data-type={entry.type}>
                  <header>
                    <Show when={entry.when}>{new Date(entry.when).toLocaleString()}</Show> {entry.from} · {entry.type}
                  </header>
                  {entry.text}
                </div>
              )}
            </For>
            <Show when={!page()?.entries.length && !outputs.loading}>
              <p>{ctx.t("noOutput")}</p>
            </Show>
          </div>
        </Show>
      </Show>
    </>
  )
}
