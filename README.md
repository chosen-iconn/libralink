# Libra Link — School Textbook Management

A full-stack web app that replaces the LibraLink Excel registers: class registers, learners (movable between classes), stock reconciliation, lost & damaged cases, executive summary, reports, roles and an audit trail. Blue/gold theme, mobile-first.

## Run it (no installation of packages needed to run)
Requires **Node.js 22.5 or newer**.

    node backend/server.mjs          # or: npm start
    # open http://localhost:3000

First sign-in: user **admin**, password **Libra@2026** — you are forced to choose a new password immediately.
The frontend is already built in `frontend/dist`. To rebuild after editing `frontend/src`: `npm install && npm run build`.

Environment (optional): `PORT`, `HOST`, `DATA_DIR` (database + secret key live here, default `backend/data`), `ADMIN_PASSWORD` (initial admin password, only used when the database is first created), `JWT_SECRET`.

## Already loaded from your workbook
* 29 classes with class teachers; 99 book titles (typos such as VISSIONARY→VISIONARY fixed) assigned to each class in the original column order
* 607 real learners from *Libra_Link_All_Pupils_Final_copy.xlsx* (26 classes). **Classes 1 North, 1 East and 1 West have no learners in that file** — add them on the Learners page (Add or CSV import).
* Demo issue dates, demo stock figures and demo incidents were NOT carried over: production starts clean.

## Workbook → app map
| Excel | App |
|---|---|
| Home / class buttons with OUT counts | Dashboard (live colour-coded class grid, KPIs, health checks, find-a-learner) |
| 29 register sheets (ISSUED / COLLECTED, LOST, DMG, OUT, totals, remarks, sign-offs) | Class register: Register grid, Learners cards, By-book quick mode, bulk issue/collect, CSV, Print (A4 landscape) |
| Learner codes / moving learners | Learners page → **Move class** (their book records move with them; full move history), mark as left, CSV import |
| Summary | Executive summary (by class, by grade, chart, register-vs-incident check) |
| Stock | Stock reconciliation (opening, purchases, replacements, issued, with learners, lost, expected, physical count, variance, status) |
| Incidents | Lost & damaged (case log, categories, status flow, replacement, value) — can be logged straight from the register |
| Settings / lists | Settings (school, term, year, logo, lists) |
| Guide | User guide |
| — (new) | Users & roles, audit trail, snapshots (end-of-term freeze), backup / restore, outstanding & left-with-books reports |

## Roles
Administrator (everything) · Librarian (registers, learners, books, stock, cases) · Class teacher (edits own class register and logs cases for it; read-only elsewhere) · Head teacher (read-only, audit trail, snapshots).

## Tests
`npm test` runs 112 API checks (auth, permissions, register maths, moves, stock maths, incidents, import, backup/restore) on a throw-away database.

## Backups
Settings → Backup & restore → download a backup (JSON) regularly; restore re-loads it. You can also copy the `backend/data` folder while the server is stopped.
