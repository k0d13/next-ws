import { cookies, headers } from 'next/headers';

async function describe() {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return { header: headerStore.get('x-test'), cookie: cookieStore.get('session')?.value };
}

export async function UPGRADE(client, _server, request) {
  client.send(
    JSON.stringify({
      ...(await describe()),
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      requestHeader: request.headers.get('x-test'),
      requestCookie: request.cookies.get('session')?.value,
    }),
  );

  // Request context has to survive into event callbacks too
  client.on('message', async () => {
    try {
      client.send(JSON.stringify(await describe()));
    } catch (error) {
      client.send(JSON.stringify({ error: String(error?.message ?? error) }));
    }
  });
}
