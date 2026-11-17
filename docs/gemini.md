# Gemini web provider

Install dependencies with `python -m pip install -r requirements.txt`. Sign in to `https://gemini.google.com/` and inspect that site's cookies in your browser's developer tools. Add the values to `.env` in the project root:

```text
GEMINI_SECURE_1PSID=your-cookie-value
GEMINI_SECURE_1PSIDTS=your-cookie-value-if-present
```

These values are Google account session credentials. Keep `.env` private; never share or commit it. Do not paste them into the chat.

Run `python gemini.py` for a terminal chat. To use Gemini in the coding harness, run `python C:\Users\asus\Desktop\gpt\harness\agent.py --provider gemini` from the project directory. Use `--provider chatgpt` (the default) for ChatGPT.

This uses the unofficial `gemini-webapi` package and its web-session interface, not Google's official API. It may stop working when Gemini changes, when cookies expire, or if Google requires verification. Cookie auto-refresh is disabled. Conversations are kept in memory for the current process. The adapter currently displays a full response after it arrives.
