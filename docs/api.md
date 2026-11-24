# REST API v1

Базовий шлях: `/api/v1`. Формат даних — JSON, час — ISO 8601 (UTC).
Захищені маршрути вимагають заголовок `Authorization: Bearer <JWT>`.

## Маршрути

| Метод | Шлях | Доступ | Вимога | Опис |
|---|---|---|---|---|
| GET | `/health` | усі | — | Перевірка стану сервісу |
| POST | `/auth/login` | усі | FR-01 | Вхід: `{ email, password }` → `{ token, user }` |
| GET | `/users/me` | авторизовані | FR-02 | Профіль поточного користувача |
| POST | `/users` | ADMIN | FR-13 | Створення облікового запису |
| GET | `/resources` | авторизовані | FR-08, FR-09, FR-12 | Каталог / пошук вільних ресурсів |
| GET | `/resources/:id` | авторизовані | FR-08 | Один ресурс |
| GET | `/resources/:id/schedule?from&to` | авторизовані | FR-10 | Зайняті інтервали ресурсу |
| POST | `/resources` | ADMIN | FR-06 | Додати ресурс |
| PATCH | `/resources/:id` | ADMIN | FR-06 | Змінити назву, поверх, атрибути |
| PATCH | `/resources/:id/status` | ADMIN | FR-06 | `AVAILABLE` / `MAINTENANCE` / `BLOCKED` |
| POST | `/bookings` | авторизовані | FR-03, FR-04 | Створити бронювання |
| GET | `/bookings/me` | авторизовані | FR-02, FR-05 | Мої бронювання |
| POST | `/bookings/:id/cancel` | власник / ADMIN | FR-05 | Скасувати (власник — не пізніше ніж за 15 хв) |
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

## Приклад: бронювання

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
  "status": "CONFIRMED", "createdAt": "2026-11-25T08:54:12.348Z" }
```

`409 Conflict` — слот уже зайнятий:

```json
{ "error": { "code": "CONFLICT", "message": "Обраний час уже зайнятий" } }
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
| 422 | `BUSINESS_RULE_VIOLATION` | Пізнє скасування, ресурс на обслуговуванні |
| 500 | `INTERNAL_ERROR` | Непередбачена помилка сервера |
