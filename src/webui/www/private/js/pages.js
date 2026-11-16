"use strict";

// Page registry and hash router. Each page owns a <section class="page"> and may provide:
//   mount(root)  - called once, the first time the page is shown
//   show()/hide() - called when the page becomes visible / hidden
B.pages = {
    defs: new Map(),
    current: null,
    mounted: new Set(),
    badges: new Map(),

    register(id, def) {
        B.pages.defs.set(id, def);
    },

    // Button that opens the sidebar on small screens (hidden by CSS on wide screens).
    menuButton() {
        return B.el("button", {
            type: "button",
            class: "icon-btn",
            "aria-label": "Menu",
            text: "\u2630",
            onclick: () => document.getElementById("app").classList.toggle("menu-open")
        });
    },

    setBadge(id, value) {
        const node = B.pages.badges.get(id);
        if (node)
            node.textContent = value ? String(value) : "";
    },

    buildNav() {
        const nav = document.getElementById("nav");
        const order = ["transfers", "search", "rss", "log"];
        const entries = [...B.pages.defs].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
        nav.replaceChildren(...entries.map(([id, def]) => {
            const badge = B.el("b");
            B.pages.badges.set(id, badge);
            return B.el("a", { class: "nav-item", href: `#${id}`, "data-page": id },
                B.icon(def.icon), B.el("span", { text: def.label }), badge);
        }));
    },

    show(id) {
        if (!B.pages.defs.has(id))
            id = "transfers";
        const previous = B.pages.current;
        if (previous === id)
            return;

        if (previous)
            B.pages.defs.get(previous).hide?.();
        B.pages.current = id;

        for (const [pageId, def] of B.pages.defs)
            def.root.hidden = (pageId !== id);
        document.getElementById("filters").hidden = (id !== "transfers");
        for (const link of document.querySelectorAll("#nav .nav-item"))
            link.classList.toggle("active", link.dataset.page === id);

        const def = B.pages.defs.get(id);
        if (!B.pages.mounted.has(id)) {
            B.pages.mounted.add(id);
            def.mount?.(def.root);
        }
        def.show?.();
        document.getElementById("app").classList.remove("menu-open");
    },

    start() {
        B.pages.buildNav();
        B.pages.setBadge("transfers", B.store.torrents.size);
        const route = () => B.pages.show(location.hash.slice(1) || "transfers");
        window.addEventListener("hashchange", route);
        route();
    }
};
