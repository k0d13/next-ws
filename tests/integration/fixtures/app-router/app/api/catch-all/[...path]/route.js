export function UPGRADE(client, _server, _request, context) {
  client.send(JSON.stringify(context.params));
}
