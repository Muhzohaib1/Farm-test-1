// Runs once a day on Netlify so the free Supabase project never goes a week
// without activity (free projects pause after about 7 idle days).
// Uses the same public URL and key the app is built with.
export default async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.log('keep-alive: Supabase URL or key not set, skipping')
    return
  }
  // A tiny read. Row Level Security returns no rows to this anonymous request,
  // but the database still runs the query, which counts as activity.
  const res = await fetch(`${url}/rest/v1/records?select=id&limit=1`, { headers: { apikey: key } })
  console.log(`keep-alive: Supabase answered ${res.status}`)
}

export const config = {
  schedule: '@daily',
}
