"""Unofficial Gemini web-session service with the chatgpt.py client interface."""
import asyncio
from pathlib import Path
import uuid

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]


class GeminiService:
    def __init__(self, client, loop):
        self.client, self.loop, self.sessions = client, loop, {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        try:
            self.loop.run_until_complete(self.client.close())
        finally:
            self.loop.close()

    def send_prompt(self, conversation_id, prompt, on_event=None, **_kwargs):
        if conversation_id is None:
            conversation_id = str(uuid.uuid4())
            self.sessions[conversation_id] = self.client.start_chat()
        elif conversation_id not in self.sessions:
            raise ValueError('Unknown Gemini conversation in this process; start a new chat.')
        response = self.loop.run_until_complete(self.sessions[conversation_id].send_message(prompt))
        if not response.text:
            raise RuntimeError('Gemini returned no text response.')
        if on_event:
            on_event({'type': 'delta', 'text': response.text})
        return conversation_id, {}, set()


def create_client():
    config = dotenv_values(ROOT / '.env')
    psid = (config.get('GEMINI_SECURE_1PSID') or '').strip()
    psidts = (config.get('GEMINI_SECURE_1PSIDTS') or '').strip() or None
    if not psid:
        raise RuntimeError('Add GEMINI_SECURE_1PSID to .env; see .env.example.')
    from gemini_webapi import GeminiClient
    loop = asyncio.new_event_loop()
    client = GeminiClient(psid, psidts)
    try:
        loop.run_until_complete(client.init(timeout=30, auto_close=False, auto_refresh=False))
    except BaseException:
        loop.close()
        raise
    return GeminiService(client, loop)


def main():
    try:
        print('Connecting to Gemini...')
        with create_client() as client:
            print('Connected. Type /new for a new conversation or /quit to exit.')
            conversation_id = None
            while True:
                prompt = input('\nYou: ').strip()
                if prompt.lower() in ('/quit', '/exit'):
                    break
                if prompt.lower() == '/new':
                    conversation_id = None
                elif prompt:
                    try:
                        print('\nGemini: ', end='', flush=True)
                        conversation_id, _, _ = client.send_prompt(conversation_id, prompt, on_event=lambda event: print(event['text'], end='', flush=True))
                        print()
                    except Exception as error:
                        print(f'\nRequest failed: {error}')
        return 0
    except (KeyboardInterrupt, EOFError):
        print('\nGoodbye.')
        return 0
    except Exception as error:
        print(f'Could not connect to Gemini: {error}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
