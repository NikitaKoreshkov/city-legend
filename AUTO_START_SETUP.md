# Настройка автозапуска сервера

## ✅ Что настроено:

### 1. PM2 автозапуск
- ✅ PM2 настроен на автозапуск при загрузке системы
- ✅ PM2 сохраняет список процессов (`pm2 save`)
- ✅ PM2 автоматически восстанавливает процессы после перезагрузки

### 2. Systemd сервисы
- ✅ Nginx включен в автозапуск
- ✅ PostgreSQL включен в автозапуск
- ✅ Создан systemd сервис для PM2 (`premsite-monitor`)

### 3. Мониторинг и восстановление
- ✅ PM2 автоматически перезапускает упавшие процессы
- ✅ Настроен ротатор логов PM2 (макс. размер 10MB, хранит 7 дней)
- ✅ Cron задача проверяет сервер каждые 5 минут и перезапускает при необходимости

## Команды для управления:

```bash
# Проверить статус PM2
pm2 status

# Перезапустить приложение
pm2 restart premsite

# Посмотреть логи
pm2 logs premsite

# Проверить автозапуск PM2
pm2 startup

# Сохранить текущие процессы
pm2 save

# Проверить статус сервисов
systemctl status nginx
systemctl status postgresql
systemctl status premsite-monitor
```

## Что происходит при перезагрузке сервера:

1. **Systemd** автоматически запускает:
   - PostgreSQL
   - Nginx
   - PM2 (через `premsite-monitor`)

2. **PM2** автоматически восстанавливает:
   - Приложение `premsite` на порту 3000

3. **Cron** каждые 5 минут проверяет:
   - Работает ли сервер на порту 3000
   - Если нет - перезапускает через PM2

## Логи:

- PM2 логи: `~/.pm2/logs/`
- Логи проверки сервера: `/var/log/premsite-check.log`
- Nginx логи: `/var/log/nginx/`
- PostgreSQL логи: `/var/log/postgresql/`

## Если сервер все равно падает:

1. Проверьте логи:
   ```bash
   pm2 logs premsite --lines 50
   tail -50 /var/log/premsite-check.log
   ```

2. Проверьте ресурсы:
   ```bash
   free -h
   df -h
   ```

3. Проверьте статус:
   ```bash
   pm2 status
   systemctl status premsite-monitor
   ```

## Ручной перезапуск всего:

```bash
# Перезапустить все сервисы
systemctl restart nginx
systemctl restart postgresql
pm2 restart all
```

