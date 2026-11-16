"use strict";

// RSS page: feeds and folders, articles, and auto-download rules.
(() => {
    const { el } = B;
    const SEP = "\\"; // path separator used by the RSS API

    const state = {
        tree: [], // [{ path, name, isFolder, feed?, children? }]
        feeds: [], // flat list of feed nodes
        selected: null, // path of the selected feed/folder, null = all
        article: null, // { feed, article }
        enabled: true
    };
    let ui = {};
    let visibleTimer = null;

    const stripHtml = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent.trim();
    const unreadIn = (node) => (node.isFolder ? node.children.reduce((sum, child) => sum + unreadIn(child), 0)
        : (node.feed.articles || []).filter((a) => !a.isRead).length);

    // ---- data ----------------------------------------------------------------------------------------------------
    const walk = (object, prefix) => Object.entries(object).map(([name, value]) => {
        const path = prefix ? `${prefix}${SEP}${name}` : name;
        if (typeof value.url === "string")
            return { path, name, isFolder: false, feed: value };
        return { path, name, isFolder: true, children: walk(value, path) };
    }).sort((a, b) => (a.isFolder === b.isFolder) ? a.name.localeCompare(b.name) : (a.isFolder ? -1 : 1));

    const collectFeeds = (nodes) => nodes.flatMap((node) => (node.isFolder ? collectFeeds(node.children) : [node]));

    async function load() {
        try {
            state.tree = walk(await B.api.json("rss/items", { withData: "true" }), "");
        }
        catch {
            return;
        }
        state.feeds = collectFeeds(state.tree);
        B.pages.setBadge("rss", state.tree.reduce((sum, node) => sum + unreadIn(node), 0));
        if (ui.list)
            render();
    }

    async function checkEnabled() {
        try {
            const prefs = await B.api.json("app/preferences");
            state.enabled = !!prefs.rss_processing_enabled;
            state.autoDownload = !!prefs.rss_auto_downloading_enabled;
        }
        catch {
            // keep the previous value
        }
        if (ui.notice)
            ui.notice.hidden = state.enabled;
    }

    const findNode = (path, nodes = state.tree) => {
        for (const node of nodes) {
            if (node.path === path)
                return node;
            if (node.isFolder) {
                const found = findNode(path, node.children);
                if (found)
                    return found;
            }
        }
        return null;
    };

    const articlesFor = (path) => {
        const feeds = (path === null) ? state.feeds : collectFeeds([findNode(path)].filter(Boolean));
        return feeds.flatMap((node) => (node.feed.articles || []).map((article) => ({ feed: node, article })))
            .sort((a, b) => new Date(b.article.date) - new Date(a.article.date));
    };

    // ---- rendering -----------------------------------------------------------------------------------------------
    function renderFeeds() {
        const row = (label, path, count, depth, isFolder) => el("button", {
            type: "button",
            class: `feed-item${(state.selected === path) ? " active" : ""}`,
            style: `padding-left:${12 + depth * 16}px`,
            onclick: () => {
                state.selected = path;
                state.article = null;
                render();
            }
        }, B.icon(isFolder ? "folder-documents" : "application-rss"), el("span", { class: "label", text: label }),
            el("span", { class: `count${(count > 0) ? " unread" : ""}`, text: (count > 0) ? String(count) : "" }));

        const rows = [row("All feeds", null, state.tree.reduce((sum, node) => sum + unreadIn(node), 0), 0, false)];
        const add = (nodes, depth) => {
            for (const node of nodes) {
                rows.push(row(node.isFolder ? node.name : (node.feed.title || node.name), node.path, unreadIn(node), depth, node.isFolder));
                if (node.isFolder)
                    add(node.children, depth + 1);
            }
        };
        add(state.tree, 0);
        ui.list.replaceChildren(...rows);
    }

    function renderArticles() {
        const items = articlesFor(state.selected);
        ui.body.replaceChildren(...items.map((item) => {
            const { article, feed } = item;
            const tr = el("tr", { class: `${article.isRead ? "" : "unread"}${(state.article?.article.id === article.id && state.article?.feed === feed) ? " selected" : ""}` },
                el("td", { class: "name", title: article.title, text: article.title }),
                el("td", { text: feed.feed.title || feed.name }),
                el("td", { text: article.date ? new Date(article.date).toLocaleString() : "—" }));
            tr.addEventListener("click", () => selectArticle(item));
            return tr;
        }));
        ui.empty.hidden = (items.length > 0);
        ui.empty.textContent = (state.feeds.length === 0) ? "No feeds yet. Use Add feed to subscribe to one." : "No articles.";
    }

    function renderPreview() {
        if (!state.article) {
            ui.preview.replaceChildren(el("p", { class: "hint", text: "Select an article to read it." }));
            return;
        }
        const { article, feed } = state.article;
        const link = article.torrentURL || article.link;
        ui.preview.replaceChildren(
            el("h3", { class: "article-title", text: article.title }),
            el("div", { class: "article-meta", text: [feed.feed.title || feed.name, article.author, article.date ? new Date(article.date).toLocaleString() : ""].filter(Boolean).join(" · ") }),
            el("div", { class: "tab-tools" },
                el("button", { type: "button", class: "btn primary small", disabled: !link, text: "Download", onclick: () => downloadArticle(article) }),
                el("button", { type: "button", class: "btn small", disabled: !article.link, text: "Open link", onclick: () => window.open(article.link, "_blank", "noopener,noreferrer") })),
            el("p", { class: "article-body", text: stripHtml(article.description) || "No description." }));
    }

    function render() {
        renderFeeds();
        renderArticles();
        renderPreview();
        const hasSelection = (state.selected !== null);
        ui.refresh.disabled = (state.feeds.length === 0);
        ui.remove.disabled = !hasSelection;
        ui.markRead.disabled = (state.feeds.length === 0);
    }

    // ---- actions -------------------------------------------------------------------------------------------------
    async function selectArticle(item) {
        state.article = item;
        if (!item.article.isRead) {
            item.article.isRead = true;
            try {
                await B.api.post("rss/markAsRead", { itemPath: item.feed.path, articleId: item.article.id });
            }
            catch {
                item.article.isRead = false;
            }
            B.pages.setBadge("rss", state.tree.reduce((sum, node) => sum + unreadIn(node), 0));
        }
        render();
    }

    async function downloadArticle(article) {
        const url = article.torrentURL || article.link;
        try {
            await B.api.post("torrents/add", { urls: url });
            B.toast(`Added "${article.title}"`, "ok");
            B.store.poll().catch(() => {});
        }
        catch (error) {
            B.toast(error.message, "err");
        }
    }

    async function run(path, data, success) {
        try {
            await B.api.post(path, data);
            if (success)
                B.toast(success, "ok");
            await load();
        }
        catch (error) {
            B.toast(error.message, "err");
        }
    }

    function addFeed() {
        const url = el("input", { type: "text", placeholder: "https://example.com/feed.xml" });
        const name = el("input", { type: "text", placeholder: "Name (optional)" });
        B.modal({
            title: "Add feed",
            body: el("div", { class: "form" }, el("label", { class: "field" }, el("span", { text: "Feed URL" }), url), el("label", { class: "field" }, el("span", { text: "Name" }), name)),
            actions: [
                { label: "Cancel", onclick: (close) => close() },
                {
                    label: "Add",
                    kind: "primary",
                    onclick: async (close) => {
                        const address = url.value.trim();
                        if (!address)
                            return;
                        let fallback = address;
                        try {
                            fallback = new URL(address).hostname;
                        }
                        catch {
                            // not a valid URL; the server will reject it
                        }
                        await run("rss/addFeed", { url: address, path: name.value.trim() || fallback }, "Feed added.");
                        close();
                    }
                }
            ]
        });
    }

    function addFolder() {
        const name = el("input", { type: "text", placeholder: "Folder name" });
        B.modal({
            title: "New folder",
            body: el("div", { class: "form" }, el("label", { class: "field" }, el("span", { text: "Name" }), name)),
            actions: [
                { label: "Cancel", onclick: (close) => close() },
                {
                    label: "Create",
                    kind: "primary",
                    onclick: async (close) => {
                        if (!name.value.trim())
                            return;
                        await run("rss/addFolder", { path: name.value.trim() });
                        close();
                    }
                }
            ]
        });
    }

    function removeSelected() {
        const node = findNode(state.selected);
        if (!node)
            return;
        B.modal({
            title: "Remove",
            body: el("p", { text: `Remove ${node.isFolder ? "folder" : "feed"} "${node.name}"${node.isFolder ? " and everything in it" : ""}?` }),
            actions: [
                { label: "Cancel", onclick: (close) => close() },
                {
                    label: "Remove",
                    kind: "danger",
                    onclick: async (close) => {
                        state.selected = null;
                        state.article = null;
                        await run("rss/removeItem", { path: node.path });
                        close();
                    }
                }
            ]
        });
    }

    async function refreshSelected() {
        const targets = (state.selected === null) ? state.tree.map((node) => node.path) : [state.selected];
        await Promise.all(targets.map((path) => B.api.post("rss/refreshItem", { itemPath: path }).catch(() => {})));
        B.toast("Refreshing...", "ok");
        setTimeout(load, 2500);
    }

    async function markAllRead() {
        const targets = (state.selected === null) ? state.tree.map((node) => node.path) : [state.selected];
        await Promise.all(targets.map((path) => B.api.post("rss/markAsRead", { itemPath: path }).catch(() => {})));
        await load();
    }

    // ---- rules ---------------------------------------------------------------------------------------------------
    async function rules() {
        let current = {};
        try {
            current = await B.api.json("rss/rules");
        }
        catch (error) {
            B.toast(error.message, "err");
            return;
        }
        let categories = [];
        try {
            categories = Object.keys(await B.api.json("torrents/categories")).sort();
        }
        catch {
            // categories are optional
        }

        const list = el("div", { class: "plugin-list" });
        const render = () => list.replaceChildren(...(Object.keys(current).length === 0
            ? [el("p", { class: "hint", text: "No rules yet." })]
            : Object.entries(current).map(([name, rule]) => {
                const toggle = el("input", { type: "checkbox", "aria-label": `Enable ${name}` });
                toggle.checked = !!rule.enabled;
                toggle.addEventListener("change", async () => {
                    rule.enabled = toggle.checked;
                    try {
                        await B.api.post("rss/setRule", { ruleName: name, ruleDef: JSON.stringify(rule) });
                    }
                    catch (error) {
                        B.toast(error.message, "err");
                    }
                });
                return el("div", { class: "plugin-row" }, toggle,
                    el("div", { class: "plugin-info" }, el("strong", { text: name }),
                        el("span", { text: rule.mustContain ? `Must contain: ${rule.mustContain}` : "No filter" })),
                    el("button", { type: "button", class: "btn small", text: "Edit", onclick: () => editRule(name) }),
                    el("button", {
                        type: "button",
                        class: "btn small danger",
                        text: "Delete",
                        onclick: async () => {
                            try {
                                await B.api.post("rss/removeRule", { ruleName: name });
                                delete current[name];
                                render();
                            }
                            catch (error) {
                                B.toast(error.message, "err");
                            }
                        }
                    }));
            })));

        function editRule(existingName) {
            const rule = existingName ? current[existingName] : {};
            const params = rule.torrentParams || {};
            const name = el("input", { type: "text", value: existingName || "", placeholder: "Rule name", disabled: !!existingName });
            const must = el("input", { type: "text", value: rule.mustContain || "" });
            const mustNot = el("input", { type: "text", value: rule.mustNotContain || "" });
            const episode = el("input", { type: "text", value: rule.episodeFilter || "", placeholder: "e.g. 1x01-;2x" });
            const savePath = el("input", { type: "text", value: params.save_path || rule.savePath || "" });
            const category = el("select", {}, el("option", { value: "", text: "No category" }), categories.map((c) => el("option", { value: c, text: c })));
            category.value = params.category || rule.assignedCategory || "";
            const enabled = el("input", { type: "checkbox" });
            enabled.checked = (rule.enabled !== false);
            const regex = el("input", { type: "checkbox" });
            regex.checked = !!rule.useRegex;
            const stopped = el("input", { type: "checkbox" });
            stopped.checked = !!params.stopped;
            const feeds = state.feeds.map((node) => {
                const box = el("input", { type: "checkbox" });
                box.checked = (rule.affectedFeeds || []).includes(node.feed.url);
                return { box, node };
            });
            const check = (input, label) => el("label", { class: "check" }, input, el("span", { text: label }));

            B.modal({
                title: existingName ? `Edit rule: ${existingName}` : "New rule",
                wide: true,
                body: el("div", { class: "form" },
                    el("label", { class: "field" }, el("span", { text: "Name" }), name),
                    el("div", { class: "row2" },
                        el("label", { class: "field" }, el("span", { text: "Must contain" }), must),
                        el("label", { class: "field" }, el("span", { text: "Must not contain" }), mustNot)),
                    el("div", { class: "checks" }, check(regex, "Use regular expressions"), check(enabled, "Rule enabled"), check(stopped, "Add torrents stopped")),
                    el("label", { class: "field" }, el("span", { text: "Episode filter" }), episode),
                    el("div", { class: "row2" },
                        el("label", { class: "field" }, el("span", { text: "Category" }), category),
                        el("label", { class: "field" }, el("span", { text: "Save path" }), savePath)),
                    el("div", { class: "field" }, el("span", { text: "Apply to feeds" }),
                        el("div", { class: "checks" }, feeds.length === 0 ? el("span", { class: "hint", text: "Add a feed first." })
                            : feeds.map(({ box, node }) => check(box, node.feed.title || node.name))))),
                actions: [
                    { label: "Cancel", onclick: (close) => close() },
                    {
                        label: "Save",
                        kind: "primary",
                        onclick: async (close) => {
                            const ruleName = name.value.trim();
                            if (!ruleName) {
                                B.toast("Give the rule a name.", "err");
                                return;
                            }
                            const definition = {
                                ...rule,
                                enabled: enabled.checked,
                                mustContain: must.value,
                                mustNotContain: mustNot.value,
                                useRegex: regex.checked,
                                episodeFilter: episode.value,
                                affectedFeeds: feeds.filter(({ box }) => box.checked).map(({ node }) => node.feed.url),
                                torrentParams: { ...params, category: category.value, save_path: savePath.value.trim(), stopped: stopped.checked }
                            };
                            try {
                                await B.api.post("rss/setRule", { ruleName, ruleDef: JSON.stringify(definition) });
                                current = await B.api.json("rss/rules");
                                render();
                                close();
                            }
                            catch (error) {
                                B.toast(error.message, "err");
                            }
                        }
                    }
                ]
            });
        }

        const auto = el("input", { type: "checkbox", id: "rssAuto" });
        auto.checked = !!state.autoDownload;
        auto.addEventListener("change", async () => {
            try {
                await B.api.post("app/setPreferences", { json: JSON.stringify({ rss_auto_downloading_enabled: auto.checked }) });
                state.autoDownload = auto.checked;
            }
            catch (error) {
                B.toast(error.message, "err");
            }
        });

        render();
        B.modal({
            title: "Auto-download rules",
            wide: true,
            body: el("div", {},
                el("label", { class: "check", for: "rssAuto" }, auto, el("span", { text: "Download matching articles automatically" })),
                list),
            actions: [
                { label: "New rule", onclick: () => editRule(null) },
                { label: "Close", kind: "primary", onclick: (close) => close() }
            ]
        });
    }

    // ---- page ----------------------------------------------------------------------------------------------------
    B.pages.register("rss", {
        label: "RSS",
        icon: "application-rss",
        root: document.getElementById("page-rss"),

        mount(root) {
            const button = (icon, label, handler, kind = "") => el("button", { type: "button", class: `btn ${kind}`, onclick: handler }, B.icon(icon), el("span", { text: label }));
            ui.refresh = button("view-refresh", "Refresh", refreshSelected);
            ui.remove = button("list-remove", "Remove", removeSelected, "danger");
            ui.markRead = button("checked-completed", "Mark all read", markAllRead);
            ui.notice = el("div", { class: "notice", hidden: true },
                el("strong", { text: "RSS is switched off." }), el("span", { text: " " }),
                el("button", {
                    type: "button",
                    class: "btn small primary",
                    text: "Turn on RSS",
                    onclick: async () => {
                        await B.api.post("app/setPreferences", { json: JSON.stringify({ rss_processing_enabled: true }) }).catch((e) => B.toast(e.message, "err"));
                        await checkEnabled();
                    }
                }));
            ui.list = el("div", { class: "feed-list" });
            ui.body = el("tbody");
            ui.empty = el("div", { class: "empty" });
            ui.preview = el("div", { class: "preview" });

            root.append(
                el("header", { class: "topbar wrap" },
                    B.pages.menuButton(),
                    button("list-add", "Add feed", addFeed, "primary"), button("folder-new", "New folder", addFolder),
                    ui.refresh, ui.markRead, ui.remove, el("span", { class: "spacer" }),
                    button("configure", "Rules", rules)),
                ui.notice,
                el("div", { class: "rss-layout grow" },
                    ui.list,
                    el("div", { class: "rss-main" },
                        el("div", { class: "table-wrap grow" },
                            el("table", { class: "wide rss-table" },
                                el("thead", {}, el("tr", {}, el("th", { text: "Title" }), el("th", { style: "width:180px", text: "Feed" }), el("th", { style: "width:210px", text: "Date" }))),
                                ui.body),
                            ui.empty),
                        ui.preview)));
            render();
        },

        async show() {
            await checkEnabled();
            await load();
            visibleTimer = setInterval(load, 30000);
        },

        hide() {
            clearInterval(visibleTimer);
            visibleTimer = null;
        }
    });

    // Keep the unread badge in the sidebar fresh even when this page is not open.
    setTimeout(load, 1500);
    setInterval(() => {
        if (B.pages.current !== "rss")
            load();
    }, 60000);
})();
