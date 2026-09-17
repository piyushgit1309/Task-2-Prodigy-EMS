import os
import csv
import io
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Depends, Header, Query, status
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

import database
import auth
import models

# Initialize database schema and default seeds
database.init_db()

app = FastAPI(
    title="Prodigy Infotech - Employee Management System",
    description="Production-grade REST API for Employee Management System with JWT/Session Auth & Full CRUD.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

def get_current_admin(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing. Please log in."
        )
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <token>'."
        )
    token = parts[1]
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT s.token, s.expires_at, a.id, a.name, a.email, a.created_at
    FROM sessions s
    JOIN admins a ON s.admin_id = a.id
    WHERE s.token = ?
    """, (token,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please sign in again."
        )

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.utcnow() > expires_at:
        c2 = database.get_db_connection()
        c2.execute("DELETE FROM sessions WHERE token = ?", (token,))
        c2.commit()
        c2.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again."
        )

    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "created_at": row["created_at"]
    }

# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_admin(payload: models.AdminRegister):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM admins WHERE email = ?", (payload.email.lower().strip(),))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An administrator account with this email already exists.")

    pwd_hash = auth.hash_password(payload.password)
    now_str = datetime.utcnow().isoformat()
    cursor.execute("""
    INSERT INTO admins (name, email, password_hash, created_at)
    VALUES (?, ?, ?, ?)
    """, (payload.name.strip(), payload.email.lower().strip(), pwd_hash, now_str))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return {"success": True, "message": "Administrator registered successfully.", "admin_id": new_id}

@app.post("/api/auth/login")
def login_admin(payload: models.AdminLogin):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, password_hash FROM admins WHERE email = ?", (payload.email.lower().strip(),))
    admin = cursor.fetchone()

    if not admin or not auth.verify_password(payload.password, admin["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password. Please verify credentials.")

    token = auth.generate_token()
    now = datetime.utcnow()
    expires = now + timedelta(days=7)

    cursor.execute("""
    INSERT INTO sessions (token, admin_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
    """, (token, admin["id"], now.isoformat(), expires.isoformat()))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "token": token,
        "expires_at": expires.isoformat(),
        "admin": {
            "id": admin["id"],
            "name": admin["name"],
            "email": admin["email"]
        }
    }

@app.get("/api/auth/me")
def get_me(admin: dict = Depends(get_current_admin)):
    return {"authenticated": True, "admin": admin}

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        parts = authorization.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
            conn = database.get_db_connection()
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            conn.close()
    return {"success": True, "message": "Logged out successfully."}

# ==========================================
# EMPLOYEE CRUD ENDPOINTS
# ==========================================

@app.get("/api/employees")
def list_employees(
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    employment_type: Optional[str] = Query(None),
    sort_by: str = Query("created_at", regex="^(emp_id|first_name|last_name|department|salary|joining_date|created_at|status)$", description="Column to sort by"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin: dict = Depends(get_current_admin)
):
    conn = database.get_db_connection()
    cursor = conn.cursor()

    conditions = []
    params = []

    if search:
        s_term = f"%{search.strip()}%".lower()
        conditions.append("""(
            LOWER(emp_id) LIKE ? OR
            LOWER(first_name) LIKE ? OR
            LOWER(last_name) LIKE ? OR
            LOWER(email) LIKE ? OR
            LOWER(job_title) LIKE ? OR
            LOWER(department) LIKE ?
        )""")
        params.extend([s_term] * 6)

    if department and department != "All":
        conditions.append("department = ?")
        params.append(department)

    if status and status != "All":
        conditions.append("status = ?")
        params.append(status)

    if employment_type and employment_type != "All":
        conditions.append("employment_type = ?")
        params.append(employment_type)

    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

    count_sql = f"SELECT COUNT(*) as total FROM employees{where_clause}"
    cursor.execute(count_sql, params)
    total = cursor.fetchone()["total"]

    order_clause = f" ORDER BY {sort_by} {sort_order.upper()}"
    offset = (page - 1) * page_size
    limit_clause = f" LIMIT ? OFFSET ?"
    query_params = list(params) + [page_size, offset]

    select_sql = f"SELECT * FROM employees{where_clause}{order_clause}{limit_clause}"
    cursor.execute(select_sql, query_params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return {
        "employees": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }

@app.get("/api/employees/analytics")
def get_analytics(admin: dict = Depends(get_current_admin)):
    conn = database.get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(salary), 0) as total_sal, COALESCE(AVG(salary), 0) as avg_sal FROM employees")
    overall = cursor.fetchone()

    cursor.execute("SELECT status, COUNT(*) as cnt FROM employees GROUP BY status")
    status_counts = {r["status"]: r["cnt"] for r in cursor.fetchall()}

    cursor.execute("""
    SELECT department, COUNT(*) as cnt, COALESCE(SUM(salary), 0) as total_salary, COALESCE(AVG(salary), 0) as avg_salary
    FROM employees
    GROUP BY department
    ORDER BY cnt DESC
    """)
    dept_rows = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
    SELECT employment_type, COUNT(*) as cnt
    FROM employees
    GROUP BY employment_type
    ORDER BY cnt DESC
    """)
    emp_type_rows = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "total_employees": overall["cnt"],
        "total_payroll": round(overall["total_sal"], 2),
        "avg_salary": round(overall["avg_sal"], 2),
        "active_count": status_counts.get("Active", 0),
        "on_leave_count": status_counts.get("On Leave", 0),
        "inactive_count": status_counts.get("Inactive", 0),
        "terminated_count": status_counts.get("Terminated", 0),
        "departments": dept_rows,
        "employment_types": emp_type_rows
    }

