export function UPGRADE(client) {
  client.send(Buffer.from([0, 1, 2, 255]));
}
