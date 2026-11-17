# Gemini web provider

Install dependencies with `python -m pip install -r requirements.txt`. Sign in to `https://gemini.google.com/` and inspect that site's cookies in your browser's developer tools. Add the values to `.env` in the project root:

```text
GEMINI_SECURE_1PSID=your-cookie-value
GEMINI_SECURE_1PSIDTS=your-cookie-value-if-present
```

These values are Google account session credentials. Keep `.env` private; never share or commit it. Do not paste them into the chat.

From the Symbiote folder, run `python ai-service/gemini/gemini.py` for a terminal chat. To use Gemini in the coding harness, run `powershell -ExecutionPolicy Bypass -File C:\Users\asus\Desktop\gpt\symbiote.ps1 -Provider gemini` from the project directory. Omit `-Provider gemini` for ChatGPT.

This uses the unofficial `gemini-webapi` package and its web-session interface, not Google's official API. It may stop working when Gemini changes, when cookies expire, or if Google requires verification. Cookie auto-refresh is disabled. The Pi bridge sends the current transcript with each request and displays the full model response after it arrives.
