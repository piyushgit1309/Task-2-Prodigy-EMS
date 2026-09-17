# Prodigy Infotech Employee Management System

Full-stack employee management system built with FastAPI, SQLite, Tailwind CSS, and Chart.js.

## Features

- Administrator registration, login, sessions, and logout
- Employee CRUD operations with validation
- Search, filtering, sorting, pagination, and CSV export
- Dashboard analytics and responsive grid/table views
- Docker, Render, and Vercel deployment configuration

## Run Locally

Requirements: Python 3.9+ and pip.

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:8000.

Demo credentials:

- Email: `admin@prodigy.com`
- Password: `admin123`

## Deploy To Vercel

1. Import this repository into Vercel.
2. Keep the project root at the repository root and use the **Other** framework preset.
3. Deploy. `vercel.json` routes requests to the FastAPI handler at `api/index.py`.

The Vercel filesystem is ephemeral. SQLite is suitable for a demo deployment only; records and sessions may be lost when the serverless instance is recreated. For persistent production data, migrate the SQLite layer to hosted PostgreSQL or Supabase and configure it through environment variables.

## Other Deployment Options

Render uses the included `render.yaml`. Docker uses the included `Dockerfile`.

## API

Protected endpoints require `Authorization: Bearer <token>`.

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/employees`
- `GET /api/employees/analytics`
- `POST /api/employees`
- `PUT /api/employees/{id}`
- `DELETE /api/employees/{id}`
- `POST /api/employees/bulk-delete`
- `GET /api/employees/export/csv`