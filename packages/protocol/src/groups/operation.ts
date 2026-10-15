import { optional } from "@opencode/schema/schema"
import { Operation } from "@opencode/schema/operation"
import { SessionMessage } from "@opencode/schema/session-message"
import { Session } from "@opencode/schema/session"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { SessionNotFoundError } from "../errors.js"

export const OperationGroup = HttpApiGroup.make("server.operation")
  .annotateMerge(OpenApi.annotations({ title: "operation" }))
  .add(
    HttpApiEndpoint.get("operation.get", "/api/session/:sessionID/operation", {
      params: { sessionID: Session.ID },
      success: Schema.Struct({ data: Operation.Document }),
      error: SessionNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "operation.get",
        summary: "Read operation workspace",
        description:
          "Read the session-owned situation workspace. Delegated sessions share their parent workspace. Credential plaintext is omitted.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("operation.reveal", "/api/session/:sessionID/operation/credential/:credentialID", {
      params: { sessionID: Session.ID, credentialID: Schema.String },
      success: Schema.Struct({ data: Schema.Struct({ secret: Schema.String.pipe(optional) }) }),
      error: SessionNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "operation.reveal",
        summary: "Reveal one operation credential",
        description:
          "Read the exact stored secret on user demand; values are never abbreviated. Uses the server's existing authorization boundary.",
      }),
    ),
  )

  .add(
    HttpApiEndpoint.get("operation.audit", "/api/session/:sessionID/operation/audit", {
      params: { sessionID: Session.ID },
      query: Schema.Struct({ before: SessionMessage.ID.pipe(Schema.optional) }),
      success: Schema.Struct({ data: Operation.AuditPage }),
      error: SessionNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "operation.audit",
        summary: "Read native execution audit",
        description:
          "Page through this session's original tool execution records, including running and failed calls. Does not duplicate execution logs or credential values.",
      }),
    ),
  )
