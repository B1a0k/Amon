export * as BeaconPass from "./beaconpass.js"

import { Schema } from "effect"
import { Event } from "./event.js"
import { optional } from "./schema.js"
import { Session } from "./session.js"
import { SessionMessage } from "./session-message.js"

const Text = Schema.String

export const JobID = Text.annotate({ identifier: "BeaconPass.JobID" })
export type JobID = typeof JobID.Type

export const ArtifactID = Text.annotate({
  identifier: "BeaconPass.ArtifactID",
})
export type ArtifactID = typeof ArtifactID.Type

export const Source = Schema.Union([
  Schema.Struct({ type: Schema.Literal("manual") }),
  Schema.Struct({
    type: Schema.Literal("agent"),
    sessionID: Session.ID,
    messageID: SessionMessage.ID,
    toolCallID: Text,
  }),
]).annotate({ identifier: "BeaconPass.Source" })
export type Source = typeof Source.Type

export const Engine = Schema.Struct({
  available: Schema.Boolean,
  name: Text,
  version: Text,
  target: Text,
  error: Text.pipe(optional),
  capabilities: Schema.Array(Schema.Literals(["inspect_pe", "convert_pe"])),
}).annotate({ identifier: "BeaconPass.Engine" })
export interface Engine extends Schema.Schema.Type<typeof Engine> {}

export const Section = Schema.Struct({
  name: Text,
  virtualAddress: Schema.Int,
  virtualSize: Schema.Int,
  rawOffset: Schema.Int,
  rawSize: Schema.Int,
}).annotate({ identifier: "BeaconPass.Section" })
export interface Section extends Schema.Schema.Type<typeof Section> {}

export const Pe = Schema.Struct({
  path: Text,
  architecture: Schema.Literals(["x86", "x64"]),
  entrypoint: Schema.Int,
  imageBase: Text,
  sectionAlignment: Schema.Int,
  fileAlignment: Schema.Int,
  imageSize: Schema.Int,
  headerSize: Schema.Int,
  hasRelocations: Schema.Boolean,
  hasTls: Schema.Boolean,
  isDotNet: Schema.Boolean,
  overlaySize: Schema.Int,
  sections: Schema.Array(Section),
}).annotate({ identifier: "BeaconPass.Pe" })
export interface Pe extends Schema.Schema.Type<typeof Pe> {}

export const Artifact = Schema.Struct({
  id: ArtifactID,
  jobID: JobID,
  kind: Schema.Literals(["shellcode", "report"]),
  name: Text,
  path: Text,
  mediaType: Text,
  size: Schema.Int,
  sha256: Text,
  createdAt: Schema.Finite,
}).annotate({ identifier: "BeaconPass.Artifact" })
export interface Artifact extends Schema.Schema.Type<typeof Artifact> {}

export const Job = Schema.Struct({
  id: JobID,
  operation: Schema.Literals(["inspect_pe", "convert_pe"]),
  status: Schema.Literals(["running", "succeeded", "failed"]),
  source: Source,
  inputPath: Text,
  outputPath: Text.pipe(optional),
  stubPath: Text.pipe(optional),
  scheme: Schema.Literals(["1", "2"]).pipe(optional),
  format: Schema.Literals(["binary", "hex", "c"]).pipe(optional),
  architecture: Schema.Literals(["x86", "x64"]).pipe(optional),
  artifactID: ArtifactID.pipe(optional),
  error: Text.pipe(optional),
  createdAt: Schema.Finite,
  completedAt: Schema.Finite.pipe(optional),
}).annotate({ identifier: "BeaconPass.Job" })
export interface Job extends Schema.Schema.Type<typeof Job> {}

export const Snapshot = Schema.Struct({
  engine: Engine,
  jobs: Schema.Array(Job),
  artifacts: Schema.Array(Artifact),
}).annotate({ identifier: "BeaconPass.Snapshot" })
export interface Snapshot extends Schema.Schema.Type<typeof Snapshot> {}

export const InspectInput = Schema.Struct({ path: Text }).annotate({ identifier: "BeaconPass.InspectInput" })
export interface InspectInput extends Schema.Schema.Type<typeof InspectInput> {}

export const ConvertInput = Schema.Struct({
  path: Text,
  stubPath: Text.pipe(Schema.optionalKey),
  scheme: Schema.Literals(["1", "2"]).pipe(Schema.optionalKey),
  format: Schema.Literals(["binary", "hex", "c"]).pipe(Schema.optionalKey),
  outputPath: Text.pipe(Schema.optionalKey),
}).annotate({ identifier: "BeaconPass.ConvertInput" })
export interface ConvertInput extends Schema.Schema.Type<typeof ConvertInput> {}

export const ConvertResult = Schema.Struct({ job: Job, artifact: Artifact }).annotate({
  identifier: "BeaconPass.ConvertResult",
})
export interface ConvertResult extends Schema.Schema.Type<typeof ConvertResult> {}

export const Updated = Event.ephemeral({
  type: "beaconpass.updated",
  schema: { jobID: JobID, status: Job.fields.status },
})
export const Events = { Updated }
