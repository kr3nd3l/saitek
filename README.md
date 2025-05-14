# Система управления спорткомплексом

Веб-приложение для администрации спорткомплекса с функциями бронирования, управления клиентами, расписанием и оплатами.

## Функциональность

- Бронирование залов и тренажеров
- Управление клиентами
- Расписание занятий
- Система оплат
- Статистика посещений

## Технологии

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- База данных: SQLite

## Установка

1. Убедитесь, что у вас установлен Node.js (версия 14 или выше)

2. Клонируйте репозиторий:
```bash
git clone [url-репозитория]
cd sports-complex-admin
```

3. Установите зависимости:
```bash
npm install
```

4. Запустите сервер:
```bash
npm start
```

Для разработки используйте:
```bash
npm run dev
```

5. Откройте приложение в браузере:
```
http://localhost:3000
```

## Структура проекта

```
sports-complex-admin/
├── public/              # Статические файлы
│   ├── css/            # Стили
│   ├── js/             # JavaScript файлы
│   └── index.html      # Главная страница
├── server.js           # Основной файл сервера
├── sports_complex.db   # База данных SQLite
├── package.json        # Зависимости проекта
└── README.md          # Документация
```

## API Endpoints

- GET /api/clients - Получить список клиентов
- POST /api/clients - Добавить нового клиента
- GET /api/bookings - Получить список бронирований
- POST /api/bookings - Создать новое бронирование
- GET /api/schedule - Получить расписание
- POST /api/schedule - Добавить занятие в расписание
- GET /api/payments - Получить список платежей
- POST /api/payments - Добавить новый платеж
- GET /api/statistics - Получить статистику

## Разработка

Для добавления новых функций:

1. Создайте новую ветку для вашей функциональности
2. Внесите необходимые изменения
3. Протестируйте изменения
4. Создайте pull request

## Лицензия

MIT 

async function populateBookingClients() {
    const clientSelects = [
        document.querySelector('#new-booking select[name="client_id"]'),
        document.querySelector('#new-payment select[name="client_id"]')
    ].filter(Boolean);

    const clients = await fetchData('clients');
    if (!clients) return;

    clientSelects.forEach(select => {
        select.innerHTML = '<option value="">Выберите клиента</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            select.appendChild(option);
        });
    });
}

function initializePages() {
    loadFacilities();
    loadClients();
    loadSchedule();
    loadPayments();
    loadStatistics();
    populateScheduleFormDropdowns();
    populateBookingClients();
} 