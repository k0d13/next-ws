import type { Message } from './messaging';

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <ul
      style={{
        minHeight: '90vh',
        position: 'relative',
        listStyleType: 'none',
        padding: '0',
        margin: '0',
      }}
    >
      {messages.map((message, i) => (
        <li key={String(i)}>
          <strong>{message.author}</strong>: <span>{message.content}</span>
        </li>
      ))}

      {messages.length === 0 && (
        <div
          style={{
            position: 'absolute',
            left: '0',
            top: '0',
            right: '0',
            bottom: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: 'white' }}>Waiting for messages...</p>
        </div>
      )}
    </ul>
  );
}
