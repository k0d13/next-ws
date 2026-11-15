export function GET() {
  return new Response('Upgrade Required', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

export function UPGRADE(client) {
  client.on('message', (data, isBinary) => client.send(data, { binary: isBinary }));
}
