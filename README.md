# VTIAC Management System

Django web portal for VTIAC school operations: student enrollment, registrar, cashier, trainer, and system administration.

This system uses **PostgreSQL** as its database (via `psycopg2` and Django’s PostgreSQL backend). You need a running Postgres instance before running migrations or the app.

**Repository:** [github.com/zygradezeropat/vtiac-management-system](https://github.com/zygradezeropat/vtiac-management-system)

## Requirements

- **Python 3.12+**
- **PostgreSQL 16+** (required)
- **Docker** (optional, to run PostgreSQL locally via `docker-compose.yml`)
- **Git**

## Project structure

```
vtiac-system/
├── backend/          # Django project & apps
├── templates/        # HTML templates
├── static/           # CSS, JavaScript
├── media/            # User uploads (not in git)
├── manage.py
├── requirements.txt
├── docker-compose.yml   # PostgreSQL 16 service
└── README.md
```

## Database

| Item | Detail |
|------|--------|
| Engine | PostgreSQL (`django.db.backends.postgresql`) |
| Driver | `psycopg2-binary` (see `requirements.txt`) |
| Local dev | `docker compose up -d` starts Postgres on port `5432` |
| Config | `POSTGRES_*` environment variables (see `.env.example`) |

## Setup (Windows)

### 1. Clone the repository

```powershell
git clone https://github.com/zygradezeropat/vtiac-management-system.git
cd vtiac-management-system
```

### 2. Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 3. Install dependencies

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Start PostgreSQL

**With Docker** (matches `docker-compose.yml`):

```powershell
docker compose up -d
```

**Or** install PostgreSQL locally and create a database (e.g. `vtiac`).

Set connection variables to match your Postgres instance. For Docker Compose, user, password, and database name are all `vtiac`:

```powershell
$env:POSTGRES_DB = "vtiac"
$env:POSTGRES_USER = "vtiac"
$env:POSTGRES_PASSWORD = "vtiac"
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5432"
```

Copy `.env.example` to `.env` for reference; export these variables in your shell (or use a tool that loads `.env`) before `migrate` and `runserver`.

### 5. Run migrations

```powershell
python manage.py migrate
```

### 6. Create an admin user

```powershell
python manage.py createsuperuser
```

Use this account for Django admin at `/admin/` and for staff portals that require login.

### 7. Run the development server

```powershell
python manage.py runserver
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

## Setup (macOS / Linux)

```bash
git clone https://github.com/zygradezeropat/vtiac-management-system.git
cd vtiac-management-system
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# PostgreSQL (Docker Compose)
docker compose up -d
export POSTGRES_DB=vtiac POSTGRES_USER=vtiac POSTGRES_PASSWORD=vtiac POSTGRES_HOST=localhost POSTGRES_PORT=5432

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## Environment variables (PostgreSQL)

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB` | Database name (default: `vtiac`) |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_HOST` | Host (default: `localhost`) |
| `POSTGRES_PORT` | Port (default: `5432`) |

Do **not** commit `.env` files. Use `.env.example` as a template.

## Common commands

```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
python manage.py collectstatic   # production / deployment
```

## Portals (after login)

Routes are defined per role (student, registrar, cashier, trainer, system admin). Use `createsuperuser` or your app’s registration flows to provision accounts.

## Production notes

Before deploying publicly:

- Set `DEBUG = False` and configure `ALLOWED_HOSTS` in `backend/settings.py` (or move settings to environment-based config).
- Use a strong `SECRET_KEY` from environment variables — never commit secrets.
- Serve static files with a reverse proxy or `collectstatic` + whitenoise/CDN as appropriate.
- Use a managed PostgreSQL instance; do not rely on the default credentials in settings.

## License

Private / client project — add license terms as needed.
