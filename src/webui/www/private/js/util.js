"use strict";

// Shared helpers. Everything lives under the global `B` namespace (classic scripts, no modules).
window.B = window.B || {};

B.fmt = {
    bytes(n) {
        if (!Number.isFinite(n) || n < 0)
            return "—";
        const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
        let i = 0;
        while ((n >= 1024) && (i < units.length - 1)) {
            n /= 1024;
            ++i;
        }
        return `${(i === 0) ? n.toFixed(0) : n.toFixed((n >= 100) ? 0 : 1)} ${units[i]}`;
    },
    speed(n) {
        return `${B.fmt.bytes(n)}/s`;
    },
    percent(p) {
        return `${(Math.floor(p * 1000) / 10).toFixed(1)}%`;
    },
    eta(seconds) {
        if ((seconds < 0) || (seconds >= 8640000))
            return "∞";
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0)
            return `${d}d ${h}h`;
        if (h > 0)
            return `${h}h ${m}m`;
        if (m > 0)
            return `${m}m`;
        return `${Math.floor(seconds)}s`;
    },
    duration(seconds) {
        return (seconds >= 0) ? B.fmt.eta(seconds) : "—";
    },
    date(ts) {
        return (ts > 0) ? new Date(ts * 1000).toLocaleString() : "—";
    },
    ratio(r) {
        return (r < 0) ? "∞" : r.toFixed(2);
    }
};

// DOM builder. Text is always added as text nodes, so torrent-supplied strings can never inject markup.
B.el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === "class")
            node.className = value;
        else if (key === "text")
            node.textContent = value;
        else if (key.startsWith("on"))
            node.addEventListener(key.slice(2), value);
        else if (value === true)
            node.setAttribute(key, "");
        else if ((value !== false) && (value !== null) && (value !== undefined))
            node.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) {
        if ((child !== null) && (child !== undefined))
            node.append((typeof child === "object") ? child : document.createTextNode(String(child)));
    }
    return node;
};

B.icon = (name) => B.el("img", { src: `images/${name}.svg`, alt: "" });

B.storage = {
    get(key, fallback) {
        try {
            const value = localStorage.getItem(`bitarr.${key}`);
            return (value === null) ? fallback : JSON.parse(value);
        }
        catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(`bitarr.${key}`, JSON.stringify(value));
        }
        catch {
            // storage may be unavailable (private mode); the UI works without it
        }
    }
};

B.toast = (message, kind = "info") => {
    const node = B.el("div", { class: `toast ${kind}`, text: message });
    document.getElementById("toasts").append(node);
    setTimeout(() => node.remove(), 4500);
};
