<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel Admina - Social Tools</title>
    <link rel="icon" href="https://github.com/M1DES1/social-tools/raw/refs/heads/main/cwel.ico" type="image/x-icon">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="page-shell">
        <header class="header">
            <a href="index.html" class="brand">
                <img src="cwel.ico" alt="Social Tools logo" class="brand-logo">
                <div class="brand-copy">
                    <h2>Social Tools</h2>
                    <span>Panel administratora</span>
                </div>
            </a>
            <nav class="nav">
                <a href="index.html" class="nav-link">Start</a>
                <a href="download.html" class="nav-link">Pobieranie</a>
                <a href="#" class="button-secondary" onclick="logout()">Wyloguj</a>
            </nav>
        </header>

        <main class="main-content">
            <section class="hero-panel">
                <div class="eyebrow">Admin</div>
                <h1 class="hero-title">Panel <span class="accent">administratora</span></h1>
                <p class="hero-subtitle">Zarzadzanie kontami, banami i komunikacja z uzytkownikami.</p>
                <div class="hero-actions">
                    <button class="button" id="refreshUsersBtn" type="button">Odswiez uzytkownikow</button>
                    <button class="button-secondary" id="refreshBansBtn" type="button">Odswiez bany</button>
                </div>
                <div class="message" id="message" style="display: none;"></div>
            </section>

            <section class="content-grid section">
                <div class="container">
                    <h1>Uzytkownicy</h1>
                    <p class="subtitle">Konta w systemie i szybkie akcje administratora.</p>
                    <div id="usersList" class="check-list"></div>
                </div>
                <aside class="side-card">
                    <h3>Regulamin</h3>
                    <ul class="check-list">
                        <li>Aplikacja jest tylko do legalnego i autoryzowanego uzytku.</li>
                        <li>Zabronione sa naduzycia, zaklocanie uslug i obchodzenie zabezpieczen.</li>
                        <li>Administrator moze usuwac konta i blokowac dostep za naruszenia.</li>
                        <li>Dzialania uzytkownika musza byc zgodne z prawem i zasadami uslug.</li>
                    </ul>
                </aside>
            </section>

            <section class="content-grid section">
                <div class="container" style="max-width: none;">
                    <h1>Pomoc techniczna</h1>
                    <p class="subtitle">Rozmowy uzytkownikow widoczne dla administratora w czasie prawie rzeczywistym.</p>
                    <div class="admin-support-layout">
                        <div class="admin-support-sidebar">
                            <div id="supportConversations" class="admin-conversation-list"></div>
                        </div>
                        <div class="admin-support-thread-card">
                            <div class="admin-thread-header">
                                <h3 id="selectedConversationTitle">Wybierz rozmowe</h3>
                                <p class="subtitle" id="selectedConversationSubtitle">Kliknij uzytkownika po lewej stronie, aby zobaczyc wiadomosci.</p>
                            </div>
                            <div class="support-thread admin-support-thread" id="adminSupportThread"></div>
                            <form id="adminReplyForm" class="support-form">
                                <label for="adminReplyMessage">Odpowiedz administratora</label>
                                <textarea id="adminReplyMessage" rows="4" maxlength="2000" placeholder="Napisz odpowiedz do wybranego uzytkownika..." required></textarea>
                                <div class="hero-actions support-form-actions">
                                    <button type="submit">Wyslij odpowiedz</button>
                                </div>
                            </form>
                            <div class="message" id="adminSupportStatus"></div>
                        </div>
                    </div>
                </div>
                <aside class="side-card">
                    <h3>Role</h3>
                    <ul class="check-list">
                        <li>Nowe konto ma domyslnie role `user`.</li>
                        <li>Role `admin` moze nadawac tylko konto `w0bise`.</li>
                        <li>Administrator widzi panel, bany i rozmowy pomocy technicznej.</li>
                    </ul>
                </aside>
            </section>

            <section class="container">
                <h1>Bany</h1>
                <p class="subtitle">Aktywne blokady w systemie. Mozesz odbanowac wpis nawet wtedy, gdy konto zostalo juz usuniete.</p>
                <div id="bansList" class="check-list"></div>
            </section>
        </main>

        <footer class="footer">
            <span>Social Tools - panel administratora</span>
            <div class="footer-links">
                <a href="privacy.html">Privacy</a>
                <a href="regulamin.html">Regulamin</a>
                <span id="adminIdentity"></span>
            </div>
        </footer>
    </div>

    <script src="site.js"></script>
    <script src="admin.js"></script>
</body>
</html>
