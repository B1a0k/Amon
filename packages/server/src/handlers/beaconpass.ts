import { BeaconPass } from "@opencode/core/beaconpass"
import { InvalidRequestError, ServiceUnavailableError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

const errors = <A, R>(effect: Effect.Effect<A, BeaconPass.InvalidInput | BeaconPass.Unavailable, R>) =>
  effect.pipe(
    Effect.catchTag(
      "BeaconPass.InvalidInput",
      (error) => new InvalidRequestError({ message: error.message, field: error.field }),
    ),
    Effect.catchTag("BeaconPass.Unavailable", (error) => new ServiceUnavailableError({ message: error.message })),
  )

export const BeaconPassHandler = HttpApiBuilder.group(Api, "server.beaconpass", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "beaconpass.get",
        Effect.fn(function* () {
          const beaconpass = yield* BeaconPass.Service
          return yield* response(beaconpass.snapshot())
        }),
      )
      .handle(
        "beaconpass.inspect",
        Effect.fn(function* (ctx) {
          const beaconpass = yield* BeaconPass.Service
          return yield* response(errors(beaconpass.inspect(ctx.payload, { type: "manual" })))
        }),
      )
      .handle(
        "beaconpass.convert",
        Effect.fn(function* (ctx) {
          const beaconpass = yield* BeaconPass.Service
          return yield* response(errors(beaconpass.convert(ctx.payload, { type: "manual" })))
        }),
      )
  }),
)
