import { getOwner, lazy, onCleanup, runWithOwner, Show, Suspense } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import {
  bindExtension,
  Command,
  LinkHandler,
  MenuItem,
  onIdle,
  Panel,
  SettingsPage,
  Style,
  type MountedSession,
  type PanelTab,
  type Setup,
} from "../sdk"
import { Integration } from "../details/contract"
import { Projects, Selection } from "./contract"
import type { Persisted } from "../sdk"
import type definition from "./index"
import styles from "./audit.css?inline"
import { readReference } from "./reference"

const setup: Setup<typeof definition> = (ctx) => {
  ctx.add(Style, styles)
  const owner = getOwner()
  const projects = new Map<string, Persisted<typeof Selection.Type>>()
  ctx.provide(Projects, {
    binding: (session) => {
      const key = JSON.stringify([session.server.id, session.directory])
      const saved = projects.get(key)

      if (saved) return saved

      // Storage resources belong to the extension, not whichever popover or panel asks first.
      const store = runWithOwner(owner, () =>
        ctx.storage.store("connection", {
          schema: Selection,
          initial: { id: "" },
          scope: { server: session.server.id, directory: session.directory },
        }),
      )

      if (!store) throw new Error("Project storage could not be opened")
      projects.set(key, store)

      return store
    },
  })
  onCleanup(() => projects.clear())
  const Workspace = lazy(() => import("./workspace"))
  const Row = lazy(() => import("./row"))
  const Settings = lazy(() => import("./settings"))
  const ReferenceNotice = lazy(() => import("./dialog").then((module) => ({ default: module.ReferenceNotice })))

  ctx.add(LinkHandler, {
    priority: 10,
    match: (link) => link.origin === ctx.id && !!link.session,
    open: (link) => {
      const session = ctx.sessions.current()
      const reference = readReference(link.href)
      const live = ctx.uses.audit()
      const projects = ctx.uses.projects()

      const connection =
        live.status === "active"
          ? live.value.state()?.connections.find((item) => item.profile.id === reference?.profile)
          : undefined

      if (!session || session.key !== link.session?.key) return

      if (
        !reference ||
        projects.status !== "active" ||
        !connection ||
        connection.profile.url !== reference.endpoint ||
        (reference.server && connection.serverId && connection.serverId !== reference.server)
      ) {
        ctx.dialogs.open(() => (
          <Suspense>
            <ReferenceNotice />
          </Suspense>
        ))

        return
      }

      void projects.value.binding(session).update((draft) => {
        draft.id = connection.profile.id
      })
      void ctx.stores.view(session).update((draft) => {
        draft.profile = connection.profile.id
        draft.session = reference.session
      })
      ctx.layout.open(`${ctx.id}:main`, session, { background: link.background })
    },
  })

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
      bind: "mod+shift+h",
      enabled: !!ctx.sessions.current() && !ctx.sessions.current()?.pending,
      run: open,
    }),
  )
  ctx.add(MenuItem, (): MenuItem | undefined =>
    ctx.sessions.current() && !ctx.sessions.current()?.pending
      ? {
          menu: "session.panel",
          id: "open",
          title: ctx.t("title"),
          icon: "monitor",
          keybind: `${ctx.id}.open`,
          order: 40,
          run: open,
        }
      : undefined,
  )
  ctx.add(Integration, {
    id: "connection",
    order: 10,
    Row: bindExtension((props: { session: MountedSession; shown: boolean }) => (
      <Suspense>
        <Row session={props.session} shown={props.shown} />
      </Suspense>
    )),
  })
  ctx.add(SettingsPage, {
    id: ctx.id,
    get title() {
      return ctx.t("name")
    },
    icon: "monitor",
    available: "desktop",
    entries: [
      {
        id: ctx.id,
        get title() {
          return ctx.t("configure")
        },
      },
    ],
    render: () => (
      <Suspense>
        <Settings />
      </Suspense>
    ),
  })

  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("title")
    },
    draggable: false,
    closable: "compact",
    label: () => (
      <div class="flex items-center gap-1.5">
        <Icon name="monitor" size="small" />
        <span class="max-w-40 truncate">{ctx.t("title")}</span>
      </div>
    ),
  }

  ctx.add(Panel, {
    id: "main",
    region: "side",
    mobile: {
      get title() {
        return ctx.t("title")
      },
      icon: "monitor",
      order: 36,
      kind: "menu",
    },
    list: (input) => (input.open.includes("main") ? [tab] : []),
    render: (props) => (
      <div class="ce-audit">
        <Show when={props.session.key} keyed>
          {(_key) => (
            <Suspense>
              <Workspace session={props.session} screen={props.screen} />
            </Suspense>
          )}
        </Show>
      </div>
    ),
  })
  onCleanup(
    onIdle(() => {
      void Workspace.preload()
      void Row.preload()
    }),
  )
}

export default setup
