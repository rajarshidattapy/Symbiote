# Gemini web provider

Run `symbiote -Provider gemini` on Windows or `symbiote --provider gemini` on macOS/Linux. If Gemini is not configured yet, Symbiote opens an isolated sign-in browser. Sign in, complete any verification, then press Enter in the terminal while the browser stays open. Symbiote verifies the session and saves the required credentials in the installation's `.env`.

To renew an expired session, use `symbiote -Provider gemini -Login` on Windows or `symbiote --provider gemini --login` on macOS/Linux. You can also select Gemini with `/model` inside Pi.

If browser-assisted setup cannot complete, the manual fallback is `symbiote -Provider gemini -ManualLogin` on Windows or `symbiote --provider gemini --manual-login` on macOS/Linux. It asks for these values locally:

```text
GEMINI_SECURE_1PSID=your-cookie-value
GEMINI_SECURE_1PSIDTS=your-cookie-value-if-present
```

These values are Google account session credentials. Keep `.env` private; never share or commit it. Do not paste them into the chat.

From the Symbiote installation folder, run `node ai-service/cli.ts gemini` for a standalone terminal chat. Omit the provider flag from the launcher to use the last selected provider.

This uses the unofficial TypeScript [`gemini-web-api`](https://github.com/qutek/gemini-web-api) package and its web-session interface, not Google's official API. It may stop working when Gemini changes, when cookies expire, or if Google requires verification. Cookie auto-refresh is disabled. The Pi bridge sends the current transcript with each request and displays the full model response after it arrives.
