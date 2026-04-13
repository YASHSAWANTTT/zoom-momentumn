/** Raw POST body buffer — set by express.json({ verify }) in server.ts for Zoom webhook HMAC */
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}
export {};
