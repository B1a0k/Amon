import type { Component } from "solid-js"
import { Registry, type MountedSession } from "../sdk"

/** An independently owned integration row in the session's extension details. */
export interface Integration {
  /** Stable identity within its contributing extension. */
  readonly id: string
  /** Rows follow built-in services, in ascending order. */
  readonly order: number
  /** Bound to the contributing extension with bindExtension; session and shown stay reactive. */
  readonly Row: Component<{
    /** The session whose project chooses the integration. */
    readonly session: MountedSession
    /** The details are currently on screen. */
    readonly shown: boolean
  }>
}

/** Optional integrations contribute rows without modifying the built-in service catalog. */
export const Integration = Registry.define<Integration>("details.integration")
