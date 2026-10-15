import { lazy, onCleanup, Show, Suspense } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Keybind } from "@opencode/ui/keybind"
import { Tooltip } from "@opencode/ui/tooltip"
import {
  Command,
  LinkHandler,
  MenuItem,
  onIdle,
  Panel,
  Slot,
  Style,
  type SessionRef,
  type PanelTab,
  type Setup,
  usePanel,
} from "../sdk"
import { Reference, Situation } from "./contract"
import { Schema } from "effect"
import type definition from "./index"
import styles from "./operation.css?inline"

const setup: Setup<typeof definition> = (ctx) => {
  // Styles belong to the extension lifetime, including a restored pane before its lazy chunk resolves.
  ctx.add(Style, styles)
  const Workspace = lazy(() => import("./workspace"))

  const open = (session: SessionRef, reference?: Reference) => {
    if (reference)
      void ctx.stores.view(session).update((draft) => {
        draft.selection = reference
        draft.tab =
          reference.kind === "finding"
            ? "findings"
            : ["hypothesis", "drawing"].includes(reference.kind)
              ? "paths"
              : "assets"
      })
    ctx.layout.open(`${ctx.id}:main`, session)
  }

  ctx.provide(Situation, { open })

  ctx.add(Command, (): Command => {
    const session = ctx.sessions.current()

    return {
      id: "open",
      title: ctx.t("open"),
      group: ctx.t("command.category.view"),
      section: "session",
      bind: "mod+shift+g",
      enabled: !!session && !session.pending,
      run: () => session && open(session),
    }
  })
  ctx.add(MenuItem, (): MenuItem | undefined => {
    const session = ctx.sessions.current()

    if (!session || session.pending) return undefined

    return {
      menu: "session.panel",
      id: "open",
      title: ctx.t("title"),
      icon: "radar",
      keybind: `${ctx.id}.open`,
      order: 30,
      run: () => open(session),
    }
  })
  ctx.add(LinkHandler, {
    priority: 10,
    match: (link) => link.origin === ctx.id && !!link.session,
    open: (link) => {
      if (!link.session) return
      const divider = link.href.indexOf("/")

      const reference = {
        kind: link.href.slice(0, divider),
        id: new URLSearchParams(`reference=${link.href.slice(divider + 1)}`).get("reference") ?? "",
      }

      open(link.session, Schema.is(Reference)(reference) ? reference : undefined)
    },
  })

  onCleanup(onIdle(() => void Workspace.preload()))

  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("title")
    },
    label: () => (
      <div class="flex items-center gap-1.5">
        <Icon name="radar" size="small" />
        <span class="max-w-40 truncate">{ctx.t("title")}</span>
      </div>
    ),
    draggable: false,
    closable: "compact",
  }

  ctx.add(Slot, {
    at: "session.header",
    order: 15,
    render: (input) => (
      <Tooltip
        value={
          <>
            {ctx.t("open")}
            <Show when={ctx.keybinds.keybind(`${ctx.id}.open`).length > 0}>
              <Keybind keys={[...ctx.keybinds.keybind(`${ctx.id}.open`)]} variant="neutral" />
            </Show>
          </>
        }
        placement="bottom"
      >
        <IconButton
          type="button"
          variant="ghost-muted"
          size="large"
          icon={<Icon name="radar" size="normal" />}
          disabled={input.session.pending}
          aria-label={ctx.t("open")}
          aria-pressed={ctx.layout.state(`${ctx.id}:main`, input.session) === "visible"}
          onClick={() => ctx.layout.toggle(`${ctx.id}:main`, input.session)}
        />
      </Tooltip>
    ),
  })
  ctx.add(Panel, {
    id: "main",
    region: "side",
    mobile: {
      get title() {
        return ctx.t("title")
      },
      order: 35,
      kind: "menu",
      icon: "radar",
    },
    list: (input) => (input.open.includes("main") ? [tab] : []),
    render: (props) => {
      const frame = usePanel()

      return (
        <div class="amon-operation-panel">
          <Show when={props.session.key} keyed>
            {(_key) => (
              <Suspense>
                <Workspace session={props.session} visible={frame.visible()} />
              </Suspense>
            )}
          </Show>
        </div>
      )
    },
  })
}

export default setup
