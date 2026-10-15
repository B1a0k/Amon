import { safeStorage } from "electron"
import { Audit } from "./contract"
import { createAudit } from "./controller"
import type { MainSetup } from "../sdk/main"
import type definition from "./index"

const setup: MainSetup<typeof definition> = (ctx) => {
  const secure = () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")

  const controller = createAudit({
    saved: ctx.stores.profiles.value,
    persist: (profiles) => ctx.stores.profiles.set(profiles),
    secure,
    encrypt: (password) => {
      if (!secure()) throw new Error("storage")

      return safeStorage.encryptString(password).toString("base64")
    },
    decrypt: (secret) => {
      if (!secure()) throw new Error("storage")

      return safeStorage.decryptString(Buffer.from(secret, "base64"))
    },
    changed: () => provider.changed(),
  })

  const provider = ctx.provide(Audit, {
    state: controller.state,
    save: controller.save,
    connect: controller.connect,
    disconnect: (input) => controller.disconnect(input.id),
    remove: (input) => controller.remove(input.id),
    outputs: controller.outputs,
  })

  ctx.scope.addFinalizer(controller.close)
}

export default setup
