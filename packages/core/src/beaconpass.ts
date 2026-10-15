export * as BeaconPass from "./beaconpass.js"

import { native } from "@amon/native"
import { BeaconPass } from "@opencode/schema/beaconpass"
import { Identifier } from "@opencode/schema/identifier"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { createHash } from "node:crypto"
import path from "node:path"
import { Bus } from "./bus.js"
import { KV } from "./kv.js"
import { Location } from "./location.js"

const Stored = Schema.Struct({ jobs: Schema.Array(BeaconPass.Job), artifacts: Schema.Array(BeaconPass.Artifact) })

export class InvalidInput extends Schema.TaggedError<InvalidInput>()("BeaconPass.InvalidInput", {
  message: Schema.String,
  field: Schema.String,
}) {}

export class Unavailable extends Schema.TaggedError<Unavailable>()("BeaconPass.Unavailable", {
  message: Schema.String,
}) {}

export interface Interface {
  readonly snapshot: () => Effect.Effect<BeaconPass.Snapshot>
  readonly inspect: (
    input: BeaconPass.InspectInput,
    source: BeaconPass.Source,
  ) => Effect.Effect<BeaconPass.Pe, InvalidInput | Unavailable>
  readonly convert: (
    input: BeaconPass.ConvertInput,
    source: BeaconPass.Source,
  ) => Effect.Effect<BeaconPass.ConvertResult, InvalidInput | Unavailable>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/BeaconPass") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const global = yield* Global.Service
    const fs = yield* FSUtil.Service
    const kv = yield* KV.Service
    const bus = yield* Bus.Service
    const lock = Semaphore.makeUnsafe(1)
    const key = `beaconpass:location:${location.project.id}`
    const root = path.join(global.data, "beaconpass", location.project.id)
    const decode = Schema.decodeUnknownSync(Stored)
    const encode = Schema.encodeSync(Schema.toCodecJson(Stored))

    const load = Effect.fn("BeaconPass.load")(function* () {
      const stored = yield* kv.get(key)
      return stored ? decode(stored) : { jobs: [], artifacts: [] }
    })
    const save = Effect.fn("BeaconPass.save")((stored: typeof Stored.Type) => kv.set(key, encode(stored)))
    const resolve = (value: string) => path.resolve(location.directory, value)
    const engine = () =>
      Effect.try({
        try: () => native().engineInfo(),
        catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
      })

    const engineState = () =>
      engine().pipe(
        Effect.match({
          onFailure: (error): BeaconPass.Engine => ({
            available: false,
            name: "amon-native",
            version: "",
            target: `${process.platform}-${process.arch}`,
            error,
            capabilities: [],
          }),
          onSuccess: (info): BeaconPass.Engine => ({
            available: true,
            name: info.name,
            version: info.version,
            target: info.target,
            capabilities: ["inspect_pe", "convert_pe"],
          }),
        }),
      )

    const requireFile = Effect.fn("BeaconPass.requireFile")(function* (value: string, field: string) {
      const target = resolve(value)
      const info = yield* fs
        .stat(target)
        .pipe(Effect.mapError(() => new InvalidInput({ message: `File is unavailable: ${value}`, field })))
      if (info.type !== "File") return yield* new InvalidInput({ message: `Not a file: ${value}`, field })
      return target
    })

    const record = Effect.fn("BeaconPass.record")(function* (job: BeaconPass.Job, artifact?: BeaconPass.Artifact) {
      yield* lock.withPermit(
        Effect.gen(function* () {
          const stored = yield* load()
          const jobs = [job, ...stored.jobs.filter((item) => item.id !== job.id)].slice(0, 500)
          const artifacts = artifact
            ? [artifact, ...stored.artifacts.filter((item) => item.id !== artifact.id)].slice(0, 500)
            : stored.artifacts
          yield* save({ jobs, artifacts })
        }),
      )
      yield* bus.publish(BeaconPass.Updated, { jobID: job.id, status: job.status })
    })

