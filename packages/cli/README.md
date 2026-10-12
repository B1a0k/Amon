# Amon Desktop Engine Launcher

This package keeps its upstream workspace directory and package scope for compatibility. Its compiled binary is named amon-engine. It contains only the headless engine entrypoint and process-control commands, including local pairing and service configuration needed by the desktop. It has no npm CLI bin entry, interactive coding CLI, mini frontend, or TUI.

The full AI implementation is in ../core and ../server; the full desktop frontend is in ../desktop and ../app.

Build the bundled engine with the root build:engine script. Bun and Node compilation scripts are retained in script/.
