const DEFAULT_GRAPH_API_BASE = "https://graph.facebook.com";
const DEFAULT_GRAPH_API_VERSION = "v23.0";

function readConfig() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "";
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID || "";
  const graphApiBase = process.env.META_GRAPH_API_BASE || process.env.INSTAGRAM_GRAPH_API_BASE || DEFAULT_GRAPH_API_BASE;
  const graphApiVersion = process.env.META_GRAPH_API_VERSION || process.env.INSTAGRAM_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
  const missing = [];
  if (!accessToken) missing.push("INSTAGRAM_ACCESS_TOKEN or META_ACCESS_TOKEN");
  if (!accountId) missing.push("INSTAGRAM_BUSINESS_ACCOUNT_ID or INSTAGRAM_USER_ID");
  return { accessToken, accountId, graphApiBase, graphApiVersion, missing };
}

function graphRoot(config) {
  return `${config.graphApiBase.replace(/\/+$/, "")}/${config.graphApiVersion}`;
}

function errorMessageFromGraph(payload, fallback) {
  if (payload?.error?.message) return payload.error.message;
  if (payload?.error) return JSON.stringify(payload.error);
  return fallback;
}

async function graphRequest(config, path, { method = "GET", params = {} } = {}) {
  const url = new URL(`${graphRoot(config)}/${String(path).replace(/^\/+/, "")}`);
  const headers = { Authorization: `Bearer ${config.accessToken}` };
  const init = { method, headers };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  } else {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") body.set(key, String(value));
    }
    init.body = body;
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }

  if (!res.ok || payload?.error) {
    throw new Error(errorMessageFromGraph(payload, `${method} ${url.pathname} failed with ${res.status}`));
  }
  return payload;
}

function requireConfig() {
  const config = readConfig();
  if (config.missing.length) {
    throw new Error(`Instagram publishing is not configured. Missing: ${config.missing.join(", ")}`);
  }
  return config;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForContainer(config, containerId, log) {
  let delay = 1200;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    await sleep(delay);
    const status = await graphRequest(config, containerId, {
      method: "GET",
      params: { fields: "status_code,status" },
    });
    const statusCode = status.status_code || "UNKNOWN";
    log(`Container ${containerId}: ${statusCode}`);
    if (statusCode === "FINISHED") return status;
    if (["ERROR", "EXPIRED"].includes(statusCode)) {
      throw new Error(status.status || `Instagram container ${containerId} ended with ${statusCode}`);
    }
    delay = Math.min(delay + 800, 6500);
  }
  throw new Error(`Instagram container ${containerId} did not finish processing in time`);
}

export async function getInstagramConnectionStatus() {
  const config = readConfig();
  const base = {
    configured: config.missing.length === 0,
    connected: false,
    publishEnabled: false,
    accountId: config.accountId || null,
    graphApiBase: config.graphApiBase,
    graphApiVersion: config.graphApiVersion,
    missing: config.missing,
  };

  if (config.missing.length) return base;

  try {
    const profile = await graphRequest(config, config.accountId, {
      method: "GET",
      params: { fields: "id,username" },
    });
    return {
      ...base,
      connected: true,
      publishEnabled: true,
      username: profile.username || null,
    };
  } catch (e) {
    return {
      ...base,
      error: e.message,
    };
  }
}

export async function publishInstagramCarousel({ imageUrls, caption, log = () => {} }) {
  const config = requireConfig();
  if (!Array.isArray(imageUrls) || imageUrls.length !== 5) {
    throw new Error("Instagram carousel publishing requires exactly 5 image URLs");
  }

  log(`Using ${config.graphApiBase} ${config.graphApiVersion}`);
  log("Creating carousel item containers...");

  const childIds = [];
  for (let index = 0; index < imageUrls.length; index += 1) {
    const imageUrl = imageUrls[index];
    log(`Creating child ${index + 1}/5`);
    const child = await graphRequest(config, `${config.accountId}/media`, {
      method: "POST",
      params: {
        image_url: imageUrl,
        is_carousel_item: "true",
      },
    });
    if (!child.id) throw new Error(`Instagram did not return a child container id for item ${index + 1}`);
    childIds.push(child.id);
    await waitForContainer(config, child.id, log);
  }

  log("Creating parent carousel container...");
  const parent = await graphRequest(config, `${config.accountId}/media`, {
    method: "POST",
    params: {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: caption || "",
    },
  });
  if (!parent.id) throw new Error("Instagram did not return a parent carousel container id");
  await waitForContainer(config, parent.id, log);

  log("Publishing carousel...");
  const published = await graphRequest(config, `${config.accountId}/media_publish`, {
    method: "POST",
    params: { creation_id: parent.id },
  });
  if (!published.id) throw new Error("Instagram did not return a published media id");

  let permalink = null;
  try {
    const media = await graphRequest(config, published.id, {
      method: "GET",
      params: { fields: "permalink" },
    });
    permalink = media.permalink || null;
  } catch (e) {
    log(`Published, but permalink lookup failed: ${e.message}`);
  }

  return { instagramMediaId: published.id, permalink };
}
