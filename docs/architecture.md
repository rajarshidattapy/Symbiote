# Symbiote monorepo

Chat On Steroids is the core app. The other two folders plug into it.

| Folder | Role |
| --- | --- |
| `chat-on-steroids/` | Core Electron app: ChatGPT workspace, MCP tools, workers, plugins. Its UI is unchanged. |
| `symbiote-harness/` | Pi-based coding harness and web-session adapters. Used as a selectable engine through `chat-on-steroids/src/main/harness/pi-backend.ts` (Pi RPC mode over JSONL, in a child process). |
| `repsyn/` | `reposync`: live repo bridge (REST + OpenAPI) for other chat frontends. Started on demand through `chat-on-steroids/src/main/harness/reposync.ts`. Local-only unless a tunnel is requested. |

## Engine contract

`PiBackend` starts `pi --mode rpc --no-session` in an approved project folder, sends JSON commands on stdin
and receives responses and session events on stdout. Responses are matched by id. If the process exits,
pending requests fail with `harness exited`.

Build the harness first (`npm install && npm run build` in `symbiote-harness/harness`), then point
`resolvePiCli(repoRoot)` at the bundle.

## Wiring

`chat-on-steroids/src/main/harness-ipc.ts` registers main-process IPC handlers (`harness:status`, `harness:start`,
`harness:prompt`, `harness:stop`) and forwards engine events on `harness:event`. No renderer or preload file changed.
The engine is off unless configured: set `COS_HARNESS_CLI` (path to the built Pi CLI) or `COS_HARNESS_ROOT`
(monorepo root). It only starts inside a folder the user already approved, and stops when the app quits.

## Tests

`npm test` in `chat-on-steroids/` runs the app suite, including `test/harness-backend.test.ts`.
