export function createAuditStore() {
  const events = [];
  let nextId = 1;

  function record(type, { traceId, actorId = "mock-user", deviceId, target, outcome = "success", metadata } = {}) {
    const event = {
      id: `audit-${nextId++}`,
      type,
      actorId,
      deviceId,
      traceId: traceId || `trace-${Date.now()}-${nextId}`,
      target,
      outcome,
      createdAt: new Date().toISOString(),
      metadata,
    };
    events.unshift(event);
    return event;
  }

  function list(query) {
    let items = events.slice();
    if (query.type) items = items.filter(item => item.type === query.type);
    if (query.actorId) items = items.filter(item => item.actorId === query.actorId);
    if (query.traceId) items = items.filter(item => item.traceId === query.traceId);
    if (query.from) items = items.filter(item => item.createdAt >= query.from);
    if (query.to) items = items.filter(item => item.createdAt <= query.to);
    const total = items.length;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const offset = Math.max(Number(query.offset) || 0, 0);
    return { items: items.slice(offset, offset + limit), total, limit, offset };
  }

  return { record, list };
}
