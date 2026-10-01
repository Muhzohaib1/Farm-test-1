// Added to the app's service worker: shows the daily Mir Farm notification
// and opens the app when it is tapped.
self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || 'Mir Farm', {
      body: msg.body || '',
      icon: 'icon-192.png',
      tag: 'mir-farm-daily',
      renotify: true,
      data: { url: msg.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
