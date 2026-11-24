# Процес роботи з Git

## Гілки

| Гілка | Призначення |
|---|---|
| `main` | Стабільна версія. Прямі коміти заборонені — лише злиття через Pull Request |
| `feature/<область>-<коротко>` | Нова функціональність, напр. `feature/backend-core`, `feature/frontend-skeleton`, `feature/booking-calendar` |
| `fix/<коротко>` | Виправлення помилок |
| `docs/<коротко>` | Лише документація |

Кожен учасник працює у власній гілці для кожної задачі з беклогу.

## Коміти

Формат [Conventional Commits](https://www.conventionalcommits.org/):

```
<тип>(<область>): <що зроблено>

feat(bookings): add transactional collision check
fix(client): show 409 message on double booking
docs: describe API error format
test(analytics): cover CSV escaping
```

Типи: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.

## Pull Request і код-рев'ю

1. Створити гілку від актуального `main`: `git switch main && git pull && git switch -c feature/<назва>`.
2. Зробити зміни невеликими логічними комітами; локально запустити `npm test` і `npm run build`.
3. Відправити гілку: `git push -u origin feature/<назва>` і відкрити Pull Request у `main`.
4. Заповнити шаблон PR (задачі беклогу, як перевірити).
5. **Рев'юер — інший учасник команди**: перевіряє код за чеклістом шаблону, залишає коментарі або схвалює (Approve).
6. Злиття — лише після схвалення та успішного CI (GitHub Actions: `Server CI`, `Client CI`).
7. Після злиття гілку видаляють.

## Рекомендовані налаштування репозиторію на GitHub

`Settings → Branches → Add branch protection rule` для `main`:

- Require a pull request before merging → Require approvals: **1**
- Require status checks to pass before merging → `test` (Server CI), `build` (Client CI)
