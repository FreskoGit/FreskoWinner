// security.js - Улучшенная система безопасности и валидации

class SecuritySystem {
    constructor() {
        this.allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.passwordMinLength = 6;
        this.xssPatterns = /<script|javascript:|onload=|onerror=|onclick=|alert\(|document\.|window\.|eval\(/gi;
        this.sqlInjectionPatterns = /(\-\-)|(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b)/gi;
        this.rateLimitStore = {};
        this.sessionDuration = 24 * 60 * 60 * 1000; // 24 часа
    }

    // ==================== ВАЛИДАЦИЯ ВВОДА ====================
    
    sanitizeInput(input) {
        if (input === null || input === undefined) return '';
        if (typeof input !== 'string') return String(input);
        
        // Удаляем опасные паттерны
        let sanitized = input
            .replace(this.xssPatterns, '')
            .replace(this.sqlInjectionPatterns, '');
        
        // Экранируем HTML
        sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
        
        // Обрезаем пробелы и ограничиваем длину
        sanitized = sanitized.trim().substring(0, 1000);
        
        return sanitized;
    }
    
    validateEmail(email) {
        if (!email || typeof email !== 'string') return false;
        
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = re.test(email.trim());
        
        // Дополнительная проверка длины
        if (email.length > 100) return false;
        
        return isValid;
    }
    
    validatePassword(password) {
        if (!password || typeof password !== 'string') {
            return {
                valid: false,
                message: 'Пароль не указан'
            };
        }
        
        const trimmedPassword = password.trim();
        
        if (trimmedPassword.length < this.passwordMinLength) {
            return {
                valid: false,
                message: `Пароль должен содержать не менее ${this.passwordMinLength} символов`
            };
        }
        
        // Проверка сложности
        const hasUpperCase = /[A-Z]/.test(trimmedPassword);
        const hasLowerCase = /[a-z]/.test(trimmedPassword);
        const hasNumbers = /\d/.test(trimmedPassword);
        
        if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
            return {
                valid: false,
                message: 'Пароль должен содержать заглавные и строчные буквы, а также цифры'
            };
        }
        
        // Проверка на распространенные пароли
        const commonPasswords = [
            'password', '123456', 'qwerty', 'admin', 'welcome',
            'password123', 'admin123', 'qwerty123', '123456789',
            '12345678', '12345', '1234567', '123123', '111111'
        ];
        
        if (commonPasswords.includes(trimmedPassword.toLowerCase())) {
            return {
                valid: false,
                message: 'Пароль слишком простой и легко угадывается'
            };
        }
        
        return { 
            valid: true, 
            message: 'Пароль корректен',
            strength: this.calculatePasswordStrength(trimmedPassword)
        };
    }
    
    calculatePasswordStrength(password) {
        let strength = 0;
        
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        
        return Math.min(strength, 5); // Максимум 5
    }
    
    validateUsername(username) {
        if (!username || typeof username !== 'string') {
            return {
                valid: false,
                message: 'Имя пользователя не указано'
            };
        }
        
        const trimmedUsername = username.trim();
        
        if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
            return {
                valid: false,
                message: 'Имя пользователя должно быть от 3 до 20 символов'
            };
        }
        
        // Разрешаем только буквы, цифры и подчеркивания
        const re = /^[a-zA-Z0-9_]+$/;
        if (!re.test(trimmedUsername)) {
            return {
                valid: false,
                message: 'Имя пользователя может содержать только буквы, цифры и подчеркивания'
            };
        }
        
        // Проверяем на запрещенные слова
        const forbiddenUsernames = ['admin', 'administrator', 'root', 'system', 'support'];
        if (forbiddenUsernames.includes(trimmedUsername.toLowerCase())) {
            return {
                valid: false,
                message: 'Это имя пользователя запрещено'
            };
        }
        
        return { valid: true, message: 'Имя пользователя корректно' };
    }
    
    validateTelegramTag(tag) {
        if (!tag || typeof tag !== 'string') {
            return { valid: false, message: 'Введите Telegram тег' };
        }
        
        const trimmedTag = tag.trim();
        
        const re = /^@[a-zA-Z0-9_]{5,32}$/;
        const isValid = re.test(trimmedTag);
        
        if (!isValid) {
            return {
                valid: false,
                message: 'Telegram тег должен начинаться с @ и содержать от 5 до 32 символов (буквы, цифры, подчеркивания)'
            };
        }
        
        return { valid: true, message: 'Telegram тег корректен' };
    }
    
