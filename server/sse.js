import { mutateQuote } from "./mock-data.js";

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function handleQuoteStream(req, res, { state, url, audit, sseIntervalMs = 1_000, traceId }) {
  const symbols = (url.searchParams.get("symbols") || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "VALIDATION_FAILED", message: "symbols query is required", traceId }));
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.flushHeaders?.();

  const connectionId = `sse-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  audit.record("stream.connect", { traceId, target: symbols.join(",") });
  writeEvent(res, "connected", { type: "connected", connectionId, serverTime: new Date().toISOString() });

  let tick = 0;
  const sendQuotes = () => {
    tick += 1;
    const quotes = symbols
      .map(symbol => state.stocks.get(symbol))
      .filter(Boolean)
      .map(quote => {
        const next = mutateQuote(quote, tick);
        state.stocks.set(next.id, next);
        return next;
      });
    writeEvent(res, "quotes", { type: "quotes", quotes, patchOnly: true });
  };
  const timer = setInterval(sendQuotes, sseIntervalMs);
  sendQuotes();

  req.on("close", () => {
    clearInterval(timer);
    audit.record("stream.disconnect", { traceId, target: symbols.join(",") });
  });
}
