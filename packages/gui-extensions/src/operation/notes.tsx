import { For, Show } from "solid-js"
import { Operation } from "@opencode/schema/operation"
import { useExtension } from "../sdk"

export function Notes(props: { document: Operation.Document; board: string }) {
  const ctx = useExtension()

  return (
    <Show when={props.document.cards.length > 0 || props.document.tables.length > 0}>
      <details class="op-notes">
        <summary>{ctx.t("notes")}</summary>
        <For each={props.document.cards.filter((item) => !props.board || item.board === props.board)}>
          {(item) => (
            <section class="op-details">
              <h4>{item.title}</h4>
              <pre>{item.body}</pre>
            </section>
          )}
        </For>
        <For each={props.document.tables.filter((item) => !props.board || item.board === props.board)}>
          {(item) => (
            <div class="op-table-wrap">
              <h4>{item.title}</h4>
              <table>
                <thead>
                  <tr>
                    <For each={item.columns}>{(column) => <th>{column}</th>}</For>
                  </tr>
                </thead>
                <tbody>
                  <For each={item.rows}>
                    {(row) => (
                      <tr>
                        <For each={row.cells}>{(cell) => <td>{cell}</td>}</For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          )}
        </For>
      </details>
    </Show>
  )
}
