"use strict";

// Search page: runs searches through the installed search plugins and manages those plugins.
(() => {
    const { el, fmt } = B;

    const state = {
        plugins: [],
        jobId: null,
        running: false,
        results: [],
        sort: { col: "nbSeeders", dir: -1 },
        filter: "",
        selected: null,
        timer: null
    };
    let ui = {};

    const COLUMNS = [
        { id: "fileName", label: "Name", cls: "name", value: (r) => r.fileName.toLowerCase(), text: (r) => r.fileName },
        { id: "fileSize", label: "Size", cls: "num", width: "96px", value: (r) => r.fileSize, text: (r) => fmt.bytes(r.fileSize) },
        { id: "nbSeeders", label: "Seeds", cls: "num", width: "80px", value: (r) => r.nbSeeders, text: (r) => (r.nbSeeders < 0 ? "—" : String(r.nbSeeders)) },
        { id: "nbLeechers", label: "Peers", cls: "num", width: "80px", value: (r) => r.nbLeechers, text: (r) => (r.nbLeechers < 0 ? "—" : String(r.nbLeechers)) },
        { id: "engineName", label: "Engine", width: "130px", value: (r) => r.engineName.toLowerCase(), text: (r) => r.engineFullName || r.engineName },
        { id: "pubDate", label: "Published", width: "150px", value: (r) => r.pubDate, text: (r) => (r.pubDate > 0 ? new Date(r.pubDate * 1000).toLocaleDateString() : "\u2014") }
    ];

    const setStatus = (message, tone = "") => {
        ui.status.textContent = message;
        ui.status.className = `search-status ${tone}`;
    };

    // ---- plugins -------------------------------------------------------------------------------------------------
    async function loadPlugins() {
        try {
            state.plugins = await B.api.json("search/plugins");
        }
        catch {
            state.plugins = [];
        }
        const enabled = state.plugins.filter((plugin) => plugin.enabled);

        ui.plugin.replaceChildren(
            el("option", { value: "enabled", text: "Enabled plugins" }),
            ...enabled.map((plugin) => el("option", { value: plugin.name, text: plugin.fullName || plugin.name })));

        const categories = new Map([["all", "All categories"]]);
        for (const plugin of enabled) {
            for (const category of plugin.supportedCategories)
                categories.set(category.id, category.name);
        }
        const previous = ui.category.value;
        ui.category.replaceChildren(...[...categories].map(([id, name]) => el("option", { value: id, text: name })));
        if (categories.has(previous))
            ui.category.value = previous;

        ui.empty.hidden = (state.plugins.length > 0);
        ui.go.disabled = (enabled.length === 0);
    }

    function managePlugins() {
        const list = el("div", { class: "plugin-list" });
        const url = el("input", { type: "text", placeholder: "Plugin URL or local file path" });

        const render = () => {
            list.replaceChildren(...(state.plugins.length === 0
                ? [el("p", { class: "hint", text: "No search plugins installed." })]
                : state.plugins.map((plugin) => {
                    const toggle = el("input", { type: "checkbox", "aria-label": `Enable ${plugin.name}` });
                    toggle.checked = plugin.enabled;
                    toggle.addEventListener("change", async () => {
                        try {
                            await B.api.post("search/enablePlugin", { names: plugin.name, enable: String(toggle.checked) });
                            await loadPlugins();
                        }
                        catch (error) {
                            B.toast(error.message, "err");
                        }
                    });
                    return el("div", { class: "plugin-row" },
                        toggle,
                        el("div", { class: "plugin-info" },
                            el("strong", { text: plugin.fullName || plugin.name }),
                            el("span", { text: `${plugin.name} · v${plugin.version}` })),
                        el("button", {
                            type: "button",
                            class: "btn small danger",
                            text: "Uninstall",
                            onclick: async () => {
                                try {
                                    await B.api.post("search/uninstallPlugin", { names: plugin.name });
                                    setTimeout(async () => {
                                        await loadPlugins();
                                        render();
                                    }, 600);
                                }
                                catch (error) {
                                    B.toast(error.message, "err");
                                }
                            }
                        }));
                })));
        };

        const reloadSoon = () => [1200, 3500].forEach((delay) => setTimeout(async () => {
            await loadPlugins();
            render();
        }, delay));

        const install = async () => {
            const source = url.value.trim();
            if (!source)
                return;
            try {
                await B.api.post("search/installPlugin", { sources: source });
                B.toast("Installing plugin...", "ok");
                url.value = "";
                reloadSoon();
            }
            catch (error) {
                B.toast(error.message, "err");
            }
        };

        render();
        B.modal({
            title: "Search plugins",
            wide: true,
            body: el("div", {},
                list,
                el("h3", { text: "Install a plugin" }),
                el("div", { class: "inline-form" }, url, el("button", { type: "button", class: "btn primary", text: "Install", onclick: install })),
                el("p", { class: "hint", text: "Plugins are third-party Python scripts. Only install ones you trust." })),
            actions: [
                {
                    label: "Check for updates",
                    onclick: async () => {
                        try {
                            await B.api.post("search/updatePlugins");
                            B.toast("Checking for plugin updates...", "ok");
                            reloadSoon();
                        }
                        catch (error) {
                            B.toast(error.message, "err");
                        }
                    }
                },
                { label: "Close", kind: "primary", onclick: (close) => close() }
            ]
        });
    }

    // ---- searching -----------------------------------------------------------------------------------------------
    async function pollResults() {
        if (state.jobId === null)
            return;
        try {
            const reply = await B.api.json("search/results", { id: String(state.jobId), limit: "5000", offset: "0" });
            state.results = reply.results;
            renderResults();
            if (reply.status === "Stopped") {
                finish(`${reply.total} result${(reply.total === 1) ? "" : "s"} found`);
            }
            else {
                setStatus(`Searching... ${reply.total} result${(reply.total === 1) ? "" : "s"} so far`);
            }
        }
        catch {
            finish("Search ended");
        }
    }

    function finish(message) {
        state.running = false;
        clearInterval(state.timer);
        state.timer = null;
        ui.go.textContent = "Search";
        ui.go.classList.remove("danger");
        setStatus(message);
    }

    async function stop() {
        if (state.jobId !== null) {
            try {
                await B.api.post("search/stop", { id: String(state.jobId) });
            }
            catch {
                // already finished
            }
        }
        await pollResults();
        finish(`${state.results.length} results found (stopped)`);
    }

    async function start() {
        const pattern = ui.query.value.trim();
        if (!pattern) {
            ui.query.focus();
            return;
        }
        if (state.jobId !== null) {
            B.api.post("search/delete", { id: String(state.jobId) }).catch(() => {});
            state.jobId = null;
        }
        state.results = [];
        state.selected = null;
        renderResults();
        try {
            const job = await (await B.api.post("search/start", { pattern, category: ui.category.value, plugins: ui.plugin.value })).json();
            state.jobId = job.id;
            state.running = true;
            ui.go.textContent = "Stop";
            ui.go.classList.add("danger");
            setStatus("Searching...");
            state.timer = setInterval(pollResults, 1000);
        }
        catch (error) {
            setStatus(error.message || "Could not start the search", "err");
        }
    }

    async function download(result) {
        try {
            await B.api.post("search/downloadTorrent", { torrentUrl: result.fileUrl, pluginName: result.engineName });
            B.toast(`Added "${result.fileName}"`, "ok");
            B.store.poll().catch(() => {});
        }
        catch (error) {
            B.toast(error.message, "err");
        }
    }

    // ---- results table -------------------------------------------------------------------------------------------
    function visibleResults() {
        const query = state.filter.toLowerCase();
        const column = COLUMNS.find((c) => c.id === state.sort.col) || COLUMNS[0];
        return state.results
            .filter((r) => !query || r.fileName.toLowerCase().includes(query))
            .sort((a, b) => {
                const x = column.value(a);
                const y = column.value(b);
                return ((x < y) ? -1 : (x > y) ? 1 : 0) * state.sort.dir;
            });
    }

    function renderHead() {
        ui.head.replaceChildren(...COLUMNS.map((column) => el("th", {
            class: `${column.cls || ""}${(state.sort.col === column.id) ? ` sorted ${(state.sort.dir > 0) ? "asc" : "desc"}` : ""}`,
            style: column.width ? `width:${column.width}` : false,
            text: column.label,
            onclick: () => {
                state.sort = (state.sort.col === column.id) ? { col: column.id, dir: -state.sort.dir } : { col: column.id, dir: (column.id === "fileName" || column.id === "engineName") ? 1 : -1 };
                renderHead();
                renderResults();
            }
        })));
    }

    function renderResults() {
        const list = visibleResults();
        ui.body.replaceChildren(...list.map((result) => {
            const row = el("tr", { class: (result === state.selected) ? "selected" : "" },
                COLUMNS.map((column) => el("td", { class: column.cls || "", title: (column.id === "fileName") ? result.fileName : false, text: column.text(result) })));
            row.addEventListener("click", () => {
                state.selected = result;
                renderResults();
            });
            row.addEventListener("dblclick", () => download(result));
            return row;
        }));
        ui.download.disabled = (state.selected === null) || !state.results.includes(state.selected);
        ui.open.disabled = ui.download.disabled || !state.selected?.descrLink;
        ui.tableEmpty.hidden = (list.length > 0);
        ui.tableEmpty.textContent = state.running ? "Waiting for results..." : (state.jobId === null) ? "Enter a search term to begin." : "No results.";
    }

    B.pages.register("search", {
        label: "Search",
        icon: "edit-find",
        root: document.getElementById("page-search"),

        mount(root) {
            ui.query = el("input", { type: "search", placeholder: "Search for torrents...", "aria-label": "Search term" });
            ui.query.addEventListener("keydown", (event) => {
                if (event.key === "Enter")
                    start();
            });
            ui.category = el("select", { "aria-label": "Category" });
            ui.plugin = el("select", { "aria-label": "Search plugins" });
            ui.go = el("button", { type: "button", class: "btn primary", text: "Search", onclick: () => (state.running ? stop() : start()) });
            const filter = el("input", { type: "search", placeholder: "Filter results...", "aria-label": "Filter results" });
            filter.addEventListener("input", () => {
                state.filter = filter.value;
                renderResults();
            });
            ui.status = el("span", { class: "search-status" });
            ui.download = el("button", { type: "button", class: "btn", disabled: true, onclick: () => state.selected && download(state.selected) }, B.icon("download"), el("span", { text: "Download" }));
            ui.open = el("button", { type: "button", class: "btn", disabled: true, onclick: () => state.selected?.descrLink && window.open(state.selected.descrLink, "_blank", "noopener,noreferrer") }, B.icon("application-url"), el("span", { text: "Open page" }));
            ui.empty = el("div", { class: "notice", hidden: true },
                el("strong", { text: "No search plugins installed." }),
                el("span", { text: " Open Plugins to install some (for example from https://plugins.qbittorrent.org). Python 3 must be installed for searching." }));
            ui.head = el("tr");
            ui.body = el("tbody");
            ui.tableEmpty = el("div", { class: "empty" });

            root.append(
                el("header", { class: "topbar wrap" },
                    B.pages.menuButton(),
                    el("div", { class: "search-box" }, ui.query, ui.category, ui.plugin, ui.go),
                    el("button", { type: "button", class: "btn", onclick: managePlugins }, B.icon("plugins"), el("span", { text: "Plugins" }))),
                ui.empty,
                el("div", { class: "toolbar2" }, ui.status, el("span", { class: "spacer" }), ui.download, ui.open, el("label", { class: "search" }, B.icon("edit-find"), filter)),
                el("div", { class: "table-wrap grow" }, el("table", { class: "wide" }, el("thead", {}, ui.head), ui.body), ui.tableEmpty));
            renderHead();
            renderResults();
            setStatus("");
        },

        async show() {
            await loadPlugins();
            if (state.running && !state.timer)
                state.timer = setInterval(pollResults, 1000);
        },

        hide() {
            // keep a running search going in the background; only stop polling the UI
            clearInterval(state.timer);
            state.timer = null;
        }
    });
})();
