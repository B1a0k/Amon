import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import { Reference, Situation } from "./contract"
import en from "./i18n/en"

export default Extension.define({
  id: "operation",
  provides: { situation: Situation },
  stores: {
    view: Store.session(
      Schema.Struct({
        selection: Schema.optionalKey(Reference),
        tab: Schema.Literals(["overview", "paths", "assets", "findings"]),
        assetMode: Schema.Literals(["list", "graph", "both"]),
        // Read old pane preferences without restoring the retired, tool-specific drawing tab.
        pathMode: Schema.optionalKey(Schema.Literals(["graph", "drawing", "audit", "history"])),
      }),
      { tab: "overview", assetMode: "list" },
    ),
  },
  i18n: { en, zh: () => import("./i18n/zh") },
})
