"use strict";

// Details panel for the selected torrent: General, Files, Trackers and Peers tabs.
(() => {
    const { el, fmt } = B;

    const TABS = [["general", "General"], ["files", "Files"], ["trackers", "Trackers"], ["peers", "Peers"]];
    const TRACKER_STATUS = ["Disabled", "Not contacted", "Working", "Updating", "Not working"];
    const PRIORITIES = [[0, "Skip"], [1, "Normal"], [6, "High"], [7, "Maximum"]];

    let currentHash = null;
    let tab = B.storage.get("tab", "general");

    const bodyNode = () => document.getElementById("tabBody");

    const hint = (message) => bodyNode().replaceChildren(el("p", { class: "hint", text: message }));

    const keyValues = (rows) => el("dl", { class: "kv" },
        rows.map(([label, value]) => [el("dt", { text: label }), el("dd", { text: value })]));

    const table = (headers, rows) => el("table", { class: "mini" },
        el("thead", {}, el("tr", {}, headers.map((header) => el("th", { text: header })))),
        el("tbody", {}, rows));

    const isNfo = (name) => name.toLowerCase().endsWith(".nfo");

    const renderGeneral = (p) => keyValues([
        ["Save path", p.save_path || "—"],
        ["Total size", fmt.bytes(p.total_size)],
        ["Added", fmt.date(p.addition_date)],
        ["Completed", fmt.date(p.completion_date)],
        ["Pieces", `${p.pieces_have} / ${p.pieces_num} (${fmt.bytes(p.piece_size)} each)`],
        ["Downloaded", `${fmt.bytes(p.total_downloaded)} (session ${fmt.bytes(p.total_downloaded_session)})`],
        ["Uploaded", `${fmt.bytes(p.total_uploaded)} (session ${fmt.bytes(p.total_uploaded_session)})`],
        ["Share ratio", fmt.ratio(p.share_ratio)],
        ["Seeds", `${p.seeds} (${p.seeds_total})`],
        ["Peers", `${p.peers} (${p.peers_total})`],
        ["Active time", fmt.duration(p.time_elapsed)],
        ["Seeding time", fmt.duration(p.seeding_time)],
        ["ETA", fmt.eta(p.eta)],
        ["Info hash v1", p.infohash_v1 || "—"],
        ["Created by", p.created_by || "—"],
        ["Comment", p.comment || "—"]
    ]);

    const renderFiles = (files, hash) => {
        const select = (file) => {
            const node = el("select", { "aria-label": `Priority of ${file.name}` },
                PRIORITIES.map(([value, label]) => el("option", { value: String(value), text: label })));
            node.value = String(file.priority);
            node.addEventListener("change", async () => {
                try {
                    await B.api.post("torrents/filePrio", { hash, id: String(file.index), priority: node.value });
                }
                catch (error) {
                    B.toast(error.message, "err");
                }
            });
            return node;
        };
        const nfoIds = files.filter((file) => isNfo(file.name) && (file.priority !== 0)).map((file) => file.index);
        const skipNfo = el("button", {
            type: "button",
            class: "btn small",
            text: "Skip .nfo files",
            disabled: nfoIds.length === 0,
            onclick: async () => {
                try {
                    await B.api.post("torrents/filePrio", { hash, id: nfoIds.join("|"), priority: "0" });
                    refresh();
                }
                catch (error) {
                    B.toast(error.message, "err");
                }
            }
        });
        const rows = files.map((file) => el("tr", { class: (file.priority === 0) ? "skipped" : "" },
            el("td", { class: "name", title: file.name, text: file.name }),
            el("td", { class: "num", text: fmt.bytes(file.size) }),
            el("td", { class: "num", text: fmt.percent(file.progress) }),
            el("td", {}, select(file))));
        return el("div", {}, el("div", { class: "tab-tools" }, skipNfo), table(["Name", "Size", "Progress", "Priority"], rows));
    };

    const renderTrackers = (trackers) => table(["URL", "Status", "Seeds", "Peers", "Message"],
        trackers.map((tracker) => el("tr", {},
            el("td", { class: "name", title: tracker.url, text: tracker.url }),
            el("td", { text: TRACKER_STATUS[tracker.status] ?? String(tracker.status) }),
            el("td", { class: "num", text: String(tracker.num_seeds) }),
            el("td", { class: "num", text: String(tracker.num_peers) }),
            el("td", { class: "name", text: tracker.msg || "" }))));

    const renderPeers = (peers) => table(["Address", "Client", "Progress", "Down", "Up", "Flags"],
        Object.values(peers).map((peer) => el("tr", {},
            el("td", { text: `${peer.ip}:${peer.port}` }),
            el("td", { class: "name", text: peer.client || "" }),
            el("td", { class: "num", text: fmt.percent(peer.progress) }),
            el("td", { class: "num", text: fmt.speed(peer.dl_speed) }),
            el("td", { class: "num", text: fmt.speed(peer.up_speed) }),
            el("td", { text: peer.flags || "" }))));

    async function refresh() {
        if (!currentHash) {
            hint("Select a torrent to see its details.");
            return;
        }
        // Don't rebuild the panel while a priority drop-down is open.
        if (document.activeElement && (document.activeElement.tagName === "SELECT") && bodyNode().contains(document.activeElement))
            return;

        const hash = currentHash;
        const activeTab = tab;
        try {
            let content;
            if (activeTab === "general")
                content = renderGeneral(await B.api.json("torrents/properties", { hash }));
            else if (activeTab === "files")
                content = renderFiles(await B.api.json("torrents/files", { hash }), hash);
            else if (activeTab === "trackers")
                content = renderTrackers(await B.api.json("torrents/trackers", { hash }));
            else
                content = renderPeers((await B.api.json("sync/torrentPeers", { hash, rid: 0 })).peers || {});

            // Ignore the reply if the user moved on while it was loading.
            if ((hash === currentHash) && (activeTab === tab))
                bodyNode().replaceChildren(content);
        }
        catch {
            if ((hash === currentHash) && (activeTab === tab))
                hint("Details are not available.");
        }
    }

    function renderTabs() {
        document.getElementById("tabs").replaceChildren(...TABS.map(([id, label]) => el("button", {
            type: "button",
            role: "tab",
            class: `tab${(id === tab) ? " active" : ""}`,
            "aria-selected": String(id === tab),
            text: label,
            onclick: () => {
                tab = id;
                B.storage.set("tab", id);
                renderTabs();
                hint("Loading...");
                refresh();
            }
        })));
    }

    B.details = {
        init() {
            renderTabs();
            refresh();
            setInterval(refresh, 2000);
        },
        // Show details only when exactly one torrent is selected.
        setSelection(hashes) {
            const next = (hashes.length === 1) ? hashes[0] : null;
            if (next === currentHash)
                return;
            currentHash = next;
            hint(next ? "Loading..." : (hashes.length > 1) ? `${hashes.length} torrents selected.` : "Select a torrent to see its details.");
            refresh();
        }
    };
})();
