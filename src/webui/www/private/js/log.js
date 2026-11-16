"use strict";

// Log page: shows the application log, polled incrementally.
(() => {
    const { el } = B;

    const LEVELS = [[1, "Normal", "normal"], [2, "Info", "info"], [4, "Warning", "warn"], [8, "Critical", "crit"]];
    const MAX_ROWS = 5000;

    let lastId = -1;
    let timer = null;
    let list = null;
    let filterText = "";
    let autoScroll = true;
    const enabled = new Set(B.storage.get("logLevels", [1, 2, 4, 8]));

    const when = (timestamp) => {
        const date = new Date((timestamp < 1e11) ? timestamp * 1000 : timestamp);
        return date.toLocaleTimeString();
    };

    const applyRowFilter = (row) => {
        const text = row.dataset.text;
        row.hidden = !enabled.has(Number(row.dataset.level)) || ((filterText !== "") && !text.includes(filterText));
    };

    const applyAllFilters = () => {
        for (const row of list.children)
            applyRowFilter(row);
    };

    const append = (messages) => {
        const atBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 40;
        for (const message of messages) {
            const level = LEVELS.find(([value]) => value === message.type) || LEVELS[0];
            const row = el("div", { class: `log-row ${level[2]}`, "data-level": String(message.type), "data-text": message.message.toLowerCase() },
                el("span", { class: "log-time", text: when(message.timestamp) }),
                el("span", { class: "log-level", text: level[1] }),
                el("span", { class: "log-msg", text: message.message }));
            applyRowFilter(row);
            list.append(row);
            lastId = Math.max(lastId, message.id);
        }
        while (list.children.length > MAX_ROWS)
            list.firstChild.remove();
        if (autoScroll && atBottom)
            list.scrollTop = list.scrollHeight;
    };

    const poll = async () => {
        try {
            const messages = await B.api.json("log/main", { last_known_id: String(lastId) });
            if (messages.length > 0)
                append(messages);
        }
        catch {
            // the next poll will retry; session loss is handled by B.api
        }
    };

    B.pages.register("log", {
        label: "Log",
        icon: "help-contents",
        root: document.getElementById("page-log"),

        mount(root) {
            const chips = LEVELS.map(([value, label, css]) => {
                const input = el("input", { type: "checkbox", id: `logLevel${value}` });
                input.checked = enabled.has(value);
                input.addEventListener("change", () => {
                    if (input.checked)
                        enabled.add(value);
                    else
                        enabled.delete(value);
                    B.storage.set("logLevels", [...enabled]);
                    applyAllFilters();
                });
                return el("label", { class: `chip ${css}`, for: `logLevel${value}` }, input, el("span", { text: label }));
            });
            const search = el("input", { type: "search", placeholder: "Filter messages...", "aria-label": "Filter messages" });
            search.addEventListener("input", () => {
                filterText = search.value.trim().toLowerCase();
                applyAllFilters();
            });
            const auto = el("input", { type: "checkbox", id: "logAuto" });
            auto.checked = true;
            auto.addEventListener("change", () => {
                autoScroll = auto.checked;
            });
            const clear = el("button", { type: "button", class: "btn", onclick: () => list.replaceChildren() }, B.icon("edit-clear"), el("span", { text: "Clear" }));

            list = el("div", { class: "log-list", role: "log", "aria-live": "off" });
            root.append(
                el("header", { class: "topbar" },
                    B.pages.menuButton(),
                    el("h2", { class: "page-title", text: "Log" }),
                    el("div", { class: "chips" }, chips),
                    el("span", { class: "spacer" }),
                    el("label", { class: "check" }, auto, el("span", { text: "Auto-scroll" })),
                    clear,
                    el("label", { class: "search" }, B.icon("edit-find"), search)),
                list);
        },

        show() {
            poll();
            timer = setInterval(poll, 2000);
        },

        hide() {
            clearInterval(timer);
            timer = null;
        }
    });
})();
