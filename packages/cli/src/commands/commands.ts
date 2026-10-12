import { Argument, Flag, GlobalFlag } from "effect/cli"
import { Schema } from "effect"
import { Spec } from "../framework/spec"

export const PrintLogs = GlobalFlag.Setting("print-logs")({
  flag: Flag.Boolean("print-logs").pipe(Flag.withDefault(false)),
})

// Private process-control interface used by the desktop and SSH integration.
export const Commands = Spec.make("amon-engine", {
  description: "Amon desktop engine",
  commands: [
    Spec.make("serve", {
      description: "Run the local desktop engine",
      params: {
        hostname: Flag.String("hostname").pipe(Flag.optional),
        port: Flag.Int("port").pipe(Flag.optional),
        cors: Flag.String("cors").pipe(Flag.withSchema(Schema.NonEmptyString), Flag.atLeast(0)),
        service: Flag.Boolean("service").pipe(Flag.withDefault(false)),
        stdio: Flag.Boolean("stdio").pipe(Flag.withDefault(false)),
      },
    }),
    Spec.make("service", {
      description: "Manage the desktop engine process",
      commands: [
        Spec.make("start", { description: "Start the engine" }),
        Spec.make("restart", { description: "Restart the engine" }),
        Spec.make("status", { description: "Report the engine address" }),
        Spec.make("stop", { description: "Stop the engine" }),
        Spec.make("get", {
          description: "Read engine configuration",
          params: {
            key: Argument.String("key").pipe(Argument.optional),
            name: Argument.String("name").pipe(Argument.optional),
          },
        }),
        Spec.make("set", {
          description: "Configure the desktop engine",
          params: {
            key: Argument.String("key"),
            value: Argument.String("value"),
            nestedValue: Argument.String("nestedValue").pipe(Argument.optional),
          },
        }),
        Spec.make("unset", {
          description: "Clear engine configuration",
          params: {
            key: Argument.String("key"),
            name: Argument.String("name").pipe(Argument.optional),
          },
        }),
      ],
    }),
    Spec.make("pair", { description: "Print a local device pairing link" }),
  ],
})
