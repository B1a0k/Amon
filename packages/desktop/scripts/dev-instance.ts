import { createHash } from "node:crypto"
import { unlink } from "node:fs/promises"
import { createConnection, createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// Lock before touching Vite's shared output. Electron's own lock is acquired after that build.
export async function acquireDevInstance(directory: string, focus: () => void) {
  const directoryKey = resolve(directory)
  const id = createHash("sha256")
    .update(process.platform === "win32" ? directoryKey.toLowerCase() : directoryKey)
    .digest("hex")
    .slice(0, 24)
  const address = process.platform === "win32" ? `\\\\.\\pipe\\amon-dev-${id}` : join(tmpdir(), `amon-dev-${id}.sock`)
  const server = createServer((socket) => {
    socket.once("data", () => {
      focus()
      socket.end("ready")
    })
    socket.on("error", () => undefined)
  })
  const listen = () =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(address, () => {
        server.off("error", reject)
        resolve()
      })
    })
  const error = await listen().then(
    () => undefined,
    (error: NodeJS.ErrnoException) => error,
  )
  if (error) {
    if (error.code !== "EADDRINUSE") throw error
    const active = await new Promise<boolean>((resolve) => {
      const socket = createConnection(address)
      socket.once("connect", () => socket.write("focus"))
      socket.once("data", () => {
        socket.destroy()
        resolve(true)
      })
      socket.once("error", () => {
        socket.destroy()
        resolve(false)
      })
      socket.setTimeout(5000, () => {
        socket.destroy()
        resolve(true)
      })
    })
    if (active) return undefined
    if (process.platform === "win32") throw error
    // Unix sockets survive an interrupted launcher; Windows named pipes are removed by the OS.
    await unlink(address)
    await listen()
  }
  return () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}
