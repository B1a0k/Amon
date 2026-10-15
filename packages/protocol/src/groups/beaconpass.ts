import { BeaconPass } from "@opencode/schema/beaconpass"
import { Location } from "@opencode/schema/location"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestError, ServiceUnavailableError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

const errors = [InvalidRequestError, ServiceUnavailableError] as const

export const BeaconPassGroup = HttpApiGroup.make("server.beaconpass")
  .add(
    HttpApiEndpoint.get("beaconpass.get", "/api/beaconpass", {
      query: LocationQuery,
      success: Location.response(BeaconPass.Snapshot),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "beaconpass.get", summary: "Read BeaconPass workspace" })),
  )
  .add(
    HttpApiEndpoint.post("beaconpass.inspect", "/api/beaconpass/inspect", {
      query: LocationQuery,
      payload: BeaconPass.InspectInput,
      success: Location.response(BeaconPass.Pe),
      error: errors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "beaconpass.inspect", summary: "Inspect a PE image" })),
  )
  .add(
    HttpApiEndpoint.post("beaconpass.convert", "/api/beaconpass/convert", {
      query: LocationQuery,
      payload: BeaconPass.ConvertInput,
      success: Location.response(BeaconPass.ConvertResult),
      error: errors,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "beaconpass.convert", summary: "Convert a PE image" })),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "beaconpass",
      description: "Local native PE inspection, shellcode conversion, jobs, and artifacts.",
    }),
  )
