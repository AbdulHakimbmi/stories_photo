// =============================================================================
//  hub.js — Server-Sent Events (SSE). One-way, built into every browser, reconnects by itself.
//  Events are small JSON notifications; photographs are never sent through this channel.
// =============================================================================
export class Hub {
  constructor({ maxPerChannel = 80 } = {}) {
    this.channels = new Map(); // key -> Set<res>
    this.maxPerChannel = maxPerChannel;
    this.counter = 0;
    this.timer = setInterval(() => this.ping(), 20000);
    this.timer.unref();
  }

  /** key examples: "host:<sessionId>" */
  subscribe(key, req, res) {
    const set = this.channels.get(key) || new Set();
    if (set.size >= this.maxPerChannel) return false;
    this.channels.set(key, set);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write('retry: 3000\n\n');
    set.add(res);
    const drop = () => { set.delete(res); if (!set.size) this.channels.delete(key); };
    req.on('close', drop);
    res.on('error', drop);
    return true;
  }

  publish(key, event, data) {
    const set = this.channels.get(key);
    if (!set) return;
    const id = ++this.counter;
    const frame = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try { res.write(frame); } catch { set.delete(res); }
    }
  }

  ping() {
    for (const set of this.channels.values()) for (const res of set) { try { res.write(': ping\n\n'); } catch { /* dropped on close */ } }
  }

  closeChannel(key) {
    const set = this.channels.get(key);
    if (!set) return;
    for (const res of set) { try { res.end(); } catch { /* ignore */ } }
    this.channels.delete(key);
  }

  close() {
    clearInterval(this.timer);
    for (const key of [...this.channels.keys()]) this.closeChannel(key);
  }

  count(key) { return (this.channels.get(key) || new Set()).size; }
}
