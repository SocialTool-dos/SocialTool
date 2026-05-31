document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "https://socialtool.onrender.com";
    const overlay = document.createElement("div");
    overlay.className = "loader-overlay";
    overlay.innerHTML = `
        <div class="loader-box">
            <img src="cwel.ico" alt="" class="loader-logo">
            <img src="loading.gif" alt="" class="loader-gif">
        </div>
    `;
    document.body.appendChild(overlay);

    let navigating = false;

    function showLoader(targetUrl) {
        if (navigating) return;
        navigating = true;
        overlay.classList.add("is-visible");
        window.setTimeout(() => {
            if (targetUrl) {
                window.location.href = targetUrl;
            }
        }, 2000);
    }

    window.STNavigate = function(targetUrl) {
        showLoader(targetUrl);
    };

    window.STGetApiBase = function() {
        return API_BASE;
    };

    window.STGetToken = function() {
        return localStorage.getItem("authToken");
    };

    window.STGetAuthHeaders = function(extraHeaders = {}) {
        const headers = { ...extraHeaders };
        const token = window.STGetToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    };

    window.STAuthorizedFetch = async function(path, options = {}) {
        const response = await fetch(API_BASE + path, {
            ...options,
            headers: window.STGetAuthHeaders(options.headers || {})
        });

        let data = null;
        try {
            data = await response.json();
        } catch (error) {
            if (!response.ok) {
                throw new Error("Serwer zwrocil nieprawidlowa odpowiedz");
            }
        }

        if (response.status === 401) {
            localStorage.removeItem("authToken");
            localStorage.removeItem("currentUser");
            localStorage.removeItem("currentUserRole");
        }

        if (!response.ok || (data && data.success === false)) {
            throw new Error((data && (data.message || data.error)) || "Blad serwera");
        }

        return data;
    };

    window.STRefreshSession = async function() {
        const token = window.STGetToken();
        if (!token) {
            return null;
        }

        try {
            const data = await window.STAuthorizedFetch("/auth/me");
            if (data && data.user) {
                localStorage.setItem("currentUser", data.user.username);
                localStorage.setItem("currentUserRole", data.user.role || "user");
                return data.user;
            }
        } catch (error) {
            const fallbackUsername = localStorage.getItem("currentUser");
            const fallbackRole = localStorage.getItem("currentUserRole");
            if (fallbackUsername) {
                return {
                    username: fallbackUsername,
                    role: fallbackRole || "user"
                };
            }
        }

        return null;
    };

    window.STRequireAuth = async function(targetUrl = "login.html") {
        const user = await window.STRefreshSession();
        if (!user) {
            window.location.href = targetUrl;
            return null;
        }
        return user;
    };

    window.STLogout = function(targetUrl = "index.html") {
        try {
            localStorage.removeItem("authToken");
            localStorage.removeItem("currentUser");
            localStorage.removeItem("currentUserRole");
        } catch (error) {
            console.error(error);
        }
        showLoader(targetUrl);
    };

    document.addEventListener("click", (event) => {
        const anchor = event.target.closest("a[href]");
        if (!anchor) return;

        const href = anchor.getAttribute("href");
        if (!href || href === "#" || anchor.hasAttribute("download")) return;
        if (anchor.target && anchor.target !== "_self") return;
        if (href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
        if (href.startsWith("#")) return;

        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;

        event.preventDefault();
        showLoader(url.href);
    });
});
