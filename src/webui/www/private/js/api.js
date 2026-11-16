"use strict";

// Thin wrapper over the /api/v2 WebAPI.
B.api = {
    sessionLost: false,

    async request(path, { method = "GET", params, body } = {}) {
        let url = `api/v2/${path}`;
        if (params)
            url += `?${new URLSearchParams(params)}`;

        const response = await fetch(url, { method, body, credentials: "same-origin" });
        if ((response.status === 401) || (response.status === 403)) {
            B.api.handleSessionLost();
            throw new Error("Not authorised");
        }
        if (!response.ok)
            throw new Error((await response.text()) || response.statusText);
        return response;
    },

    async json(path, params) {
        return (await B.api.request(path, { params })).json();
    },

    async text(path, params) {
        return (await B.api.request(path, { params })).text();
    },

    post(path, data = {}) {
        const body = (data instanceof FormData) ? data : new URLSearchParams(data);
        return B.api.request(path, { method: "POST", body });
    },

    // Stop everything and tell the user, instead of reloading in a loop.
    handleSessionLost() {
        if (B.api.sessionLost)
            return;
        B.api.sessionLost = true;
        const overlay = B.el("div", { class: "overlay" },
            B.el("div", { class: "modal small" },
                B.el("h2", { text: "Session ended" }),
                B.el("p", { text: "Your session has expired or you have been logged out." }),
                B.el("div", { class: "modal-actions" },
                    B.el("button", { class: "btn primary", type: "button", text: "Log in again", onclick: () => location.reload() }))));
        document.body.append(overlay);
    }
};
