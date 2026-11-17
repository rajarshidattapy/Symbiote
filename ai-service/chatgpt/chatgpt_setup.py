"""Create a local ChatGPT session configuration without echoing credentials."""
from getpass import getpass
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / '.env'


def setup(path=ENV_FILE):
    print('ChatGPT terminal setup')
    print('In a signed-in browser, open chatgpt.com, press F12, open Network,')
    print('refresh, and select a chatgpt.com request. Under Request Headers,')
    print('copy the Cookie and User-Agent values. Paste them below locally.')
    print('The cookie will not appear while you paste. Do not share it with anyone.\n')
    if path.exists():
        answer = input(f'{path} already exists. Replace it? [y/N] ').strip().lower()
        if answer not in ('y', 'yes'):
            print('Existing file kept.')
            return 0

    cookie = getpass('Cookie header value (hidden): ').strip()
    if cookie.lower().startswith('cookie:'):
        cookie = cookie.split(':', 1)[1].strip()
    if not cookie or '=' not in cookie or '\n' in cookie or '\r' in cookie:
        print('No valid cookie header was entered; no changes were made.')
        return 1
    agent = input('User-Agent header value: ').strip()
    if agent.lower().startswith('user-agent:'):
        agent = agent.split(':', 1)[1].strip()
    if not agent or '\n' in agent or '\r' in agent:
        print('No User-Agent was entered; no changes were made.')
        return 1

    # JSON string quoting is compatible with python-dotenv's double-quoted values.
    contents = f'CHATGPT_COOKIE={json.dumps(cookie, ensure_ascii=False)}\nCHATGPT_USER_AGENT={json.dumps(agent, ensure_ascii=False)}\n'
    tmp = None
    try:
        fd, name = tempfile.mkstemp(prefix='.env-', dir=path.parent, text=True)
        tmp = Path(name)
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(contents)
        os.replace(tmp, path)
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)
    print(f'Saved {path}. Keep this file private; it grants access to your account.')
    print('Start chat: python chat.py')
    print('Start coding harness: python harness/agent.py')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(setup())
    except (EOFError, KeyboardInterrupt):
        print('\nSetup cancelled; no changes made.')
        raise SystemExit(1)
