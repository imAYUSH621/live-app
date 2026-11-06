// Current REST join shape is room.host/state.host; retain older clients' shape.
export function roomHost(info) {
  const host = info?.hostCard || info?.room?.host || info?.state?.host;
  return host ? { ...host, publicId: host.publicId || host.uid || host.fancy_id } : undefined;
}
