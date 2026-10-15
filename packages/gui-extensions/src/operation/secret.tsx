import { createMemo, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Operation } from "@opencode/schema/operation"
import { createLatest, useExtension, type MountedSession } from "../sdk"
import type definition from "./index"

export function Secret(props: { credential: Operation.Credential; session: MountedSession }) {
  const ctx = useExtension<typeof definition>()
  const [state, set] = createStore({ revealed: false, copy: "copy" })

  const source = createMemo(() =>
    state.revealed
      ? {
          key: `${props.session.key}/${props.credential.id}`,
          id: props.session.id,
          credential: props.credential.id,
          client: props.session.server.client,
        }
      : undefined,
  )

  const resource = createLatest(source, async (current, signal) => ({
    key: current.key,
    secret: (
      await current.client.operation.reveal({ sessionID: current.id, credentialID: current.credential }, { signal })
    ).secret,
  }))

  const value = () =>
    resource.latest?.key === `${props.session.key}/${props.credential.id}` ? resource.latest.secret : undefined

  return (
    <section class="op-secret">
      <header>
        <strong>{[props.credential.realm, props.credential.principal].filter(Boolean).join("\\")}</strong>
        <small>{props.credential.kind}</small>
        <span>{ctx.t(`state.${props.credential.state}`)}</span>
      </header>
      <div>
        <code>
          {state.revealed ? (value() ?? props.credential.secretRef ?? ctx.t("secretUnavailable")) : "••••••••••••"}
        </code>
        <button onClick={() => set("revealed", (current) => !current)}>
          {ctx.t(state.revealed ? "hide" : "reveal")}
        </button>
        <button
          disabled={value() === undefined}
          onClick={() => {
            const secret = value()

            if (secret === undefined) return
            void ctx.system.copy(secret).then(
              () => set("copy", "copied"),
              () => set("copy", "copyFailed"),
            )
          }}
        >
          {ctx.t(state.copy)}
        </button>
      </div>
      <Show when={resource.error}>
        <p role="alert">{ctx.t("unavailable")}</p>
      </Show>
      <small>{props.credential.source}</small>
    </section>
  )
}
