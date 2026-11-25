# DR Booking — внутрішня система бронювання робочих місць та переговорних кімнат

Веб-сервіс для компанії з гібридним форматом роботи: співробітники бронюють робоче місце або переговорну кімнату на потрібний часовий слот, а адміністратор керує ресурсами офісу, обліковими записами та отримує звіти про завантаженість.

Проєкт виконується в межах лабораторних робіт. Поточний стан — **ЛР №5: інтегрована система**. Усі компоненти (React SPA, REST API, PostgreSQL, Nginx) зібрані в один стенд Docker Compose, а виконання вимог підтверджено автоматичними тестами. Детальний звіт: [docs/integration-report.md](docs/integration-report.md).

## Функціональні можливості

| Вимога | Функція | Стан |
|---|---|---|
| FR-01 | Вхід за корпоративною поштою та паролем (JWT) | ✅ |
| FR-02 | Особистий кабінет: профіль, активні, завершені та скасовані бронювання | ✅ |
| FR-03 | Бронювання слота від 30 хв з підтвердженням | ✅ |
| FR-04 | Контроль колізій: транзакція з блокуванням + обмеження в БД | ✅ |
| FR-05 | Скасування власного бронювання не пізніше ніж за 15 хв; перенесення на інший час | ✅ |
| FR-06 | Керування ресурсами; при блокуванні — автоскасування бронювань зі сповіщенням | ✅ |
| FR-07 | Звіт завантаженості в CSV (робочі години, без часу простою) | ✅ |
| FR-08 | Каталог ресурсів зі статусами | ✅ |
| FR-09 | Пошук і фільтрація за датою, часом, зоною, типом, обладнанням | ✅ |
| FR-10 | Календар доступності ресурсу з вибором вільного слота | ✅ |
| FR-11 | Сповіщення про створення, зміну, скасування; нагадування за 30 хв | ✅ |
| FR-12 | Підбір переговорних за кількістю учасників | ✅ |
| FR-13 | Створення облікових записів адміністратором | ✅ |

