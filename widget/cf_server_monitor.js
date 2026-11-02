/**
 * ====================================
 * 📌 CF Server Monitor - Egern 小组件脚本（公开仓库脱敏版）
 * ✨ 迁移自 huilang-me/CF-Server-Monitor (ios-scriptable-widget.js)
 * 📖 适配 Egern 官方 Widget DSL 规范 (https://egernapp.com/docs/configuration/widgets/)
 *
 * 🔒 【隐私参数说明】
 * 本脚本不在代码中保存任何个人域名、服务器 ID 或密钥，可安全托管于公开 GitHub 仓库。
 * 所有隐私参数均在 Egern App 内通过模块设置界面 (env_schema) 或小组件环境变量 (ctx.env) 填写：
 * - BASE_URL   : 必填，监控面板地址（如 https://status.yourdomain.com）
 * - SERVER_ID  : 必填，服务器 ID（如 hk-01 或 id:hk-01）
 * - PASSWORD   : 可选，若面板设为“私有站点”，填入后台管理密码或 API_SECRET 以自动登录鉴权
 * - USERNAME   : 可选，私有站点管理员用户名（默认 admin）
 * - API_TOKEN  : 可选，私有站点可直接填入 Bearer JWT Token（优先级高于 PASSWORD）
 * ====================================
 */

const COL = {
  bg1: "#0d1117",
  bg2: "#161b22",
  fg: "#e6edf3",
  dim: "#8b949e",
  dim2: "#6e7681",
  green: "#3fb950",
  amber: "#d29922",
  red: "#f85149",
  blue: "#58a6ff",
  cyan: "#39d2c0",
  track: "rgba(255, 255, 255, 0.12)"
};

const BG_GRADIENT = {
  type: "linear",
  colors: [COL.bg1, COL.bg2],
  stops: [0, 1],
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 0, y: 1 }
};

function getEnv(env, keys, fallback = "") {
  for (const key of keys) {
    const val = env?.[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return String(val).trim();
    }
  }
  return fallback;
}

function normalizeServerId(value) {
  const raw = String(value || "").trim();
  const matched = raw.match(/^(?:id|server):(.+)$/i);
  if (matched) return matched[1].trim();
  return raw;
}

function isPlaceholder(value, placeholders) {
  if (!value) return true;
  const lower = String(value).trim().toLowerCase();
  return placeholders.some((p) => lower === p || lower.includes("example.com") || lower.includes("exmaple.com"));
}

function getFlagRegionCode(region) {
  const code = String(region || "").trim().toUpperCase();
  if (!code || code === "XX") return "";
  if (code === "TW" || code === "HK" || code === "MO") return "CN";
  return code;
}

function regionToFlagEmoji(region) {
  const code = getFlagRegionCode(region);
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const offset = 127397;
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

function normalizeTimestamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10000000000 ? n * 1000 : n;
}

function isOnline(server) {
  const ts = normalizeTimestamp(server.report_timestamp || server.last_updated || server.timestamp);
  return ts > 0 && Date.now() - ts < 300000;
}

