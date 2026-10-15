import { Operation } from "@opencode/core/operation"
import { SessionNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"

export const OperationHandler = HttpApiBuilder.group(Api, "server.operation", (handlers) =>
  Effect.gen(function* () {
    const operation = yield* Operation.Service
    return handlers
      .handle("operation.get", (ctx) =>
        operation.read(ctx.params.sessionID).pipe(
          Effect.map((data) => ({ data })),
          Effect.catchTag(
            "Operation.SessionNotFound",
            (error) => new SessionNotFoundError({ sessionID: error.sessionID, message: "Session not found" }),
          ),
        ),
      )
      .handle("operation.audit", (ctx) =>
        operation.audit(ctx.params.sessionID, ctx.query.before).pipe(
          Effect.map((data) => ({ data })),
          Effect.catchTag(
            "Operation.SessionNotFound",
            (error) => new SessionNotFoundError({ sessionID: error.sessionID, message: "Session not found" }),
          ),
        ),
      )
      .handle("operation.reveal", (ctx) =>
        operation.reveal(ctx.params.sessionID, ctx.params.credentialID).pipe(
          Effect.map((secret) => ({ data: { secret } })),
          Effect.catchTag(
            "Operation.SessionNotFound",
            (error) => new SessionNotFoundError({ sessionID: error.sessionID, message: "Session not found" }),
          ),
        ),
      )
  }),
)
