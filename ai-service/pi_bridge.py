"""Single-request stdin/stdout bridge between Pi and the web-session adapters."""
import contextlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def load_service(provider):
    if provider not in ('chatgpt', 'gemini'):
        raise ValueError('Unknown provider')
    path = ROOT / provider / f'{provider}.py'
    spec = importlib.util.spec_from_file_location(f'symbiote_{provider}', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    request = json.load(sys.stdin)
    provider, prompt = request.get('provider'), request.get('prompt')
    conversation_id = request.get('conversation_id')
    if not isinstance(prompt, str) or not prompt:
        raise ValueError('Missing prompt')
    if conversation_id is not None and (provider != 'chatgpt' or not isinstance(conversation_id, str) or not conversation_id):
        raise ValueError('Invalid conversation ID')
    service = load_service(provider)
    parts = []
    def on_event(event):
        if event.get('type') == 'delta':
            parts.append(event.get('text', ''))
        elif event.get('type') == 'replace':
            parts[:] = [event.get('text', '')]
    # Third-party status messages must not corrupt the JSON response.
    with contextlib.redirect_stdout(sys.stderr):
        with service.create_client() as client:
            resolved_id, _, _ = client.send_prompt(conversation_id, prompt, on_event=on_event)
    if not parts:
        raise RuntimeError('Provider returned no text')
    print(json.dumps({'text': ''.join(parts), 'conversation_id': resolved_id}, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not print credentials, request contents, or provider exception payloads.
        print(json.dumps({'error': f'{type(error).__name__}: provider request failed; check session configuration.'}), flush=True)
        raise SystemExit(1)
