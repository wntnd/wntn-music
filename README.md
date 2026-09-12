# wntn.music

Музыкальный мини-сайт с треками neverlane и roulse420. Плеер + аккаунты, плейлисты,
лайки, профили артистов, версии треков (демо/релиз/...), тексты с синхронизацией (LRC).

## Стек

- **Фронт:** Vite + React + TS + Tailwind (дизайн в духе cobalt.tools, шрифты IBM Plex + Unbounded)
- **API:** Cloudflare Pages Functions + Hono + Drizzle
- **БД:** Postgres (Supabase) через Hyperdrive. Сессии и счётчик неудачных логинов лежат там же — Redis больше нет
- **Файлы:** Cloudflare R2 через биндинг — аудио отдаётся `/api/audio/:id` (302 → публичный домен бакета)
- **Раздача:** один Pages-проект отдаёт и фронт, и API, отдельного прокси нет

## Быстрый старт (локально)

Локально воркер ходит не в Supabase, а в свой постгрес — так настроен
`localConnectionString` у биндинга Hyperdrive в `wrangler.jsonc`:

```bash
docker run -d --name wntn-local -p 5432:5432 \
  -e POSTGRES_USER=wntn -e POSTGRES_PASSWORD=wntn -e POSTGRES_DB=wntn postgres:16-alpine

cd server
cp .env.example .env    # DATABASE_URL нужен только скриптам на Node
pnpm db:push            # схема в базу из DATABASE_URL
pnpm bootstrap          # выдать root из ADMIN_USERNAMES (раньше это делал старт сервера)
pnpm dev                # воркер на :8787, отдаёт и API, и фронт из ../dist
```

Порт обязательно публиковать на `127.0.0.1`: до внутреннего docker-адреса
воркер не достучится.

Фронт с горячей перезагрузкой — в другом терминале: `pnpm dev` в корне, vite проксит `/api` на `:8787`.

## Почему Hyperdrive

workerd не умеет поднимать TLS по протоколу postgres: соединение с Supabase
рвётся и с проверкой сертификата, и без неё. Hyperdrive держит соединение вне
изолята и отдаёт воркеру локальный незашифрованный эндпоинт. Кеш запросов у
конфига выключен, чтобы чтение оставалось таким же свежим, как раньше.

Скрипты на Node ходят в Supabase напрямую, и им нужен приватный корневой
сертификат Supabase — он лежит в `server/src/db/supabase-ca.ts`.

## Хранилище

R2 подключён биндингом `BUCKET` в `server/wrangler.jsonc` — ни ключей, ни
подписи URL больше нет. Публичный домен бакета лежит в `R2_PUBLIC_BASE_URL`,
ссылки обычные `<домен>/<key>`, их кэширует CDN.

## Деплой

```bash
pnpm deploy   # в корне: собирает фронт, пакует API в dist/_worker.js, заливает в Pages
```

Сборка делает три вещи: `vite build` кладёт фронт в `dist/`, потом оттуда
вырезается `dist/audio` (74 МБ исходных mp3 живут в R2, в деплой им не надо),
потом API пакуется в один файл `dist/_worker.js`. Pages отдаёт статику сам, а
всё, что начинается на `/api/`, уходит в этот файл.

Сайт живёт на `music.wntn.one`. Зона `wntn.one` лежит в аккаунте `wntn`, а
проект в `linia account`, и это единственная причина, по которой выбран Pages:
Workers отказывается цеплять домен из чужого аккаунта («zone does not exist on
your account»), а Pages разрешает, если руками прописать CNAME на
`wntn-music-4ju.pages.dev` без проксирования.

## Добавить треки

- **UI:** `/studio` → профиль артиста → создать трек → залить mp3 (версию) и обложку (летят в R2).
- **Пачкой:** пакетного импорта больше нет — скрипт `seed` жил на `node:fs` и
  локальном диске, которых у воркера нет. Исходники в `public/audio/` остались,
  но в деплой не едут: `pnpm build` вырезает их из `dist/`.

## Структура

```
src/                    фронт (компоненты, hooks, lib/api.ts)
server/src/             воркер (routes/, db/schema.ts, storage.ts, auth.ts, ctx.ts)
wrangler.jsonc          конфиг Pages: биндинги R2 и Hyperdrive, переменные
server/wrangler.jsonc    только сборка: пакует API в dist/_worker.js
public/                 обложки (mp3 лежат в гите, но сборка их выкидывает)
PLAN.md                 полный план и статус
```
