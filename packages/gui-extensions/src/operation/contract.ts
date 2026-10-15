import { Schema } from "effect"
import { Contract, type SessionRef } from "../sdk"

/** A stable record reference; identifiers stay qualified by their record kind. */
export const Reference = Schema.Struct({
  kind: Schema.Literals(["asset", "service", "surface", "credential", "access", "finding", "hypothesis", "drawing"]),
  id: Schema.String,
})

export interface Reference extends Schema.Schema.Type<typeof Reference> {}

export interface Situation {
  /** Opens this session's situation pane, optionally revealing a record in its corresponding view. */
  open(session: SessionRef, reference?: Reference): void
}

/** Other extensions can reveal situation records without knowing its panels or persisted keys. */
export const Situation = Contract.define<Situation, "operation">("operation")
