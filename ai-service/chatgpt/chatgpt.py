"""Experimental direct ChatGPT web client. No browser is launched."""
import contextlib
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import sys
import threading
import types
import uuid

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / '.vendor' / 'chatgpt-web'
sys.path.insert(0, str(VENDOR))
if os.name == 'nt':
    # The upstream module imports fcntl for its Unix daemon; this client does not use it.
    sys.modules.setdefault('fcntl', types.ModuleType('fcntl'))

_web = None
_web_claimed = False
_web_lock = threading.Lock()


def _exec_vendor():
    loader = importlib.machinery.SourceFileLoader('chatgpt_web_direct', str(VENDOR / 'chatgpt-web'))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def _load_web():
    """Import the shared vendored module on first use instead of at startup."""
    global _web
    with _web_lock:
        if _web is None:
            _web = _exec_vendor()
        return _web


def _client_module():
    """First client patches the shared module (no extra cost); later clients get a private copy,
    so their auth patches can't overwrite each other."""
    global _web_claimed
    with _web_lock:
        first, _web_claimed = not _web_claimed, True
    return _load_web() if first else _exec_vendor()


def __getattr__(name):
    # Keeps `<this module>.web` working for anything that imported it before.
    if name == 'web':
        return _load_web()
    raise AttributeError(f'module {__name__!r} has no attribute {name!r}')


class _Background:
    """Runs fn(*args) in a daemon thread. result() waits for it and returns or raises.
    cancel() means nobody will call result(): a value that was or will be produced is passed to dispose."""

    def __init__(self, fn, *args, dispose=None):
        self._lock = threading.Lock()
        self._done = threading.Event()
        self._value = self._error = None
        self._taken = self._cancelled = False
        self._dispose = dispose
        threading.Thread(target=self._run, args=(fn, args), daemon=True).start()

    def _run(self, fn, args):
        try:
            value, error = fn(*args), None
        except Exception as exc:
            value, error = None, exc
        with self._lock:
            self._value, self._error = value, error
            self._done.set()
            orphan = self._cancelled and error is None
        if orphan and self._dispose:
            self._dispose(value)

    def result(self):
        while not self._done.wait(0.1):  # returns as soon as done; the loop keeps Ctrl+C working on Windows
            pass
        with self._lock:
            self._taken = True
        if self._error is not None:
            raise self._error
        return self._value

    def cancel(self):
        with self._lock:
            self._cancelled = True
            orphan = self._done.is_set() and not self._taken and self._error is None
        if orphan and self._dispose:
            self._dispose(self._value)


def _close_client(client):
    with contextlib.suppress(Exception):
        close = getattr(client, 'close', None)
        if callable(close):
            close()
        else:
            with client:
                pass


def _read_config():
    config = dotenv_values(ROOT / '.env')
    cookie = (config.get('CHATGPT_COOKIE') or '').strip()
    if not cookie:
        raise RuntimeError('Add CHATGPT_COOKIE to .env first. See .env.example; do not share your cookies.')
    return cookie, config.get('CHATGPT_USER_AGENT') or 'Mozilla/5.0'


def _fetch_session(headers):
    import httpx  # imported here so it loads off the main thread
    return httpx.get('https://chatgpt.com/api/auth/session', headers=headers, timeout=30, follow_redirects=False)


def create_client():
    cookie, agent = _read_config()
    headers = {'cookie': cookie, 'user-agent': agent, 'accept': 'application/json',
               'origin': 'https://chatgpt.com', 'referer': 'https://chatgpt.com/'}
    session = _Background(_fetch_session, headers)  # network round trip runs...
    web = _client_module()                          # ...while the vendored module imports
    response = session.result()
    if response.status_code != 200:
        raise RuntimeError(f'Session request returned HTTP {response.status_code}. Cookies alone may not satisfy ChatGPT verification.')
    try:
        token = response.json().get('accessToken')
    except (ValueError, AttributeError):
        token = None
    if not token:
        raise RuntimeError('The session response did not contain an access token. Check your cookies or verification status.')
    headers['authorization'] = 'Bearer ' + token
    headers['oai-device-id'] = next((part.strip().split('=', 1)[1] for part in cookie.split(';') if part.strip().startswith('oai-did=')), str(uuid.uuid4()))
    # Same value for every client, so sharing this process-wide setting is harmless.
    os.environ['CHATGPT_WEB_SEND_MODE'] = 'direct'
    web.load_auth_snapshot = lambda: ('https://chatgpt.com/backend-api/conversations', headers.copy())
    # Avoid writing refreshed session credentials outside the chosen .env file.
    web.save_auth_snapshot = lambda url, values: None
    return web.ChatGPTWebClient('http://127.0.0.1:1')


def main():
    write, flush = sys.stdout.write, sys.stdout.flush

    def event(item):
        kind = item.get('type')
        if kind == 'delta':
            write(item.get('text') or '')
            flush()
        elif kind == 'replace':
            write('\n' + (item.get('text') or ''))
            flush()

    try:
        _read_config()  # fail immediately on a missing cookie
        connecting = _Background(create_client, dispose=_close_client)  # connect while the first prompt is typed
        print('Connecting in the background. Type /quit to exit.')
        client = None
        conversation_id = None
        with contextlib.ExitStack() as stack:
            stack.callback(connecting.cancel)  # closes a client that connected but was never used
            while True:
                prompt = input('\nYou: ').strip()
                if prompt.lower() in ('/quit', '/exit'):
                    break
                if not prompt:
                    continue
                if client is None:
                    client = connecting.result()  # usually already finished
                    stack.enter_context(client)
                write('\nChatGPT: ')
                flush()
                try:
                    conversation_id, _, _ = client.send_prompt(conversation_id, prompt, on_event=event)
                    write('\n')
                except Exception as error:
                    print(f'\nRequest failed: {error}\nA failed submission may have reached ChatGPT; check history before retrying.')
    except (EOFError, KeyboardInterrupt):
        print('\nGoodbye.')
    except Exception as error:
        import httpx
        if not isinstance(error, (httpx.HTTPError, OSError, RuntimeError)):
            raise
        print(f'Connection failed: {error}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