function percent(used, total) {
  const u = Number(used) || 0;
  const t = Number(total) || 0;
  return t > 0 ? (u / t) * 100 : 0;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function usageColor(p) {
  return p < 60 ? COL.green : p < 85 ? COL.amber : COL.red;
}

function formatBytes(bytes) {
  let n = Math.abs(Number(bytes) || 0);
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function trafficUsedBytes(server) {
  const rx = Number(server.net_rx_monthly) || 0;
  const tx = Number(server.net_tx_monthly) || 0;
  const type = server.traffic_calc_type || "total";
  if (type === "dl") return rx;
  if (type === "ul") return tx;
  if (type === "max") return Math.max(rx, tx);
  return rx + tx;
}

function trafficLimitBytes(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (raw.includes("TB")) return n * 1024 * 1024 * 1024 * 1024;
  if (raw.includes("GB")) return n * 1024 * 1024 * 1024;
  if (raw.includes("MB")) return n * 1024 * 1024;
  return n * 1024 * 1024 * 1024;
}

function trafficPercent(server) {
  const limit = trafficLimitBytes(server.traffic_limit);
  if (limit <= 0) return 0;
  return percent(trafficUsedBytes(server), limit);
}

function hhmm() {
  const d = new Date();
  const p = (n) => (n < 10 ? "0" : "") + n;
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function serverName(server) {
  return server.name || server.id || "Server";
}

// 使用 Egern 原生支持的 Inline SVG 绘制圆角进度条
function barSvgUri(value, width, height, color) {
  const p = clampPercent(value);
  const r = (height / 2).toFixed(1);
  const fw = Math.max(height, (width * p) / 100).toFixed(1);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
    `<rect x='0' y='0' width='${width}' height='${height}' rx='${r}' ry='${r}' fill='${COL.track}'/>` +
    `<rect x='0' y='0' width='${fw}' height='${height}' rx='${r}' ry='${r}' fill='${color}'/>` +
    `</svg>`;
  return `data:image/svg+xml,${svg}`;
}

function mkText(text, size, weight, color, opts = {}) {
  return {
    type: "text",
    text: String(text ?? ""),
    font: { size, weight: weight || "regular", ...(opts.family ? { family: opts.family } : {}) },
    textColor: color,
    ...(opts.maxLines ? { maxLines: opts.maxLines } : {}),
    ...(opts.minScale ? { minScale: opts.minScale } : {}),
    ...(opts.textAlign ? { textAlign: opts.textAlign } : {}),
    ...(opts.flex ? { flex: opts.flex } : {})
  };
}

function mkSpacer(length) {
  return length !== undefined ? { type: "spacer", length } : { type: "spacer" };
}

function mkStack(direction, children, opts = {}) {
  return {
    type: "stack",
    direction,
    alignItems: opts.alignItems || "center",
    ...(opts.gap !== undefined ? { gap: opts.gap } : {}),
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
    ...(opts.flex !== undefined ? { flex: opts.flex } : {}),
    ...(opts.padding !== undefined ? { padding: opts.padding } : {}),
    children
  };
}

function buildFlagElement(server, fontSize = 11) {
  const emoji = regionToFlagEmoji(server.region);
  if (emoji) {
    return mkText(emoji, fontSize, "regular", COL.fg, { maxLines: 1 });
  }
  const code = getFlagRegionCode(server.region);
  if (code) {
    return mkText(code, 9, "semibold", COL.dim, { maxLines: 1, minScale: 0.7 });
  }
  return null;
}

function buildBarRow(label, value, width, height) {
  const pctStr = `${Math.round(clampPercent(value))}%`;
  return mkStack("row", [
    mkStack("row", [
      mkText(label, 9, "semibold", COL.dim, { maxLines: 1 })
    ], { width: 34, height: 12, alignItems: "center" }),
    mkSpacer(5),
    {
      type: "image",
      src: barSvgUri(value, width, height, usageColor(value)),
      width,
      height,
      resizeMode: "contain"
    },
    mkSpacer(5),
    mkText(pctStr, 9, "regular", COL.dim, { maxLines: 1, minScale: 0.7 })
  ], { alignItems: "center" });
}

function buildMetricColumn(label, value, width) {
  const pctStr = `${Math.round(clampPercent(value))}%`;
  return mkStack("column", [
    mkStack("row", [
      mkText(label, 9, "semibold", COL.dim, { maxLines: 1 }),
      mkSpacer(),
      mkText(pctStr, 9, "regular", COL.dim2, { maxLines: 1 })
    ], { width, alignItems: "center" }),
    {
      type: "image",
      src: barSvgUri(value, width, 6, usageColor(value)),
      width,
      height: 6,
      resizeMode: "contain"
    }
  ], { gap: 3, alignItems: "start" });
}

function buildNetLine(label, value, color) {
  return mkStack("row", [
    mkText(label, 10, "semibold", COL.dim, { maxLines: 1 }),
    mkSpacer(),
    mkText(`${formatBytes(value)}/s`, 11, "regular", color, { maxLines: 1, minScale: 0.7 })
  ], { alignItems: "center", flex: 1 });
}

function buildSmallChildren(server) {
  const online = isOnline(server);
  const cpu = Number(server.cpu) || 0;
  const ram = percent(server.ram_used, server.ram_total);
  const disk = percent(server.disk_used, server.disk_total);
  const flagEl = buildFlagElement(server, 12);

  const headChildren = [
    mkText("•", 10, "regular", online ? COL.green : COL.dim2, { maxLines: 1 }),
    mkSpacer(5),
    ...(flagEl ? [flagEl, mkSpacer(5)] : []),
    mkText(serverName(server), 13, "bold", COL.fg, { maxLines: 1, minScale: 0.7 })
  ];

  const netText = online
    ? `↓ ${formatBytes(server.net_in_speed)}/s\n↑ ${formatBytes(server.net_out_speed)}/s`
    : "offline";

  return [
    mkStack("row", headChildren, { alignItems: "center" }),
    mkSpacer(10),
    buildBarRow("CPU", cpu, 76, 7),
    mkSpacer(6),
    buildBarRow("RAM", ram, 76, 7),
    mkSpacer(6),
    buildBarRow("DSK", disk, 76, 7),
    mkSpacer(),
    mkText(netText, 10, "regular", online ? COL.dim : COL.red, { maxLines: 2 }),
    mkSpacer(3),
    mkStack("row", [
      mkSpacer(),
      mkText(`Updated ${hhmm()}`, 8, "regular", COL.dim2, { maxLines: 1, textAlign: "center" }),
      mkSpacer()
    ])
  ];
}

function buildMediumLargeChildren(server, isLarge) {
  const online = isOnline(server);
  const cpu = Number(server.cpu) || 0;
  const ram = percent(server.ram_used, server.ram_total);
  const disk = percent(server.disk_used, server.disk_total);
  const traffic = trafficPercent(server);
  const flagEl = buildFlagElement(server, isLarge ? 16 : 14);

  const headChildren = [
    mkText("•", isLarge ? 12 : 11, "regular", online ? COL.green : COL.dim2, { maxLines: 1 }),
    mkSpacer(6),
    ...(flagEl ? [flagEl, mkSpacer(6)] : []),
    mkText(serverName(server), isLarge ? 18 : 16, "bold", COL.fg, { maxLines: 1, minScale: 0.65 }),
    mkSpacer(),
    mkText(online ? "online" : "offline", 11, "semibold", online ? COL.green : COL.red, { maxLines: 1 })
  ];

  const colWidth = isLarge ? 86 : 76;
  const children = [
    mkStack("row", headChildren, { alignItems: "center" }),
    mkSpacer(3),
    mkText(`Updated ${hhmm()}`, 9, "regular", COL.dim2, { maxLines: 1 }),
    mkSpacer(isLarge ? 16 : 13),
    mkStack("row", [
      buildMetricColumn("CPU", cpu, colWidth),
      mkSpacer(8),
      buildMetricColumn("RAM", ram, colWidth),
      mkSpacer(8),
      buildMetricColumn("DISK", disk, colWidth)
    ], { alignItems: "center" })
  ];

  if (server.traffic_limit) {
    children.push(
      mkSpacer(isLarge ? 13 : 10),
      buildBarRow("TRF", traffic, isLarge ? 245 : 216, 7)
    );
  }

  children.push(
    mkSpacer(),
    mkStack("row", [
      buildNetLine("DOWN", server.net_in_speed, online ? COL.cyan : COL.dim2),
      mkSpacer(isLarge ? 28 : 18),
      buildNetLine("UP", server.net_out_speed, online ? COL.blue : COL.dim2)
    ], { alignItems: "center" })
  );

  return children;
}

function buildLockScreenWidget(server) {
  const online = isOnline(server);
  const cpu = Math.round(clampPercent(server.cpu));
  const ram = Math.round(clampPercent(percent(server.ram_used, server.ram_total)));
  return {
    type: "widget",
    children: [
      mkStack("row", [
        mkText(online ? "●" : "○", 10, "bold", online ? COL.green : COL.red),
        mkSpacer(4),
        mkText(serverName(server), 13, "bold", COL.fg, { maxLines: 1 })
      ]),
      mkSpacer(2),
      mkText(`CPU ${cpu}%  |  RAM ${ram}%`, 11, "medium", COL.dim, { maxLines: 1 }),
      mkText(
        online ? `↓${formatBytes(server.net_in_speed)}/s ↑${formatBytes(server.net_out_speed)}/s` : "offline",
        10,
        "regular",
        COL.dim2,
        { maxLines: 1 }
      )
    ]
  };
}

function buildErrorWidget(message, baseURL) {
  return {
    type: "widget",
    padding: [14, 15, 14, 15],
    ...(baseURL ? { url: baseURL } : {}),
    backgroundGradient: BG_GRADIENT,
    refreshAfter: new Date(Date.now() + 60 * 1000).toISOString(),
    children: [
      mkText("CF Server Monitor", 14, "bold", COL.red, { maxLines: 1 }),
      mkSpacer(8),
      mkText(message, 11, "regular", COL.fg, { maxLines: 4 })
    ]
  };
}

// 若面板设为私有站点且提供了 PASSWORD，自动向 /admin/api 登录换取 JWT Token
async function loginForToken(ctx, baseURL, username, password) {
  const resp = await ctx.http.post(`${baseURL}/admin/api`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      action: "login",
      username: username || "admin",
      password
    }),
    timeout: 10000
  });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(`登录响应解析失败 (HTTP ${resp.status || ""})`);
  }
  if (!data?.token) {
    throw new Error(data?.error || "私有站点登录鉴权失败，请检查 PASSWORD 或 USERNAME");
  }
  return data.token;
}

