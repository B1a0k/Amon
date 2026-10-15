import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import { Audit, Profile, Projects } from "./contract"
import en from "./i18n/en"

export default Extension.define({
  id: "cobaltelectron",
  provides: { audit: Audit, projects: Projects },
  stores: {
    profiles: Store.main(Schema.Array(Schema.Struct({ profile: Profile, secret: Schema.String })), []),
    view: Store.session(
      Schema.Struct({
        sort: Schema.String,
        descending: Schema.Boolean,
        session: Schema.String,
        profile: Schema.String,
      }),
      { sort: "internal", descending: false, session: "", profile: "" },
    ),
  },
  i18n: { en, zh: () => import("./i18n/zh") },
})
