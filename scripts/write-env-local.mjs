// Writes .env.local from the running local Supabase stack (`supabase status`).
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
const vars = Object.fromEntries(
  out
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)

const url = vars.API_URL
const key = vars.PUBLISHABLE_KEY ?? vars.ANON_KEY
if (!url || !key) {
  console.error('Could not read API_URL / PUBLISHABLE_KEY from `supabase status`. Is Supabase running?')
  process.exit(1)
}

writeFileSync('.env.local', `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`)
console.log(`Wrote .env.local (${url})`)
