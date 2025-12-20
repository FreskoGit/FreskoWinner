// counter-system.js - Универсальная система счетчиков

class CounterSystem {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.localStoragePrefix = 'fresko_counter_';
        this.sessionPrefix = 'counter_visited_';
        this.fallbackEnabled = true;
        this.initialized = false;
        this.pendingIncrements = [];
    }

    async initialize() {
        try {
            // Проверяем подключение к базе данных
            const { data, error } = await this.supabase
                .from('page_counters')
                .select('count')
                .limit(1);
            
            if (!error) {
                console.log('Система счетчиков подключена к базе данных');
                this.fallbackEnabled = false;
            } else {
                console.warn('Используется локальное хранение счетчиков');
                this.fallbackEnabled = true;
            }
            
            this.initialized = true;
            
            // Обрабатываем ожидающие инкременты
            if (this.pendingIncrements.length > 0) {
                for (const increment of this.pendingIncrements) {
                    await this.incrementCounter(increment.counterId, increment.options);
                }
                this.pendingIncrements = [];
            }
            
        } catch (error) {
            console.error('Ошибка инициализации системы счетчиков:', error);
            this.fallbackEnabled = true;
            this.initialized = true;
        }
    }

    async incrementCounter(counterId, options = {}) {
        if (!this.initialized) {
            this.pendingIncrements.push({ counterId, options });
            return this.incrementLocal(counterId, options);
        }

        try {
            // Проверяем, был ли уже учтен этот пользователь в этой сессии
            const sessionKey = `${this.sessionPrefix}${counterId}`;
            if (sessionStorage.getItem(sessionKey)) {
                console.log(`Счетчик ${counterId} уже увеличивался в этой сессии`);
                return await this.getCounterValue(counterId);
            }

            let newCount = 1;

            if (!this.fallbackEnabled) {
                // Используем базу данных
                const { data, error } = await this.supabase
                    .from('page_counters')
                    .select('count')
                    .eq('id', counterId)
                    .single();

                if (error || !data) {
                    // Создаем новый счетчик
                    await this.supabase
                        .from('page_counters')
                        .insert({
                            id: counterId,
                            page_name: options.pageName || counterId,
                            count: 1,
                            last_updated: new Date().toISOString()
                        });
                } else {
                    newCount = data.count + 1;
                    await this.supabase
                        .from('page_counters')
                        .update({
                            count: newCount,
                            last_updated: new Date().toISOString()
                        })
                        .eq('id', counterId);
                }
            }

            // Всегда обновляем локальное хранилище
            const localCount = this.incrementLocal(counterId, options);
            newCount = Math.max(newCount, localCount);

            // Отмечаем, что пользователь уже был учтен
            sessionStorage.setItem(sessionKey, 'true');

            // Сохраняем в историю
            await this.saveToHistory(counterId, options);

            return newCount;

        } catch (error) {
            console.error('Ошибка увеличения счетчика:', error);
            return this.incrementLocal(counterId, options);
        }
    }

    incrementLocal(counterId, options = {}) {
        const key = `${this.localStoragePrefix}${counterId}`;
        let count = parseInt(localStorage.getItem(key)) || 0;
        count++;
        localStorage.setItem(key, count.toString());
        
        // Сохраняем дополнительную информацию
        const details = {
            lastIncrement: new Date().toISOString(),
            userAgent: navigator.userAgent,
            referrer: document.referrer,
            ...options
        };
        localStorage.setItem(`${key}_details`, JSON.stringify(details));
        
        return count;
    }

    async getCounterValue(counterId) {
        try {
            if (!this.fallbackEnabled && this.initialized) {
                const { data, error } = await this.supabase
                    .from('page_counters')
                    .select('count')
                    .eq('id', counterId)
                    .single();

                if (!error && data) {
                    const localCount = parseInt(localStorage.getItem(`${this.localStoragePrefix}${counterId}`)) || 0;
                    return Math.max(data.count, localCount);
                }
            }
        } catch (error) {
            console.error('Ошибка получения счетчика из базы:', error);
        }

        // Используем локальное значение
        return parseInt(localStorage.getItem(`${this.localStoragePrefix}${counterId}`)) || 0;
    }

    async saveToHistory(counterId, options = {}) {
        try {
            const historyKey = `${this.localStoragePrefix}${counterId}_history`;
            let history = JSON.parse(localStorage.getItem(historyKey)) || [];
            
            history.push({
                timestamp: new Date().toISOString(),
                counterId,
                userAgent: navigator.userAgent,
                referrer: document.referrer,
                ...options
            });
            
            // Ограничиваем историю последними 100 записями
            if (history.length > 100) {
                history = history.slice(-100);
            }
            
            localStorage.setItem(historyKey, JSON.stringify(history));
            
        } catch (error) {
            console.error('Ошибка сохранения истории:', error);
        }
    }

    async getClickCounter(buttonId) {
        try {
            if (!this.fallbackEnabled) {
                const { data, error } = await this.supabase
                    .from('click_counters')
                    .select('click_count')
                    .eq('id', buttonId)
                    .single();

                if (!error && data) {
                    const localCount = parseInt(localStorage.getItem(`${this.localStoragePrefix}click_${buttonId}`)) || 0;
                    return Math.max(data.click_count, localCount);
                }
            }
        } catch (error) {
            console.error('Ошибка получения счетчика кликов:', error);
        }

        return parseInt(localStorage.getItem(`${this.localStoragePrefix}click_${buttonId}`)) || 0;
    }

    async incrementClickCounter(buttonId, url, buttonText = '') {
        try {
            let newCount = 1;

            if (!this.fallbackEnabled) {
                const { data, error } = await this.supabase
                    .from('click_counters')
                    .select('click_count')
                    .eq('id', buttonId)
                    .single();

                if (error || !data) {
                    await this.supabase
                        .from('click_counters')
                        .insert({
                            id: buttonId,
                            name: buttonText || buttonId,
                            url: url,
                            click_count: 1,
                            last_click: new Date().toISOString()
                        });
                } else {
                    newCount = data.click_count + 1;
                    await this.supabase
                        .from('click_counters')
                        .update({
                            click_count: newCount,
                            last_click: new Date().toISOString()
                        })
                        .eq('id', buttonId);
                }
            }

            // Локальное увеличение
            const key = `${this.localStoragePrefix}click_${buttonId}`;
            let localCount = parseInt(localStorage.getItem(key)) || 0;
            localCount++;
            localStorage.setItem(key, localCount.toString());
            
            newCount = Math.max(newCount, localCount);
            
            // Сохраняем детали клика
            const clickDetails = {
                timestamp: new Date().toISOString(),
                buttonId,
                url,
                buttonText,
                userAgent: navigator.userAgent
            };
            
            const historyKey = `${this.localStoragePrefix}click_${buttonId}_history`;
            let history = JSON.parse(localStorage.getItem(historyKey)) || [];
            history.push(clickDetails);
            
            if (history.length > 50) {
                history = history.slice(-50);
            }
            
            localStorage.setItem(historyKey, JSON.stringify(history));
            
            return newCount;

        } catch (error) {
            console.error('Ошибка увеличения счетчика кликов:', error);
            return this.incrementClickLocal(buttonId);
        }
    }

    incrementClickLocal(buttonId) {
        const key = `${this.localStoragePrefix}click_${buttonId}`;
        let count = parseInt(localStorage.getItem(key)) || 0;
        count++;
        localStorage.setItem(key, count.toString());
        return count;
    }

    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    displayCounter(elementId, value) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.innerHTML = '';
        
        const formattedValue = this.formatNumber(value);
        const digits = formattedValue.split('');
        
        // Добавляем ведущие нули если нужно
        while (digits.length < 6) {
            digits.unshift('0');
        }
        
        digits.forEach((digit, index) => {
            const digitElement = document.createElement('div');
            digitElement.className = 'counter-digit';
            digitElement.textContent = digit;
            
            // Анимация появления
            setTimeout(() => {
                digitElement.classList.add('new-digit');
                setTimeout(() => {
                    digitElement.classList.remove('new-digit');
                }, 300);
            }, index * 100);
            
            element.appendChild(digitElement);
        });
    }

    async displayAllCounters() {
        // Пример использования на странице
        const counters = [
            { elementId: 'mainCounter', counterId: 'main_page_visits' },
            { elementId: 'channelsCounter', counterId: 'channels_page_visits' },
            { elementId: 'projectsCounter', counterId: 'projects_page_visits' }
        ];

        for (const counter of counters) {
            const value = await this.getCounterValue(counter.counterId);
            this.displayCounter(counter.elementId, value);
        }
    }

    async syncWithDatabase() {
        if (this.fallbackEnabled) return false;

        try {
            // Синхронизируем все локальные счетчики с базой данных
            const allKeys = Object.keys(localStorage);
            const counterKeys = allKeys.filter(key => key.startsWith(this.localStoragePrefix));
            
            for (const key of counterKeys) {
                if (key.includes('_history') || key.includes('_details') || key.includes('click_')) {
                    continue;
                }
                
                const counterId = key.replace(this.localStoragePrefix, '');
                const localCount = parseInt(localStorage.getItem(key));
                
                if (isNaN(localCount)) continue;
                
                const { data, error } = await this.supabase
                    .from('page_counters')
                    .select('count')
                    .eq('id', counterId)
                    .single();
                
                if (error || !data) {
                    await this.supabase
                        .from('page_counters')
                        .insert({
                            id: counterId,
                            page_name: counterId,
                            count: localCount
                        });
                } else if (localCount > data.count) {
                    await this.supabase
                        .from('page_counters')
                        .update({ count: localCount })
                        .eq('id', counterId);
                }
            }
            
            console.log('Синхронизация счетчиков завершена');
            return true;
            
        } catch (error) {
            console.error('Ошибка синхронизации счетчиков:', error);
            return false;
        }
    }
}

// Глобальный экземпляр
let counterSystem = null;

// Инициализация системы
async function initCounterSystem(supabaseClient) {
    counterSystem = new CounterSystem(supabaseClient);
    await counterSystem.initialize();
    
    // Автоматическая синхронизация при загрузке
    window.addEventListener('load', () => {
        setTimeout(() => counterSystem.syncWithDatabase(), 5000);
    });
    
    // Синхронизация при видимости страницы
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            counterSystem.syncWithDatabase();
        }
    });
    
    return counterSystem;
}

// Экспорт для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CounterSystem, initCounterSystem };
} else {
    window.CounterSystem = CounterSystem;
    window.initCounterSystem = initCounterSystem;
}