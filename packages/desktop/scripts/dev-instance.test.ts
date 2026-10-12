import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { acquireDevInstance } from "./dev-instance"

test("duplicate development launch focuses the owner without acquiring its build lock", async () => {
  const directory = `amon-dev-test-${randomUUID()}`
  let focused = 0
  const release = await acquireDevInstance(directory, () => {
    focused++
  })
  expect(release).toBeDefined()
  try {
    expect(
      await acquireDevInstance(directory, () => {
        throw new Error("Duplicate became owner")
      }),
    ).toBeUndefined()
    expect(focused).toBe(1)
  } finally {
    await release?.()
  }
  const next = await acquireDevInstance(directory, () => undefined)
  expect(next).toBeDefined()
  await next?.()
})
