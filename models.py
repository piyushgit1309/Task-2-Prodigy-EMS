from pydantic import BaseModel, Field, validator
from typing import Optional
import re
from datetime import datetime

EMAIL_REGEX = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

class AdminRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Administrator full name")
    email: str = Field(..., description="Valid admin email address")
    password: str = Field(..., min_length=6, max_length=100, description="Master password (min 6 characters)")

    @validator("email")
    def validate_email(cls, v):
        cleaned = v.strip().lower()
        if not re.match(EMAIL_REGEX, cleaned):
            raise ValueError("Invalid email address format (e.g. user@example.com)")
        return cleaned

class AdminLogin(BaseModel):
    email: str = Field(..., description="Administrator email")
    password: str = Field(..., min_length=1, description="Password")

    @validator("email")
    def validate_email(cls, v):
        cleaned = v.strip().lower()
        if not re.match(EMAIL_REGEX, cleaned):
            raise ValueError("Invalid email address format")
        return cleaned

class EmployeeBase(BaseModel):
    emp_id: str = Field(..., min_length=3, max_length=20, description="Unique Employee ID (e.g. EMP-1001)")
    first_name: str = Field(..., min_length=1, max_length=50, description="First name")
    last_name: str = Field(..., min_length=1, max_length=50, description="Last name")
    email: str = Field(..., description="Unique employee work email")
    phone: str = Field(..., min_length=7, max_length=25, description="Contact phone number")
    department: str = Field(..., min_length=2, max_length=50, description="Department")
    job_title: str = Field(..., min_length=2, max_length=80, description="Job title / designation")
    employment_type: str = Field(..., description="Full-Time, Part-Time, Contract, Internship")
    joining_date: str = Field(..., description="Joining date in YYYY-MM-DD format")
    salary: float = Field(..., gt=0, description="Annual compensation, must be positive")
    status: str = Field(default="Active", description="Active, On Leave, Inactive, Terminated")
    address: Optional[str] = Field(default="", max_length=255)
    emergency_contact: Optional[str] = Field(default="", max_length=50)

    @validator("emp_id")
    def validate_emp_id(cls, v):
        cleaned = v.strip().upper()
        if not re.match(r"^[A-Z0-9\-_]{3,20}$", cleaned):
            raise ValueError("Employee ID must be 3-20 alphanumeric characters or hyphens (e.g. EMP-1001)")
        return cleaned

    @validator("email")
    def validate_email(cls, v):
        cleaned = v.strip().lower()
        if not re.match(EMAIL_REGEX, cleaned):
            raise ValueError("Invalid employee email address")
        return cleaned

    @validator("phone")
    def validate_phone(cls, v):
        cleaned = v.strip()
        if not re.match(r"^[+0-9\s\-()]{7,25}$", cleaned):
            raise ValueError("Invalid phone number format")
        return cleaned

    @validator("joining_date")
    def validate_joining_date(cls, v):
        try:
            datetime.strptime(v.strip(), "%Y-%m-%d")
        except ValueError:
            raise ValueError("Date of joining must be in YYYY-MM-DD format")
        return v.strip()

    @validator("status")
    def validate_status(cls, v):
        allowed = {"Active", "On Leave", "Inactive", "Terminated"}
        v_title = v.strip().title()
        if v_title not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(allowed)}")
        return v_title

    @validator("employment_type")
    def validate_employment_type(cls, v):
        allowed = {"Full-Time", "Part-Time", "Contract", "Internship"}
        v_clean = v.strip()
        matched = [a for a in allowed if a.lower() == v_clean.lower()]
        if not matched:
            raise ValueError(f"Employment type must be one of: {', '.join(allowed)}")
        return matched[0]

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    employment_type: Optional[str] = None
    joining_date: Optional[str] = None
    salary: Optional[float] = Field(None, gt=0)
    status: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None

    @validator("email")
    def validate_email(cls, v):
        if v is None:
            return v
        cleaned = v.strip().lower()
        if not re.match(EMAIL_REGEX, cleaned):
            raise ValueError("Invalid email address format")
        return cleaned

    @validator("phone")
    def validate_phone(cls, v):
        if v is None:
            return v
        cleaned = v.strip()
        if not re.match(r"^[+0-9\s\-()]{7,25}$", cleaned):
            raise ValueError("Invalid phone number format")
        return cleaned

    @validator("joining_date")
    def validate_joining_date(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v.strip(), "%Y-%m-%d")
        except ValueError:
            raise ValueError("Date of joining must be in YYYY-MM-DD format")
        return v.strip()

    @validator("status")
    def validate_status(cls, v):
        if v is None:
            return v
        allowed = {"Active", "On Leave", "Inactive", "Terminated"}
        v_title = v.strip().title()
        if v_title not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(allowed)}")
        return v_title
