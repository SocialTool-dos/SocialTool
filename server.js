const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const ADMIN_BOOTSTRAP = {
    username: process.env.ADMIN_BOOTSTRAP_USERNAME || 'w0bise',
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD || ''
};

// KONFIGURACJA CORS
const allowedOrigins = [
    'http://socialtool.pl',
    'https://socialtool.pl',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'https://socialtool.onrender.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Obsługa preflight
app.options('*', (req, res) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

// PARSOWANIE JSON
app.use(express.json());

// KONFIGURACJA MYSQL AIVEN
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.CA_CERTIFICATE 
        ? { ca: process.env.CA_CERTIFICATE, rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    connectTimeout: 60000,
    charset: 'utf8mb4'
};

// FUNKCJA DO POŁĄCZENIA Z BAZĄ
async function getConnection() {
    try {
        console.log('🔄 Próba połączenia z MySQL...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Połączono z MySQL Aiven');
        return connection;
    } catch (error) {
        console.error('❌ BŁĄD POŁĄCZENIA MYSQL:', error.message);
        throw error;
    }
}

function createSession(user) {
    const token = crypto.randomBytes(32).toString('hex');
    SESSION_TOKENS.set(token, {
        userId: user.id,
        username: user.username,
        role: user.role || 'user',
        createdAt: Date.now()
    });
    return token;
}

function getBearerToken(req) {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) {
        return null;
    }
    return authorization.slice(7).trim();
}

async function getAuthenticatedUser(req, connection) {
    const token = getBearerToken(req);
    if (!token) {
        return null;
    }

    const session = SESSION_TOKENS.get(token);
    if (!session) {
        return null;
    }

    const [users] = await connection.execute(
        'SELECT id, username, role, terms_accepted, status FROM users WHERE id = ? LIMIT 1',
        [session.userId]
    );

    if (!users.length) {
        SESSION_TOKENS.delete(token);
        return null;
    }

    const user = users[0];
    SESSION_TOKENS.set(token, {
        ...session,
        username: user.username,
        role: user.role || 'user'
    });

    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role || 'user',
            is_admin: (user.role || 'user') === 'admin',
            terms_accepted: Boolean(user.terms_accepted),
            status: user.status || 'offline'
        }
    };
}

async function requireAuth(req, res, connection) {
    const auth = await getAuthenticatedUser(req, connection);
    if (!auth) {
        res.status(401).json({
            success: false,
            message: 'Wymagane logowanie'
        });
        return null;
    }
    return auth.user;
}

async function requireAdmin(req, res, connection) {
    const user = await requireAuth(req, res, connection);
    if (!user) {
        return null;
    }
    if (user.role !== 'admin') {
        res.status(403).json({
            success: false,
            message: 'Brak uprawnien administratora'
        });
        return null;
    }
    return user;
}

async function requireOwnerAdmin(req, res, connection) {
    const user = await requireAdmin(req, res, connection);
    if (!user) {
        return null;
    }
    if (user.username !== ADMIN_BOOTSTRAP.username) {
        res.status(403).json({
            success: false,
            message: `Tylko konto ${ADMIN_BOOTSTRAP.username} moze nadawac role administratora`
        });
        return null;
    }
    return user;
}

// SYSTEM W PAMIĘCI
const activeUsers = new Map();
const BAN_LIST = new Map();
const USER_MESSAGES = new Map();
const SESSION_TOKENS = new Map();

async function ensureColumnExists(connection, tableName, columnName, definition) {
    const [rows] = await connection.execute(
        `SELECT 1
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [tableName, columnName]
    );

    if (!rows.length) {
        await connection.execute(
            `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
        );
    }
}

