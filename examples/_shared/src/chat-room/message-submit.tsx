'use client';

import { useCallback, type FormEvent } from 'react';
import type { Message } from './messaging';

export function MessageSubmit({ onMessage }: { onMessage(message: Message): void }) {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const author = form.get('author') as string;
      const content = form.get('content') as string;
      if (!author || !content) return;

      onMessage({ author, content });

      // Reset the content input (only)
      const contentInputElement = event.currentTarget //
        .querySelector<HTMLInputElement>('input[name="content"]');
      if (contentInputElement) contentInputElement.value = '';
    },
    [onMessage],
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex' }}>
      <input name="author" style={{ width: '70px' }} type="text" placeholder="Your name" />
      <input name="content" style={{ width: '280px' }} type="text" placeholder="Your message" />
      <button type="submit">Send</button>
    </form>
  );
}
