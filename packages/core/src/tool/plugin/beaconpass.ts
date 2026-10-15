export * as BeaconPassTools from "./beaconpass.js"

import { SystemPart, ToolFailure } from "@opencode/ai"
import type { Context } from "@opencode/plugin/effect/plugin"
import { BeaconPass } from "@opencode/schema/beaconpass"
import { Effect, Schema } from "effect"
import { BeaconPass as Engine } from "../../beaconpass.js"
import { FileAccess } from "../../file-access.js"
import { Permission } from "../../permission.js"

const guidance = `BeaconPass is Amon's local native binary-transformation workspace.

- Use beaconpass.inspect_pe before conversion when architecture, relocations, or managed-code status is unknown.
- Use beaconpass.convert_pe only when the user explicitly asks to transform a PE executable into a shellcode artifact.
- Amon selects its built-in x86/x64 loader stub from the inspected PE and scheme. Only provide stubPath when the user explicitly requests a compatible custom stub.
- Prefer binary output unless the user asks for hex or C source. Relative paths resolve from the active workspace.
- Report the generated artifact path, size, SHA-256, architecture, and job ID. Do not paste binary or large hex output into the conversation.
- A .NET PE or an image without base relocations is not supported by the current native backend; explain the exact limitation returned by the tool.
- BeaconPass jobs and artifacts are also visible in the desktop BeaconPass panel, so do not create duplicate bookkeeping files.`

const failure = (operation: string) => (error: unknown) =>
  new ToolFailure({
    message:
      error instanceof Engine.InvalidInput || error instanceof Engine.Unavailable
        ? error.message
        : `BeaconPass ${operation} failed`,
    error,
  })

export const Plugin = {
  id: "amon.tools.beaconpass",
  effect: Effect.fn("BeaconPassTools.Plugin")(function* (ctx: Context) {
    const beaconpass = yield* Engine.Service
    const access = yield* FileAccess.Service
    const permission = yield* Permission.Service
    const hook = (event: { system: SystemPart[] }) => Effect.sync(() => event.system.push(SystemPart.make(guidance)))
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.tool
      .transform((editor) => {
        editor.namespace({
          name: "beaconpass",
          description:
            "Inspect portable executables and create traceable shellcode artifacts through Amon's local native engine.",
        })
        editor.add({
          name: "status",
          input: Schema.Struct({}),
          output: BeaconPass.Snapshot,
          description: "Read native-engine availability and recent BeaconPass jobs and artifacts.",
          options: { namespace: "beaconpass", codemode: true },
          execute: () => beaconpass.snapshot().pipe(Effect.map((output) => ({ output }))),
        })
        editor.add({
          name: "inspect_pe",
          input: BeaconPass.InspectInput,
          output: BeaconPass.Pe,
          description:
            "Inspect PE architecture, layout, relocations, TLS, managed-code metadata, overlay, and sections before conversion.",
          options: { namespace: "beaconpass", codemode: true, permission: "beaconpass_inspect_pe" },
          execute: (input, context) =>
            Effect.gen(function* () {
              const target = yield* access.resolve({ path: input.path, kind: "file" })
              yield* access.authorizeExternal([target], context)
              yield* permission.assert({
                action: "beaconpass_inspect_pe",
                resources: [target.resource],
                save: ["*"],
                metadata: { paths: [target.resource] },
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.messageID, id: context.id },
              })
              const output = yield* beaconpass.inspect(
                { path: target.absolute },
                {
                  type: "agent",
                  sessionID: context.sessionID,
                  messageID: context.messageID,
                  toolCallID: context.id,
                },
              )
              return { output }
            }).pipe(Effect.mapError(failure("inspection"))),
        })
        editor.add({
          name: "convert_pe",
          input: BeaconPass.ConvertInput,
          output: BeaconPass.ConvertResult,
          description:
            "Convert a native x86/x64 PE with relocations into a shellcode artifact using an architecture-compatible loader stub.",
          options: { namespace: "beaconpass", codemode: true, permission: "beaconpass_convert_pe" },
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = yield* access.resolve({ path: input.path, kind: "file" })
              const stub = input.stubPath
                ? yield* access.resolve({ path: input.stubPath, kind: "file" })
                : undefined
              const output = input.outputPath
                ? yield* access.resolve({ path: input.outputPath, kind: "file" })
                : undefined
              const resources = [source, ...(stub ? [stub] : []), ...(output ? [output] : [])]
              yield* access.authorizeExternal(resources, context)
              yield* permission.assert({
                action: "beaconpass_convert_pe",
                resources: resources.map((item) => item.resource),
                save: ["*"],
                metadata: { paths: [source.resource, ...(stub ? [stub.resource] : [])], output: output?.resource },
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.messageID, id: context.id },
              })
              const result = yield* beaconpass.convert(
                {
                  path: source.absolute,
                  ...(stub === undefined ? {} : { stubPath: stub.absolute }),
                  ...(input.scheme === undefined ? {} : { scheme: input.scheme }),
                  ...(input.format === undefined ? {} : { format: input.format }),
                  ...(output === undefined ? {} : { outputPath: output.absolute }),
                },
                {
                  type: "agent",
                  sessionID: context.sessionID,
                  messageID: context.messageID,
                  toolCallID: context.id,
                },
              )
              return {
                output: result,
                content: `Created BeaconPass artifact ${result.artifact.path}\nArchitecture: ${result.job.architecture}\nSize: ${result.artifact.size} bytes\nSHA-256: ${result.artifact.sha256}\nJob: ${result.job.id}`,
                metadata: { jobID: result.job.id, artifactPath: result.artifact.path },
              }
            }).pipe(Effect.mapError(failure("conversion"))),
        })
      })
      .pipe(Effect.orDie)
  }),
}
