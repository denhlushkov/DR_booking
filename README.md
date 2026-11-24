# DR Booking — внутрішня система бронювання робочих місць та переговорних кімнат

Веб-сервіс для компанії з гібридним форматом роботи: співробітники бронюють робоче місце або переговорну кімнату на потрібний часовий слот, а адміністратор керує ресурсами офісу та отримує звіти про їх завантаженість.

Проєкт виконується в межах лабораторних робіт з дисципліни. Цей репозиторій — результат **Лабораторної роботи №4: Розробка базової структури коду**.

## Можливості (MVP, Спринт 1)

| Вимога | Функція | Стан |
|---|---|---|
| FR-01 | Вхід за корпоративною поштою та паролем (JWT, bcrypt) | ✅ API + UI |
| FR-02 | Особистий кабінет: профіль і список бронювань | ✅ API + UI |
| FR-03 | Бронювання слота від 30 хв | ✅ API + UI |
| FR-04 | Контроль колізій: транзакція з блокуванням + обмеження в БД | ✅ API |
| FR-05 | Скасування власного бронювання не пізніше ніж за 15 хв | ✅ API + UI |
| FR-06 | Керування ресурсами (додавання, обслуговування, блокування) | ✅ API + UI |
| FR-07 | Звіт завантаженості у CSV | ✅ API + UI (базовий розрахунок) |
| FR-08, FR-09, FR-12 | Каталог, пошук і фільтрація, перевірка місткості | ✅ API + UI |
| FR-10 | Календар зайнятості ресурсу | 🟡 API, UI — наступний спринт |
| FR-11 | Сповіщення | 🟡 інтерфейс + логування, email — наступний спринт |
| FR-13 | Реєстрація користувачів адміністратором | 🟡 API, UI — наступний спринт |

## Стек технологій

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Hook Form, React Router
- **Backend:** Node.js 24, Express 5, TypeScript, Zod (валідація), JSON Web Token, bcrypt
- **База даних:** PostgreSQL 17 (ACID-транзакції, exclusion constraint проти овербукінгу)
- **Інфраструктура:** Docker Compose, Nginx (reverse proxy), GitHub Actions (CI)
- **Тести:** Vitest, Supertest

## Архітектура

Модульний моноліт із трирівневою структурою `React SPA → REST API → PostgreSQL` (Лаб. №2).
Серверний код поділено на доменні модулі `auth`, `users`, `resources`, `bookings`, `analytics`, `notifications`, а всередині — на шари: **контролери → сервіси → доменна модель ← інфраструктура**. Бізнес-логіка залежить лише від інтерфейсів (репозиторії, Unit of Work, сповіщення, час), тому PostgreSQL можна замінити in-memory сховищем без зміни сервісів — саме так працюють тести.

Детально, з відповідністю діаграмі класів і принципам SOLID: [docs/architecture.md](docs/architecture.md).

## Структура репозиторію

```
DR_booking/
├── server/                         # REST API (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── domain/                 # Сутності User, Resource, Booking та enum-и
│   │   ├── modules/                # Доменні модулі: контролер, сервіс, інтерфейс репозиторію
│   │   │   ├── auth/               #   вхід, JWT, хешування паролів, middleware ролей
│   │   │   ├── users/              #   профіль, створення користувачів
│   │   │   ├── resources/          #   каталог, пошук, керування ресурсами
│   │   │   ├── bookings/           #   бронювання, правила офісу, Unit of Work
│   │   │   ├── analytics/          #   ReportGenerator, CSV-звіт
│   │   │   └── notifications/      #   інтерфейс сповіщень
│   │   ├── infrastructure/         # Реалізації: PostgreSQL, in-memory, демо-дані
│   │   ├── shared/                 # Помилки, час, інтервали, HTTP-утиліти
│   │   ├── config/                 # Конфігурація зі змінних оточення
│   │   ├── container.ts            # Composition Root — зв'язування залежностей
│   │   ├── app.ts                  # Express-застосунок
│   │   └── server.ts               # Точка входу
│   ├── tests/                      # Юніт- та інтеграційні тести
│   ├── db/migrations/              # SQL-схема БД
│   └── Dockerfile
├── client/                         # React SPA (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── api/                    # HTTP-клієнт і функції для кожного ресурсу API
│   │   ├── components/             # Layout, ProtectedRoute, ResourceCard, ResourceFilters
│   │   ├── context/                # AuthContext — сесія користувача
│   │   ├── pages/                  # Вхід, пошук, мої бронювання, адміністрування
│   │   ├── types/                  # Типи DTO
│   │   └── utils/                  # Валідація слотів, правило 15 хв, підписи
│   ├── tests/
│   ├── nginx.conf                  # Статика SPA + проксі /api на сервер
│   └── Dockerfile
├── docs/                           # Архітектура, API, процес роботи з Git
├── .github/                        # CI (GitHub Actions) і шаблон Pull Request
├── docker-compose.yml              # PostgreSQL + API + Nginx
├── .gitignore
└── README.md
```