Як перевірено кожну вимогу: [docs/integration-report.md, розділ 4](docs/integration-report.md#4-виконання-функціональних-вимог).

## Нефункціональні вимоги

| Вимога | Ціль | Виміряно |
|---|---|---|
| NFR-01 Продуктивність | ≤ 300 мс при 50 одночасних запитах | p99 = **96 мс** (1 125 запитів/с, 0 помилок) |
| NFR-02 Завантаження UI | ≤ 2,0 с при 10 Мбіт/с | **0,35 с** до появи переліку ресурсів |
| NFR-03 Надійність | 99,5 % у робочі години | Автоперезапуск після аварії за 5 с; при недоступній БД — 503 без падіння, відновлення за 0,2 с |
| NFR-04 Безпека | bcrypt, лише HTTPS з TLS 1.3 | bcrypt (cost 10); TLS 1.2 відхиляється; HTTP → HTTPS |
| NFR-05 Адаптивність | 360–1920 px | 0 px горизонтального переповнення на всіх сторінках |

Методика і сирі результати: [docs/integration-report.md, розділ 5](docs/integration-report.md#5-виконання-нефункціональних-вимог), [docs/results/](docs/results/).

| Мобільний (360 px) | Десктоп (1920 px) |
|---|---|
| <img src="docs/screenshots/search-360.png" alt="Пошук на 360 px" width="240"> | <img src="docs/screenshots/search-1920.png" alt="Пошук на 1920 px" width="560"> |

## Стек технологій

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Hook Form, React Router
- **Backend:** Node.js 24, Express 5, TypeScript, Zod, JSON Web Token, bcrypt
- **База даних:** PostgreSQL 17 (транзакції, exclusion constraint проти овербукінгу, SQL-міграції)
- **Інфраструктура:** Docker Compose, Nginx (HTTPS, reverse proxy), GitHub Actions, Dependabot
- **Тести:** Vitest, Supertest, Playwright, Postman/newman, autocannon

## Архітектура

Модульний моноліт із трирівневою структурою `React SPA → REST API → PostgreSQL` (ЛР №2). Серверний код поділено на модулі `auth`, `users`, `resources`, `bookings`, `analytics`, `notifications` і на шари **контролери → сервіси → доменна модель ← інфраструктура**. Бізнес-логіка залежить лише від інтерфейсів, тому ті самі сервіси працюють і з PostgreSQL, і з in-memory сховищем у тестах.

```
Браузер ──HTTPS (TLS 1.3)──► web: Nginx ──/api──► server: Node.js API ──SQL──► db: PostgreSQL
                              статика SPA          міграції, фонові задачі      exclusion constraint
```

Детально: [docs/architecture.md](docs/architecture.md).

## Структура репозиторію

```
DR_booking/
├── server/                       # REST API (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── domain/               # User, Resource, Booking, Notification, enum-и
│   │   ├── modules/              # auth, users, resources, bookings, analytics, notifications
│   │   ├── infrastructure/       # PostgreSQL (+ мігратор), in-memory, планувальник, демо-дані
│   │   ├── shared/               # помилки, час і графік офісу, health-check, HTTP-утиліти
│   │   ├── config/               # конфігурація зі змінних оточення
│   │   ├── container.ts          # Composition Root
│   │   ├── app.ts / server.ts    # Express-застосунок і точка входу
│   ├── tests/                    # unit, integration (HTTP), postgres (справжня БД)
│   ├── db/migrations/            # SQL-міграції
│   └── Dockerfile
├── client/                       # React SPA (Vite + TypeScript + Tailwind)
│   ├── src/                      # api/, components/, context/, pages/, types/, utils/
│   ├── tests/
│   ├── nginx/                    # конфігурація Nginx (HTTPS, проксі) і генерація сертифіката
│   └── Dockerfile
├── e2e/                          # Playwright: наскрізні сценарії, NFR-02, NFR-05
├── tests/postman/                # Postman-колекція інтеграційних тестів API
├── scripts/                      # навантажувальний тест (NFR-01), перевірка надійності (NFR-03)
├── docs/                         # архітектура, API, звіт інтеграції, результати, скріншоти
├── .github/                      # CI, Dependabot, шаблон Pull Request
├── docker-compose.yml            # PostgreSQL + API + Nginx
├── package.json                  # npm workspaces: server, client, e2e (один lock-файл)
└── README.md
```

## Запуск

### Вимоги

- Node.js **24** (див. `.nvmrc`; мінімум 22.12) та npm 10+
- Docker Desktop — для запуску інтегрованої системи

### Варіант 1. Інтегрована система в Docker (рекомендовано)

```bash
docker compose up -d --build --wait
```

- Застосунок: **https://localhost:8443** (http://localhost:8080 переадресовує на HTTPS).
- Сертифікат самопідписаний і створюється автоматично — браузер покаже попередження, його можна прийняти для локального стенду. Для production змонтуйте власний сертифікат у том `tls-certs` (`server.crt`, `server.key`) і задайте `JWT_SECRET`.
- Схема БД створюється міграціями під час старту API; демо-дані — при `SEED_DEMO_DATA=true` (за замовчуванням).
- Зупинка: `docker compose down` (з видаленням даних — `docker compose down -v`).

Порти можна змінити змінними `HTTP_PORT`, `HTTPS_PORT`, `DB_PORT` (БД доступна лише з `127.0.0.1:15432`).

### Варіант 2. Режим розробки

```bash
npm install
npm run dev          # API на http://localhost:3000 + клієнт на http://localhost:5173
```

За замовчуванням API працює з in-memory сховищем (дані до перезапуску). Щоб працювати з PostgreSQL:

```bash
docker compose up -d db
cp server/.env.example server/.env   # DATA_STORE=postgres, DATABASE_URL=postgres://dr_booking:dr_booking@localhost:15432/dr_booking
npm run dev
```

Усі змінні оточення з поясненнями: [server/.env.example](server/.env.example).

### Демо-облікові записи

| Роль | Email | Пароль |
|---|---|---|
| Адміністратор | `admin@company.com` | `Admin12345` |
| Співробітник | `employee@company.com` | `Employee12345` |

## Тестування

| Команда | Що перевіряє | Потрібен стенд |
|---|---|---|
| `npm run typecheck` | Типи TypeScript у всіх пакетах | — |
| `npm test` | 47 тестів сервера (домен, сервіси, HTTP API) + 9 тестів клієнта | — |
| `TEST_DATABASE_URL=postgres://dr_booking:dr_booking@localhost:15432/dr_booking_test npm test` | Те саме + 7 тестів на справжньому PostgreSQL (транзакції, обмеження, міграції) | `db` |
| `npm run test:api` | Postman-колекція: 20 запитів, 28 перевірок | ✅ |
| `npm run test:e2e` | Playwright: 9 сценаріїв через браузер, NFR-02, NFR-05, скріншоти | ✅ |
| `npm run test:load` | NFR-01 (50 з'єднань × 20 с) і FR-04 (50 паралельних бронювань одного слота) | ✅ |
| `npm run test:resilience` | NFR-03: аварія API, недоступність БД | ✅ |
| `npm run test:integration` | Усі чотири перевірки стенду поспіль | ✅ |

Стенд піднімається командою `npm run stack:up`. Для e2e локально використовується встановлений Microsoft Edge; інший браузер — `PW_CHANNEL=chrome npm run test:e2e`.

CI (GitHub Actions) виконує все це для кожного Pull Request: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## API

Основні маршрути (`/api/v1`): `POST /auth/login`, `GET /resources`, `GET /resources/:id/schedule`, `POST /bookings`, `PATCH /bookings/:id`, `POST /bookings/:id/cancel`, `GET /notifications/me`, `GET /analytics/utilization.csv`, `GET /health`.
Повний перелік, параметри і коди помилок: [docs/api.md](docs/api.md).

## Управління залежностями

- npm workspaces (`server`, `client`, `e2e`) з одним `package-lock.json` — версії синхронізовані між пакетами.
- Спільні інструменти (TypeScript 7, Vitest 5) оголошено один раз у кореневому `package.json`.
- `npm audit` — 0 вразливостей; Dependabot щотижня пропонує оновлення npm, Docker-образів і GitHub Actions.
- Docker-образи будуються з того самого lock-файлу (`npm ci`).

## Команда та ролі

Групи: ІМ-43, ІП-41.

| Учасник | Ролі | Зона відповідальності в ЛР №5 |
|---|---|---|
| **Глушков Денис** | Scrum Master, System Architect, Backend & DevOps, QA Lead | Доробка API: сповіщення й нагадування (FR-11), автоскасування при блокуванні ресурсу (FR-06), точний звіт завантаженості (FR-07), перенесення бронювань; міграції та інтеграція з PostgreSQL; Docker Compose, Nginx з TLS 1.3, CI; Postman-колекція, навантажувальний тест і тест надійності (NFR-01, NFR-03, NFR-04) |
| **Гуменюк Андрій** | Product Owner, Business Analyst, Frontend Engineer | Календар слотів (FR-10), сповіщення в інтерфейсі (FR-11), історія та перенесення бронювань (FR-02), керування користувачами в адмін-панелі (FR-13); e2e-тести Playwright, перевірка NFR-02 і NFR-05 |

Кожен учасник рецензує Pull Request іншого перед злиттям у `main`.

## Процес розробки

- Кожна задача — окрема гілка `feature/…`, злиття в `main` лише через Pull Request з код-рев'ю і зеленим CI.
- Коміти — у форматі Conventional Commits.

Детально: [docs/git-workflow.md](docs/git-workflow.md).
