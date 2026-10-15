import { lazy, onCleanup, Show, Suspense } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { Command, LinkHandler, MenuItem, onIdle, Panel, Slot, Style, type PanelTab, type Setup, usePanel } from "../sdk"
import type definition from "./index"
import styles from "./style.css?inline"

const setup: Setup<typeof definition> = (ctx) => {
  ctx.add(Style, styles)

  const Workspace = lazy(() => import("./workspace"))

  const open = () => {
    const session = ctx.sessions.current()

    if (session && !session.pending) ctx.layout.open(`${ctx.id}:main`, session)
  }

  ctx.add(
    Command,
    (): Command => ({
      id: "open",
      title: ctx.t("open"),
      group: ctx.t("command.category.view"),
      section: "session",
      bind: "mod+shift+b",
      enabled: !!ctx.sessions.current() && !ctx.sessions.current()?.pending,
      run: open,
    }),
  )
  ctx.add(MenuItem, (): MenuItem | undefined =>
    ctx.sessions.current() && !ctx.sessions.current()?.pending
      ? { menu: "session.panel", id: "open", title: ctx.t("title"), icon: "code-slash", order: 35, run: open }
      : undefined,
  )
  ctx.add(LinkHandler, {
    priority: 10,
    match: (link) => link.origin === ctx.id && !!link.session,
    open: (link) => {
      if (!link.session) return
      ctx.layout.open(`${ctx.id}:main`, link.session)
    },
  })

  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("title")
    },
    label: () => (
      <div class="flex items-center gap-1.5">
        <Icon name="code-slash" size="small" />
        <span>{ctx.t("title")}</span>
      </div>
    ),
    draggable: false,
    closable: "compact",
  }

  ctx.add(Slot, {
    at: "session.header",
    order: 16,
    render: (input) => (
      <Tooltip value={ctx.t("open")} placement="bottom">
        <IconButton
          type="button"
          variant="ghost-muted"
          size="large"
          icon={<Icon name="code-slash" size="normal" />}
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
    mobile: { title: ctx.t("title"), order: 35, kind: "menu", icon: "code-slash" },
    list: (input) => (input.open.includes("main") ? [tab] : []),
    render: (props) => {
      const frame = usePanel()

      return (
        <div class="amon-beaconpass">
          <Show when={props.session.key}>
            <Suspense>
              <Workspace session={props.session} visible={frame.visible()} />
            </Suspense>
          </Show>
        </div>
      )
    },
  })
  onCleanup(onIdle(() => void Workspace.preload()))
}

export default setup