## Запуск

### Вимоги

- Node.js **20.12+** (рекомендовано 24) та npm
- Docker Desktop — лише для запуску з PostgreSQL

### Варіант 1. Локально без бази даних (найшвидше)

Сервер за замовчуванням використовує in-memory сховище та створює демо-дані.

```bash
# Термінал 1 — API на http://localhost:3000
cd server
npm install
npm run dev

# Термінал 2 — клієнт на http://localhost:5173
cd client
npm install
npm run dev
```

Vite проксує запити `/api` на `localhost:3000`. Дані зберігаються лише до перезапуску сервера.

### Варіант 2. Docker Compose (PostgreSQL + API + Nginx)

```bash
docker compose up --build
```

Застосунок: http://localhost:8080. Схема БД створюється автоматично з `server/db/migrations/`.

### Демо-облікові записи

| Роль | Email | Пароль |
|---|---|---|
| Адміністратор | `admin@company.com` | `Admin12345` |
| Співробітник | `employee@company.com` | `Employee12345` |

Створюються лише при `SEED_DEMO_DATA=true` (див. `server/.env.example`).

### Тести та збірка

```bash
cd server && npm test && npm run build   # 28 тестів: домен, бізнес-правила, конкурентні бронювання, API
cd client && npm test && npm run build   # тести утиліт + production-збірка
```

## API

Основні маршрути (`/api/v1`): `POST /auth/login`, `GET /resources`, `POST /bookings`, `GET /bookings/me`, `POST /bookings/:id/cancel`, `GET /analytics/utilization.csv`.
Повний перелік, параметри і коди помилок: [docs/api.md](docs/api.md).

## Команда та ролі

Групи: ІМ-43, ІП-41.

| Учасник | Ролі | Зона відповідальності в ЛР №4 |
|---|---|---|
| **Глушков Денис** | Scrum Master, System Architect, Backend & DevOps Engineer | `server/`: доменна модель, модулі API, контроль колізій (TASK-04), PostgreSQL-схема, Docker Compose і Nginx (TASK-08), CI. Гілка `feature/backend-core` |
| **Гуменюк Андрій** | Product Owner, Business Analyst, Frontend Engineer | `client/`: React SPA — вхід (TASK-01), пошук і фільтрація (TASK-02), бронювання (TASK-03), особистий кабінет і скасування (TASK-05), адмін-панель. Гілка `feature/frontend-skeleton` |

Кожен учасник рецензує Pull Request іншого перед злиттям у `main`.

## Процес розробки

- Кожна задача — окрема гілка `feature/…`, злиття в `main` лише через Pull Request з код-рев'ю і зеленим CI.
- Коміти — у форматі Conventional Commits.

Детально: [docs/git-workflow.md](docs/git-workflow.md).

## Відповідність беклогу (Лаб. №3)

| Задача | Реалізація |
|---|---|
| TASK-01 Авторизація (JWT) | `server/src/modules/auth/`, `client/src/pages/LoginPage.tsx`, `client/src/context/AuthContext.tsx` |
| TASK-02 Пошук і фільтрація | `ResourceService.search()`, `client/src/components/ResourceFilters.tsx` |
| TASK-03 Створення бронювання | `BookingService.createBooking()`, `client/src/pages/ResourcesPage.tsx` |
| TASK-04 Перевірка колізій (ACID) | `BookingService` + `PgUnitOfWork` (`SELECT … FOR UPDATE`) + exclusion constraint |
| TASK-05 Особистий кабінет і скасування | `BookingService.cancelBooking()`, `client/src/pages/MyBookingsPage.tsx` |
| TASK-06 Керування ресурсами | `ResourceService`, `client/src/pages/AdminPage.tsx` |
| TASK-07 CSV-звіт | `ReportGenerator`, `GET /analytics/utilization.csv` |
| TASK-08 Docker, PostgreSQL, Nginx | `docker-compose.yml`, `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf` |
