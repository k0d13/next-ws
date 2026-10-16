/**
 * Adapter interface for multi-instance WebSocket deployments. Enables message broadcasting across
 * multiple server instances via pub/sub.
 *
 * Every room is a route pathname. next-ws subscribes an instance to a room when its first client
 * connects there and unsubscribes it once its last client leaves. Messages are opaque strings,
 * next-ws encodes and decodes them itself, so an adapter only has to move them around.
 *
 * @example
 *   class RedisAdapter implements Adapter {
 *     private pub = new Redis(process.env.REDIS_URL);
 *     private sub = new Redis(process.env.REDIS_URL);
 *     private handlers = new Map<string, (message: string) => void>();
 *
 *     constructor() {
 *       this.sub.on('message', (room, message) => this.handlers.get(room)?.(message));
 *     }
 *
 *     async broadcast(room: string, message: string) {
 *       await this.pub.publish(room, message);
 *     }
 *
 *     async subscribe(room: string, handler: (message: string) => void) {
 *       this.handlers.set(room, handler);
 *       await this.sub.subscribe(room);
 *     }
 *
 *     async unsubscribe(room: string) {
 *       this.handlers.delete(room);
 *       await this.sub.unsubscribe(room);
 *     }
 *
 *     async close() {
 *       await Promise.all([this.pub.quit(), this.sub.quit()]);
 *     }
 *   }
 */
export interface Adapter {
  /**
   * Publish a message to every instance subscribed to the room, including this one.
   *
   * @param room Room identifier, the route pathname
   * @param message Encoded message to deliver as is
   */
  broadcast(room: string, message: string): Promise<void> | void;

  /**
   * Subscribe this instance to a room. Called once per room until it is unsubscribed.
   *
   * @param room Room identifier to subscribe to
   * @param handler Callback to invoke with each message published to the room
   */
  subscribe(room: string, handler: (message: string) => void): Promise<void> | void;

  /**
   * Unsubscribe this instance from a room, after the last client here has left it.
   *
   * @param room Room identifier to unsubscribe from
   */
  unsubscribe(room: string): Promise<void> | void;

  /** Clean up adapter resources, such as connections. */
  close(): Promise<void> | void;
}
