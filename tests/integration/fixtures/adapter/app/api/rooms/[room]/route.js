export function UPGRADE(client) {
  client.send(`instance:${process.env.INSTANCE_ID}`);
}
