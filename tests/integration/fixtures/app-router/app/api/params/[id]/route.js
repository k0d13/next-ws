export async function UPGRADE(client, _server, _request, context) {
  client.send(JSON.stringify(await context.params));
}