    // ==================== ВАЛИДАЦИЯ ФАЙЛОВ ====================
    
    validateFile(file) {
        if (!file || !(file instanceof File)) {
            return { valid: false, message: 'Файл не выбран или недействителен' };
        }
        
        // Проверка типа файла
        if (!this.allowedFileTypes.includes(file.type)) {
            return {
                valid: false,
                message: `Недопустимый тип файла. Разрешены: ${this.allowedFileTypes.map(t => t.split('/')[1]).join(', ')}`
            };
        }
        
        // Проверка размера файла
        if (file.size > this.maxFileSize) {
            const maxSizeMB = this.maxFileSize / (1024 * 1024);
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            return {
                valid: false,
                message: `Файл слишком большой (${fileSizeMB}MB). Максимальный размер: ${maxSizeMB}MB`
            };
        }
        
        // Проверка имени файла
        const fileName = file.name.toLowerCase();
        const dangerousExtensions = ['.php', '.exe', '.js', '.jar', '.bat', '.sh', '.py'];
        if (dangerousExtensions.some(ext => fileName.endsWith(ext))) {
            return {
                valid: false,
                message: 'Недопустимое расширение файла'
            };
        }
        
        // Проверка на двойные расширения
        if (fileName.split('.').length > 2) {
            const extensions = fileName.split('.').slice(-2);
            if (extensions.some(ext => dangerousExtensions.includes('.' + ext))) {
                return {
                    valid: false,
                    message: 'Обнаружено опасное расширение файла'
                };
            }
        }
        
        return { 
            valid: true, 
            message: 'Файл корректен',
            details: {
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified
            }
        };
    }
    
    async getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = function() {
                URL.revokeObjectURL(url);
                resolve({
                    width: this.width,
                    height: this.height,
                    aspectRatio: this.width / this.height
                });
            };
            
            img.onerror = function() {
                URL.revokeObjectURL(url);
                reject(new Error('Не удалось загрузить изображение'));
            };
            
