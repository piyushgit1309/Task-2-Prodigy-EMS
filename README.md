<<<<<<< HEAD
# Task-2-Prodigy-EMS
=======
# 🏢 Prodigy Infotech — Task-02: Employee Management System (EMS)

An enterprise-grade, full-stack **Employee Management System** built with **FastAPI**, **SQLite**, **Tailwind CSS**, and **Chart.js**.

Developed for the **Prodigy Infotech Full Stack Developer Internship (Task-02)**.

---

## 🌟 Key Features

- **Admin Authentication**: Secure registration and login flow for administrators.
- **Password Hashing**: PBKDF2-HMAC-SHA256 with cryptographically generated 16-byte salts (no plain-text storage).
- **Session Tokens**: Bearer token authentication with automated 7-day expiration and database session revocation.
- **Sensitive Data Masking**: 1-click eye toggle to mask/unmask sensitive compensation and payroll data across the dashboard and table.
  - High-performance data table with sorting, search, and pagination.
  - Interactive grid view with visual employee cards.
- **Delete**: Record deletion modal with safety confirmation prompt, plus bulk-deletion support.

### 3. ✅ Multi-Tier Validation Mechanisms
- **Phone Validation**: International phone format validation (`+91...`).
- **Compensation Checks**: Positive numeric values only (`salary > 0`).
  - Staff Distribution by Department (Doughnut Chart)
  - Department Payroll Share (Bar Chart)
### 5. 🛠 Productivity & UX Enhancements
- **Live Instant Search**: Debounced search across name, ID, email, designation, and department.
- **Filter Controls**: Multi-dropdown filters for Department, Status, and Contract Type.
- **Export to CSV**: Instant 1-click download of full employee dataset into clean CSV format.
- **Keyboard Shortcuts**: `Ctrl/Cmd + N` to create a new employee, `Esc` to close any modal.


| Role | Email | Password |
| :--- | :--- | :--- |
| **Super Admin** | `admin@prodigy.com` | `admin123` |

*(You can also use the 1-click **Autofill Demo Admin Credentials** button on the sign-in screen or register your own new administrator account.)*

---

## 🚀 Quick Start (Run Locally)

- Python 3.9+ installed
- pip package manager

### 1. Extract & Navigate
cd employee_management_system
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Launch the Server
```bash
python app.py
```
*Alternatively:*
```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Open in Browser
Visit **[http://localhost:8000](http://localhost:8000)** in your browser!

---

## 🌐 1-Click Deployment Guide


### Option A: Deploy to Render (Recommended - Free)
1. Push this folder to a GitHub repository.
2. Go to [Render Dashboard](https://dashboard.render.com/) -> **New Web Service**.
3. Connect your GitHub repository.
4. Render will automatically detect `render.yaml` or set:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app:app --host 0.0.0.0 --port $PORT`
5. Click **Deploy Web Service**!

### Option B: Deploy to Railway / Heroku
- The included `Procfile` allows Railway and Heroku to deploy instantly without any manual configuration.

### Option C: Docker
```bash
docker build -t prodigy-ems .

# Run the container
docker run -p 8000:8000 prodigy-ems
```

---

## 📡 REST API Reference


### Authentication
- `POST /api/auth/register` — Create new administrator
- `POST /api/auth/login` — Sign in and obtain 7-day Bearer token
- `GET /api/auth/me` — Verify current active administrator session
- `POST /api/auth/logout` — Invalidate session token
- `GET /api/employees/{id}` — Fetch detailed employee record by ID or employee code
- `POST /api/employees` — Create new employee record (enforces validations)
```
├── app.py                  # Main FastAPI application & REST routing
├── database.py             # SQLite setup, migrations, and seed data
├── models.py               # Pydantic validation schemas
├── auth.py                 # PBKDF2 hashing & session token management
├── requirements.txt        # Python dependency manifest
├── Procfile                # Heroku / Railway web process definition
├── render.yaml             # Render Blueprint deployment definition
├── Dockerfile              # Docker container definition
├── .env.example            # Environment variables template
├── README.md               # Complete documentation
└── static/
    ├── index.html          # Modern dashboard & auth portal
    ├── css/
    │   └── styles.css      # Glassmorphism, animations & custom styling
    └── js/
        └── app.js          # Full client-side application logic
```

---

## 👨‍💻 Author & Internship Details
- **Internship**: Prodigy Infotech Full Stack Developer Internship
>>>>>>> 1d0397d (Initial commit: employee management system)
