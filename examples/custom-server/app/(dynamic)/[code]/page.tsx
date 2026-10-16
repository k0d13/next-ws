'use client';

import { useParams } from 'next/navigation';
import { MessageList, MessageSubmit, useMessaging } from 'shared/chat-room';

export default function Page() {
  const { code } = useParams();
  const [messages, sendMessage] = useMessaging(() => `ws://${window.location.host}/${code}/api/ws`);

  return (
    <div style={{ maxWidth: '50vh' }}>
      <MessageList messages={messages} />
      <MessageSubmit onMessage={sendMessage} />
    </div>
  );
}