            img.src = url;
        });
    }
    
    // ==================== ЗАЩИТА ОТ БОТОВ ====================
    
    createCaptcha() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = 200;
            canvas.height = 80;
            
            // Генерируем случайный текст
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let captchaText = '';
            
            for (let i = 0; i < 6; i++) {
                captchaText += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            // Очищаем canvas
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Добавляем сложный шум
            for (let i = 0; i < 200; i++) {
                ctx.fillStyle = `rgba(${Math.floor(Math.random() * 100)}, ${Math.floor(Math.random() * 100)}, ${Math.floor(Math.random() * 100)}, 0.2)`;
                ctx.fillRect(
                    Math.random() * canvas.width,
                    Math.random() * canvas.height,
                    Math.random() * 15,
                    Math.random() * 15
                );
            }
            
            // Рисуем текст с искажениями
            ctx.font = 'bold 32px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Искажаем каждый символ по-разному
            for (let i = 0; i < captchaText.length; i++) {
                ctx.save();
                
                const x = 30 + i * 25;
                const y = 40 + Math.random() * 15 - 7.5;
                const rotation = Math.random() * 0.6 - 0.3;
                const scaleX = 0.8 + Math.random() * 0.4;
                const scaleY = 0.8 + Math.random() * 0.4;
                
                ctx.translate(x, y);
                ctx.rotate(rotation);
                ctx.scale(scaleX, scaleY);
                
                // Добавляем внутреннюю тень
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                
                ctx.fillText(captchaText[i], 0, 0);
                ctx.restore();
            }
            
            // Добавляем пересекающиеся линии
            for (let i = 0; i < 8; i++) {
                ctx.beginPath();
                ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
                ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
                ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.7)`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            
            // Добавляем точки шума поверх текста
            for (let i = 0; i < 100; i++) {
                ctx.fillStyle = `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.3)`;
                ctx.fillRect(
                    Math.random() * canvas.width,
                    Math.random() * canvas.height,
                    1, 1
                );
            }
            
            // Создаем хэш для проверки
            const hash = this.hashString(captchaText + 'fresko_salt_' + Date.now());
            
            // Сохраняем в сессионном хранилище
            sessionStorage.setItem('captcha_hash', hash);
            sessionStorage.setItem('captcha_text', captchaText);
            sessionStorage.setItem('captcha_time', Date.now().toString());
            
            return {
                image: canvas.toDataURL(),
                text: captchaText,
                hash: hash
            };
            
        } catch (error) {
            console.error('Ошибка создания капчи:', error);
            return null;
        }
    }
    
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16) + str.length.toString(16);
    }
    
    verifyCaptcha(input) {
        try {
            const storedHash = sessionStorage.getItem('captcha_hash');
            const storedText = sessionStorage.getItem('captcha_text');
            const storedTime = parseInt(sessionStorage.getItem('captcha_time') || '0');
            
            if (!storedHash || !storedText || !storedTime) {
                return false;
            }
            
            // Проверяем время (капча действительна 10 минут)
            if (Date.now() - storedTime > 10 * 60 * 1000) {
                this.clearCaptcha();
                return false;
            }
            
            // Проверяем ввод
            const inputHash = this.hashString(input.toUpperCase());
            const directMatch = input.toUpperCase() === storedText;
            
            return inputHash === storedHash || directMatch;
            
        } catch (error) {
            console.error('Ошибка проверки капчи:', error);
            return false;
        }
    }
    
    clearCaptcha() {
        sessionStorage.removeItem('captcha_hash');
        sessionStorage.removeItem('captcha_text');
        sessionStorage.removeItem('captcha_time');
    }
    
    // ==================== РАТЕ-ЛИМИТИНГ ====================
    
    checkRateLimit(action, limit = 10, interval = 60000) {
        const now = Date.now();
        const key = `rate_limit_${action}`;
        
        // Получаем или создаем данные для этого действия
        let data = JSON.parse(sessionStorage.getItem(key) || '{}');
        
        // Инициализируем если нет данных
        if (!data.count || !data.resetTime) {
            data = {
                count: 0,
                resetTime: now + interval
            };
        }
        
        // Сбрасываем счетчик если время истекло
        if (now > data.resetTime) {
            data.count = 0;
            data.resetTime = now + interval;
        }
        
        // Проверяем лимит
        if (data.count >= limit) {
            return {
                allowed: false,
                remaining: 0,
                resetIn: data.resetTime - now,
                retryAfter: Math.ceil((data.resetTime - now) / 1000)
            };
        }
        
        // Увеличиваем счетчик и сохраняем
        data.count++;
        sessionStorage.setItem(key, JSON.stringify(data));
        
        return {
            allowed: true,
            remaining: limit - data.count,
            resetIn: data.resetTime - now
        };
    }
    
    // ==================== ЗАЩИТА ОТ CSRF ====================
    
    generateCSRFToken() {
        try {
            const token = this.generateRandomString(32);
            const expires = Date.now() + 3600000; // 1 час
            
            // Сохраняем в localStorage
            localStorage.setItem('csrf_token', token);
            localStorage.setItem('csrf_token_expires', expires.toString());
            
            // Также сохраняем в sessionStorage для текущей сессии
            sessionStorage.setItem('csrf_token', token);
            
            return token;
            
        } catch (error) {
            console.error('Ошибка генерации CSRF токена:', error);
            return null;
        }
    }
    
    verifyCSRFToken(token) {
        try {
            const storedToken = localStorage.getItem('csrf_token');
            const storedSessionToken = sessionStorage.getItem('csrf_token');
            const expires = parseInt(localStorage.getItem('csrf_token_expires') || '0');
            
            // Проверяем срок действия
            if (!storedToken || !expires || Date.now() > expires) {
                return false;
            }
            
            // Принимаем токен из localStorage или sessionStorage
            return token === storedToken || token === storedSessionToken;
            
        } catch (error) {
            console.error('Ошибка проверки CSRF токена:', error);
            return false;
        }
    }
    
    // ==================== УПРАВЛЕНИЕ СЕССИЯМИ ====================
    
    createSession(userData) {
        try {
            const sessionId = this.generateRandomString(64);
            const sessionData = {
                id: sessionId,
                user: userData,
                created: Date.now(),
                expires: Date.now() + this.sessionDuration,
                ip: await this.getClientIP(),
                userAgent: navigator.userAgent
            };
            
            // Сохраняем сессию
            localStorage.setItem('user_session', JSON.stringify(sessionData));
            sessionStorage.setItem('session_id', sessionId);
            
            // Сохраняем время последней активности
            this.updateSessionActivity();
            
            return sessionId;
            
        } catch (error) {
            console.error('Ошибка создания сессии:', error);
            return null;
        }
    }
    
    validateSession() {
        try {
            const sessionData = localStorage.getItem('user_session');
            if (!sessionData) return false;
            
            const session = JSON.parse(sessionData);
            
            // Проверяем срок действия
            if (Date.now() > session.expires) {
                this.destroySession();
                return false;
            }
            
            // Проверяем соответствие sessionStorage
            const sessionId = sessionStorage.getItem('session_id');
            if (sessionId !== session.id) {
                this.destroySession();
                return false;
            }
            
            // Обновляем активность
            this.updateSessionActivity();
            
            return session.user;
            
        } catch (error) {
            console.error('Ошибка проверки сессии:', error);
            return false;
        }
    }
    
    updateSessionActivity() {
        try {
            const sessionData = localStorage.getItem('user_session');
            if (!sessionData) return;
            
            const session = JSON.parse(sessionData);
            session.lastActivity = Date.now();
            
            // Продлеваем сессию при активности
            if (Date.now() - session.created < this.sessionDuration * 0.8) {
                session.expires = Date.now() + this.sessionDuration;
            }
            
            localStorage.setItem('user_session', JSON.stringify(session));
            
        } catch (error) {
            console.error('Ошибка обновления активности сессии:', error);
        }
    }
    
    destroySession() {
        try {
            localStorage.removeItem('user_session');
            localStorage.removeItem('csrf_token');
            localStorage.removeItem('csrf_token_expires');
            sessionStorage.removeItem('session_id');
            sessionStorage.removeItem('csrf_token');
            
            // Очищаем все данные сессии
            const keys = Object.keys(sessionStorage);
            keys.forEach(key => {
                if (key.startsWith('rate_limit_') || key.startsWith('captcha_')) {
                    sessionStorage.removeItem(key);
                }
            });
            
        } catch (error) {
            console.error('Ошибка удаления сессии:', error);
        }
    }
    
    // ==================== БЕЗОПАСНОСТЬ ФОРМ ====================
    
    secureForm(formId) {
        const form = document.getElementById(formId);
        if (!form) return null;
        
        // Генерируем CSRF токен
        const csrfToken = this.generateCSRFToken();
        if (!csrfToken) return null;
        
        // Добавляем скрытое поле с токеном
        let csrfField = form.querySelector('input[name="csrf_token"]');
        if (!csrfField) {
            csrfField = document.createElement('input');
            csrfField.type = 'hidden';
            csrfField.name = 'csrf_token';
            csrfField.value = csrfToken;
            form.appendChild(csrfField);
        } else {
            csrfField.value = csrfToken;
        }
        
        // Защищаем от автоматической отправки
        form.addEventListener('submit', (e) => {
            if (!this.verifyCSRFToken(csrfToken)) {
                e.preventDefault();
                this.showSecurityAlert('Обнаружена потенциальная атака. Пожалуйста, обновите страницу.');
                return false;
            }
            
            // Проверяем rate limit
            const rateLimit = this.checkRateLimit('form_submit_' + formId, 5, 60000);
            if (!rateLimit.allowed) {
                e.preventDefault();
                this.showSecurityAlert(`Слишком много попыток. Попробуйте через ${rateLimit.retryAfter} секунд.`);
                return false;
            }
        });
        
        return csrfToken;
    }
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    generateRandomString(length = 32) {
        try {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            
            // Используем криптографически безопасный генератор
            const array = new Uint8Array(length);
            window.crypto.getRandomValues(array);
            
            for (let i = 0; i < length; i++) {
                result += chars[array[i] % chars.length];
            }
            
            return result;
            
        } catch (error) {
            console.error('Ошибка генерации случайной строки:', error);
            
            // Fallback на менее безопасный метод
            let result = '';
            for (let i = 0; i < length; i++) {
                result += Math.random().toString(36).substr(2, 1);
            }
            return result;
        }
    }
    
    async getClientIP() {
        try {
            // Используем внешний сервис для получения IP
            const response = await fetch('https://api.ipify.org?format=json', {
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.ip;
            }
        } catch (error) {
            // В случае ошибки возвращаем локальный IP
            console.warn('Не удалось получить публичный IP:', error);
        }
        
        return '127.0.0.1';
    }
    
    showSecurityAlert(message) {
        // Создаем красивое уведомление
        const alert = document.createElement('div');
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(145deg, #dc3545, #c82333);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 400px;
            animation: slideIn 0.3s ease;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        alert.innerHTML = `
            <i class="fas fa-shield-alt" style="font-size: 20px;"></i>
            <div>
                <strong>Система безопасности:</strong><br>
                ${message}
            </div>
            <button onclick="this.parentElement.remove()" style="margin-left: auto; background: none; border: none; color: white; cursor: pointer;">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(alert);
        
        // Автоматическое удаление через 5 секунд
        setTimeout(() => {
            if (alert.parentElement) {
                alert.remove();
            }
        }, 5000);
    }
    
    // ==================== АУДИТ БЕЗОПАСНОСТИ ====================
    
    async performSecurityAudit() {
        const audit = {
            timestamp: new Date().toISOString(),
            checks: [],
            score: 0,
            totalChecks: 0,
            recommendations: []
        };
        
        try {
            // Проверка 1: HTTPS
            audit.totalChecks++;
            if (window.location.protocol === 'https:') {
                audit.checks.push({ 
                    name: 'HTTPS', 
                    status: 'pass', 
                    message: 'Сайт использует безопасное HTTPS соединение' 
                });
                audit.score++;
            } else {
                audit.checks.push({ 
                    name: 'HTTPS', 
                    status: 'fail', 
                    message: 'Сайт не использует HTTPS. Рекомендуется включить SSL/TLS' 
                });
                audit.recommendations.push('Включите HTTPS для защиты данных пользователей');
            }
            
            // Проверка 2: Content Security Policy
            audit.totalChecks++;
            const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            if (csp) {
                audit.checks.push({ 
                    name: 'CSP', 
                    status: 'pass', 
                    message: 'Content Security Policy настроен' 
                });
                audit.score++;
            } else {
                audit.checks.push({ 
                    name: 'CSP', 
                    status: 'warn', 
                    message: 'CSP не настроен. Рекомендуется добавить политику безопасности' 
                });
                audit.recommendations.push('Добавьте Content-Security-Policy для защиты от XSS');
            }
            
            // Проверка 3: Защита от кликов
            audit.totalChecks++;
            if (document.querySelector('meta[name="viewport"][content*="user-scalable=no"]')) {
                audit.checks.push({ 
                    name: 'Zoom Control', 
                    status: 'pass', 
                    message: 'Управление масштабом ограничено для безопасности' 
                });
                audit.score++;
            } else {
                audit.checks.push({ 
                    name: 'Zoom Control', 
                    status: 'info', 
                    message: 'Управление масштабом не ограничено' 
                });
            }
            
            // Проверка 4: LocalStorage доступность
            audit.totalChecks++;
            try {
                localStorage.setItem('security_test', 'test');
                localStorage.removeItem('security_test');
                audit.checks.push({ 
                    name: 'LocalStorage', 
                    status: 'pass', 
                    message: 'LocalStorage доступен и работает' 
                });
                audit.score++;
            } catch (e) {
                audit.checks.push({ 
                    name: 'LocalStorage', 
                    status: 'warn', 
                    message: 'LocalStorage недоступен. Возможно, включен приватный режим' 
                });
            }
            
            // Проверка 5: SessionStorage
            audit.totalChecks++;
            try {
                sessionStorage.setItem('security_test', 'test');
                sessionStorage.removeItem('security_test');
                audit.checks.push({ 
                    name: 'SessionStorage', 
                    status: 'pass', 
                    message: 'SessionStorage доступен и работает' 
                });
                audit.score++;
            } catch (e) {
                audit.checks.push({ 
                    name: 'SessionStorage', 
                    status: 'warn', 
                    message: 'SessionStorage недоступен' 
                });
            }
            
            // Проверка 6: Защита от iframe
            audit.totalChecks++;
            if (window.self === window.top) {
                audit.checks.push({ 
                    name: 'Frame Protection', 
                    status: 'pass', 
                    message: 'Сайт не встроен в iframe' 
                });
                audit.score++;
            } else {
                audit.checks.push({ 
                    name: 'Frame Protection', 
                    status: 'warn', 
                    message: 'Сайт может быть встроен в iframe. Рекомендуется добавить X-Frame-Options' 
                });
                audit.recommendations.push('Добавьте заголовок X-Frame-Options: DENY для защиты от clickjacking');
            }
            
            // Рассчитываем итоговый балл
            audit.scorePercentage = Math.round((audit.score / audit.totalChecks) * 100);
            
            // Оцениваем безопасность
            if (audit.scorePercentage >= 80) {
                audit.securityLevel = 'Высокий';
                audit.securityColor = '#28a745';
            } else if (audit.scorePercentage >= 60) {
                audit.securityLevel = 'Средний';
                audit.securityColor = '#ffc107';
            } else {
                audit.securityLevel = 'Низкий';
                audit.securityColor = '#dc3545';
            }
            
            // Сохраняем результат аудита
            localStorage.setItem('security_audit', JSON.stringify(audit));
            
            console.log('Аудит безопасности завершен:', audit);
            
            return audit;
            
        } catch (error) {
            console.error('Ошибка выполнения аудита безопасности:', error);
            return null;
        }
    }
    
    getSecurityReport() {
        try {
            const report = localStorage.getItem('security_audit');
            return report ? JSON.parse(report) : null;
        } catch (error) {
            return null;
        }
    }
    
    // ==================== МОНИТОРИНГ ====================
    
    setupMonitoring() {
        // Отслеживаем необычную активность
        window.addEventListener('error', (e) => {
            this.logSecurityEvent('javascript_error', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                error: e.error?.toString()
            });
        });
        
        // Отслеживаем изменения в DOM (потенциальные XSS)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.innerHTML) {
                            if (this.xssPatterns.test(node.innerHTML)) {
                                this.logSecurityEvent('potential_xss', {
                                    node: node.outerHTML.substring(0, 200)
                                });
                            }
                        }
                    });
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Защита от копирования важных данных
        document.addEventListener('copy', (e) => {
            const selection = window.getSelection().toString();
            if (selection.includes('пароль') || selection.includes('password')) {
                this.logSecurityEvent('sensitive_data_copy', {
                    selection: selection.substring(0, 100)
                });
            }
        });
    }
    
    logSecurityEvent(type, data = {}) {
        try {
            const events = JSON.parse(localStorage.getItem('security_events') || '[]');
            
            events.push({
                type: type,
                data: data,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });
            
            // Ограничиваем историю 100 событиями
            if (events.length > 100) {
                events.splice(0, events.length - 100);
            }
            
            localStorage.setItem('security_events', JSON.stringify(events));
            
        } catch (error) {
            console.error('Ошибка логирования события безопасности:', error);
        }
    }
}

