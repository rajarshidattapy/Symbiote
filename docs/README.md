# Symbiote

Symbiote is an experimental terminal coding harness. Its goal is to connect conversational AI services to a local coding harness that can inspect and work with a codebase.

## Project structure

- [`ai-service/`](../ai-service/) contains the ChatGPT and Gemini service adapters and their setup scripts.
- [`harness/`](../harness/) contains the Pi source tree and the experimental Python harness.
- [`docs/`](.) contains project documentation and planning notes.
- [`requirements.txt`](../requirements.txt) lists the Python dependencies used by the service adapters.

The service adapters use unofficial web-session interfaces. Sessions may expire, require verification, or stop working when the providers change their websites. Treat session cookies and `.env` files as private account credentials.

The project is under development. The current directory layout has changed since the original setup instructions, and the service paths and harness integration still need to be aligned before those instructions can be relied upon.

## Credits

Symbiote uses [Pi](https://github.com/earendil-works/pi), the extensible coding-agent harness by Mario Zechner and contributors. Pi is distributed under the MIT license; its copyright notice and license are preserved in [`harness/LICENSE`](../harness/LICENSE).