// INICJALIZACJA BAZY DANYCH
async function initializeDatabase() {
    let connection;
    try {
        console.log('🔄 Inicjalizacja bazy danych...');
        connection = await getConnection();
        
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                ip VARCHAR(45),
                version VARCHAR(50) DEFAULT '2.0',
                role VARCHAR(50) DEFAULT 'user',
                terms_accepted TINYINT(1) DEFAULT 0,
                terms_accepted_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                status VARCHAR(50) DEFAULT 'offline'
            )
        `);

        await ensureColumnExists(connection, 'users', 'role', "VARCHAR(50) DEFAULT 'user'");
        await ensureColumnExists(connection, 'users', 'terms_accepted', "TINYINT(1) DEFAULT 0");
        await ensureColumnExists(connection, 'users', 'terms_accepted_at', 'TIMESTAMP NULL');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS support_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_username VARCHAR(255) NOT NULL,
                sender_username VARCHAR(255) NOT NULL,
                sender_role VARCHAR(50) NOT NULL DEFAULT 'user',
                message TEXT NOT NULL,
                read_by_user TINYINT(1) DEFAULT 0,
                read_by_admin TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_support_conversation_created (conversation_username, created_at),
                INDEX idx_support_unread_user (conversation_username, read_by_user),
                INDEX idx_support_unread_admin (conversation_username, read_by_admin)
            )
        `);

        if (ADMIN_BOOTSTRAP.password) {
            await connection.execute(
                `INSERT INTO users (username, password, version, role, terms_accepted, terms_accepted_at)
                 VALUES (?, ?, '2.0', 'admin', 1, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE
                    password = VALUES(password),
                    role = 'admin',
                    terms_accepted = 1,
                    terms_accepted_at = COALESCE(terms_accepted_at, CURRENT_TIMESTAMP)`,
                [ADMIN_BOOTSTRAP.username, ADMIN_BOOTSTRAP.password]
            );
        } else {
            await connection.execute(
                `UPDATE users
                 SET role = 'admin',
                     terms_accepted = 1,
                     terms_accepted_at = COALESCE(terms_accepted_at, CURRENT_TIMESTAMP)
                 WHERE username = ?`,
                [ADMIN_BOOTSTRAP.username]
            );
            console.warn('⚠️ Brak ADMIN_BOOTSTRAP_PASSWORD w env - hasło admina nie jest bootstrapowane z kodu.');
        }
        
        console.log('✅ Tabela users gotowa');
        await connection.end();
    } catch (error) {
        console.error('❌ Błąd inicjalizacji bazy danych:', error.message);
        if (connection) await connection.end();
    }
}

// ==================== SYSTEM WIADOMOŚCI ====================

app.post('/send-message', async (req, res) => {
    const { to_username, message, title, from_admin } = req.body;
    
    console.log(`📨 Próba wysłania wiadomości do: ${to_username}`);
    
    if (!to_username || !message) {
        return res.status(400).json({ 
            success: false, 
            message: 'Brak odbiorcy lub wiadomości' 
        });
    }

    try {
        const messageData = {
            id: Date.now() + Math.random(),
            to_username: to_username,
            from_admin: from_admin || 'Administrator',
            title: title || 'Wiadomość od Administratora',
            message: message,
            timestamp: new Date().toISOString(),
            read: false,
            delivered: false
        };

        if (!USER_MESSAGES.has(to_username)) {
            USER_MESSAGES.set(to_username, []);
        }
        USER_MESSAGES.get(to_username).push(messageData);

        console.log(`✅ Wiadomość zapisana dla ${to_username}:`, messageData.title);
        
        res.json({ 
            success: true, 
            message: `Wiadomość wysłana do ${to_username}`,
            message_id: messageData.id
        });

    } catch (error) {
        console.error('❌ Błąd wysyłania wiadomości:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera' 
        });
    }
});

app.get('/messages/:username', async (req, res) => {
    const username = req.params.username;
    
    console.log(`📥 Pobieranie wiadomości dla: ${username}`);
    
    try {
        const userMessages = USER_MESSAGES.get(username) || [];
        const unreadMessages = userMessages.filter(msg => !msg.read);
        
        console.log(`✅ Znaleziono ${unreadMessages.length} nieprzeczytanych wiadomości dla ${username}`);
        
        res.json({
            success: true,
            messages: unreadMessages,
            unread_count: unreadMessages.length,
            total_messages: userMessages.length
        });

    } catch (error) {
        console.error('❌ Błąd pobierania wiadomości:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera' 
        });
    }
});