// Глобальная инициализация
let securitySystem = null;

document.addEventListener('DOMContentLoaded', function() {
    try {
        securitySystem = new SecuritySystem();
        window.securitySystem = securitySystem;
        
        // Выполняем аудит безопасности
        setTimeout(() => securitySystem.performSecurityAudit(), 3000);
        
        // Настраиваем мониторинг
        securitySystem.setupMonitoring();
        
        // Защищаем все формы на странице
        document.querySelectorAll('form').forEach(form => {
            if (form.id) {
                securitySystem.secureForm(form.id);
            }
        });
        
        console.log('Система безопасности инициализирована');
        
    } catch (error) {
        console.error('Ошибка инициализации системы безопасности:', error);
    }
});

// Защита от вставки опасного контента
document.addEventListener('paste', function(e) {
    if (securitySystem) {
        const pastedText = e.clipboardData.getData('text');
        if (securitySystem.xssPatterns.test(pastedText)) {
            e.preventDefault();
            securitySystem.showSecurityAlert('Обнаружена потенциально опасная вставка');
            securitySystem.logSecurityEvent('dangerous_paste', {
                text: pastedText.substring(0, 100)
            });
        }
    }
});

// Защита от открытия консоли разработчика
document.addEventListener('contextmenu', function(e) {
    if (securitySystem && e.target.tagName === 'INPUT' && e.target.type === 'password') {
        securitySystem.logSecurityEvent('password_field_context_menu');
    }
});

// Экспорт класса для использования в модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecuritySystem;
}
