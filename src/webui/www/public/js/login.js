"use strict";

const form = document.getElementById("loginForm");
const errorNode = document.getElementById("error");
const button = document.getElementById("loginButton");

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNode.textContent = "";
    button.disabled = true;

    try {
        const response = await fetch("api/v2/auth/login", {
            method: "POST",
            credentials: "same-origin",
            body: new URLSearchParams({
                username: document.getElementById("username").value,
                password: document.getElementById("password").value
            })
        });
        // 204 (or 200) means logged in; 401 means wrong credentials; 403 means the IP is banned.
        if (response.ok) {
            location.reload();
            return;
        }
        errorNode.textContent = (response.status === 403)
            ? "Your IP address has been banned after too many failed attempts."
            : "Invalid username or password.";
    }
    catch {
        errorNode.textContent = "Could not reach the server.";
    }
    button.disabled = false;
});
