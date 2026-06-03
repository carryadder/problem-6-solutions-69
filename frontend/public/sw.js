self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const hasVisibleClient = windowClients.some((client) => client.visibilityState === 'visible');
      if (hasVisibleClient) return;

      await self.registration.showNotification(data.title || 'Gather', {
        body: data.body || 'You have a new notification.',
        icon: data.icon || '/avatars/avatar-01.svg',
        badge: '/avatars/avatar-01.svg',
        tag: data.tag,
        data: {
          url: data.url || '/notifications',
        },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