app.post('/messages/:username/read', async (req, res) => {
    const username = req.params.username;
    const { message_id } = req.body;
    
    try {
        const userMessages = USER_MESSAGES.get(username) || [];
        const messageIndex = userMessages.findIndex(msg => msg.id === message_id);
        
        if (messageIndex !== -1) {
            userMessages[messageIndex].read = true;
            console.log(`✅ Oznaczono wiadomość ${message_id} jako przeczytaną dla ${username}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Błąd oznaczania wiadomości:', error);
        res.status(500).json({ success: false, message: 'Błąd serwera' });
    }
});

app.delete('/messages/:username/cleanup', async (req, res) => {
    const username = req.params.username;
    
    try {
        if (USER_MESSAGES.has(username)) {
            const userMessages = USER_MESSAGES.get(username);
            const unreadMessages = userMessages.filter(msg => !msg.read);
            USER_MESSAGES.set(username, unreadMessages);
            
            console.log(`🧹 Wyczyszczono przeczytane wiadomości dla ${username}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Błąd czyszczenia wiadomości:', error);
        res.status(500).json({ success: false, message: 'Błąd serwera' });
    }
});

// ==================== SYSTEM STATUSÓW ====================

app.post('/update-status', async (req, res) => {
    const { username, ip, status, version } = req.body;
    
    if (!username || !ip) {
        return res.status(400).json({ 
            success: false, 
            message: 'Brak wymaganych danych' 
        });
    }

    try {
        // SPRAWDŹ BANY
        const ipBanned = BAN_LIST.has(ip);
        const userBanned = Array.from(BAN_LIST.values()).some(ban => ban.username === username);
        
        if (ipBanned || userBanned) {
            const banReason = ipBanned ? BAN_LIST.get(ip).reason : 'Konto zbanowane';
            console.log(`🚫 Odmowa dostępu - zbanowany użytkownik: ${username}, IP: ${ip}`);
            return res.json({ 
                success: false, 
                message: banReason, 
                banned: true 
            });
        }

        // Sprawdź czy użytkownik istnieje w bazie MySQL
        const connection = await getConnection();
        const [users] = await connection.execute(
            'SELECT username, role FROM users WHERE username = ?',
            [username]
        );
        await connection.end();

        if (users.length === 0) {
            console.log(`🗑️ Konto usunięte: ${username}`);
            return res.json({ 
                success: false, 
                message: '🗑️ KONTO USUNIĘTE przez administratora', 
                banned: true 
            });
        }

        // Aktualizuj status
        const userData = {
            username,
            ip,
            status: status || 'online',
            version: version || '2.0',
            last_activity: new Date().toISOString(),
            timestamp: Date.now(),
            last_status_update: Date.now()
        };

        activeUsers.set(username, userData);

        console.log(`🟢 Status zaktualizowany: ${username} - ${status}`);

        res.json({ 
            success: true, 
            message: 'Status zaktualizowany',
            role: users[0].role || 'user'
        });

    } catch (error) {
        console.error('❌ Błąd update-status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera' 
        });
    }
});

app.get('/status', async (req, res) => {
    try {
        const now = Date.now();
        const OFFLINE_THRESHOLD = 15 * 1000;
        
        for (let [username, userData] of activeUsers.entries()) {
            if (now - userData.timestamp > OFFLINE_THRESHOLD) {
                userData.status = 'offline';
                console.log(`⚪ Automatycznie oznaczono jako offline: ${username}`);
            }
        }

        const statuses = Array.from(activeUsers.values());
        const onlineUsers = statuses.filter(s => s.status === 'online');
        const offlineUsers = statuses.filter(s => s.status === 'offline');
        
        res.json({ 
            success: true, 
            online: onlineUsers.length,
            offline: offlineUsers.length,
            total: statuses.length,
            statuses: statuses,
            banned_ips: Array.from(BAN_LIST.entries()).map(([ip, data]) => ({
                ip,
                reason: data.reason,
                username: data.username,
                banned_at: data.timestamp
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== SYSTEM BANÓW ====================

app.post('/ban-ip', async (req, res) => {
    const { ip, reason, username, admin } = req.body;
    
    if (!ip) {
        return res.status(400).json({ 
            success: false, 
            message: 'Brak IP' 
        });
    }

    try {
        const connection = await getConnection();
        const adminUser = await requireAdmin(req, res, connection);
        if (!adminUser) {
            await connection.end();
            return;
        }
        await connection.end();

        const banData = {
            ip: ip,
            username: username || '',
            reason: reason || 'Administrator decision',
            admin: adminUser.username || admin || 'admin_panel',
            timestamp: new Date().toISOString()
        };

        BAN_LIST.set(ip, banData);
        
        if (username && activeUsers.has(username)) {
            activeUsers.delete(username);
            console.log(`🚫 Usunięto z aktywnych: ${username} (zbanowany)`);
        }

        console.log(`🚫 Zbanowano IP: ${ip}, użytkownik: ${username}, powód: ${reason}`);
        
        res.json({ 
            success: true, 
            message: `IP ${ip} zostało zbanowane` 
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera' 
        });
    }
});

app.post('/unban-ip', async (req, res) => {
    const { ip } = req.body;
    
    if (!ip) {
        return res.status(400).json({ 
            success: false, 
            message: 'Brak IP' 
        });
    }

    try {
        const connection = await getConnection();
        const adminUser = await requireAdmin(req, res, connection);
        if (!adminUser) {
            await connection.end();
            return;
        }
        await connection.end();

        const wasBanned = BAN_LIST.has(ip);
        BAN_LIST.delete(ip);
        
        console.log(`✅ Odbanowano IP: ${ip}`);
        
        res.json({ 
            success: true, 
            message: `IP ${ip} zostało odbanowane`,
            was_banned: wasBanned
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera' 
        });
    }
});

app.get('/bans', async (req, res) => {
    try {
        const connection = await getConnection();
        const adminUser = await requireAdmin(req, res, connection);
        if (!adminUser) {
            await connection.end();
            return;
        }
        await connection.end();

        const bansArray = Array.from(BAN_LIST.entries()).map(([ip, data]) => ({
            ip: ip,
            reason: data.reason,
            username: data.username,
            banned_by: data.admin,
            banned_at: data.timestamp
        }));

        res.json({
            success: true,
            banned_ips: Array.from(BAN_LIST.keys()),
            bans: bansArray,
            total_bans: bansArray.length
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Błąd serwera' 
        });
    }
});

// ==================== SYSTEM UŻYTKOWNIKÓW ====================

app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Brak loginu lub hasła'
        });
    }

    try {
        const connection = await getConnection();
        const [users] = await connection.execute(
            'SELECT id, username, password, role, status, terms_accepted FROM users WHERE username = ? LIMIT 1',
            [username]
        );

        if (!users.length || users[0].password !== password) {
            await connection.end();
            return res.status(401).json({
                success: false,
                message: 'Nieprawidłowa nazwa użytkownika lub hasło'
            });
        }

        await connection.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
            ['online', users[0].id]
        );
        const token = createSession(users[0]);
        await connection.end();

        return res.json({
            success: true,
            token,
            user: {
                id: users[0].id,
                username: users[0].username,
                role: users[0].role || 'user',
                is_admin: (users[0].role || 'user') === 'admin',
                terms_accepted: Boolean(users[0].terms_accepted)
            }
        });
    } catch (error) {
        console.error('❌ Błąd logowania:', error);
        return res.status(500).json({
            success: false,
            message: 'Błąd serwera'
        });
    }
});

app.get('/auth/me', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const auth = await getAuthenticatedUser(req, connection);
        await connection.end();

        if (!auth) {
            return res.status(401).json({
                success: false,
                message: 'Sesja wygasla lub nie jestes zalogowany'
            });
        }

        return res.json({
            success: true,
            user: auth.user
        });
    } catch (error) {
        if (connection) {
            await connection.end();
        }
        console.error('❌ Błąd auth/me:', error);
        return res.status(500).json({
            success: false,
            message: 'Błąd serwera'
        });
    }
});

app.post('/save-log', async (req, res) => {
    console.log('📝 Rejestracja:', req.body.username);
    
    try {
        const { username, password, ip, termsAccepted } = req.body;

        if (!termsAccepted) {
            return res.status(400).json({
                success: false,
                message: 'Musisz zaakceptować regulamin'
            });
        }

        // Sprawdź czy użytkownik jest zbanowany
        if (BAN_LIST.has(ip)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Twoje IP jest zbanowane' 
            });
        }

        const connection = await getConnection();

        // Sprawdź czy użytkownik istnieje
        const [existingUsers] = await connection.execute(
            'SELECT username FROM users WHERE username = ?',
            [username]
        );

        if (existingUsers.length > 0) {
            await connection.end();
            return res.status(409).json({ 
                success: false, 
                message: 'Ta nazwa użytkownika jest już zajęta' 
            });
        }

        // POPRAWIONE: Użyj MySQL CURRENT_TIMESTAMP zamiast ręcznej daty
        await connection.execute(
            `INSERT INTO users (username, password, ip, version, role, terms_accepted, terms_accepted_at)
             VALUES (?, ?, ?, ?, 'user', 1, CURRENT_TIMESTAMP)`,
            [username, password, ip, '2.0']
        );

        const [createdUsers] = await connection.execute(
            'SELECT id, username, role, terms_accepted FROM users WHERE username = ? LIMIT 1',
            [username]
        );
        const createdUser = createdUsers[0];
        const token = createSession(createdUser);

        await connection.end();

        console.log('✅ Użytkownik zarejestrowany:', username);
        
        res.json({ 
            success: true, 
            message: 'Konto utworzone pomyslnie!',
            token,
            user: {
                id: createdUser.id,
                username: createdUser.username,
                role: createdUser.role || 'user',
                is_admin: false,
                terms_accepted: Boolean(createdUser.terms_accepted)
            }
        });
        
    } catch (error) {
        console.error('💥 Błąd rejestracji:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Błąd połączenia z bazą danych' 
        });
    }
});

