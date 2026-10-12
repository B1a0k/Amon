import { Effect } from "effect"
import { Service } from "@opencode/client/effect/service"
import { OpenCode } from "@opencode/client/promise"
import { renderUnicodeCompact } from "uqr"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { ServiceConfig } from "../../services/service-config"

// Non-interactive process control for the desktop's pairing instructions.
export default Runtime.handler(
  Commands.commands.pair,
  Effect.fn("engine.pair")(function* () {
    const endpoint = yield* Service.ensure(yield* ServiceConfig.options())
    const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
    const pairing = yield* Effect.tryPromise(() => client.server.pair())
    const info = yield* Effect.tryPromise(() => client.server.info())
    const links = info.urls.map(url => new URL(`/auth/connect/${pairing.code}`, url).href)
    process.stdout.write(JSON.stringify({ ...pairing, links }) + "\n")
    process.stdout.write(renderUnicodeCompact(JSON.stringify({ code: pairing.code, urls: info.urls }), { border: 2 }) + "\n")
  }),
)
