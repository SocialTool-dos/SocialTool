# 🖥️ Social Tool - Najlepszy program typu CMD DOS

Szybki, wydajny program w stylu retro CMD DOS dla Windows.

## 📌 Główne funkcje

- ✅ Klasyczny styl CMD DOS
- ✅ Wysoka wydajność
- ✅ Proste i intuicyjne użycie
- ✅ System logowania i rejestracji
- ✅ Panel administracyjny

## 🚀 Dostęp

Strona główna: [http://socialtool.pl](http://socialtool.pl)  
API: [https://socialtool.onrender.com](https://socialtool.onrender.com)

## 🛠️ Instalacja i uruchomienie

### Wymagania
- Node.js v16 lub nowszy
- npm lub yarn

### Krok po kroku

1. Sklonuj repozytorium:
```bash
git clone https://github.com/SocialTool-dos/SocialTool.git
cd SocialTool
```

2. Zainstaluj zależności:
```bash
npm install
```

3. Skopiuj plik .env.example na .env i skonfiguruj zmienne środowiskowe:
```bash
cp .env.example .env
```

4. Uruchom serwer:
```bash
npm start
```

Dla trybu deweloperskiego z auto-odświeżaniem:
```bash
npm run dev
```

## 🗄️ Baza danych

Projekt używa MySQL z Aiven. Konfiguracja znajduje się w pliku `server.js` i odczytywana jest ze zmiennych środowiskowych.

### Konfiguracja zmiennych środowiskowych

- `DB_HOST` - Host bazy danych
- `DB_PORT` - Port bazy danych
- `DB_USER` - Nazwa użytkownika
- `DB_PASSWORD` - Hasło
- `DB_NAME` - Nazwa bazy danych
- `PORT` - Port na którym działa serwer (domyślnie 10000 dla Render)

## 📂 Struktura projektu

```
social-tools/
├── index.html          # Strona główna
├── login.html          # Logowanie
├── register.html       # Rejestracja
├── download.html       # Pobieranie aplikacji
├── style.css           # Style
├── site.js             # Skrypty front-end
├── login.js            # Logika logowania
├── register.js         # Logika rejestracji
├── server.js           # Serwer Express + API
├── package.json        # Zależności
├── .env.example        # Przykład zmiennych środowiskowych
└── README.md           # Ten plik
```

## ⚠️ Ostrzeżenie

Program jest przeznaczony wyłącznie do celów edukacyjnych. Zabronione jest używanie go w sposób nielegalny.

## 📝 Licencja

MIT License
