export function UPGRADE(client, server) {
  client.on('message', (data) => {
    for (const other of server.clients)
      if (other.readyState === other.OPEN) other.send(data.toString());
  });
  client.send('ready');
}