    const inspect = Effect.fn("BeaconPass.inspect")(function* (
      input: BeaconPass.InspectInput,
      source: BeaconPass.Source,
    ) {
      const inputPath = yield* requireFile(input.path, "path")
      const jobID = Identifier.create(false)
      const started: BeaconPass.Job = {
        id: jobID,
        operation: "inspect_pe",
        status: "running",
        source,
        inputPath,
        createdAt: Date.now(),
      }
      yield* record(started)
      const result = yield* Effect.gen(function* () {
        const runtime = yield* Effect.try({
          try: native,
          catch: (cause) => new Unavailable({ message: cause instanceof Error ? cause.message : String(cause) }),
        })
        return yield* Effect.tryPromise({
          try: () => runtime.inspectPe(inputPath),
          catch: (cause) =>
            new InvalidInput({ message: cause instanceof Error ? cause.message : String(cause), field: "path" }),
        })
      }).pipe(
        Effect.tapError((error) =>
          record({ ...started, status: "failed", error: error.message, completedAt: Date.now() }),
        ),
      )
      yield* record({
        ...started,
        status: "succeeded",
        architecture: result.architecture,
        completedAt: Date.now(),
      })
      return {
        path: inputPath,
        architecture: result.architecture,
        entrypoint: result.entrypoint,
        imageBase: result.imageBase,
        sectionAlignment: result.sectionAlignment,
        fileAlignment: result.fileAlignment,
        imageSize: result.imageSize,
        headerSize: result.headerSize,
        hasRelocations: result.hasRelocations,
        hasTls: result.hasTls,
        isDotNet: result.isDotNet,
        overlaySize: result.overlaySize,
        sections: [...result.sections],
      }
    })

    const convert = Effect.fn("BeaconPass.convert")(function* (
      input: BeaconPass.ConvertInput,
      source: BeaconPass.Source,
    ) {
      const inputPath = yield* requireFile(input.path, "path")
      const stubPath = input.stubPath ? yield* requireFile(input.stubPath, "stubPath") : undefined
      const format = input.format ?? "binary"
      const scheme = input.scheme ?? "1"
      const jobID = Identifier.create(false)
      const rawPath = path.join(root, "work", `${jobID}.bin`)
      const extension = format === "binary" ? ".bin" : format === "hex" ? ".hex" : ".c"
      const outputPath = input.outputPath
        ? resolve(input.outputPath)
        : path.join(root, "artifacts", `${jobID}${extension}`)
      const started: BeaconPass.Job = {
        id: jobID,
        operation: "convert_pe",
        status: "running",
        source,
        inputPath,
        outputPath,
        stubPath,
        scheme,
        format,
        createdAt: Date.now(),
      }
      yield* record(started)
      const converted = yield* Effect.gen(function* () {
        const runtime = yield* Effect.try({
          try: native,
          catch: (cause) => new Unavailable({ message: cause instanceof Error ? cause.message : String(cause) }),
        })
        const result = yield* Effect.tryPromise({
          try: () => runtime.convertPe(inputPath, stubPath ?? "", rawPath, scheme),
          catch: (cause) =>
            new InvalidInput({ message: cause instanceof Error ? cause.message : String(cause), field: "path" }),
        })
        const raw = yield* fs
          .readFile(rawPath)
          .pipe(Effect.mapError(() => new Unavailable({ message: "Native conversion output is unavailable" })))
        const content =
          format === "binary"
            ? raw
            : new TextEncoder().encode(
                format === "hex"
                  ? Buffer.from(raw).toString("hex")
                  : `unsigned char amon_payload[] = {${[...raw].map((value) => `0x${value.toString(16).padStart(2, "0")}`).join(",")}};\nunsigned int amon_payload_len = ${raw.length};\n`,
              )
        yield* fs
          .writeWithDirs(outputPath, content)
          .pipe(Effect.mapError(() => new Unavailable({ message: "Unable to write the BeaconPass artifact" })))
        yield* fs.remove(rawPath).pipe(Effect.ignore)
        return { result, content }
      }).pipe(
        Effect.tapError((error) =>
          Effect.all([
            fs.remove(rawPath).pipe(Effect.ignore),
            record({ ...started, status: "failed", error: error.message, completedAt: Date.now() }),
          ]),
        ),
      )
      const artifact: BeaconPass.Artifact = {
        id: `sha256:${createHash("sha256").update(converted.content).digest("hex")}`,
        jobID,
        kind: "shellcode",
        name: path.basename(outputPath),
        path: outputPath,
        mediaType: format === "binary" ? "application/octet-stream" : "text/plain",
        size: converted.content.length,
        sha256: createHash("sha256").update(converted.content).digest("hex"),
        createdAt: Date.now(),
      }
      const job: BeaconPass.Job = {
        ...started,
        status: "succeeded",
        architecture: converted.result.architecture,
        artifactID: artifact.id,
        completedAt: Date.now(),
      }
      yield* record(job, artifact)
      return { job, artifact }
    })

    return Service.of({
      snapshot: () =>
        Effect.all({ engine: engineState(), stored: load() }).pipe(
          Effect.map(({ engine, stored }) => ({ engine, jobs: stored.jobs, artifacts: stored.artifacts })),
        ),
      inspect,
      convert,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Location.node, Global.node, FSUtil.node, KV.node, Bus.node],
})
