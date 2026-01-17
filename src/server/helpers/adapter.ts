/**
 * Adapter interface for multi-instance WebSocket deployments.
 * Enables message broadcasting across multiple server instances via pub/sub.
 *
 * @example
 * ```typescript
 * class RedisAdapter implements Adapter {
 *   private pub = new Redis(process.env.REDIS_URL);
 *   private sub = new Redis(process.env.REDIS_URL);
 *
 *   async broadcast(room: string, message: unknown): Promise<void> {
 *     await this.pub.publish(room, JSON.stringify(message));
 *   }
 *
 *   onMessage(room: string, handler: (message: unknown) => void): void {
 *     this.sub.subscribe(room);
 *     this.sub.on('message', (channel, msg) => {
 *       if (channel === room) handler(JSON.parse(msg));
 *     });
 *   }
 *
 *   async close(): Promise<void> {
 *     await Promise.all([this.pub.quit(), this.sub.quit()]);
 *   }
 * }
 * ```
 */
export interface Adapter {
  /**
   * Broadcast a message to all instances subscribed to the specified room.
   * @param room Room identifier (typically the route pathname)
   * @param message Message to broadcast (will be JSON stringified if needed)
   */
  broadcast(room: string, message: unknown): Promise<void>;

  /**
   * Subscribe to messages for a specific room.
   * @param room Room identifier to subscribe to
   * @param handler Callback invoked when messages arrive for this room
   */
  onMessage(room: string, handler: (message: unknown) => void): void;

  /**
   * Clean up adapter resources (close connections, unsubscribe, etc.)
   */
  close(): Promise<void>;
}
