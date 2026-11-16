"use strict";

// Modal dialogs: add torrent, remove confirmation and settings.
(() => {
    const { el } = B;

    // Generic modal. `actions` is a list of { label, kind, onclick(close) }.
    B.modal = ({ title, body, actions, wide = false }) => {
        const root = document.getElementById("modalRoot");
        const overlay = el("div", { class: "overlay" });
        const close = () => {
            overlay.remove();
            document.removeEventListener("keydown", onKey);
        };
        const onKey = (event) => {
            if (event.key === "Escape")
                close();
        };
        const buttons = actions.map((action) => el("button", {
            type: "button",
            class: `btn ${action.kind || ""}`,
            text: action.label,
            onclick: () => action.onclick(close)
        }));
        const dialog = el("div", { class: `modal${wide ? " wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title },
            el("h2", { text: title }),
            el("div", { class: "modal-body" }, body),
            el("div", { class: "modal-actions" }, buttons));
        overlay.append(dialog);
        overlay.addEventListener("mousedown", (event) => {
            if (event.target === overlay)
                close();
        });
        document.addEventListener("keydown", onKey);
        root.append(overlay);
        const first = dialog.querySelector("input, textarea, select");
        if (first)
            first.focus();
        return { close, dialog };
    };

    const checkbox = (id, label, checked = false) => {
        const input = el("input", { type: "checkbox", id });
        input.checked = checked;
        return { input, row: el("label", { class: "check", for: id }, input, el("span", { text: label })) };
    };

    const field = (label, control) => el("label", { class: "field" }, el("span", { text: label }), control);

    B.dialogs = {};

    B.dialogs.add = async () => {
        let prefs = {};
        try {
            prefs = await B.api.json("app/preferences");
        }
        catch {
            // defaults are fine if preferences cannot be read
        }

        const urls = el("textarea", { rows: "4", placeholder: "Magnet links or URLs, one per line" });
        const files = el("input", { type: "file", accept: ".torrent,application/x-bittorrent", multiple: true });
        const savePath = el("input", { type: "text", placeholder: prefs.save_path || "Default save path" });
        const category = el("select", {}, el("option", { value: "", text: "No category" }),
            Object.keys(B.store.categories).sort().map((name) => el("option", { value: name, text: name })));
        const tags = el("input", { type: "text", placeholder: "tag1, tag2" });

        const start = checkbox("addStart", "Start torrent", !prefs.add_stopped_enabled);
        const sequential = checkbox("addSeq", "Download in sequential order", !!prefs.always_sequential_download);
        const firstLast = checkbox("addFirstLast", "Download first and last pieces first", !!prefs.always_first_last_pieces);
        const nfo = checkbox("addNfo", "Don't download .nfo files", !!prefs.never_download_nfo_files);
        // These are forced on by the matching "always" settings, so show them locked.
        for (const [box, forced] of [[sequential, prefs.always_sequential_download], [firstLast, prefs.always_first_last_pieces], [nfo, prefs.never_download_nfo_files]]) {
            if (forced)
                box.input.disabled = true;
        }

        const body = el("div", { class: "form" },
            field("Links", urls),
            field("Torrent files", files),
            field("Save path", savePath),
            el("div", { class: "row2" }, field("Category", category), field("Tags", tags)),
            el("div", { class: "checks" }, start.row, sequential.row, firstLast.row, nfo.row));

        B.modal({
            title: "Add torrents",
            body,
            actions: [
                { label: "Cancel", onclick: (close) => close() },
                {
                    label: "Add",
                    kind: "primary",
                    onclick: async (close) => {
                        const links = urls.value.split("\n").map((line) => line.trim()).filter(Boolean);
                        if ((links.length === 0) && (files.files.length === 0)) {
                            B.toast("Enter a link or choose a .torrent file.", "err");
                            return;
                        }
                        const form = new FormData();
                        if (links.length > 0)
                            form.append("urls", links.join("\n"));
                        for (const file of files.files)
                            form.append("torrents", file, file.name);
                        if (savePath.value.trim())
                            form.append("savepath", savePath.value.trim());
                        if (category.value)
                            form.append("category", category.value);
                        if (tags.value.trim())
                            form.append("tags", tags.value.trim());
                        form.append("stopped", String(!start.input.checked));
                        form.append("sequentialDownload", String(sequential.input.checked));
                        form.append("firstLastPiecePrio", String(firstLast.input.checked));
                        form.append("excludeNfoFiles", String(nfo.input.checked));
                        try {
                            const reply = await (await B.api.post("torrents/add", form)).json().catch(() => null);
                            if (reply && (reply.failure_count > 0) && !reply.success_count && !reply.pending_count)
                                throw new Error("The server rejected the torrent(s) (already added, or invalid).");
                            B.toast("Torrent(s) added.", "ok");
                            close();
                            B.store.poll().catch(() => {});
                        }
                        catch (error) {
                            B.toast(error.message, "err");
                        }
                    }
                }
            ]
        });
    };

    B.dialogs.remove = (hashes, done) => {
        const names = hashes.map((hash) => B.store.torrents.get(hash)?.name).filter(Boolean);
        const files = checkbox("rmFiles", "Also delete the downloaded files", false);
        const body = el("div", {},
            el("p", { text: (hashes.length === 1) ? `Remove "${names[0] ?? "this torrent"}"?` : `Remove ${hashes.length} torrents?` }),
            files.row);
        B.modal({
            title: "Remove",
            body,
            actions: [
                { label: "Cancel", onclick: (close) => close() },
                {
                    label: "Remove",
                    kind: "danger",
                    onclick: async (close) => {
                        try {
                            await B.api.post("torrents/delete", { hashes: hashes.join("|"), deleteFiles: String(files.input.checked) });
                            close();
                            done();
                        }
                        catch (error) {
                            B.toast(error.message, "err");
                        }
                    }
                }
            ]
        });
    };

    B.dialogs.settings = async () => {
        let prefs;
        try {
            prefs = await B.api.json("app/preferences");
        }
        catch (error) {
            B.toast(`Could not load settings: ${error.message}`, "err");
            return;
        }

        const kib = (bytes) => Math.round((bytes || 0) / 1024);
        const number = (value, min = 0) => el("input", { type: "number", min: String(min), value: String(value) });

        const savePath = el("input", { type: "text", value: prefs.save_path || "" });
        const port = number(prefs.listen_port || 0, 0);
        const dl = number(kib(prefs.dl_limit));
        const ul = number(kib(prefs.up_limit));
        const altDl = number(kib(prefs.alt_dl_limit));
        const altUl = number(kib(prefs.alt_up_limit));
        const addStopped = checkbox("setStopped", "Do not start downloads automatically", !!prefs.add_stopped_enabled);
        const sequential = checkbox("setSeq", "Always download in sequential order", !!prefs.always_sequential_download);
        const firstLast = checkbox("setFirstLast", "Always download first and last pieces first", !!prefs.always_first_last_pieces);
        const nfo = checkbox("setNfo", "Always never download .nfo files", !!prefs.never_download_nfo_files);

        const body = el("div", { class: "form" },
            el("h3", { text: "Downloads" }),
            field("Default save path", savePath),
            el("div", { class: "checks" }, addStopped.row, sequential.row, firstLast.row, nfo.row),
            el("h3", { text: "Speed limits (KiB/s, 0 = unlimited)" }),
            el("div", { class: "row2" }, field("Download", dl), field("Upload", ul)),
            el("div", { class: "row2" }, field("Alternative download", altDl), field("Alternative upload", altUl)),
            el("h3", { text: "Connection" }),
            field("Listening port", port));

        B.modal({
            title: "Settings",
            body,
            wide: true,
            actions: [
                { label: "Cancel", onclick: (close) => close() },
                {
                    label: "Save",
                    kind: "primary",
                    onclick: async (close) => {
                        const changes = {
                            save_path: savePath.value.trim(),
                            listen_port: Number(port.value),
                            dl_limit: Number(dl.value) * 1024,
                            up_limit: Number(ul.value) * 1024,
                            alt_dl_limit: Number(altDl.value) * 1024,
                            alt_up_limit: Number(altUl.value) * 1024,
                            add_stopped_enabled: addStopped.input.checked,
                            always_sequential_download: sequential.input.checked,
                            always_first_last_pieces: firstLast.input.checked,
                            never_download_nfo_files: nfo.input.checked
                        };
                        try {
                            await B.api.post("app/setPreferences", { json: JSON.stringify(changes) });
                            B.toast("Settings saved.", "ok");
                            close();
                        }
                        catch (error) {
                            B.toast(error.message, "err");
                        }
                    }
                }
            ]
        });
    };
})();
