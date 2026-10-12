interface ImportMetaEnv {
  readonly AMON_CHANNEL: string
  readonly AMON_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
