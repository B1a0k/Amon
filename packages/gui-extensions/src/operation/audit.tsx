import { For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createKeyed, createLatest, useExtension, type MountedSession } from "../sdk"
import type definition from "./index"

export function ExecutionAudit(props: { session: MountedSession; visible: boolean }) {
  const ctx = useExtension<typeof definition>()
  const [state, set] = createStore<{ refresh: number; before?: string }>({ refresh: 0 })

  const resource = createLatest(
    () =>
      props.visible && props.session.server.connected
        ? {
            client: props.session.server.client,
            sessionID: props.session.id,
            before: state.before,
            refresh: state.refresh,
          }
        : undefined,
    async (input, signal) =>
      input.client.operation.audit({ sessionID: input.sessionID, before: input.before }, { signal }),
  )

  createKeyed(
    () => props.session.server.data,
    (data) =>
      onCleanup(
        data.listen(({ details }) => {
          if (
            ["session.tool.called", "session.tool.success", "session.tool.failed"].includes(details.type) &&
            "sessionID" in details.data &&
            details.data.sessionID === props.session.id
          )
            set("refresh", (value) => value + 1)
        }),
      ),
  )

  return (
    <section>
      <Show when={resource.error}>
        <p role="alert">{ctx.t("unavailable")}</p>
      </Show>
      <div class="op-table-wrap">
        <table>
          <thead>
            <tr>
              <For each={["tool", "state", "duration", "message"]}>{(key) => <th>{ctx.t(key)}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={resource.latest?.records}>
              {(item) => (
                <tr>
                  <td>
                    <code>{item.toolName}</code>
                    <small>{item.id}</small>
                    <For each={item.steps}>
                      {(step) => (
                        <small>
                          {step.toolName} · {ctx.t(`state.${step.state}`)}
                        </small>
                      )}
                    </For>
                    <Show when={item.stepCount > item.steps.length}>
                      <small>{ctx.plural("executionSteps", item.stepCount)}</small>
                    </Show>
                    <Show when={item.error}>
                      <pre>{item.error}</pre>
                    </Show>
                  </td>
                  <td>{ctx.t(`state.${item.state}`)}</td>
                  <td>
                    {item.completedAt === undefined
                      ? "—"
                      : `${Math.max(0, Math.round((item.completedAt - item.startedAt) / 1000))}s`}
                  </td>
                  <td>
                    <code>{item.messageID}</code>
                    <small>{new Date(item.startedAt).toLocaleString()}</small>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="op-pager">
        <button disabled={!state.before} onClick={() => set("before", undefined)}>
          {ctx.t("latest")}
        </button>
        <button disabled={!resource.latest?.next} onClick={() => set("before", resource.latest?.next)}>
          {ctx.t("older")}
        </button>
      </div>
    </section>
  )
}
