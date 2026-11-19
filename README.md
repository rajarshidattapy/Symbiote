

<h1 align="center"><img src="public/logo_bgremoved.png" width="44" height="44" align="absmiddle" alt="Symbiote logo" /> Symbiote — Terminal-Native AI Coding Harness</h1>

<p align="center"><strong>Web-powered AI. Terminal-native coding. One symbiotic harness.</strong></p>

<p align="center">An experimental terminal coding harness that brings conversational AI services into your local development environment.</p>

<!--<p align="center"><img src="public/banner.png" width="100%" alt="Symbiote banner" /></p> -->

## Overview

Symbiote connects web-based AI services like ChatGPT and Gemini to a local coding-agent harness, allowing you to work with AI directly from your terminal.

It combines unofficial web-session adapters with [Pi](https://github.com/earendil-works/pi), giving conversational AI access to your local codebase through a unified terminal interface.

## Project Structure

```
symbiote/
├── ai-service/       # TypeScript adapters, provider bridge, and session handling
├── harness/          # Pi source
├── docs/             # Documentation and setup guides
├── public/           # Branding and visual assets
├── .env.example      # Environment configuration template
├── install.ps1       # Windows installer
├── install.sh        # macOS and Linux installer
├── symbiote.ps1      # Windows launcher
└── symbiote          # macOS and Linux launcher
```

## Getting Started

### Install

The installer supports Windows, macOS and Linux. It downloads Symbiote into `~/.symbiote/app`, installs Node.js privately if a suitable version is unavailable, builds Pi, and installs a sign-in browser. On macOS and Linux, `curl`, `tar`, and a SHA-256 utility are required.

**Windows PowerShell**

```powershell
$symbioteInstaller = Join-Path $env:TEMP ('symbiote-install-' + [guid]::NewGuid().ToString('N') + '.ps1'); try { Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/rajarshidattapy/Symbiote/master/install.ps1' -OutFile $symbioteInstaller -ErrorAction Stop; powershell -NoProfile -ExecutionPolicy Bypass -File $symbioteInstaller } catch { Write-Error $_ }
```

**macOS or Linux**

```sh
symbiote_installer=$(mktemp) && curl -fsSL 'https://raw.githubusercontent.com/rajarshidattapy/Symbiote/master/install.sh' -o "$symbiote_installer" && sh "$symbiote_installer"
```

After installing, choose ChatGPT or Gemini. A separate browser opens: sign in, complete any verification, and press Enter in the terminal while the browser remains open. Symbiote checks the session and saves its credentials locally; you do not need to edit `.env`.

Open a new terminal, change to your project directory, and run:

```text
symbiote
```

On Windows, the installer adds `~/.symbiote/bin` to the user PATH. On macOS and Linux it installs the command in `~/.local/bin` and, when needed, adds that directory to your shell configuration. Re-running the installer preserves an existing installation and its credentials; it does not update its source files.

### Change provider or sign in again

Use `/model` inside Symbiote to select another provider; if it has not been set up, Symbiote opens the sign-in browser. To choose a provider or renew an expired session when starting Symbiote:

| Action | Windows | macOS / Linux |
| --- | --- | --- |
| Choose provider | `symbiote -Select` | `symbiote --select` |
| Sign in again | `symbiote -Login` | `symbiote --login` |
| Start with Gemini | `symbiote -Provider gemini` | `symbiote --provider gemini` |

The installer uses a temporary browser profile and never reads the user's existing Chrome profile. Account verification or provider changes can still prevent automated setup. A manual fallback is available via `symbiote -ManualLogin` on Windows or `symbiote --manual-login` on macOS/Linux. See the [Gemini setup guide](docs/gemini.md).

## How It Works

### ChatGPT commands

Use `/chatgpt-file path/to/file.txt | What should I change?` to send a local UTF-8 text file in the current ChatGPT conversation. This sends the file contents as text, not as a native ChatGPT attachment; files are limited to 100,000 bytes. `/chatgpt-projects` lists your ChatGPT projects without changing the current conversation. Use `/chatgpt-features` to see current support. The adapter requests a thinking model by default, though actual availability depends on the account and service.

Native file and image uploads, ChatGPT library, image generation, web search, projects, deep research, and sketch are not implemented by the current text-only adapter.

Symbiote bridges conversational AI services with a local coding-agent runtime.

- **AI Service Adapters:** Connect to ChatGPT and Gemini through authenticated web sessions.
- **Provider Bridge:** Translates conversations and tool interactions into a text-based protocol supported by the adapters.
- **Coding Harness:** Uses Pi's tools to inspect and modify files and execute terminal commands.
- **Local Execution:** Works within the project directory from which Symbiote is launched.

For ChatGPT, each Pi session continues in one web conversation, including after a Pi session is resumed. Symbiote stores the Pi-to-ChatGPT conversation ID mapping under `~/.symbiote/pi-sessions/`; it does not store session cookies there. Starting a new Pi session starts a new web conversation. Pi operations that explicitly disable continuation can use a separate conversation.

## Limitations & Security

Symbiote is experimental and relies on unofficial web-session interfaces.

- Provider sessions can expire, require verification, or stop working when websites change.
- The adapters currently support text-based interactions only; image input is not supported.
- Tool calls and responses may fail when provider interfaces or model output formats change.
- Gemini requires valid session credentials and may require additional verification.
- Gemini's web-session adapter does not yet persist one web conversation across Pi turns.
- The provider bridge forwards Pi conversations, including tool results, to the selected web service.
- Pi can modify files and execute commands. Review its configuration and permissions before use.

**Security:** Treat session cookies, authentication headers, and `.env` files as private account credentials. Never commit them to version control or share them publicly.

## Project Status

Symbiote is under active development. Provider integrations, harness orchestration, and setup workflows are experimental and may change.

## Credits

Symbiote builds on [Pi](https://github.com/earendil-works/pi), the extensible coding-agent harness created by Mario Zechner and contributors.

Pi is distributed under the [MIT License](https://github.com/earendil-works/pi/blob/main/LICENSE).

The ChatGPT adapter includes a helper from [chatgpt-web](https://github.com/tritao/chatgpt-web), and the Gemini adapter uses [gemini-web-api](https://github.com/qutek/gemini-web-api).

---

<p align="center"><strong>Symbiote</strong><br/><sub>One interface. Multiple minds. Your terminal.</sub></p>
