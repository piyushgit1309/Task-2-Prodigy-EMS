import sqlite3
import os
from datetime import datetime
import auth

_ACTIVE_DB_PATH = None

def get_db_path():
    global _ACTIVE_DB_PATH
    if _ACTIVE_DB_PATH:
        return _ACTIVE_DB_PATH

    env_path = os.environ.get("DATABASE_PATH")
    primary = os.path.join(os.path.dirname(__file__), "ems.db")
    fallback = "/tmp/ems.db"

    candidates = [p for p in [env_path, primary, fallback] if p]
    for p in candidates:
        try:
            conn = sqlite3.connect(p)
            conn.execute("CREATE TABLE IF NOT EXISTS _lock_probe (id INT)")
            conn.commit()
            conn.close()
            _ACTIVE_DB_PATH = p
            return _ACTIVE_DB_PATH
        except sqlite3.OperationalError:
            continue
    _ACTIVE_DB_PATH = fallback
    return _ACTIVE_DB_PATH

def get_db_connection():
    path = get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        admin_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_id TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        department TEXT NOT NULL,
        job_title TEXT NOT NULL,
        employment_type TEXT NOT NULL,
        joining_date TEXT NOT NULL,
        salary REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        address TEXT DEFAULT '',
        emergency_contact TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    cursor.execute("SELECT id FROM admins WHERE email = ?", ("admin@prodigy.com",))
    if not cursor.fetchone():
        now_str = datetime.utcnow().isoformat()
        cursor.execute("""
        INSERT INTO admins (name, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
        """, (
            "Prodigy Administrator",
            "admin@prodigy.com",
            auth.hash_password("admin123"),
            now_str
        ))

    cursor.execute("SELECT COUNT(*) as cnt FROM employees")
    if cursor.fetchone()["cnt"] == 0:
        seed_employees = [
            ("EMP-1001", "Aarav", "Sharma", "aarav.sharma@example.com", "+91 98765 43210", "Engineering", "Senior Full-Stack Engineer", "Full-Time", "2023-01-15", 1450000.0, "Active", "Bangalore, Karnataka", "+91 98765 00001"),
            ("EMP-1002", "Priya", "Patel", "priya.patel@example.com", "+91 98234 56789", "Product", "Lead Product Manager", "Full-Time", "2023-03-01", 1600000.0, "Active", "Mumbai, Maharashtra", "+91 98234 00002"),
            ("EMP-1003", "Rohan", "Verma", "rohan.verma@example.com", "+91 99112 23344", "Engineering", "DevOps & Cloud Architect", "Full-Time", "2023-06-10", 1500000.0, "Active", "Pune, Maharashtra", "+91 99112 00003"),
            ("EMP-1004", "Ananya", "Iyer", "ananya.iyer@example.com", "+91 97456 12345", "Design", "Senior UI/UX Designer", "Full-Time", "2023-08-20", 1200000.0, "Active", "Chennai, Tamil Nadu", "+91 97456 00004"),
            ("EMP-1005", "Vikram", "Malhotra", "vikram.malhotra@example.com", "+91 91234 87654", "Marketing", "Growth Marketing Lead", "Full-Time", "2023-11-05", 1100000.0, "On Leave", "New Delhi", "+91 91234 00005"),
            ("EMP-1006", "Sneha", "Kulkarni", "sneha.kulkarni@example.com", "+91 93456 78901", "Human Resources", "People Operations Lead", "Full-Time", "2024-01-10", 950000.0, "Active", "Hyderabad, Telangana", "+91 93456 00006"),
            ("EMP-1007", "Karan", "Singhania", "karan.singhania@example.com", "+91 94567 11223", "Finance", "Financial Analyst", "Contract", "2024-03-15", 850000.0, "Active", "Gurugram, Haryana", "+91 94567 00007"),
            ("EMP-1008", "Meera", "Nair", "meera.nair@example.com", "+91 95678 22334", "Engineering", "Frontend Developer Intern", "Internship", "2024-06-01", 360000.0, "Active", "Kochi, Kerala", "+91 95678 00008"),
            ("EMP-1009", "Arjun", "Reddy", "arjun.reddy@example.com", "+91 96789 33445", "Sales", "Enterprise Account Executive", "Full-Time", "2024-02-01", 1300000.0, "Active", "Bengaluru, Karnataka", "+91 96789 00009"),
            ("EMP-1010", "Tanvi", "Deshmukh", "tanvi.deshmukh@example.com", "+91 97890 44556", "Operations", "Operations Associate", "Part-Time", "2024-04-18", 480000.0, "Inactive", "Nagpur, Maharashtra", "+91 97890 00010")
        ]
        now_str = datetime.utcnow().isoformat()
        cursor.executemany("""
        INSERT INTO employees (
            emp_id, first_name, last_name, email, phone, department,
            job_title, employment_type, joining_date, salary, status,
            address, emergency_contact, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [(
            emp[0], emp[1], emp[2], emp[3], emp[4], emp[5],
            emp[6], emp[7], emp[8], emp[9], emp[10], emp[11], emp[12],
            now_str, now_str
        ) for emp in seed_employees])

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", get_db_path())
