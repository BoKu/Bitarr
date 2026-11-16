"use strict";

// Torrent/server state kept in sync with the server through sync/maindata (incremental updates).
B.store = {
    rid: 0,
    torrents: new Map(),
    categories: {},
    tags: [],
    server: {},
    connected: false,
    listeners: [],

    onChange(callback) {
        B.store.listeners.push(callback);
    },

    apply(data) {
        const s = B.store;
        if (data.full_update) {
            s.torrents.clear();
            s.categories = {};
            s.tags = [];
            s.server = {};
        }
        for (const hash of (data.torrents_removed || []))
            s.torrents.delete(hash);
        for (const [hash, partial] of Object.entries(data.torrents || {})) {
            const current = s.torrents.get(hash) || { hash };
            Object.assign(current, partial);
            s.torrents.set(hash, current);
        }
        for (const name of (data.categories_removed || []))
            delete s.categories[name];
        for (const [name, partial] of Object.entries(data.categories || {}))
            s.categories[name] = Object.assign(s.categories[name] || {}, partial);
        if (data.tags)
            s.tags = [...new Set([...s.tags, ...data.tags])];
        if (data.tags_removed)
            s.tags = s.tags.filter((tag) => !data.tags_removed.includes(tag));
        Object.assign(s.server, data.server_state || {});
        s.rid = data.rid;
    },

    async poll() {
        const data = await B.api.json("sync/maindata", { rid: B.store.rid });
        B.store.apply(data);
        B.store.connected = true;
        for (const callback of B.store.listeners)
            callback();
    },

    start() {
        const tick = async () => {
            if (B.api.sessionLost)
                return;
            try {
                await B.store.poll();
            }
            catch {
                B.store.connected = false;
                for (const callback of B.store.listeners)
                    callback();
            }
            setTimeout(tick, 1500);
        };
        tick();
    }
};

B.states = {
    // [label, css class]
    info(t) {
        switch (t.state) {
            case "downloading": return ["Downloading", "dl"];
            case "forcedDL": return ["Downloading (forced)", "dl"];
            case "metaDL":
            case "forcedMetaDL": return ["Fetching metadata", "dl"];
            case "stalledDL": return ["Stalled", "warn"];
            case "uploading":
            case "forcedUP":
            case "stalledUP": return ["Seeding", "up"];
            case "stoppedDL":
            case "pausedDL": return ["Stopped", "off"];
            case "stoppedUP":
            case "pausedUP": return ["Completed", "off"];
            case "queuedDL":
            case "queuedUP": return ["Queued", "warn"];
            case "checkingDL":
            case "checkingUP":
            case "checkingResumeData": return ["Checking", "warn"];
            case "allocating": return ["Allocating", "warn"];
            case "moving": return ["Moving", "warn"];
            case "error": return ["Error", "err"];
            case "missingFiles": return ["Missing files", "err"];
            default: return [t.state || "Unknown", "off"];
        }
    },

    groups: [
        { id: "all", label: "All", icon: "filter-all", test: () => true },
        { id: "downloading", label: "Downloading", icon: "downloading", test: (t) => /^(downloading|forcedDL|metaDL|forcedMetaDL|stalledDL|queuedDL|checkingDL)$/.test(t.state) },
        { id: "seeding", label: "Seeding", icon: "upload", test: (t) => /^(uploading|forcedUP|stalledUP|queuedUP|checkingUP)$/.test(t.state) },
        { id: "completed", label: "Completed", icon: "checked-completed", test: (t) => t.progress >= 1 },
        { id: "stopped", label: "Stopped", icon: "stopped", test: (t) => /^(stopped|paused)(DL|UP)$/.test(t.state) },
        { id: "active", label: "Active", icon: "filter-active", test: (t) => (t.dlspeed > 0) || (t.upspeed > 0) },
        { id: "inactive", label: "Inactive", icon: "filter-inactive", test: (t) => !((t.dlspeed > 0) || (t.upspeed > 0)) },
        { id: "stalled", label: "Stalled", icon: "filter-stalled", test: (t) => /^stalled(DL|UP)$/.test(t.state) },
        { id: "errored", label: "Errored", icon: "error", test: (t) => /^(error|missingFiles)$/.test(t.state) }
    ]
};
