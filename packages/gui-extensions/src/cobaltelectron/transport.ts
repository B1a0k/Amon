import { request } from "node:http"
import https, { type Agent } from "node:https"
import { randomUUID } from "node:crypto"
import WebSocket from "ws"
import { Option, Schema } from "effect"
import type { Profile } from "./contract"

const Login = Schema.Struct({
  success: Schema.Boolean,
  token: Schema.optional(Schema.String),
  wsPath: Schema.optional(Schema.String),
  serverId: Schema.optional(Schema.String),
  errorCode: Schema.optional(Schema.String),
})

/** The configured origin only; credentials, fragments and path-based endpoint guesses are refused. */
export function endpoint(value: string) {
  if (!URL.canParse(value)) throw new Error("endpoint")
  const url = new URL(value)

  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("endpoint")

  return url
}

/** Authentication is the only HTTP write; redirects are not followed and no cookies or tokens are persisted. */
export async function authenticate(
  profile: Profile,
  password: string,
  instance: string,
  signal: AbortSignal,
  agent: Agent,
) {
  const url = endpoint(profile.url)

  const body = JSON.stringify({
    user: profile.user,
    password,
    clientInstanceId: instance,
    connectionAttemptId: randomUUID(),
    clientProtocolVersion: 2,
  })

  const result = await new Promise<string>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https.request : request)(
      new URL("/login", url),
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
        signal,
        agent: url.protocol === "https:" ? agent : undefined,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume()
          reject(
            new Error(
              response.statusCode === 409
                ? "conflict"
                : response.statusCode === 401 || response.statusCode === 403
                  ? "authentication"
                  : response.statusCode === 429
                    ? "limited"
                    : "connection",
            ),
          )

          return
        }

        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk)

          if (chunks.reduce((size, item) => size + item.length, 0) > 65_536) req.destroy(new Error("protocol"))
        })
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
        response.on("error", reject)
      },
    )

    req.setTimeout(15_000, () => req.destroy(new Error("connection")))
    req.on("error", reject)
    req.end(body)
  })

  const login = Schema.decodeUnknownOption(Schema.fromJsonString(Login))(result).pipe(Option.getOrUndefined)

  if (!login || !login.success || !login.token || !login.wsPath || !login.serverId) throw new Error("protocol")
  const target = new URL(login.wsPath, url)

  if (target.origin !== url.origin || target.username || target.password || target.search || target.hash)
    throw new Error("protocol")
  target.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  target.searchParams.set("token", login.token)

  return { url: target, serverId: login.serverId }
}

/** The receiver exposes no task/send API. It emits only the documented connection heartbeat. */
export function receive(url: URL, agent: Agent) {
  return new WebSocket(url, {
    agent: url.protocol === "wss:" ? agent : undefined,
    handshakeTimeout: 15_000,
    maxPayload: 64 * 1024 * 1024,
    followRedirects: false,
  })
}
