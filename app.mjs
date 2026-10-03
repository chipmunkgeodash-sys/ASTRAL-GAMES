// The Wisp backend for the Astral browser.
//
// A Wisp server is a relay: the browser opens one websocket to it and the
// server opens the real connections to the sites being visited. That makes it
// an open proxy for anyone who can reach it, so everything here is about
// narrowing who may use it and where it may connect:
//
//   * only pages served from the allowed origins may open a websocket
//   * only web ports are reachable (80, 443, 8080, 8443 by default)
//   * private, loopback and link-local addresses are blocked, so it can't be
//     pointed at the host's own network or cloud metadata service
//   * direct-IP destinations and UDP are off
//   * caps on websockets per client and in total, and on streams per socket
//   * destinations are not logged
//
// The origin check stops other websites using the relay from a browser. It is
// not authentication: a script can send any Origin header it likes.
import http from 'node:http';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';

export const DEFAULTS = {
  host: '0.0.0.0',
  port: 8080,
  // The sites this relay serves. Add yours with ALLOWED_ORIGINS.
  allowedOrigins: [
    'https://mq5bi2szqu.web.app',
    'https://cw2exkq6jo.web.app',
    'https://c7mh9f9g2u.web.app',
    'https://mq5bi2szqu.firebaseapp.com',
    'https://cw2exkq6jo.firebaseapp.com',
    'https://c7mh9f9g2u.firebaseapp.com'
  ],
  allowedPorts: [80, 443, 8080, 8443],
  maxSocketsPerIp: 8,
  maxSockets: 400,
  streamsPerSocket: 200,
  // How many proxies sit in front of this server and append to X-Forwarded-For
  // (Render, Cloud Run and Fly each add one). 0 uses the socket address.
  trustProxyHops: 1,
  logLevel: 'WARN',
  // Test-only switches, never set from the environment.
  allowLoopback: false
};

const LEVELS = { DEBUG: logging.DEBUG, INFO: logging.INFO, WARN: logging.WARN, ERROR: logging.ERROR, NONE: logging.NONE };

export function createApp(overrides = {}) {
  const config = { ...DEFAULTS, ...overrides };
  const allowAll = config.allowedOrigins.includes('*');
  const origins = new Set(config.allowedOrigins.map((o) => o.replace(/\/$/, '').toLowerCase()));

  logging.set_level(LEVELS[String(config.logLevel).toUpperCase()] ?? logging.WARN);

  wisp.options.port_whitelist = config.allowedPorts;
  wisp.options.allow_udp_streams = false;
  wisp.options.allow_direct_ip = false;
  wisp.options.allow_private_ips = false;
  wisp.options.allow_loopback_ips = !!config.allowLoopback;
  wisp.options.stream_limit_total = config.streamsPerSocket;
  // Not setting stream_limit_per_host: in wisp-js 0.5.0 it iterates an object
  // with for...of and throws on every new stream. stream_limit_total is fine.
  wisp.options.parse_real_ip = false;
  wisp.options.wisp_motd = 'Astral';

  const perIp = new Map();
  let total = 0;
  const stats = { accepted: 0, refused: 0 };

  const clientIp = (req) => {
    const hops = config.trustProxyHops;
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (hops > 0 && forwarded.length) return forwarded[Math.max(0, forwarded.length - hops)];
    return req.socket.remoteAddress || 'unknown';
  };

  const refuse = (socket, status, text) => {
    stats.refused += 1;
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };

  const server = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, sockets: total }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Astral Wisp backend. Nothing to see here.\n');
  });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/wisp/' && path !== '/wisp') return refuse(socket, 404, 'Not Found');

    const origin = String(req.headers.origin || '').replace(/\/$/, '').toLowerCase();
    if (!allowAll && !origins.has(origin)) return refuse(socket, 403, 'Forbidden');

    const ip = clientIp(req);
    const mine = perIp.get(ip) || 0;
    if (mine >= config.maxSocketsPerIp || total >= config.maxSockets) return refuse(socket, 429, 'Too Many Requests');

    perIp.set(ip, mine + 1);
    total += 1;
    stats.accepted += 1;
    socket.once('close', () => {
      total -= 1;
      const left = (perIp.get(ip) || 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
    });
    socket.on('error', () => {});

    wisp.routeRequest(req, socket, head);
  });

  return { server, config, stats, sockets: () => total };
}
