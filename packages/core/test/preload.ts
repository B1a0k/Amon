import { mkdirSync, mkdtempSync } from "node:fs"
import path from "node:path"

// Fixtures must sit outside the checkout: Git and config discovery walk ancestors.
const base = path.resolve(import.meta.dirname, "../../../../.amon-test-runtime")
mkdirSync(base, { recursive: true })
const home = mkdtempSync(path.join(base, "amon-"))
for (const dir of [".config", ".local/share", ".local/state", ".cache", "tmp"])
  mkdirSync(path.join(home, dir), { recursive: true })
process.env.HOME = home
process.env.USERPROFILE = home
process.env.AMON_TEST_HOME = home
process.env.XDG_CONFIG_HOME = path.join(home, ".config")
process.env.XDG_DATA_HOME = path.join(home, ".local/share")
process.env.XDG_STATE_HOME = path.join(home, ".local/state")
process.env.XDG_CACHE_HOME = path.join(home, ".cache")
process.env.TEMP = path.join(home, "tmp")
process.env.TMP = path.join(home, "tmp")
process.env.TMPDIR = path.join(home, "tmp")
process.env.AMON_CONFIG_DIR = path.join(home, ".config", "amon")
for (const key of ["AMON_CONFIG", "AMON_CONFIG_CONTENT", "AWS_REGION", "GOOGLE_VERTEX_PROJECT", "NPM_CONFIG_REGISTRY", "UIDOTSH_AUTHORIZATION"])
  delete process.env[key]
if (process.env.RECORD !== "true") delete process.env.OPENAI_API_KEY
process.env.AMON_DB = ":memory:"
process.env.NPM_CONFIG_AUDIT = "false"
