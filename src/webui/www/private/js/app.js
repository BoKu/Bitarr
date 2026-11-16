"use strict";

// Main application: torrent table, sidebar filters, toolbar and status bar.
(() => {
    const { el, fmt, storage, icon } = B;
    const $ = (id) => document.getElementById(id);

    const view = {
        status: storage.get("status", "all"),
        category: storage.get("category", null), // null = all, "" = uncategorised
        tag: storage.get("tag", null), // null = all, "" = untagged
        search: "",
        sort: storage.get("sort", { col: "added_on", dir: -1 }),
        selected: new Set(),
        anchor: null,
        order: []
    };

    const tagsOf = (t) => (t.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);

    // ---- columns -------------------------------------------------------------------------------------------------
    const text = (id, label, options) => ({
        id,
        label,
        key: options.text,
        paint: (td, t) => {
            td.textContent = options.text(t);
            if (options.title)
                td.title = td.textContent;
        },
        sortValue: options.sort,
        ...options.extra
    });

    const columns = [
        text("name", "Name", { text: (t) => t.name || t.hash, title: true, sort: (t) => (t.name || "").toLowerCase(), extra: { cls: "name" } }),
        text("size", "Size", { text: (t) => fmt.bytes(t.size), sort: (t) => t.size, extra: { cls: "num", width: "88px" } }),
        {
            id: "progress",
            label: "Progress",
            width: "150px",
            key: (t) => `${t.progress}|${t.state}`,
            sortValue: (t) => t.progress,
            paint: (td, t) => {
                if (!td.firstChild)
                    td.append(el("div", { class: "bar" }, el("div", { class: "fill" }), el("span", { class: "label" })));
                const percent = Math.min(100, t.progress * 100);
                const bar = td.firstChild;
                bar.dataset.tone = B.states.info(t)[1];
                bar.firstChild.style.width = `${percent}%`;
                bar.lastChild.textContent = fmt.percent(t.progress);
                bar.lastChild.style.setProperty("--p", `${percent}%`);
            }
        },
        {
            id: "state",
            label: "Status",
            width: "150px",
            key: (t) => t.state,
            sortValue: (t) => B.states.info(t)[0],
            paint: (td, t) => {
                const [label, tone] = B.states.info(t);
                td.replaceChildren(el("span", { class: `pill ${tone}`, text: label }));
            }
        },
        text("num_seeds", "Seeds", { text: (t) => `${t.num_seeds} (${t.num_complete})`, sort: (t) => t.num_seeds, extra: { cls: "num", width: "84px" } }),
        text("num_leechs", "Peers", { text: (t) => `${t.num_leechs} (${t.num_incomplete})`, sort: (t) => t.num_leechs, extra: { cls: "num", width: "84px" } }),
        text("dlspeed", "Down", { text: (t) => fmt.speed(t.dlspeed), sort: (t) => t.dlspeed, extra: { cls: "num", width: "100px" } }),
        text("upspeed", "Up", { text: (t) => fmt.speed(t.upspeed), sort: (t) => t.upspeed, extra: { cls: "num", width: "100px" } }),
        text("eta", "ETA", { text: (t) => fmt.eta(t.eta), sort: (t) => t.eta, extra: { cls: "num", width: "76px" } }),
        text("ratio", "Ratio", { text: (t) => fmt.ratio(t.ratio), sort: (t) => t.ratio, extra: { cls: "num", width: "70px" } }),
        text("category", "Category", { text: (t) => t.category || "", sort: (t) => (t.category || "").toLowerCase(), extra: { width: "120px" } }),
        text("added_on", "Added", { text: (t) => fmt.date(t.added_on), sort: (t) => t.added_on, extra: { width: "170px" } })
    ];

    function renderHead() {
        $("headRow").replaceChildren(...columns.map((column) => el("th", {
            class: `${column.cls || ""}${(view.sort.col === column.id) ? ` sorted ${(view.sort.dir > 0) ? "asc" : "desc"}` : ""}`,
            style: column.width ? `width:${column.width}` : false,
            text: column.label,
            onclick: () => {
                view.sort = (view.sort.col === column.id) ? { col: column.id, dir: -view.sort.dir } : { col: column.id, dir: 1 };
                storage.set("sort", view.sort);
                renderHead();
                renderTable();
            }
        })));
    }

    // ---- table ---------------------------------------------------------------------------------------------------
    const rows = new Map(); // hash -> { tr, cells, last }

    function buildRow(hash) {
        const tr = el("tr", { "data-hash": hash });
        const cells = columns.map((column) => {
            const td = el("td", { class: column.cls || "" });
            tr.append(td);
            return td;
        });
        return { tr, cells, last: new Array(columns.length) };
    }

    function visibleTorrents() {
        const query = view.search.trim().toLowerCase();
        const group = B.states.groups.find((g) => g.id === view.status) || B.states.groups[0];
        const list = [...B.store.torrents.values()].filter((t) =>
            group.test(t)
            && ((view.category === null) || ((t.category || "") === view.category))
            && ((view.tag === null) || ((view.tag === "") ? (tagsOf(t).length === 0) : tagsOf(t).includes(view.tag)))
            && (!query || (t.name || "").toLowerCase().includes(query)));

        const column = columns.find((c) => c.id === view.sort.col) || columns[0];
        list.sort((a, b) => {
            const x = column.sortValue(a);
            const y = column.sortValue(b);
            return ((x < y) ? -1 : (x > y) ? 1 : 0) * view.sort.dir;
        });
        return list;
    }

    function renderTable() {
        const body = $("tbody");
        const list = visibleTorrents();
        view.order = list.map((t) => t.hash);

        const seen = new Set();
        let previous = null;
        for (const t of list) {
            let row = rows.get(t.hash);
            if (!row) {
                row = buildRow(t.hash);
                rows.set(t.hash, row);
            }
            columns.forEach((column, i) => {
                const key = column.key(t);
                if (row.last[i] !== key) {
                    row.last[i] = key;
                    column.paint(row.cells[i], t);
                }
            });
            row.tr.classList.toggle("selected", view.selected.has(t.hash));
            seen.add(t.hash);

            const expected = previous ? previous.nextSibling : body.firstChild;
            if (row.tr !== expected)
                body.insertBefore(row.tr, expected);
            previous = row.tr;
        }
        for (const [hash, row] of rows) {
            if (!seen.has(hash)) {
                row.tr.remove();
                rows.delete(hash);
            }
        }
        $("empty").hidden = (list.length > 0);
    }

    $("tbody").addEventListener("click", (event) => {
        const tr = event.target.closest("tr");
        if (!tr)
            return;
        const hash = tr.dataset.hash;
        if (event.shiftKey && view.anchor && view.order.includes(view.anchor)) {
            const a = view.order.indexOf(view.anchor);
            const b = view.order.indexOf(hash);
            view.selected = new Set(view.order.slice(Math.min(a, b), Math.max(a, b) + 1));
        }
        else if (event.metaKey || event.ctrlKey) {
            if (!view.selected.delete(hash))
                view.selected.add(hash);
            view.anchor = hash;
        }
        else {
            view.selected = new Set([hash]);
            view.anchor = hash;
        }
        renderTable();
        afterSelectionChange();
    });

    document.addEventListener("keydown", (event) => {
        if (document.querySelector(".overlay") || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
            return;
        if ((event.key === "a") && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            view.selected = new Set(view.order);
            renderTable();
            afterSelectionChange();
        }
        else if ((event.key === "Delete") && (selectedHashes().length > 0)) {
            $("btnDelete").click();
        }
    });

    // ---- selection and toolbar -----------------------------------------------------------------------------------
    const selectedHashes = () => [...view.selected].filter((hash) => B.store.torrents.has(hash));

    function afterSelectionChange() {
        const hashes = selectedHashes();
        for (const id of ["btnStart", "btnStop", "btnDelete"])
            $(id).disabled = (hashes.length === 0);
        B.details.setSelection(hashes);
    }

    async function runAction(path) {
        const hashes = selectedHashes();
        if (hashes.length === 0)
            return;
        try {
            await B.api.post(path, { hashes: hashes.join("|") });
            await B.store.poll();
        }
        catch (error) {
            B.toast(error.message, "err");
        }
    }

    $("btnAdd").addEventListener("click", () => B.dialogs.add());
    $("btnStart").addEventListener("click", () => runAction("torrents/start"));
    $("btnStop").addEventListener("click", () => runAction("torrents/stop"));
    $("btnDelete").addEventListener("click", () => B.dialogs.remove(selectedHashes(), () => {
        view.selected.clear();
        B.store.poll().catch(() => {});
    }));
    $("btnSettings").addEventListener("click", () => B.dialogs.settings());
    $("btnLogout").addEventListener("click", async () => {
        try {
            await B.api.post("auth/logout");
        }
        finally {
            location.reload();
        }
    });
    $("btnAlt").addEventListener("click", async () => {
        try {
            await B.api.post("transfer/toggleSpeedLimitsMode");
            await B.store.poll();
        }
        catch (error) {
            B.toast(error.message, "err");
        }
    });
    $("search").addEventListener("input", (event) => {
        view.search = event.target.value;
        renderTable();
    });

    // Small screens: the sidebar slides in over the content.
    const toggleMenu = (open) => $("app").classList.toggle("menu-open", open);
    $("btnMenu").addEventListener("click", () => toggleMenu(!$("app").classList.contains("menu-open")));
    $("scrim").addEventListener("click", () => toggleMenu(false));

    // ---- sidebar filters -----------------------------------------------------------------------------------------
    let filterSignature = "";
    const counters = new Map(); // "kind:value" -> count element

    function filterSection(title, iconName, kind, items) {
        return el("section", { class: "filter-group" },
            el("h3", { text: title }),
            items.map((item) => {
                const count = el("span", { class: "count" });
                counters.set(`${kind}:${item.value}`, count);
                const active = (view[kind] === item.value);
                return el("button", {
                    type: "button",
                    class: `filter-item${active ? " active" : ""}`,
                    "aria-pressed": String(active),
                    onclick: () => {
                        view[kind] = item.value;
                        storage.set(kind, item.value);
                        toggleMenu(false);
                        renderFilters();
                        renderTable();
                    }
                }, icon(item.icon || iconName), el("span", { class: "label", text: item.label }), count);
            }));
    }

    function renderFilters() {
        const categories = Object.keys(B.store.categories).sort((a, b) => a.localeCompare(b));
        const tags = [...B.store.tags].sort((a, b) => a.localeCompare(b));
        const signature = JSON.stringify([categories, tags, view.status, view.category, view.tag]);

        if (signature !== filterSignature) {
            filterSignature = signature;
            counters.clear();
            $("filters").replaceChildren(
                filterSection("Status", "filter-all", "status", B.states.groups.map((g) => ({ value: g.id, label: g.label, icon: g.icon }))),
                filterSection("Categories", "view-categories", "category",
                    [{ value: null, label: "All" }, { value: "", label: "Uncategorised" }, ...categories.map((name) => ({ value: name, label: name }))]),
                filterSection("Tags", "tags", "tag",
                    [{ value: null, label: "All" }, { value: "", label: "Untagged" }, ...tags.map((name) => ({ value: name, label: name }))]));
        }

        const counts = new Map();
        const bump = (key) => counts.set(key, (counts.get(key) || 0) + 1);
        for (const t of B.store.torrents.values()) {
            for (const group of B.states.groups) {
                if (group.test(t))
                    bump(`status:${group.id}`);
            }
            bump("category:null");
            bump(`category:${t.category || ""}`);
            const own = tagsOf(t);
            bump("tag:null");
            if (own.length === 0)
                bump("tag:");
            for (const tag of own)
                bump(`tag:${tag}`);
        }
        for (const [key, node] of counters) {
            const value = String(counts.get(key) || 0);
            if (node.textContent !== value)
                node.textContent = value;
        }
        $("navCount").textContent = String(B.store.torrents.size);
    }

    // ---- status bar ----------------------------------------------------------------------------------------------
    function renderStatus() {
        const s = B.store.server;
        const connection = $("connection");
        if (!B.store.connected) {
            connection.textContent = "Server unreachable";
            connection.className = "status-chip err";
        }
        else {
            const status = s.connection_status || "disconnected";
            connection.textContent = status.charAt(0).toUpperCase() + status.slice(1);
            connection.className = `status-chip ${(status === "connected") ? "ok" : (status === "firewalled") ? "warn" : "err"}`;
        }
        $("dht").textContent = `DHT: ${s.dht_nodes ?? 0} nodes`;
        $("disk").textContent = `Free: ${fmt.bytes(s.free_space_on_disk)}`;
        $("dlSpeed").textContent = `${fmt.speed(s.dl_info_speed || 0)} (${fmt.bytes(s.dl_info_data || 0)})`;
        $("upSpeed").textContent = `${fmt.speed(s.up_info_speed || 0)} (${fmt.bytes(s.up_info_data || 0)})`;
        $("btnAlt").classList.toggle("active", !!s.use_alt_speed_limits);
    }

    // ---- start-up ------------------------------------------------------------------------------------------------
    B.store.onChange(() => {
        // Drop selected torrents that no longer exist.
        view.selected = new Set(selectedHashes());
        renderFilters();
        renderTable();
        renderStatus();
        afterSelectionChange();
    });

    renderHead();
    B.details.init();
    afterSelectionChange();
    B.store.start();
})();