async function fetchServer(ctx, baseURL, id, authConfig) {
  const headers = { Accept: "application/json" };
  let token = authConfig.apiToken;

  if (!token && authConfig.password) {
    token = await loginForToken(ctx, baseURL, authConfig.username, authConfig.password);
  }
  if (token) {
    headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }

  const url = `${baseURL}/api/server?id=${encodeURIComponent(id)}`;
  const resp = await ctx.http.get(url, { headers, timeout: 15000 });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(`接口返回异常 (HTTP ${resp.status || ""})`);
  }
  if (resp.status === 401 || data?.code === 401) {
    throw new Error("站点已开启私有保护 (401)，请在 Egern 环境变量中填写 PASSWORD 或 API_TOKEN");
  }
  if (data?.error) throw new Error(`${id}: ${data.error}`);
  return data?.data && typeof data.data === "object" ? data.data : data;
}

export default async function (ctx) {
  const env = ctx.env || {};
  const rawBaseURL = getEnv(env, ["BASE_URL", "API_URL", "baseURL"], "");
  const baseURL = String(rawBaseURL || "").replace(/\/+$/, "");
  const serverId = normalizeServerId(
    getEnv(env, ["SERVER_ID", "ID", "serverId"], "")
  );
  const apiToken = getEnv(env, ["API_TOKEN", "TOKEN", "JWT"], "");
  const password = getEnv(env, ["PASSWORD", "API_SECRET", "SECRET"], "");
  const username = getEnv(env, ["USERNAME", "USER"], "admin");

  if (isPlaceholder(baseURL, ["https://status.example.com", "请填写"])) {
    return buildErrorWidget(
      "请在 Egern「模块 → CF Server Monitor」或小组件环境变量中填写 BASE_URL",
      ""
    );
  }
  if (isPlaceholder(serverId, ["your-server-id", "请填写"])) {
    return buildErrorWidget(
      "请在 Egern「模块 → CF Server Monitor」或小组件环境变量中填写 SERVER_ID",
      baseURL
    );
  }

  try {
    const server = await fetchServer(ctx, baseURL, serverId, {
      apiToken,
      password,
      username
    });
    const family = String(ctx.widgetFamily || "systemMedium");

    if (family === "accessoryRectangular") {
      return buildLockScreenWidget(server);
    }

    const isSmall = family === "systemSmall";
    const isLarge = family === "systemLarge" || family === "systemExtraLarge";
    const padding = isSmall ? [12, 13, 12, 13] : [14, 15, 14, 15];

    return {
      type: "widget",
      padding,
      url: baseURL,
      backgroundGradient: BG_GRADIENT,
      refreshAfter: new Date(Date.now() + 60 * 1000).toISOString(),
      children: isSmall
        ? buildSmallChildren(server)
        : buildMediumLargeChildren(server, isLarge)
    };
  } catch (e) {
    return buildErrorWidget("Request failed: " + (e?.message || String(e)), baseURL);
  }
}
