import type { TunnelProvider } from './types.js'

export type TunnelHandle = {
  url: string | null
  close: () => Promise<void>
}

const NOOP: TunnelHandle = { url: null, close: async () => {} }

/**
 * Starts a tunnel to the local port using the requested provider.
 *
 * - `none`       : no tunnel, LAN/localhost only.
 * - `cloudflare` : spawns the `cloudflared` binary (must be in PATH).
 *                  Uses Cloudflare quick tunnels — no account required.
 * - `ngrok`      : uses the optional `@ngrok/ngrok` dependency.
 *                  Requires NGROK_AUTHTOKEN env var.
 *
 * Never throws: tunnel failures degrade to a local-only server so the SDK
 * stays usable on LAN even when the tunnel can't come up.
 */
export async function startTunnel(
  provider: TunnelProvider,
  port: number,
  opts: { silent?: boolean } = {}
): Promise<TunnelHandle> {
  const warn = (msg: string) => {
    if (!opts.silent) console.warn(`[reposync] ${msg}`)
  }

  if (provider === 'none') return NOOP

  if (provider === 'cloudflare') {
    return startCloudflareTunnel(port, warn)
  }

  // ngrok (optional fallback)
  try {
    const ngrok = await loadNgrok()
    if (!ngrok) {
      warn(
        'ngrok is not installed. Install with `npm i @ngrok/ngrok` or switch to --tunnel cloudflare. Starting local only.'
      )
      return NOOP
    }

    const authtoken = process.env.NGROK_AUTHTOKEN
    if (!authtoken) {
      warn(
        'NGROK_AUTHTOKEN is not set. Get a free token at https://dashboard.ngrok.com and export it. Starting local only.'
      )
      return NOOP
    }

    const listener = await ngrok.forward({ addr: port, authtoken })
    const url = listener.url()
    return {
      url,
      close: async () => {
        try {
          await listener.close()
        } catch {
          // best-effort teardown
        }
      }
    }
  } catch (err) {
    warn(`Failed to start ngrok tunnel (${(err as Error).message}). Starting local only.`)
    return NOOP
  }
}

/** Spawn cloudflared and resolve once the quick-tunnel URL appears in its output. */
async function startCloudflareTunnel(
  port: number,
  warn: (msg: string) => void
): Promise<TunnelHandle> {
  const { spawn } = await import('node:child_process')

  return new Promise<TunnelHandle>((resolve) => {
    const CF_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const settle = (url: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      if (url) {
        resolve({
          url,
          close: async () => {
            try { proc.kill() } catch {}
          }
        })
      } else {
        try { proc.kill() } catch {}
        resolve(NOOP)
      }
    }

    const handleOutput = (chunk: Buffer) => {
      const text = chunk.toString()
      const match = text.match(CF_URL_RE)
      if (match) settle(match[0]!)
    }

    proc.stdout?.on('data', handleOutput)
    proc.stderr?.on('data', handleOutput)

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        warn(
          'cloudflared not found in PATH. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ then re-run, or use --tunnel none for LAN-only mode.'
        )
      } else {
        warn(`cloudflared failed: ${(err as Error).message}`)
      }
      settle(null)
    })

    proc.on('exit', (code) => {
      if (!settled) {
        warn(`cloudflared exited (code ${code}) before a URL was ready. Starting local only.`)
        settle(null)
      }
    })

    timeoutId = setTimeout(() => {
      warn('cloudflared timed out after 30s waiting for tunnel URL. Starting local only.')
      settle(null)
    }, 30_000)
  })
}

/** Dynamically import the optional ngrok dependency; null if unavailable. */
async function loadNgrok(): Promise<null | {
  forward: (opts: { addr: number; authtoken: string }) => Promise<{
    url: () => string | null
    close: () => Promise<void>
  }>
}> {
  try {
    // Indirected so bundlers treat it as a true optional/external dep.
    const mod: any = await import(/* @vite-ignore */ '@ngrok/ngrok')
    return mod.default ?? mod
  } catch {
    return null
  }
}
