# REST API v1

Базовий шлях: `/api/v1` (через Nginx: `https://localhost:8443/api/v1`). Формат даних — JSON, час — ISO 8601 (UTC).
Захищені маршрути вимагають заголовок `Authorization: Bearer <JWT>`.

Готова колекція запитів з перевірками: [tests/postman/dr-booking.postman_collection.json](../tests/postman/dr-booking.postman_collection.json).

## Маршрути

| Метод | Шлях | Доступ | Вимога | Опис |
|---|---|---|---|---|
| GET | `/health` | усі | NFR-03 | Стан сервісу та БД (200 або 503) |
| POST | `/auth/login` | усі | FR-01 | Вхід: `{ email, password }` → `{ token, user }` |
| GET | `/users/me` | авторизовані | FR-02 | Профіль поточного користувача |
| GET | `/users` | ADMIN | FR-13 | Список користувачів |
| POST | `/users` | ADMIN | FR-13 | Створення облікового запису |
| GET | `/resources` | авторизовані | FR-08, FR-09, FR-12 | Каталог / пошук вільних ресурсів |
| GET | `/resources/:id` | авторизовані | FR-08 | Один ресурс |
| GET | `/resources/:id/schedule?from&to` | авторизовані | FR-10 | Зайняті інтервали ресурсу |
| POST | `/resources` | ADMIN | FR-06 | Додати ресурс |
| PATCH | `/resources/:id` | ADMIN | FR-06 | Змінити назву, поверх, атрибути |
| PATCH | `/resources/:id/status` | ADMIN | FR-06 | `AVAILABLE` / `MAINTENANCE` / `BLOCKED` → `{ resource, cancelledBookings }` |
| POST | `/bookings` | авторизовані | FR-03, FR-04 | Створити бронювання |
| GET | `/bookings/me` | авторизовані | FR-02, FR-05 | Мої бронювання |
| PATCH | `/bookings/:id` | власник | FR-04, FR-11 | Перенести на інший час: `{ startTime, endTime }` |
| POST | `/bookings/:id/cancel` | власник / ADMIN | FR-05 | Скасувати (власник — не пізніше ніж за 15 хв) |
| GET | `/notifications/me?unreadOnly&limit` | авторизовані | FR-11 | `{ items, unreadCount }` |
| POST | `/notifications/:id/read` | власник | FR-11 | Позначити прочитаним |
| POST | `/notifications/read-all` | авторизовані | FR-11 | Позначити всі прочитаними → `{ updated }` |
| GET | `/analytics/utilization?from&to` | ADMIN | FR-07 | Звіт завантаженості (JSON) |
| GET | `/analytics/utilization.csv?from&to` | ADMIN | FR-07 | Звіт завантаженості (CSV) |

### Параметри пошуку `GET /resources`

| Параметр | Приклад | Опис |
|---|---|---|
| `type` | `DESK`, `MEETING_ROOM` | Тип ресурсу |
| `floor` | `2` | Поверх |
| `zone` | `Open Space A` | Зона офісу |
| `from`, `to` | `2026-12-01T09:00:00Z` | Повернути лише вільні на цей інтервал |
| `equipment` | `monitor,docking` | Потрібне обладнання (усі пункти) |
| `participants` | `6` | Мінімальна місткість (лише для переговорних) |

## Приклади

### Бронювання

```http
POST /api/v1/bookings
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{ "resourceId": "0cbf3775-112f-49b1-8ed1-c85b8b7ddd81",
  "startTime": "2026-12-01T09:00:00Z", "endTime": "2026-12-01T10:00:00Z" }
```

`201 Created`:

```json
{ "id": "0e4c6eb3-…", "userId": "5765a64d-…", "resourceId": "0cbf3775-…",
  "startTime": "2026-12-01T09:00:00.000Z", "endTime": "2026-12-01T10:00:00.000Z",
  "status": "CONFIRMED", "createdAt": "2026-11-25T08:54:12.348Z", "reminderSentAt": null }
```

`409 Conflict` — слот уже зайнятий:

```json
{ "error": { "code": "CONFLICT", "message": "Обраний час уже зайнятий" } }
```

### Сповіщення

```json
GET /api/v1/notifications/me
{ "unreadCount": 1,
  "items": [{ "id": "…", "type": "BOOKING_REMINDER", "title": "Нагадування: бронювання скоро почнеться",
              "message": "«Стіл A-101», 01.12.2026, 10:00–11:00", "bookingId": "…",
              "createdAt": "2026-12-01T07:30:00.000Z", "readAt": null }] }
```

Типи: `BOOKING_CREATED`, `BOOKING_UPDATED`, `BOOKING_CANCELLED`, `BOOKING_CANCELLED_BY_ADMIN`, `BOOKING_REMINDER`. Дата й час у повідомленні — у часовому поясі офісу (`OFFICE_TIMEZONE`).

### Стан сервісу

```json
GET /api/v1/health
200 { "status": "ok", "uptimeSeconds": 3600, "checks": { "database": "up" } }
503 { "status": "degraded", "uptimeSeconds": 3600, "checks": { "database": "down" } }
```

## Формат помилок

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Некоректні дані запиту",
             "details": [{ "field": "resourceId", "message": "Invalid UUID" }] } }
```

| HTTP | `code` | Коли |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` | Некоректні вхідні дані |
| 401 | `UNAUTHORIZED` | Немає токена, токен недійсний, невірний пароль |
| 403 | `FORBIDDEN` | Недостатньо прав (роль, чуже бронювання) |
| 404 | `NOT_FOUND` | Ресурс, бронювання або маршрут не існує |
| 409 | `CONFLICT` | Перетин бронювань, дублікат email |
| 422 | `BUSINESS_RULE_VIOLATION` | Пізнє скасування/зміна, ресурс на обслуговуванні |
| 429 | — | Забагато спроб входу (Nginx, понад 20 за хвилину з однієї IP) |
| 500 | `INTERNAL_ERROR` | Непередбачена помилка сервера |
| 503 | `SERVICE_UNAVAILABLE` | Тимчасово недоступна БД; заголовок `Retry-After: 5` |
