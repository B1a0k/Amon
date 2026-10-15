import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

export default Extension.define({
  id: "beaconpass",
  stores: {
    view: Store.session(
      Schema.Struct({
        tab: Schema.Literals(["convert", "history"]),
        path: Schema.String,
        stubPath: Schema.String,
        outputPath: Schema.String,
        scheme: Schema.Literals(["1", "2"]),
        format: Schema.Literals(["binary", "hex", "c"]),
      }),
      { tab: "convert", path: "", stubPath: "", outputPath: "", scheme: "1", format: "binary" },
    ),
  },
  i18n: { en, zh: () => import("./i18n/zh") },
})
