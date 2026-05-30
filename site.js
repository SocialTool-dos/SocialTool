document.addEventListener("DOMContentLoaded", () => {
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

    window.STLogout = function(targetUrl = "index.html") {
        try {
            localStorage.removeItem("currentUser");
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
