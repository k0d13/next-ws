// Awaits before listening, as a handler checking a session would
export async function UPGRADE(client) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  client.on('message', (data) => client.send(`late ${data}`));
}
