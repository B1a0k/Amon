declare const AMON_VERSION: string
declare const AMON_CHANNEL: string
declare const AMON_ARTIFACT: string

const version = typeof AMON_VERSION === "string" ? AMON_VERSION : "local"
const channel = typeof AMON_CHANNEL === "string" ? AMON_CHANNEL : "local"
const artifact = typeof AMON_ARTIFACT === "string" ? AMON_ARTIFACT : "cli"

export { version as AMON_VERSION, channel as AMON_CHANNEL, artifact as AMON_ARTIFACT }
export const AMON_LOCAL = channel === "local"
