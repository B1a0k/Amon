# BeaconPass loader stubs

These four loader stubs are the scheme 1/2 x86/x64 templates migrated from
`BeaconPass-Flask/templates/shellcode_stub`. They are compiled into the
Node-API module with `include_bytes!`, so packaged Amon builds do not depend on
an external runtime directory.

The native converter selects a stub only after parsing the input PE. A caller
may provide an explicit custom stub path to override the built-in choice.

| File | SHA-256 |
| --- | --- |
| `scheme1-x86.bin` | `299423c2a2774bfd5532860ef79f46e691308a97e533a00589068496e3a58db3` |
| `scheme1-x64.bin` | `4e48d6ad056affece6ceda0936bb5cfbe85e303a3178e94323d499d1c0f436f3` |
| `scheme2-x86.bin` | `5a437d764587da3511aa0bf31fda9dc7cf38091040a471dc853641c2e36e7aa4` |
| `scheme2-x64.bin` | `fa1f7f64311cf6150374f21f345187bdeea4f87c34c32a3d2e5a940f5ded9a34` |