app.get('/check-logs', async (req, res) => {
    try {
        const connection = await getConnection();
        const [users] = await connection.execute('SELECT * FROM users');
        await connection.end();

        res.json({ 
            success: true, 
            users: users || [] 
        });
    } catch (error) {
        console.error('Błąd check-logs:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/users', async (req, res) => {
    try {
        const connection = await getConnection();
        const adminUser = await requireAdmin(req, res, connection);
        if (!adminUser) {
            await connection.end();
            return;
        }
        const [users] = await connection.execute(
            'SELECT * FROM users ORDER BY created_at DESC'
        );
        const [supportRows] = await connection.execute(`
            SELECT
                conversation_username,
                SUM(CASE WHEN read_by_admin = 0 THEN 1 ELSE 0 END) AS unread_for_admin
            FROM support_messages
            GROUP BY conversation_username
        `);
        await connection.end();

        const supportMap = new Map(
            supportRows.map(row => [row.conversation_username, Number(row.unread_for_admin) || 0])
        );

        const now = Date.now();
        const ONLINE_THRESHOLD = 15 * 1000;

        const usersWithStatus = (users || []).map(user => {
            const userActive = activeUsers.get(user.username);
            const isOnline = userActive && (now - userActive.timestamp < ONLINE_THRESHOLD);
            const isBanned = BAN_LIST.has(user.ip);
            const banInfo = isBanned ? BAN_LIST.get(user.ip) : null;

            return {
                ...user,
                is_online: isOnline,
                is_banned: isBanned,
                is_admin: (user.role || 'user') === 'admin',
                support_unread: supportMap.get(user.username) || 0,
                ban_reason: banInfo?.reason,
                status: isOnline ? '🟢 ONLINE' : (isBanned ? '🚫 BANNED' : '⚫ OFFLINE'),
                last_activity: userActive?.last_activity || 'Never'
            };
        });

        res.json({
            success: true,
            users: usersWithStatus,
            total: usersWithStatus.length,
            online: usersWithStatus.filter(u => u.is_online).length,
            banned: usersWithStatus.filter(u => u.is_banned).length
        });

    } catch (error) {
        console.error('Błąd users:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.delete('/users/:username', async (req, res) => {
    const username = req.params.username;
    
    try {
        const connection = await getConnection();
        const adminUser = await requireAdmin(req, res, connection);
        if (!adminUser) {
            await connection.end();
            return;
        }

        // Znajdź użytkownika aby pobrać IP
        const [users] = await connection.execute(
            'SELECT ip FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            await connection.end();
            return res.status(404).json({ 
                success: false, 
                message: 'Użytkownik nie znaleziony' 
            });
        }

        const userIP = users[0].ip;

        // Usuń użytkownika
        await connection.execute(
            'DELETE FROM users WHERE username = ?',
            [username]
        );
        await connection.execute(
            'DELETE FROM support_messages WHERE conversation_username = ?',
            [username]
        );

        await connection.end();

        // Automatycznie zbanuj IP
        if (userIP) {
            BAN_LIST.set(userIP, {
                ip: userIP,
                username: username,
                reason: 'Konto usunięte przez administratora',
                admin: adminUser.username || 'system',
                timestamp: new Date().toISOString()
            });
        }

        // Usuń z aktywnych użytkowników
        activeUsers.delete(username);
        USER_MESSAGES.delete(username);

        console.log(`🗑️ Usunięto użytkownika: ${username}`);

        res.json({ 
            success: true, 
            message: `Użytkownik ${username} został usunięty i zbanowany` 
        });

    } catch (error) {
        console.error('Błąd usuwania użytkownika:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.patch('/users/:username/role', async (req, res) => {
    const targetUsername = req.params.username;
    const requestedRole = (req.body.role || '').trim().toLowerCase();

    if (!['user', 'admin'].includes(requestedRole)) {
        return res.status(400).json({
            success: false,
            message: 'Nieprawidlowa rola'
        });
    }

    let connection;
    try {
        connection = await getConnection();
        const ownerAdmin = await requireOwnerAdmin(req, res, connection);
        if (!ownerAdmin) {
            await connection.end();
            return;
        }

        const [users] = await connection.execute(
            'SELECT id, username, role FROM users WHERE username = ? LIMIT 1',
            [targetUsername]
        );

        if (!users.length) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: 'Uzytkownik nie znaleziony'
            });
        }

        await connection.execute(
            'UPDATE users SET role = ? WHERE id = ?',
            [requestedRole, users[0].id]
        );

        for (const [token, session] of SESSION_TOKENS.entries()) {
            if (session.userId === users[0].id) {
                SESSION_TOKENS.set(token, {
                    ...session,
                    role: requestedRole
                });
            }
        }

        await connection.end();
        return res.json({
            success: true,
            message: `Rola dla ${targetUsername} zostala zmieniona na ${requestedRole}`,
            role: requestedRole
        });
    } catch (error) {
        if (connection) {
            await connection.end();
        }
        console.error('Błąd zmiany roli:', error);
        return res.status(500).json({
            success: false,
            message: 'Błąd serwera'
        });
    }
});

app.get('/support/conversations', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const adminUser = await requireAdmin(req, res, connection);
        if (!adminUser) {
            await connection.end();
            return;
        }

        const [rows] = await connection.execute(`
            SELECT
                conversation_username,
                MAX(created_at) AS last_message_at,
                SUBSTRING_INDEX(GROUP_CONCAT(message ORDER BY created_at DESC SEPARATOR '|||'), '|||', 1) AS last_message,
                SUM(CASE WHEN read_by_admin = 0 THEN 1 ELSE 0 END) AS unread_for_admin
            FROM support_messages
            GROUP BY conversation_username
            ORDER BY last_message_at DESC
        `);
        await connection.end();

        return res.json({
            success: true,
            conversations: rows.map(row => ({
                username: row.conversation_username,
                last_message_at: row.last_message_at,
                last_message: row.last_message,
                unread_for_admin: Number(row.unread_for_admin) || 0
            }))
        });
    } catch (error) {
        if (connection) {
            await connection.end();
        }
        console.error('Błąd support/conversations:', error);
        return res.status(500).json({
            success: false,
            message: 'Błąd serwera'
        });
    }
});

app.get('/support/messages/:username', async (req, res) => {
    const conversationUsername = req.params.username;
    let connection;
    try {
        connection = await getConnection();
        const authUser = await requireAuth(req, res, connection);
        if (!authUser) {
            await connection.end();
            return;
        }

        if (authUser.role !== 'admin' && authUser.username !== conversationUsername) {
            await connection.end();
            return res.status(403).json({
                success: false,
                message: 'Brak dostepu do tej rozmowy'
            });
        }

        const [messages] = await connection.execute(
            `SELECT id, conversation_username, sender_username, sender_role, message, read_by_user, read_by_admin, created_at
             FROM support_messages
             WHERE conversation_username = ?
             ORDER BY created_at ASC, id ASC`,
            [conversationUsername]
        );
        await connection.end();

        const unreadCount = messages.filter(message => {
            return authUser.role === 'admin'
                ? message.sender_role === 'user' && !message.read_by_admin
                : message.sender_role === 'admin' && !message.read_by_user;
        }).length;

        return res.json({
            success: true,
            conversation_username: conversationUsername,
            messages,
            unread_count: unreadCount
        });
    } catch (error) {
        if (connection) {
            await connection.end();
        }
        console.error('Błąd support/messages:', error);
        return res.status(500).json({
            success: false,
            message: 'Błąd serwera'
        });
    }
});

app.post('/support/messages', async (req, res) => {
    const rawMessage = typeof req.body.message === 'string' ? req.body.message : '';
    const message = rawMessage.trim();
    const requestedTarget = typeof req.body.target_username === 'string' ? req.body.target_username.trim() : '';

    if (!message) {
        return res.status(400).json({
            success: false,
            message: 'Wiadomosc nie moze byc pusta'
        });
    }

    if (message.length > 2000) {
        return res.status(400).json({
            success: false,
            message: 'Wiadomosc jest za dluga'
        });
    }

    let connection;
    try {
        connection = await getConnection();
        const authUser = await requireAuth(req, res, connection);
        if (!authUser) {
            await connection.end();
            return;
        }

        const targetUsername = authUser.role === 'admin' ? requestedTarget : authUser.username;
        if (!targetUsername) {
            await connection.end();
            return res.status(400).json({
                success: false,
                message: 'Brak odbiorcy rozmowy'
            });
        }

        const [users] = await connection.execute(
            'SELECT username FROM users WHERE username = ? LIMIT 1',
            [targetUsername]
        );
        if (!users.length) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: 'Uzytkownik nie istnieje'
            });
        }

        const readByUser = authUser.role === 'admin' ? 0 : 1;
        const readByAdmin = authUser.role === 'admin' ? 1 : 0;
        const [insertResult] = await connection.execute(
            `INSERT INTO support_messages
                (conversation_username, sender_username, sender_role, message, read_by_user, read_by_admin)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [targetUsername, authUser.username, authUser.role, message, readByUser, readByAdmin]
        );
        await connection.end();

        return res.json({
            success: true,
            message: 'Wiadomosc zostala wyslana',
            support_message_id: insertResult.insertId
        });
    } catch (error) {
        if (connection) {
            await connection.end();
        }
        console.error('Błąd support/messages POST:', error);
        return res.status(500).json({
            success: false,
            message: 'Błąd serwera'
        });
    }
});

app.post('/support/messages/:username/read', async (req, res) => {
    const conversationUsername = req.params.username;
    let connection;
    try {
        connection = await getConnection();
        const authUser = await requireAuth(req, res, connection);
        if (!authUser) {
            await connection.end();
            return;
        }

        if (authUser.role !== 'admin' && authUser.username !== conversationUsername) {
            await connection.end();
            return res.status(403).json({
                success: false,
                message: 'Brak dostepu do tej rozmowy'
            });
        }

        if (authUser.role === 'admin') {
            await connection.execute(
                `UPDATE support_messages
                 SET read_by_admin = 1
                 WHERE conversation_username = ? AND sender_role = 'user' AND read_by_admin = 0`,
                [conversationUsername]
            );
        } else {
            await connection.execute(
                `UPDATE support_messages
                 SET read_by_user = 1
                 WHERE conversation_username = ? AND sender_role = 'admin' AND read_by_user = 0`,
                [conversationUsername]
            );
        }

        await connection.end();
        return res.json({
            success: true
        });
    } catch (error) {
        if (connection) {
            await connection.end();
        }
        console.error('Błąd support/messages/read:', error);
        return res.status(500).json({
            success: false,
            message: 'Błąd serwera'
        });
    }
});

// TEST ENDPOINT DLA BAZY DANYCH
app.get('/test-db', async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.execute('SELECT NOW() as current_time');
        await connection.end();
        
        res.json({ 
            success: true, 
            message: 'Database connection OK',
            time: rows[0].current_time
        });
    } catch (error) {
        res.json({ 
            success: false, 
            message: 'Database connection FAILED',
            error: error.message 
        });
    }
});

// HEALTH CHECK
app.get('/health', async (req, res) => {
    try {
        const connection = await getConnection();
        const [result] = await connection.execute('SELECT 1 as test');
        await connection.end();
        
        res.json({ 
            success: true, 
            message: 'Database connected',
            database: 'OK',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ 
            success: false, 
            message: 'Database connection failed',
            error: error.message 
        });
    }
});

// Endpoint główny
app.get('/', (req, res) => {
    const now = Date.now();
    const onlineUsers = Array.from(activeUsers.values()).filter(user => 
        now - user.timestamp < 15000
    );
    
    res.json({ 
        message: '🚀 Social Tools API z MySQL działa!', 
        status: 'online',
        version: '2.0',
        database: 'MySQL Aiven',
        stats: {
            active_users: onlineUsers.length,
            total_users: activeUsers.size,
            banned_ips: BAN_LIST.size,
            total_messages: Array.from(USER_MESSAGES.values()).flat().length
        },
        endpoints: {
            'GET /health': 'Health check bazy danych',
            'GET /test-db': 'Test połączenia z bazą',
            'POST /save-log': 'Rejestracja użytkownika',
            'GET /check-logs': 'Lista użytkowników (login)',
            'GET /users': 'Lista użytkowników (admin)',
            'DELETE /users/:username': 'Usuń użytkownika',
            'POST /update-status': 'Aktualizuj status',
            'GET /status': 'Statusy online/offline',
            'POST /ban-ip': 'Zbanuj IP',
            'POST /unban-ip': 'Odbanuj IP',
            'GET /bans': 'Lista banów',
            'POST /send-message': 'Wyślij wiadomość',
            'GET /messages/:username': 'Pobierz wiadomości',
            'POST /messages/:username/read': 'Oznacz jako przeczytane',
            'GET /auth/me': 'Sprawdz aktualna sesje',
            'PATCH /users/:username/role': 'Zmien role uzytkownika',
            'GET /support/conversations': 'Lista rozmow pomocy technicznej',
            'GET /support/messages/:username': 'Pobierz rozmowe pomocy technicznej',
            'POST /support/messages': 'Wyslij wiadomosc pomocy technicznej',
            'POST /support/messages/:username/read': 'Oznacz rozmowe wsparcia jako przeczytana'
        }
    });
});

// Czyszczenie starych statusów
setInterval(() => {
    const now = Date.now();
    const CLEANUP_THRESHOLD = 5 * 60 * 1000;
    
    let cleanedCount = 0;
    for (let [username, userData] of activeUsers.entries()) {
        if (now - userData.timestamp > CLEANUP_THRESHOLD) {
            activeUsers.delete(username);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Wyczyszczono ${cleanedCount} nieaktywnych użytkowników`);
    }
}, 30000);

// Automatyczne czyszczenie przeczytanych wiadomości
setInterval(() => {
    let cleanedCount = 0;
    for (let [username, messages] of USER_MESSAGES.entries()) {
        const originalCount = messages.length;
        const unreadMessages = messages.filter(msg => !msg.read);
        USER_MESSAGES.set(username, unreadMessages);
        cleanedCount += (originalCount - unreadMessages.length);
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Wyczyszczono ${cleanedCount} przeczytanych wiadomości`);
    }
}, 60 * 60 * 1000);

// URUCHOMIENIE SERWERA
const PORT = process.env.PORT || 10000;

async function startServer() {
    console.log('🚀 Uruchamianie serwera...');
    console.log('📊 Konfiguracja bazy:', {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        database: process.env.DB_NAME
    });
    
    await initializeDatabase();
    
    app.listen(PORT, () => {
        console.log(`🎉 Serwer działa na porcie ${PORT}`);
        console.log(`📊 System: Bany: ${BAN_LIST.size}, Aktywni: ${activeUsers.size}`);
    });
}

startServer().catch(console.error);
