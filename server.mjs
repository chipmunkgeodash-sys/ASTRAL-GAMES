// Entry point. Everything is configured from the environment:
//
//   PORT              port to listen on (default 8080; hosts set this for you).
//                     SERVER_PORT, which Pterodactyl-style panels set, works too.
//   HOST              interface to bind (default 0.0.0.0)
//   ALLOWED_ORIGINS   comma-separated sites allowed to use the relay, e.g.
//                     https://mysite.web.app,https://other.example
//                     (replaces the built-in list)
//   EXTRA_ORIGINS     comma-separated sites added to the built-in list
//   ALLOWED_PORTS     comma-separated destination ports (default 80,443,8080,8443)
//   MAX_SOCKETS_PER_IP, MAX_SOCKETS, TRUST_PROXY_HOPS, LOG_LEVEL
import { createApp, DEFAULTS } from './src/app.mjs';

const list = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
const int = (value, fallback) => (Number.isFinite(Number(value)) && value !== undefined && value !== '' ? Math.max(0, Math.floor(Number(value))) : fallback);

const env = process.env;
const origins = list(env.ALLOWED_ORIGINS);

const app = createApp({
  host: env.HOST || DEFAULTS.host,
  port: int(env.PORT || env.SERVER_PORT, DEFAULTS.port),
  allowedOrigins: origins.length ? origins : [...DEFAULTS.allowedOrigins, ...list(env.EXTRA_ORIGINS)],
  allowedPorts: list(env.ALLOWED_PORTS).map(Number).filter((n) => n > 0 && n < 65536).length
    ? list(env.ALLOWED_PORTS).map(Number).filter((n) => n > 0 && n < 65536)
    : DEFAULTS.allowedPorts,
  maxSocketsPerIp: int(env.MAX_SOCKETS_PER_IP, DEFAULTS.maxSocketsPerIp),
  maxSockets: int(env.MAX_SOCKETS, DEFAULTS.maxSockets),
  trustProxyHops: int(env.TRUST_PROXY_HOPS, DEFAULTS.trustProxyHops),
  logLevel: env.LOG_LEVEL || DEFAULTS.logLevel
});

if (app.config.allowedOrigins.includes('*')) {
  console.warn('WARNING: ALLOWED_ORIGINS contains "*", so any website can use this relay.');
}

app.server.listen(app.config.port, app.config.host, () => {
  console.log(`Astral Wisp backend listening on ${app.config.host}:${app.config.port}`);
  console.log(`Allowed origins: ${app.config.allowedOrigins.join(', ')}`);
  console.log(`Allowed ports: ${app.config.allowedPorts.join(', ')}`);
});

const shutdown = () => {
  app.server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
