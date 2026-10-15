import type { BeaconPass } from "@opencode/schema/beaconpass"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createKeyed, createLatest, useExtension, type MountedSession } from "../sdk"
import type definition from "./index"

export default function Workspace(props: { session: MountedSession; visible: boolean }) {
  const ctx = useExtension<typeof definition>()
  const view = createMemo(() => ctx.stores.view(props.session))

  const [state, set] = createStore<{ refresh: number; busy: boolean; error: string; inspection?: BeaconPass.Pe }>({
    refresh: 0,
    busy: false,
    error: "",
  })

  const source = createMemo(() =>
    props.visible && props.session.server.connected
      ? { key: props.session.key, client: props.session.server.client, refresh: state.refresh }
      : undefined,
  )

  const resource = createLatest(source, async (current, signal) => ({
    key: current.key,
    snapshot: (await current.client.beaconpass.get({}, { signal })).data,
  }))

  const snapshot = () => (resource.latest?.key === props.session.key ? resource.latest.snapshot : undefined)

  createKeyed(
    () => (props.visible ? props.session.server.data : undefined),
    (data) =>
      onCleanup(
        data.listen(({ details }) => {
          if (details.type === "beaconpass.updated") set("refresh", (value) => value + 1)
        }),
      ),
  )

  const update = (field: "path" | "stubPath" | "outputPath", value: string) =>
    void view().update((draft) => {
      draft[field] = value
    })

  const inspect = async () => {
    const current = view().value

    if (!current?.path || state.busy) return
    set({ busy: true, error: "", inspection: undefined })
    await props.session.server.client.beaconpass
      .inspect({ path: current.path })
      .then((result) => set("inspection", result.data))
      .catch((cause) => set("error", cause instanceof Error ? cause.message : String(cause)))
      .finally(() => set("busy", false))
  }

  const convert = async () => {
    const current = view().value

    if (!current?.path || state.busy) return
    set({ busy: true, error: "" })
    await props.session.server.client.beaconpass
      .convert({
        path: current.path,
        stubPath: current.stubPath.trim() || undefined,
        scheme: current.scheme,
        format: current.format,
        outputPath: current.outputPath.trim() || undefined,
      })
      .then((result) => {
        set("refresh", (value) => value + 1)
        ctx.screen.current()?.composer.attach({
          type: "note",
          origin: ctx.id,
          commentID: crypto.randomUUID(),
          icon: "code-slash",
          label: result.data.artifact.name,
          subject: `the BeaconPass artifact ${JSON.stringify(result.data.artifact.id)} at ${JSON.stringify(result.data.artifact.path)}. Its SHA-256 is ${result.data.artifact.sha256} and its size is ${result.data.artifact.size} bytes. Use BeaconPass tools to inspect current job state before acting on it.`,
          comment: ctx.t("attachComment"),
          href: result.data.artifact.id,
        })
      })
      .catch((cause) => set("error", cause instanceof Error ? cause.message : String(cause)))
      .finally(() => set("busy", false))
  }

  const selectScheme = (value: string) => {
    if (value !== "1" && value !== "2") return
    void view().update((draft) => {
      draft.scheme = value
    })
  }

  const selectFormat = (value: string) => {
    if (value !== "binary" && value !== "hex" && value !== "c") return
    void view().update((draft) => {
      draft.format = value
    })
  }

  return (
    <div class="bp-workspace">
      <header class="bp-header">
        <div>
          <Icon name="code-slash" size="small" />
          <strong>{ctx.t("title")}</strong>
        </div>
        <span class="bp-engine" data-ready={snapshot()?.engine.available || false}>
          {snapshot()?.engine.available ? ctx.t("ready") : ctx.t("unavailable")}
        </span>
      </header>
      <nav class="bp-tabs" aria-label={ctx.t("title")}>
        <button
          data-active={view().value?.tab === "convert"}
          onClick={() =>
            void view().update((draft) => {
              draft.tab = "convert"
            })
          }
        >
          {ctx.t("convert")}
        </button>
        <button
          data-active={view().value?.tab === "history"}
          onClick={() =>
            void view().update((draft) => {
              draft.tab = "history"
            })
          }
        >
          {ctx.t("history")}
        </button>
      </nav>
      <Show
        when={view().value?.tab === "convert"}
        fallback={
          <div class="bp-history">
            <Show when={(snapshot()?.jobs.length ?? 0) > 0} fallback={<div class="bp-empty">{ctx.t("empty")}</div>}>
              <For each={snapshot()?.jobs}>
                {(job) => {
                  const artifact = () => snapshot()?.artifacts.find((item) => item.id === job.artifactID)

                  return (
                    <article class="bp-job" data-status={job.status}>
                      <div class="bp-job-main">
                        <strong>{ctx.t(job.operation)}</strong>
                        <span>
                          {job.architecture ?? "—"} · {ctx.t(job.status)}
                        </span>
                      </div>
                      <code title={job.inputPath}>{job.inputPath}</code>
                      <Show when={artifact()}>
                        {(item) => (
                          <div class="bp-artifact">
                            <button onClick={() => ctx.desktop?.reveal(item().path)}>{item().name}</button>
                            <span>
                              {item().size.toLocaleString()} B · {item().sha256.slice(0, 12)}
                            </span>
                          </div>
                        )}
                      </Show>
                      <Show when={job.error}>
                        <p role="alert">{job.error}</p>
                      </Show>
                    </article>
                  )
                }}
              </For>
            </Show>
          </div>
        }
      >
        <div class="bp-form">
          <div class="bp-intro">
            <h3>{ctx.t("formTitle")}</h3>
            <p>{ctx.t("formDescription")}</p>
          </div>
          <TextField
            label={ctx.t("inputPath")}
            value={view().value?.path ?? ""}
            onChange={(value) => update("path", value)}
            placeholder={ctx.t("inputHint")}
          />
          <TextField
            label={ctx.t("stubPath")}
            value={view().value?.stubPath ?? ""}
            onChange={(value) => update("stubPath", value)}
            placeholder={ctx.t("stubHint")}
          />
          <TextField
            label={ctx.t("outputPath")}
            value={view().value?.outputPath ?? ""}
            onChange={(value) => update("outputPath", value)}
            placeholder={ctx.t("outputHint")}
          />
          <div class="bp-options">
            <label>
              {ctx.t("scheme")}
              <select value={view().value?.scheme} onChange={(event) => selectScheme(event.currentTarget.value)}>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
            <label>
              {ctx.t("format")}
              <select value={view().value?.format} onChange={(event) => selectFormat(event.currentTarget.value)}>
                <option value="binary">Binary</option>
                <option value="hex">Hex</option>
                <option value="c">C</option>
              </select>
            </label>
          </div>
          <div class="bp-actions">
            <Button variant="outline" disabled={state.busy || !view().value?.path} onClick={() => void inspect()}>
              {ctx.t("inspect")}
            </Button>
            <Button
              disabled={state.busy || !view().value?.path || !snapshot()?.engine.available}
              onClick={() => void convert()}
            >
              {state.busy ? ctx.t("working") : ctx.t("run")}
            </Button>
          </div>
          <Show when={state.inspection}>
            {(pe) => (
              <section class="bp-inspection">
                <strong>{pe().architecture} PE</strong>
                <span>
                  Entry 0x{pe().entrypoint.toString(16)} · {pe().sections.length} {ctx.t("sections")}
                </span>
                <span>
                  {pe().hasRelocations ? ctx.t("relocations") : ctx.t("noRelocations")} ·{" "}
                  {pe().isDotNet ? ".NET" : ctx.t("native")}
                </span>
              </section>
            )}
          </Show>
          <Show when={state.error}>
            <p class="bp-error" role="alert">
              {state.error}
            </p>
          </Show>
          <Show when={snapshot()?.engine.error}>
            <p class="bp-error" role="alert">
              {snapshot()?.engine.error}
            </p>
          </Show>
        </div>
      </Show>
    </div>
  )
}
