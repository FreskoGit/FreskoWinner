// admin-functions.js - Расширенные функции для админ-панели

class AdminFunctions {
    constructor(supabaseClient, currentUser) {
        this.supabase = supabaseClient;
        this.currentUser = currentUser;
        this.uploadUrl = 'https://api.supabase.com/storage/v1/object'; // Пример URL для загрузки
    }

    // ==================== УПРАВЛЕНИЕ КЕЙСАМИ ====================
    
    async createCase(caseData) {
        try {
            const { data, error } = await this.supabase
                .from('cases')
                .insert({
                    name: caseData.name,
                    description: caseData.description,
                    price: caseData.price,
                    order_index: caseData.order || 1,
                    is_active: caseData.is_active !== false,
                    image_url: caseData.image_url || '',
                    items: caseData.items || [],
                    created_by: this.currentUser.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (error) throw error;
            
            // Логирование действия
            await this.logAdminAction('case_created', {
                case_id: data.id,
                case_name: data.name,
                price: data.price
            });
            
            return { success: true, data };
            
        } catch (error) {
            console.error('Ошибка создания кейса:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateCase(caseId, updates) {
        try {
            updates.updated_at = new Date().toISOString();
            
            const { data, error } = await this.supabase
                .from('cases')
                .update(updates)
                .eq('id', caseId)
                .select()
                .single();
            
            if (error) throw error;
            
            await this.logAdminAction('case_updated', {
                case_id: caseId,
                updates: Object.keys(updates)
            });
            
            return { success: true, data };
            
        } catch (error) {
            console.error('Ошибка обновления кейса:', error);
            return { success: false, error: error.message };
        }
    }
    
    async deleteCase(caseId) {
        try {
            // Получаем информацию о кейсе перед удалением
            const { data: caseData } = await this.supabase
                .from('cases')
                .select('name')
                .eq('id', caseId)
                .single();
            
            const { error } = await this.supabase
                .from('cases')
                .delete()
                .eq('id', caseId);
            
            if (error) throw error;
            
            await this.logAdminAction('case_deleted', {
                case_id: caseId,
                case_name: caseData?.name || 'Неизвестно'
            });
            
            return { success: true };
            
        } catch (error) {
            console.error('Ошибка удаления кейса:', error);
            return { success: false, error: error.message };
        }
    }
    
    async toggleCaseActive(caseId, newState) {
        return this.updateCase(caseId, { is_active: newState });
    }
    
    // ==================== УПРАВЛЕНИЕ РОЗЫГРЫШАМИ ====================
    
    async createGiveaway(giveawayData) {
        try {
            // Проверяем дату окончания
            const endDate = new Date(giveawayData.end_date);
            if (endDate <= new Date()) {
                throw new Error('Дата окончания должна быть в будущем');
            }
            
            const { data, error } = await this.supabase
                .from('giveaways')
                .insert({
                    title: giveawayData.title,
                    description: giveawayData.description,
                    prize: giveawayData.prize,
                    winners_count: giveawayData.winners_count || 1,
                    max_participants: giveawayData.max_participants || null,
                    end_date: giveawayData.end_date,
                    is_active: giveawayData.is_active !== false,
                    image_url: giveawayData.image_url || '',
                    created_by: this.currentUser.id,
                    participants_count: 0,
                    is_finished: false
                })
                .select()
                .single();
            
            if (error) throw error;
            
            await this.logAdminAction('giveaway_created', {
                giveaway_id: data.id,
                title: data.title,
                prize: data.prize
            });
            
            // Запускаем проверку окончания розыгрыша
            this.scheduleGiveawayCheck(data.id, endDate);
            
            return { success: true, data };
            
        } catch (error) {
            console.error('Ошибка создания розыгрыша:', error);
            return { success: false, error: error.message };
        }
    }
    
    scheduleGiveawayCheck(giveawayId, endDate) {
        const now = new Date();
        const timeUntilEnd = endDate - now;
        
        if (timeUntilEnd > 0) {
            setTimeout(async () => {
                await this.finishGiveaway(giveawayId);
            }, timeUntilEnd);
            
            console.log(`Проверка розыгрыша ${giveawayId} запланирована через ${timeUntilEnd/1000} секунд`);
        }
    }
    
    async finishGiveaway(giveawayId) {
        try {
            // Получаем информацию о розыгрыше
            const { data: giveaway, error: giveawayError } = await this.supabase
                .from('giveaways')
                .select('*')
                .eq('id', giveawayId)
                .single();
            
            if (giveawayError) throw giveawayError;
            
            if (giveaway.is_finished) {
                return { success: true, message: 'Розыгрыш уже завершен' };
            }
            
            // Выбираем победителей
            const winnersResult = await this.selectWinners(giveawayId);
            
            // Обновляем статус розыгрыша
            const { error: updateError } = await this.supabase
                .from('giveaways')
                .update({
                    is_finished: true,
                    finished_at: new Date().toISOString()
                })
                .eq('id', giveawayId);
            
            if (updateError) throw updateError;
            
            await this.logAdminAction('giveaway_finished', {
                giveaway_id: giveawayId,
                winners_count: winnersResult.winners.length
            });
            
            // Отправляем уведомления победителям
            await this.notifyWinners(giveawayId, winnersResult.winners);
            
            return { 
                success: true, 
                message: `Розыгрыш завершен. Выбрано ${winnersResult.winners.length} победителей`,
                winners: winnersResult.winners 
            };
            
        } catch (error) {
            console.error('Ошибка завершения розыгрыша:', error);
            return { success: false, error: error.message };
        }
    }
    
    async selectWinners(giveawayId) {
        try {
            // Получаем информацию о розыгрыше
            const { data: giveaway, error: giveawayError } = await this.supabase
                .from('giveaways')
                .select('winners_count')
                .eq('id', giveawayId)
                .single();
            
            if (giveawayError) throw giveawayError;
            
            // Получаем участников
            const { data: participants, error: partError } = await this.supabase
                .from('giveaway_participants')
                .select('user_id, users(username, telegram_tag)')
                .eq('giveaway_id', giveawayId);
            
            if (partError) throw partError;
            
            if (!participants || participants.length === 0) {
                return { success: true, winners: [], message: 'Нет участников' };
            }
            
            // Выбираем случайных победителей
            const winners = [];
            const participantIds = participants.map(p => p.user_id);
            const winnersCount = Math.min(giveaway.winners_count, participantIds.length);
            
            // Используем криптографически безопасный генератор случайных чисел
            const cryptoRandom = () => {
                const array = new Uint32Array(1);
                window.crypto.getRandomValues(array);
                return array[0] / (0xFFFFFFFF + 1);
            };
            
            for (let i = 0; i < winnersCount; i++) {
                const randomIndex = Math.floor(cryptoRandom() * participantIds.length);
                const winnerId = participantIds[randomIndex];
                
                // Получаем данные победителя
                const winnerParticipant = participants.find(p => p.user_id === winnerId);
                
                winners.push({
                    user_id: winnerId,
                    username: winnerParticipant.users?.username,
                    telegram_tag: winnerParticipant.users?.telegram_tag
                });
                
                // Удаляем выбранного участника из списка
                participantIds.splice(randomIndex, 1);
            }
            
            // Сохраняем победителей в базе данных
            for (const winner of winners) {
                const { error: winnerError } = await this.supabase
                    .from('giveaway_winners')
                    .insert({
                        giveaway_id: giveawayId,
                        user_id: winner.user_id,
                        won_at: new Date().toISOString()
                    });
                
                if (winnerError) {
                    console.error('Ошибка сохранения победителя:', winnerError);
                }
            }
            
            return { success: true, winners };
            
        } catch (error) {
            console.error('Ошибка выбора победителей:', error);
            return { success: false, error: error.message };
        }
    }
    
    async notifyWinners(giveawayId, winners) {
        // Здесь можно реализовать отправку уведомлений через Telegram бота или email
        console.log(`Уведомления победителям розыгрыша ${giveawayId}:`, winners);
        
        // Пример отправки через Telegram (нужно настроить бота)
        // for (const winner of winners) {
        //     if (winner.telegram_tag) {
        //         await this.sendTelegramNotification(winner.telegram_tag, `🎉 Поздравляем! Вы выиграли в розыгрыше!`);
        //     }
        // }
    }
    
    // ==================== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ====================
    
    async searchUsers(searchTerm, limit = 50, offset = 0) {
        try {
            let query = this.supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            
            if (searchTerm) {
                query = query.or(`username.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,telegram_tag.ilike.%${searchTerm}%`);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            return { success: true, data };
            
        } catch (error) {
            console.error('Ошибка поиска пользователей:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateUser(userId, updates) {
        try {
            // Проверяем права доступа
            if (this.currentUser.id === userId && updates.role && updates.role !== this.currentUser.role) {
                return { success: false, error: 'Нельзя изменить свою собственную роль' };
            }
            
            updates.updated_at = new Date().toISOString();
            
            const { data, error } = await this.supabase
                .from('users')
                .update(updates)
                .eq('id', userId)
                .select()
                .single();
            
            if (error) throw error;
            
            await this.logAdminAction('user_updated', {
                user_id: userId,
                updated_fields: Object.keys(updates)
            });
            
            return { success: true, data };
            
        } catch (error) {
            console.error('Ошибка обновления пользователя:', error);
            return { success: false, error: error.message };
        }
    }
    
    async deleteUser(userId) {
        try {
            // Нельзя удалить себя
            if (this.currentUser.id === userId) {
                return { success: false, error: 'Нельзя удалить свой собственный аккаунт' };
            }
            
            // Получаем информацию о пользователе перед удалением
            const { data: userData } = await this.supabase
                .from('users')
                .select('username, role')
                .eq('id', userId)
                .single();
            
            // Нельзя удалить админов (если вы не суперадмин)
            if (userData?.role === 'admin' && this.currentUser.role !== 'superadmin') {
                return { success: false, error: 'Нельзя удалить администратора' };
            }
            
            const { error } = await this.supabase
                .from('users')
                .delete()
                .eq('id', userId);
            
            if (error) throw error;
            
            await this.logAdminAction('user_deleted', {
                user_id: userId,
                username: userData?.username || 'Неизвестно'
            });
            
            return { success: true };
            
        } catch (error) {
            console.error('Ошибка удаления пользователя:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateUserBalance(userId, amount, description = '') {
        try {
            // Получаем текущий баланс
            const { data: user, error: userError } = await this.supabase
                .from('users')
                .select('balance')
                .eq('id', userId)
                .single();
            
            if (userError) throw userError;
            
            const newBalance = (user.balance || 0) + amount;
            
            // Обновляем баланс
            const { error: updateError } = await this.supabase
                .from('users')
                .update({ 
                    balance: newBalance,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (updateError) throw updateError;
            
            // Записываем в историю транзакций
            await this.supabase
                .from('transactions')
                .insert({
                    user_id: userId,
                    type: amount > 0 ? 'deposit' : 'withdrawal',
                    amount: Math.abs(amount),
                    description: description || `Баланс изменен администратором ${this.currentUser.username}`,
                    admin_id: this.currentUser.id,
                    created_at: new Date().toISOString()
                });
            
            await this.logAdminAction('balance_updated', {
                user_id: userId,
                amount: amount,
                new_balance: newBalance
            });
            
            return { success: true, newBalance };
            
        } catch (error) {
            console.error('Ошибка обновления баланса:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ==================== СИСТЕМНЫЕ НАСТРОЙКИ ====================
    
    async getSystemSettings() {
        try {
            const { data, error } = await this.supabase
                .from('system_settings')
                .select('*');
            
            if (error) throw error;
            
            // Преобразуем массив в объект
            const settings = {};
            data.forEach(setting => {
                settings[setting.id] = {
                    value: setting.value,
                    name: setting.name,
                    type: setting.type
                };
            });
            
            return { success: true, settings };
            
        } catch (error) {
            console.error('Ошибка получения настроек:', error);
            return { success: false, error: error.message };
        }
    }
    
    async saveSystemSettings(settings) {
        try {
            const updates = [];
            
            for (const [key, value] of Object.entries(settings)) {
                updates.push({
                    id: key,
                    name: key,
                    value: typeof value === 'boolean' ? value.toString() : value,
                    type: typeof value,
                    updated_at: new Date().toISOString(),
                    updated_by: this.currentUser.id
                });
            }
            
            const { error } = await this.supabase
                .from('system_settings')
                .upsert(updates);
            
            if (error) throw error;
            
            await this.logAdminAction('settings_updated', {
                updated_settings: Object.keys(settings)
            });
            
            return { success: true };
            
        } catch (error) {
            console.error('Ошибка сохранения настроек:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ==================== СТАТИСТИКА И ОТЧЕТЫ ====================
    
    async getSystemStats(timeRange = 'day') {
        try {
            const now = new Date();
            let startDate = new Date();
            
            switch (timeRange) {
                case 'hour':
                    startDate.setHours(now.getHours() - 1);
                    break;
                case 'day':
                    startDate.setDate(now.getDate() - 1);
                    break;
                case 'week':
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                default:
                    startDate.setDate(now.getDate() - 1);
            }
            
            // Получаем статистику пользователей
            const { data: usersStats, error: usersError } = await this.supabase
                .from('users')
                .select('created_at, role')
                .gte('created_at', startDate.toISOString());
            
            if (usersError) throw usersError;
            
            // Получаем статистику покупок
            const { data: purchasesStats, error: purchasesError } = await this.supabase
                .from('case_purchases')
                .select('amount, purchased_at')
                .gte('purchased_at', startDate.toISOString());
            
            if (purchasesError) throw purchasesError;
            
            // Получаем статистику розыгрышей
            const { data: giveawaysStats, error: giveawaysError } = await this.supabase
                .from('giveaways')
                .select('created_at, participants_count')
                .gte('created_at', startDate.toISOString());
            
            if (giveawaysError) throw giveawaysError;
            
            // Анализируем данные
            const stats = {
                time_range: timeRange,
                start_date: startDate.toISOString(),
                end_date: now.toISOString(),
                
                users: {
                    total: usersStats.length,
                    new: usersStats.filter(u => u.role === 'user').length,
                    admins: usersStats.filter(u => u.role === 'admin').length,
                    growth_percentage: await this.calculateGrowth('users', timeRange)
                },
                
                revenue: {
                    total: purchasesStats.reduce((sum, p) => sum + (p.amount || 0), 0),
                    transactions: purchasesStats.length,
                    average_transaction: purchasesStats.length > 0 
                        ? purchasesStats.reduce((sum, p) => sum + (p.amount || 0), 0) / purchasesStats.length 
                        : 0,
                    growth_percentage: await this.calculateGrowth('revenue', timeRange)
                },
                
                giveaways: {
                    total: giveawaysStats.length,
                    participants: giveawaysStats.reduce((sum, g) => sum + (g.participants_count || 0), 0),
                    average_participants: giveawaysStats.length > 0 
                        ? giveawaysStats.reduce((sum, g) => sum + (g.participants_count || 0), 0) / giveawaysStats.length 
                        : 0
                },
                
                popular_items: await this.getPopularItems(timeRange)
            };
            
            return { success: true, stats };
            
        } catch (error) {
            console.error('Ошибка получения статистики:', error);
            return { success: false, error: error.message };
        }
    }
    
    async calculateGrowth(metric, timeRange) {
        // Простая реализация расчета роста
        try {
            const now = new Date();
            let currentPeriodStart = new Date();
            let previousPeriodStart = new Date();
            let previousPeriodEnd = new Date();
            
            // Настраиваем даты в зависимости от временного диапазона
            switch (timeRange) {
                case 'day':
                    currentPeriodStart.setDate(now.getDate() - 1);
                    previousPeriodStart.setDate(now.getDate() - 2);
                    previousPeriodEnd.setDate(now.getDate() - 1);
                    break;
                case 'week':
                    currentPeriodStart.setDate(now.getDate() - 7);
                    previousPeriodStart.setDate(now.getDate() - 14);
                    previousPeriodEnd.setDate(now.getDate() - 7);
                    break;
                default:
                    return 0;
            }
            
            // Получаем данные для текущего периода
            let currentValue = 0;
            let previousValue = 0;
            
            if (metric === 'users') {
                const { data: currentUsers } = await this.supabase
                    .from('users')
                    .select('id')
                    .gte('created_at', currentPeriodStart.toISOString())
                    .lt('created_at', now.toISOString());
                
                const { data: previousUsers } = await this.supabase
                    .from('users')
                    .select('id')
                    .gte('created_at', previousPeriodStart.toISOString())
                    .lt('created_at', previousPeriodEnd.toISOString());
                
                currentValue = currentUsers?.length || 0;
                previousValue = previousUsers?.length || 0;
                
            } else if (metric === 'revenue') {
                const { data: currentPurchases } = await this.supabase
                    .from('case_purchases')
                    .select('amount')
                    .gte('purchased_at', currentPeriodStart.toISOString())
                    .lt('purchased_at', now.toISOString());
                
                const { data: previousPurchases } = await this.supabase
                    .from('case_purchases')
                    .select('amount')
                    .gte('purchased_at', previousPeriodStart.toISOString())
                    .lt('purchased_at', previousPeriodEnd.toISOString());
                
                currentValue = currentPurchases?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
                previousValue = previousPurchases?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
            }
            
            // Рассчитываем процент роста
            if (previousValue === 0) {
                return currentValue > 0 ? 100 : 0;
            }
            
            return ((currentValue - previousValue) / previousValue) * 100;
            
        } catch (error) {
            console.error('Ошибка расчета роста:', error);
            return 0;
        }
    }
    
    async getPopularItems(timeRange = 'day') {
        try {
            const now = new Date();
            let startDate = new Date();
            
            switch (timeRange) {
                case 'day':
                    startDate.setDate(now.getDate() - 1);
                    break;
                case 'week':
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                default:
                    startDate.setDate(now.getDate() - 1);
            }
            
            // Получаем популярные кейсы
            const { data: popularCases, error } = await this.supabase
                .from('case_purchases')
                .select(`
                    amount,
                    purchased_at,
                    cases (
                        id,
                        name,
                        price
                    )
                `)
                .gte('purchased_at', startDate.toISOString())
                .order('purchased_at', { ascending: false });
            
            if (error) throw error;
            
            // Группируем по кейсам
            const caseStats = {};
            
            popularCases.forEach(purchase => {
                if (purchase.cases) {
                    const caseId = purchase.cases.id;
                    if (!caseStats[caseId]) {
                        caseStats[caseId] = {
                            id: caseId,
                            name: purchase.cases.name,
                            price: purchase.cases.price,
                            sales_count: 0,
                            total_revenue: 0
                        };
                    }
                    
                    caseStats[caseId].sales_count++;
                    caseStats[caseId].total_revenue += purchase.amount || 0;
                }
            });
            
            // Сортируем по количеству продаж
            const sortedCases = Object.values(caseStats)
                .sort((a, b) => b.sales_count - a.sales_count)
                .slice(0, 10); // Топ 10
            
            return sortedCases;
            
        } catch (error) {
            console.error('Ошибка получения популярных товаров:', error);
            return [];
        }
    }
    
    // ==================== ЛОГИРОВАНИЕ ====================
    
    async logAdminAction(action, details = {}) {
        try {
            await this.supabase
                .from('admin_logs')
                .insert({
                    admin_id: this.currentUser.id,
                    admin_name: this.currentUser.username,
                    action: action,
                    details: details,
                    ip_address: await this.getClientIP(),
                    user_agent: navigator.userAgent,
                    created_at: new Date().toISOString()
                });
            
        } catch (error) {
            console.error('Ошибка логирования:', error);
        }
    }
    
    async getClientIP() {
        try {
            // Используем внешний сервис для получения IP
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }
    
    async getAdminLogs(limit = 100, offset = 0) {
        try {
            const { data, error } = await this.supabase
                .from('admin_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            
            if (error) throw error;
            
            return { success: true, data };
            
        } catch (error) {
            console.error('Ошибка получения логов:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ==================== ЭКСПОРТ ДАННЫХ ====================
    
    async exportData(type = 'users', format = 'json') {
        try {
            let data;
            
            switch (type) {
                case 'users':
                    const { data: usersData, error: usersError } = await this.supabase
                        .from('users')
                        .select('*')
                        .order('created_at', { ascending: false });
                    
                    if (usersError) throw usersError;
                    data = usersData;
                    break;
                    
                case 'purchases':
                    const { data: purchasesData, error: purchasesError } = await this.supabase
                        .from('case_purchases')
                        .select('*')
                        .order('purchased_at', { ascending: false });
                    
                    if (purchasesError) throw purchasesError;
                    data = purchasesData;
                    break;
                    
                case 'giveaways':
                    const { data: giveawaysData, error: giveawaysError } = await this.supabase
                        .from('giveaways')
                        .select('*')
                        .order('created_at', { ascending: false });
                    
                    if (giveawaysError) throw giveawaysError;
                    data = giveawaysData;
                    break;
                    
                default:
                    throw new Error('Неизвестный тип данных для экспорта');
            }
            
            let exportContent;
            let mimeType;
            let filename;
            
            if (format === 'csv') {
                exportContent = this.convertToCSV(data);
                mimeType = 'text/csv';
                filename = `fresko_${type}_${new Date().toISOString().split('T')[0]}.csv`;
            } else {
                exportContent = JSON.stringify(data, null, 2);
                mimeType = 'application/json';
                filename = `fresko_${type}_${new Date().toISOString().split('T')[0]}.json`;
            }
            
            // Создаем временную ссылку для скачивания
            const blob = new Blob([exportContent], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            await this.logAdminAction('data_exported', {
                data_type: type,
                format: format
            });
            
            return { success: true, filename };
            
        } catch (error) {
            console.error('Ошибка экспорта данных:', error);
            return { success: false, error: error.message };
        }
    }
    
    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvRows = [];
        
        // Заголовки
        csvRows.push(headers.join(','));
        
        // Данные
        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header];
                // Экранируем запятые и кавычки
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value !== null && value !== undefined ? value : '';
            });
            csvRows.push(values.join(','));
        }
        
        return csvRows.join('\n');
    }
}

// Экспорт класса
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminFunctions;
} else {
    window.AdminFunctions = AdminFunctions;
}