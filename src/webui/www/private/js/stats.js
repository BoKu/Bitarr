"use strict";

// Statistics page: a live speed chart plus transfer, all-time, network and disk statistics.
(() => {
    const { el, fmt } = B;

    const MAX_SAMPLES = 200; // about 5 minutes at the 1.5 s poll interval
    const history = [];
    let ui = {};
    let visible = false;

    // Sample speeds on every poll, even while the page is closed, so the chart already has history when opened.
    B.stats = { history };
    B.store.onChange(() => {
        const s = B.store.server;
        history.push({ dl: s.dl_info_speed || 0, up: s.up_info_speed || 0 });
        if (history.length > MAX_SAMPLES)
            history.shift();
        if (visible)
            update();
    });

    const pct = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
    };
    // libtorrent reports disk job time and request latency in microseconds
    const us = (value) => (Number.isFinite(Number(value)) ? `${Number(value).toLocaleString()} \u00B5s` : "\u2014");
    const count = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—");
    const size = (value) => fmt.bytes(Number(value));
    const limit = (value) => (value > 0 ? fmt.speed(value) : "Unlimited");

    // [card title, [[label, id, formatter(serverState) -> string]]]
    const CARDS = [
        ["Transfer", [
            ["Download speed", "dl", (s) => fmt.speed(s.dl_info_speed || 0)],
            ["Upload speed", "up", (s) => fmt.speed(s.up_info_speed || 0)],
            ["Download limit", "dll", (s) => limit(s.dl_rate_limit)],
            ["Upload limit", "upl", (s) => limit(s.up_rate_limit)],
            ["Alternative limits", "alt", (s) => (s.use_alt_speed_limits ? "On" : "Off")],
            ["Downloaded (session)", "dld", (s) => size(s.dl_info_data)],
            ["Uploaded (session)", "upd", (s) => size(s.up_info_data)],
            ["Wasted (session)", "waste", (s) => size(s.total_wasted_session)]
        ]],
        ["All-time", [
            ["Total downloaded", "adl", (s) => size(s.alltime_dl)],
            ["Total uploaded", "aup", (s) => size(s.alltime_ul)],
            ["Share ratio", "ratio", (s) => (Number.isFinite(Number(s.global_ratio)) ? Number(s.global_ratio).toFixed(2) : "—")]
        ]],
        ["Network", [
            ["Connection status", "conn", (s) => s.connection_status || "—"],
            ["Peer connections", "peers", (s) => count(s.total_peer_connections)],
            ["DHT nodes", "dht", (s) => count(s.dht_nodes)],
            ["External IPv4", "ip4", (s) => s.last_external_address_v4 || "—"],
            ["External IPv6", "ip6", (s) => s.last_external_address_v6 || "—"],
            ["Free disk space", "free", (s) => size(s.free_space_on_disk)]
        ]],
        ["Disk I/O and cache", [
            ["Read cache hits", "rch", (s) => pct(s.read_cache_hits)],
            ["Read cache overload", "rco", (s) => pct(s.read_cache_overload)],
            ["Write cache overload", "wco", (s) => pct(s.write_cache_overload)],
            ["Queued I/O jobs", "qio", (s) => count(s.queued_io_jobs)],
            ["Average time in queue", "avg", (s) => us(s.average_time_queue)],
            ["Buffer size", "buf", (s) => size(s.total_buffers_size)],
            ["Queued size", "qsize", (s) => size(s.total_queued_size)],
            ["Queued tracker announces", "qta", (s) => count(s.queued_tracker_announces)],
            ["Request latency", "lat", (s) => us(s.request_latency)]
        ]]
    ];

    // ---- chart ---------------------------------------------------------------------------------------------------
    // Round the axis maximum up to 1, 2, 5 or 10 x 10^n in the unit the labels use (KiB/s or MiB/s, ...),
    // so the five labels come out as clean numbers.
    const niceMax = (value) => {
        const floor = 10 * 1024; // never zoom in past 10 KiB/s
        const v = Math.max(value, floor);
        const unit = 1024 ** Math.min(4, Math.floor(Math.log(v) / Math.log(1024)));
        const scaled = v / unit;
        const power = 10 ** Math.floor(Math.log10(scaled));
        for (const step of [1, 2, 5, 10]) {
            if (step * power >= scaled)
                return step * power * unit;
        }
        return v;
    };

    function drawChart() {
        const canvas = ui.canvas;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if ((width === 0) || (height === 0))
            return;
        const dpr = window.devicePixelRatio || 1;
        if ((canvas.width !== Math.round(width * dpr)) || (canvas.height !== Math.round(height * dpr))) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const css = getComputedStyle(document.documentElement);
        const accent = css.getPropertyValue("--accent").trim() || "#3dff8b";
        const accent2 = css.getPropertyValue("--accent-2").trim() || "#14c9a0";
        const muted = css.getPropertyValue("--muted").trim() || "#7d9a88";
        const line = css.getPropertyValue("--line").trim() || "#1b2e22";

        const left = 78;
        const right = 12;
        const top = 10;
        const bottom = 24;
        const plotW = width - left - right;
        const plotH = height - top - bottom;
        const max = niceMax(Math.max(0, ...history.map((p) => Math.max(p.dl, p.up))));

        ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; ++i) {
            const y = top + (plotH * i) / 4;
            ctx.strokeStyle = line;
            ctx.beginPath();
            ctx.moveTo(left, y + 0.5);
            ctx.lineTo(width - right, y + 0.5);
            ctx.stroke();
            ctx.fillStyle = muted;
            ctx.textAlign = "right";
            ctx.fillText(fmt.speed(max * (1 - i / 4)), left - 8, y);
        }
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.fillStyle = muted;
        const seconds = Math.round((MAX_SAMPLES * 1.5));
        ctx.fillText(`${Math.round(seconds / 60)} min ago`, left, height - 6);
        ctx.textAlign = "right";
        ctx.fillText("now", width - right, height - 6);

        if (history.length < 2)
            return;
        const x = (i) => left + (plotW * (i + (MAX_SAMPLES - history.length))) / (MAX_SAMPLES - 1);
        const y = (value) => top + plotH * (1 - value / max);

        const path = (key) => {
            ctx.beginPath();
            history.forEach((point, i) => (i === 0 ? ctx.moveTo(x(i), y(point[key])) : ctx.lineTo(x(i), y(point[key]))));
        };

        // Download: filled area plus line.
        path("dl");
        ctx.lineTo(x(history.length - 1), top + plotH);
        ctx.lineTo(x(0), top + plotH);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, top, 0, top + plotH);
        gradient.addColorStop(0, `${accent}55`);
        gradient.addColorStop(1, `${accent}00`);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.lineJoin = "round";
        ctx.lineWidth = 2;
        path("dl");
        ctx.strokeStyle = accent;
        ctx.stroke();
        path("up");
        ctx.strokeStyle = accent2;
        ctx.stroke();
    }

    // ---- page ----------------------------------------------------------------------------------------------------
    function update() {
        const s = B.store.server;
        for (const [, rows] of CARDS) {
            for (const [, id, format] of rows) {
                const text = format(s);
                if (ui.values[id].textContent !== text)
                    ui.values[id].textContent = text;
            }
        }
        ui.legendDl.textContent = fmt.speed(s.dl_info_speed || 0);
        ui.legendUp.textContent = fmt.speed(s.up_info_speed || 0);
        drawChart();
    }

    B.pages.register("stats", {
        label: "Statistics",
        icon: "speedometer",
        root: document.getElementById("page-stats"),

        mount(root) {
            ui.values = {};
            ui.canvas = el("canvas", { class: "chart", role: "img", "aria-label": "Download and upload speed over the last few minutes" });
            ui.legendDl = el("b");
            ui.legendUp = el("b");

            const cards = CARDS.map(([title, rows]) => el("section", { class: "card" },
                el("h3", { text: title }),
                el("dl", { class: "kv wide" }, rows.map(([label, id]) => {
                    ui.values[id] = el("dd", { text: "—" });
                    return [el("dt", { text: label }), ui.values[id]];
                }))));

            root.append(
                el("header", { class: "topbar" }, B.pages.menuButton(), el("h2", { class: "page-title", text: "Statistics" })),
                el("div", { class: "stats-body" },
                    el("section", { class: "card" },
                        el("div", { class: "chart-head" },
                            el("h3", { text: "Speed" }),
                            el("span", { class: "legend dl" }, el("i"), "Download ", ui.legendDl),
                            el("span", { class: "legend up" }, el("i"), "Upload ", ui.legendUp)),
                        ui.canvas),
                    el("div", { class: "stat-grid" }, cards)));

            new ResizeObserver(() => {
                if (visible)
                    drawChart();
            }).observe(ui.canvas);
        },

        show() {
            visible = true;
            update();
        },

        hide() {
            visible = false;
        }
    });
})();
