export const EMOJI = ['👍', '🎉', '❤️', '😂', '🔥'] as const;
export type Emoji = (typeof EMOJI)[number];

/** Sent by the server when a socket connects. */
export interface Hello {
  type: 'hello';
  instance: string;
}

/** Sent by a browser, then broadcast to everyone else in the room through the adapter. */
export interface Reaction {
  type: 'reaction';
  emoji: Emoji;
}

export function isReaction(value: unknown): value is Reaction {
  const reaction = value as Partial<Reaction> | null;
  return reaction?.type === 'reaction' && EMOJI.includes(reaction.emoji as Emoji);
}
