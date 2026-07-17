const OBJECT_KEY_PATTERN = /^objects\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.pdf$/;
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Last-Modified",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function validObjectKey(key) {
  return OBJECT_KEY_PATTERN.test(key);
}

function parseRange(value, size) {
  if (!value || !value.startsWith("bytes=") || value.includes(",")) return null;
  const [startText, endText] = value.slice(6).split("-");

  if (startText === "") {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length, start: size - length, end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText === "" ? size - 1 : Number(endText);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }

  const end = Math.min(requestedEnd, size - 1);
  return { offset: start, length: end - start + 1, start, end };
}

function objectHeaders(object, size) {
  const headers = new Headers(corsHeaders());
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", IMMUTABLE_CACHE);
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", String(size));
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

async function handleRead(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders(), Allow: "GET, HEAD, OPTIONS" },
    });
  }

  const key = url.pathname.replace(/^\/+/, "");
  if (!validObjectKey(key)) return new Response("Not Found", { status: 404, headers: corsHeaders() });

  const metadata = await env.TEXTBOOKS.head(key);
  if (!metadata) return new Response("Not Found", { status: 404, headers: corsHeaders() });

  const ifNoneMatch = request.headers.get("If-None-Match");
  if (!request.headers.has("Range") && ifNoneMatch === metadata.httpEtag) {
    const headers = objectHeaders(metadata, 0);
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: objectHeaders(metadata, metadata.size) });
  }

  const rangeHeader = request.headers.get("Range");
  const ifRange = request.headers.get("If-Range");
  const canUseRange = rangeHeader && (!ifRange || ifRange === metadata.httpEtag);

  if (canUseRange) {
    const range = parseRange(rangeHeader, metadata.size);
    if (!range) {
      const headers = new Headers(corsHeaders());
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Range", `bytes */${metadata.size}`);
      return new Response(null, { status: 416, headers });
    }

    const object = await env.TEXTBOOKS.get(key, {
      range: { offset: range.offset, length: range.length },
    });
    if (!object || !("body" in object)) {
      return new Response("Not Found", { status: 404, headers: corsHeaders() });
    }
    const headers = objectHeaders(object, range.length);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  const object = await env.TEXTBOOKS.get(key);
  if (!object || !("body" in object)) {
    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  }
  return new Response(object.body, {
    status: 200,
    headers: objectHeaders(object, metadata.size),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "kebiao-textbook-assets", mode: "read_only" });
    }
    return handleRead(request, env, url);
  },
};
