// Runs every hour on Netlify. Sends each family member their "Needs attention"
// summary as a phone notification at the hour they chose, in their own time zone.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { today } from '../../src/lib/dates'
import { computeAlerts } from '../../src/logic/alerts'
import { digestMessage, dueSubscriptions, localParts, rowsToData, type PushSubscriptionRow, type RecordRow } from '../../src/logic/digest'

/** The notification signing keys, created once and kept in the database. */
async function vapidKeys(sb: SupabaseClient) {
  const { data, error } = await sb.from('app_config').select('key,value').in('key', ['vapid_public', 'vapid_private'])
  if (error) throw error
  const pub = data.find((r) => r.key === 'vapid_public')?.value
  const priv = data.find((r) => r.key === 'vapid_private')?.value
  if (pub && priv) return { publicKey: pub, privateKey: priv }
  const keys = webpush.generateVAPIDKeys()
  const { error: e2 } = await sb.from('app_config').upsert([
    { key: 'vapid_public', value: keys.publicKey },
    { key: 'vapid_private', value: keys.privateKey },
  ])
  if (e2) throw e2
  console.log('daily-digest: created notification keys')
  return keys
}

async function allRecords(sb: SupabaseClient): Promise<RecordRow[]> {
  const out: RecordRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('records').select('tbl,id,data,deleted').neq('tbl', 'photos').order('seq').range(from, from + 999)
    if (error) throw error
    out.push(...(data as RecordRow[]))
    if (data.length < 1000) return out
  }
}

export default async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('daily-digest: SUPABASE_SERVICE_ROLE_KEY not set in Netlify, skipping')
    return
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const vapid = await vapidKeys(sb)

  const { data: subs, error } = await sb.from('push_subscriptions').select('*')
  if (error) throw error
  const now = Date.now()
  const due = dueSubscriptions(subs as PushSubscriptionRow[], now)
  console.log(`daily-digest: ${subs.length} subscribed, ${due.length} due now`)
  if (!due.length) return

  const alerts = computeAlerts(rowsToData(await allRecords(sb)), today(now))
  for (const s of due) {
    const msg = digestMessage(alerts, s.lang)
    if (msg) {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify(msg), {
          vapidDetails: { subject: process.env.URL || 'https://mir-farm.netlify.app', ...vapid },
          TTL: 6 * 3600,
        })
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // The phone uninstalled the app or turned notifications off.
          await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          continue
        }
        console.log(`daily-digest: send failed (${status ?? 'error'}) for ${s.email}`)
        continue
      }
    }
    await sb.from('push_subscriptions').update({ last_sent: localParts(now, s.tz).date }).eq('endpoint', s.endpoint)
  }
}

export const config = {
  schedule: '@hourly',
}
