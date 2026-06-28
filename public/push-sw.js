/* Web-Push-Handler – wird via workbox.importScripts in den generierten Service-Worker
   eingebunden. Zeigt eine Benachrichtigung auch bei geschlossener App und fokussiert
   beim Klick das bestehende App-Fenster (oder oeffnet es). */
self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = {} }
  var title = data.title || 'bbz Cannonball'
  var options = {
    body: data.body || '',
    icon: '/onTour/icon.svg',
    badge: '/onTour/icon.svg',
    tag: data.tag || 'live',
    renotify: true,
    data: { url: data.url || '/onTour/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/onTour/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('/onTour/') !== -1 && 'focus' in list[i]) return list[i].focus()
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : null
    })
  )
})