@app.get("/api/employees/export/csv")
def export_employees_csv(admin: dict = Depends(get_current_admin)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM employees ORDER BY emp_id ASC")
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Database ID", "Employee ID", "First Name", "Last Name", "Email",
        "Phone", "Department", "Job Title", "Employment Type",
        "Date of Joining", "Salary", "Status", "Address", "Emergency Contact",
        "Created At", "Updated At"
    ])

    for r in rows:
        writer.writerow([
            r["id"], r["emp_id"], r["first_name"], r["last_name"], r["email"],
            r["phone"], r["department"], r["job_title"], r["employment_type"],
            r["joining_date"], r["salary"], r["status"], r["address"], r["emergency_contact"],
            r["created_at"], r["updated_at"]
        ])

    output.seek(0)
    filename = f"employees_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/employees/{id_or_emp_id}")
def get_employee(id_or_emp_id: str, admin: dict = Depends(get_current_admin)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    if id_or_emp_id.isdigit():
        cursor.execute("SELECT * FROM employees WHERE id = ? OR emp_id = ?", (int(id_or_emp_id), id_or_emp_id))
    else:
        cursor.execute("SELECT * FROM employees WHERE emp_id = ?", (id_or_emp_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Employee '{id_or_emp_id}' not found.")
    return dict(row)

@app.post("/api/employees", status_code=status.HTTP_201_CREATED)
def create_employee(payload: models.EmployeeCreate, admin: dict = Depends(get_current_admin)):
    conn = database.get_db_connection()
    cursor = conn.cursor()

    # Unique emp_id check
    cursor.execute("SELECT id FROM employees WHERE emp_id = ?", (payload.emp_id,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Employee ID '{payload.emp_id}' already exists.")

    # Unique email check
    cursor.execute("SELECT id FROM employees WHERE email = ?", (payload.email.lower().strip(),))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Email address '{payload.email}' already exists.")

    now_str = datetime.utcnow().isoformat()
    cursor.execute("""
    INSERT INTO employees (
        emp_id, first_name, last_name, email, phone, department,
        job_title, employment_type, joining_date, salary, status,
        address, emergency_contact, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payload.emp_id,
        payload.first_name.strip(),
        payload.last_name.strip(),
        payload.email.lower().strip(),
        payload.phone.strip(),
        payload.department.strip(),
        payload.job_title.strip(),
        payload.employment_type,
        payload.joining_date,
        payload.salary,
        payload.status,
        payload.address.strip() if payload.address else "",
        payload.emergency_contact.strip() if payload.emergency_contact else "",
        now_str,
        now_str
    ))
    conn.commit()
    new_id = cursor.lastrowid

    cursor.execute("SELECT * FROM employees WHERE id = ?", (new_id,))
    created_record = dict(cursor.fetchone())
    conn.close()

    return {"success": True, "message": "Employee record created successfully.", "employee": created_record}

@app.put("/api/employees/{id}")
def update_employee(id: int, payload: models.EmployeeUpdate, admin: dict = Depends(get_current_admin)):
    conn = database.get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM employees WHERE id = ?", (id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Employee with ID {id} not found.")

    if payload.email:
        new_email = payload.email.lower().strip()
        cursor.execute("SELECT id FROM employees WHERE email = ? AND id != ?", (new_email, id))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail=f"Email '{payload.email}' is already taken by another employee.")

    update_fields = {}
    if payload.first_name is not None: update_fields["first_name"] = payload.first_name.strip()
    if payload.last_name is not None: update_fields["last_name"] = payload.last_name.strip()
    if payload.email is not None: update_fields["email"] = payload.email.lower().strip()
    if payload.phone is not None: update_fields["phone"] = payload.phone.strip()
    if payload.department is not None: update_fields["department"] = payload.department.strip()
    if payload.job_title is not None: update_fields["job_title"] = payload.job_title.strip()
    if payload.employment_type is not None: update_fields["employment_type"] = payload.employment_type
    if payload.joining_date is not None: update_fields["joining_date"] = payload.joining_date
    if payload.salary is not None: update_fields["salary"] = payload.salary
    if payload.status is not None: update_fields["status"] = payload.status
    if payload.address is not None: update_fields["address"] = payload.address.strip()
    if payload.emergency_contact is not None: update_fields["emergency_contact"] = payload.emergency_contact.strip()

    if not update_fields:
        conn.close()
        return {"success": True, "message": "No changes were provided.", "employee": dict(existing)}

    update_fields["updated_at"] = datetime.utcnow().isoformat()
    set_clause = ", ".join([f"{k} = ?" for k in update_fields.keys()])
    values = list(update_fields.values()) + [id]

    cursor.execute(f"UPDATE employees SET {set_clause} WHERE id = ?", values)
    conn.commit()

    cursor.execute("SELECT * FROM employees WHERE id = ?", (id,))
    updated_record = dict(cursor.fetchone())
    conn.close()

    return {"success": True, "message": "Employee updated successfully.", "employee": updated_record}

@app.delete("/api/employees/{id}")
def delete_employee(id: int, admin: dict = Depends(get_current_admin)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, first_name, last_name, emp_id FROM employees WHERE id = ?", (id,))
    emp = cursor.fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Employee with ID {id} not found.")

    cursor.execute("DELETE FROM employees WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": f"Employee {emp['first_name']} {emp['last_name']} ({emp['emp_id']}) was successfully deleted."}

@app.post("/api/employees/bulk-delete")
def bulk_delete_employees(ids: List[int], admin: dict = Depends(get_current_admin)):
    if not ids:
        raise HTTPException(status_code=400, detail="No employee IDs provided.")
    conn = database.get_db_connection()
    cursor = conn.cursor()
    placeholders = ",".join(["?" for _ in ids])
    cursor.execute(f"DELETE FROM employees WHERE id IN ({placeholders})", ids)
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Successfully deleted {deleted_count} employee records."}

@app.get("/", response_class=HTMLResponse)
def serve_home():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Employee Management System</h1><p>Frontend static files loading...</p>")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on http://localhost:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
