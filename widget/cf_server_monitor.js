/**
 * ====================================
 * 📌 CF Server Monitor - Egern 小组件脚本（公开仓库脱敏增强版）
 * ✨ 迁移自 huilang-me/CF-Server-Monitor (ios-scriptable-widget.js)
 * 📖 适配 Egern 官方 Widget DSL 规范 (https://egernapp.com/docs/configuration/widgets/)
 *
 * 🔒 【隐私参数说明 (ctx.env)】
 * - BASE_URL   : 必填，监控面板地址（如 https://status.yourdomain.com）
 * - SERVER_ID  : 可填服务器名称（如 CloudCone）、服务器 UUID/ID，或留空自动取第一台服务器
 * - PASSWORD   : 可选，若面板为私有站点，填入后台管理密码或 API_SECRET
 * - USERNAME   : 可选，私有站点管理员用户名（默认 admin，若填错会自动回退尝试 admin）
 * - API_TOKEN  : 可选，私有站点可直接填入 Bearer JWT Token
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
  track: "#262c36"
};

// 仅使用官方文档中定义的 Gradient 字段：type / colors / stops / startPoint / endPoint
const BG_GRADIENT = {
  type: "linear",
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 0, y: 1 },
  stops: [0, 1],
  colors: [COL.bg1, COL.bg2]
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
  const matched = raw.match(/^(?:id|server|name):(.+)$/i);
  if (matched) return matched[1].trim();
  return raw;
}

function isPlaceholderUrl(value) {
  if (!value) return true;
  const lower = String(value).trim().toLowerCase();
  return (
    lower === "https://status.example.com" ||
    lower.includes("example.com") ||
    lower.includes("exmaple.com") ||
    lower.includes("请填写")
  );
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
  if (typeof server.is_online === "boolean") return server.is_online;
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

// 基础 DSL 元素构造函数（同时兼容新旧版 Egern 屬性）
function mkText(text, size, weight, color, opts = {}) {
  return {
    type: "text",
    text: String(text ?? ""),
    font: { size, weight: weight || "regular", ...(opts.family ? { family: opts.family } : {}) },
    // color 为空时不写 textColor，交给系统默认前景色（锁屏 accessory 组件必须这样才不会被 vibrancy 冲淡）
    ...(color ? { textColor: color } : {}),
    ...(opts.maxLines ? { maxLines: opts.maxLines } : {}),
    ...(opts.minScale ? { minScale: opts.minScale } : {}),
    ...(opts.textAlign ? { textAlign: opts.textAlign } : {}),
    ...(opts.flex ? { flex: opts.flex } : {})
  };
}

function mkSpacer(length) {
  return length !== undefined ? { type: "spacer", length } : { type: "spacer" };
}

function mkRow(children, gap = 0, opts = {}) {
  // 官方 DSL 只支持 alignItems，不支持 align；这里统一做一次映射
  const { align, ...rest } = opts;
  return {
    type: "stack",
    direction: "row",
    alignItems: align || "center",
    ...rest,
    gap,
    children
  };
}

function mkCol(children, gap = 0, opts = {}) {
  const { align, ...rest } = opts;
  return {
    type: "stack",
    direction: "column",
    alignItems: align || "start",
    ...rest,
    gap,
    children
  };
}

// 使用纯原生 stack 容器绘制圆角进度条（不依赖 SVG/Image，兼容所有 Egern 版本）
function buildProgressBar(value, width, height, color) {
  const p = clampPercent(value);
  const radius = Math.round(height / 2);
  const fillWidth = p <= 0 ? 0 : Math.max(height, Math.round((width * p) / 100));

  return {
    type: "stack",
    direction: "row",
    alignItems: "center",
    width,
    height,
    borderRadius: radius,
    backgroundColor: COL.track,
    children:
      fillWidth > 0
        ? [
            {
              type: "stack",
              direction: "row",
              width: fillWidth,
              height,
              borderRadius: radius,
              backgroundColor: color,
              children: []
            },
            mkSpacer()
          ]
        : [mkSpacer()]
  };
}

function buildFlagElement(server, fontSize = 12) {
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
  return mkRow([
    mkRow([mkText(label, 9, "semibold", COL.dim, { maxLines: 1 })], 0, { width: 32, height: 12 }),
    mkSpacer(5),
    buildProgressBar(value, width, height, usageColor(value)),
    mkSpacer(5),
    mkText(pctStr, 9, "regular", COL.dim, { maxLines: 1, minScale: 0.7 })
  ]);
}

function buildMetricColumn(label, value, width) {
  const pctStr = `${Math.round(clampPercent(value))}%`;
  return mkCol(
    [
      mkRow(
        [
          mkText(label, 9, "semibold", COL.dim, { maxLines: 1 }),
          mkSpacer(),
          mkText(pctStr, 9, "regular", COL.dim2, { maxLines: 1 })
        ],
        0,
        { width }
      ),
      buildProgressBar(value, width, 6, usageColor(value))
    ],
    3
  );
}

function buildNetLine(label, value, color) {
  return mkRow(
    [
      mkText(label, 10, "semibold", COL.dim, { maxLines: 1 }),
      mkSpacer(),
      mkText(`${formatBytes(value)}/s`, 11, "regular", color, { maxLines: 1, minScale: 0.7 })
    ],
    0,
    { flex: 1 }
  );
}

function buildSmallChildren(server) {
  const online = isOnline(server);
  const cpu = Number(server.cpu) || 0;
  const ram = percent(server.ram_used, server.ram_total);
  const disk = percent(server.disk_used, server.disk_total);
  const flagEl = buildFlagElement(server, 12);

  const headChildren = [
    mkText("●", 10, "bold", online ? COL.green : COL.dim2, { maxLines: 1 }),
    mkSpacer(5),
    ...(flagEl ? [flagEl, mkSpacer(4)] : []),
    mkText(serverName(server), 13, "bold", COL.fg, { maxLines: 1, minScale: 0.7, flex: 1 })
  ];

  return [
    mkRow(headChildren),
    mkSpacer(8),
    buildBarRow("CPU", cpu, 60, 6),
    mkSpacer(5),
    buildBarRow("RAM", ram, 60, 6),
    mkSpacer(5),
    buildBarRow("DSK", disk, 60, 6),
    mkSpacer(),
    ...(online
      ? [
          mkRow([mkText(`↓ ${formatBytes(server.net_in_speed)}/s`, 10, "regular", COL.cyan, { maxLines: 1 })]),
          mkSpacer(2),
          mkRow([mkText(`↑ ${formatBytes(server.net_out_speed)}/s`, 10, "regular", COL.blue, { maxLines: 1 })])
        ]
      : [mkRow([mkText("offline", 10, "semibold", COL.red, { maxLines: 1 })])]),
    mkSpacer(4),
    mkRow([mkSpacer(), mkText(`Updated ${hhmm()}`, 8, "regular", COL.dim2, { maxLines: 1 }), mkSpacer()])
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
    mkText("●", isLarge ? 12 : 11, "bold", online ? COL.green : COL.dim2, { maxLines: 1 }),
    mkSpacer(6),
    ...(flagEl ? [flagEl, mkSpacer(6)] : []),
    mkText(serverName(server), isLarge ? 18 : 16, "bold", COL.fg, { maxLines: 1, minScale: 0.65 }),
    mkSpacer(),
    mkText(online ? "online" : "offline", 11, "semibold", online ? COL.green : COL.red, { maxLines: 1 })
  ];

  const colWidth = isLarge ? 86 : 76;
  const children = [
    mkRow(headChildren),
    mkSpacer(3),
    mkRow([mkText(`Updated ${hhmm()}`, 9, "regular", COL.dim2, { maxLines: 1 })]),
    mkSpacer(isLarge ? 16 : 12),
    mkRow([
      buildMetricColumn("CPU", cpu, colWidth),
      mkSpacer(8),
      buildMetricColumn("RAM", ram, colWidth),
      mkSpacer(8),
      buildMetricColumn("DISK", disk, colWidth)
    ])
  ];

  if (server.traffic_limit) {
    children.push(
      mkSpacer(isLarge ? 13 : 10),
      buildBarRow("TRF", traffic, isLarge ? 235 : 216, 7)
    );
  }

  children.push(
    mkSpacer(),
    mkRow([
      buildNetLine("DOWN", server.net_in_speed, online ? COL.cyan : COL.dim2),
      mkSpacer(isLarge ? 28 : 18),
      buildNetLine("UP", server.net_out_speed, online ? COL.blue : COL.dim2)
    ])
  );

  return children;
}

function buildLockScreenWidget(server) {
  const online = isOnline(server);
  const cpu = Math.round(clampPercent(server.cpu));
  const ram = Math.round(clampPercent(percent(server.ram_used, server.ram_total)));
  // 锁屏 accessory 组件由系统统一着色（忽略背景色），这里一律不写死颜色，否则浅色壁纸下会糊成一片白
  return {
    type: "widget",
    children: [
      mkRow([
        mkText(online ? "●" : "○", 10, "bold", null),
        mkSpacer(4),
        mkText(serverName(server), 13, "bold", null, { maxLines: 1 })
      ]),
      mkSpacer(2),
      mkRow([mkText(`CPU ${cpu}%  |  RAM ${ram}%`, 11, "medium", null, { maxLines: 1 })]),
      mkRow([
        mkText(
          online ? `↓${formatBytes(server.net_in_speed)}/s ↑${formatBytes(server.net_out_speed)}/s` : "offline",
          10,
          "regular",
          null,
          { maxLines: 1 }
        )
      ])
    ]
  };
}

function buildErrorWidget(message, baseURL) {
  return {
    type: "widget",
    padding: [12, 14, 12, 14],
    ...(baseURL ? { url: baseURL } : {}),
    backgroundColor: COL.bg1,
    backgroundGradient: BG_GRADIENT,
    refreshAfter: new Date(Date.now() + 60 * 1000).toISOString(),
    children: [
      mkRow([
        mkText("⚠️ ", 12, "bold", COL.red),
        mkText("CF Server Monitor", 13, "bold", COL.red, { maxLines: 1 })
      ]),
      mkSpacer(6),
      mkRow([
        mkText(String(message || "未知错误"), 11, "regular", COL.fg, {
          maxLines: 5,
          minScale: 0.75,
          flex: 1
        })
      ]),
      mkSpacer()
    ]
  };
}

// 从服务器列表中智能匹配目标服务器（同时支持 ID、UUID、服务器名称如 CloudCone、序号或留空取第 1 台）
function matchServerFromList(servers, target) {
  if (!Array.isArray(servers) || !servers.length) return null;
  const clean = String(target || "").trim();
  if (!clean || clean.toLowerCase() === "your-server-id" || clean.toLowerCase() === "auto") {
    return servers[0];
  }
  const lower = clean.toLowerCase();

  // 1. 精确匹配 id 或 name
  let found = servers.find(
    (s) => String(s?.id || "").trim() === clean || String(s?.name || "").trim() === clean
  );
  if (found) return found;

  // 2. 忽略大小写匹配 id 或 name（例如填写了 CloudCone）
  found = servers.find(
    (s) =>
      String(s?.id || "").trim().toLowerCase() === lower ||
      String(s?.name || "").trim().toLowerCase() === lower
  );
  if (found) return found;

  // 3. 模糊包含匹配 name 或 id
  found = servers.find(
    (s) =>
      String(s?.name || "").toLowerCase().includes(lower) ||
      String(s?.id || "").toLowerCase().includes(lower)
  );
  if (found) return found;

  // 4. 数字序号匹配（如填 1 代表第 1 台服务器）
  if (/^\d+$/.test(clean)) {
    const idx = parseInt(clean, 10);
    if (idx >= 1 && idx <= servers.length) return servers[idx - 1];
    if (idx === 0 && servers.length > 0) return servers[0];
  }

  return null;
}

async function tryLogin(ctx, baseURL, username, password) {
  const candidates = [username || "admin"];
  if (candidates[0] !== "admin") candidates.push("admin");

  let lastErr = "登录鉴权失败";
  for (const user of candidates) {
    try {
      const resp = await ctx.http.post(`${baseURL}/admin/api`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          action: "login",
          username: user,
          password
        }),
        timeout: 10000
      });
      const text = await resp.text();
      const data = JSON.parse(text);
      if (data?.token) return { token: data.token };
      if (data?.error) lastErr = data.error;
    } catch (e) {
      lastErr = e?.message || String(e);
    }
  }
  return { error: lastErr };
}

async function fetchServerSmart(ctx, baseURL, targetServer, authConfig) {
  const makeHeaders = (token) => {
    const h = { Accept: "application/json" };
    if (token) {
      h.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }
    return h;
  };

  let token = authConfig.apiToken || "";

  // 第一步：尝试通过 /api/servers 获取列表（支持直接用服务器名称如 CloudCone 匹配）
  const tryFetchList = async (jwt) => {
    const resp = await ctx.http.get(`${baseURL}/api/servers`, {
      headers: makeHeaders(jwt),
      timeout: 12000
    });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      return { status: resp.status, error: `接口非 JSON 响应 (HTTP ${resp.status || ""})` };
    }
    if (resp.status === 401 || data?.code === 401) {
      return { status: 401, unauthorized: true };
    }
    const list = Array.isArray(data?.servers) ? data.servers : Array.isArray(data) ? data : null;
    if (list) return { status: 200, servers: list };
    return { status: resp.status, error: data?.error || "未获取到服务器列表" };
  };

  // 先尝试公开访问（或携带已有 API_TOKEN）
  let listRes = await tryFetchList(token);

  // 若返回 401（站点为私有站点）且配置了密码，则自动登录换取 Token
  if (listRes.unauthorized && !token && authConfig.password) {
    const loginRes = await tryLogin(ctx, baseURL, authConfig.username, authConfig.password);
    if (loginRes.token) {
      token = loginRes.token;
      listRes = await tryFetchList(token);
    } else {
      throw new Error(`私有站点登录失败 (${loginRes.error})`);
    }
  } else if (listRes.unauthorized && !token) {
    throw new Error("面板已开启私有访问 (401)，请在环境变量中填写 PASSWORD 或 API_TOKEN");
  }

  let availableNames = [];
  if (listRes.servers && listRes.servers.length > 0) {
    const matched = matchServerFromList(listRes.servers, targetServer);
    if (matched) return matched;
    availableNames = listRes.servers.map((s) => s.name || s.id).filter(Boolean);
  }

  // 第二步：若公开列表未找到（例如该服务器被设为隐藏 is_hidden=1）且有密码/Token，尝试管理端 list 接口
  if (!token && authConfig.password) {
    const loginRes = await tryLogin(ctx, baseURL, authConfig.username, authConfig.password);
    if (loginRes.token) token = loginRes.token;
  }
  if (token) {
    try {
      const adminResp = await ctx.http.post(`${baseURL}/admin/api`, {
        headers: { ...makeHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", refresh: false }),
        timeout: 12000
      });
      const adminData = JSON.parse(await adminResp.text());
      if (Array.isArray(adminData?.servers) && adminData.servers.length > 0) {
        const matched = matchServerFromList(adminData.servers, targetServer);
        if (matched) return matched;
        availableNames = adminData.servers.map((s) => s.name || s.id).filter(Boolean);
      }
    } catch (_) {}
  }

  // 第三步：直接按 ID 请求 /api/server?id=...
  if (targetServer && targetServer.toLowerCase() !== "your-server-id") {
    const resp = await ctx.http.get(
      `${baseURL}/api/server?id=${encodeURIComponent(targetServer)}`,
      { headers: makeHeaders(token), timeout: 12000 }
    );
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(`接口响应异常 (HTTP ${resp.status || ""})，请检查 BASE_URL 是否正确`);
    }
    if (!data?.error) {
      return data?.data && typeof data.data === "object" ? data.data : data;
    }
  }

  if (availableNames.length > 0) {
    throw new Error(
      `未找到 "${targetServer}"，当前可用: ${availableNames.slice(0, 4).join(", ")}`
    );
  }
  throw new Error(listRes.error || `未找到服务器 "${targetServer}"`);
}

export default async function (ctx) {
  const env = ctx.env || {};
  const rawBaseURL = getEnv(env, ["BASE_URL", "API_URL", "baseURL"], "");
  const baseURL = String(rawBaseURL || "").replace(/\/+$/, "");
  const serverId = normalizeServerId(
    getEnv(env, ["SERVER_ID", "ID", "serverId", "SERVER_NAME"], "")
  );
  const apiToken = getEnv(env, ["API_TOKEN", "TOKEN", "JWT"], "");
  const password = getEnv(env, ["PASSWORD", "API_SECRET", "SECRET"], "");
  const username = getEnv(env, ["USERNAME", "USER"], "admin");

  if (isPlaceholderUrl(baseURL)) {
    return buildErrorWidget(
      "请先在 Egern 模块设置中填写 BASE_URL（监控面板地址）",
      ""
    );
  }

  try {
    const server = await fetchServerSmart(ctx, baseURL, serverId, {
      apiToken,
      password,
      username
    });
    const family = String(ctx.widgetFamily || "systemMedium").toLowerCase();

    if (family.includes("accessory")) {
      return buildLockScreenWidget(server);
    }

    const isSmall = family.includes("small");
    const isLarge = family.includes("large");
    const padding = isSmall ? [12, 13, 10, 13] : [14, 15, 12, 15];

    return {
      type: "widget",
      padding,
      url: baseURL,
      backgroundColor: COL.bg1,
      backgroundGradient: BG_GRADIENT,
      refreshAfter: new Date(Date.now() + 60 * 1000).toISOString(),
      children: isSmall
        ? buildSmallChildren(server)
        : buildMediumLargeChildren(server, isLarge)
    };
  } catch (e) {
    return buildErrorWidget(e?.message || String(e), baseURL);
  }
}
