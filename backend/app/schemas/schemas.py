from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    role: str = Field(pattern="^(patient|doctor|admin)$")
    specialization: str | None = None
    license_no: str | None = None
    hospital: str | None = None
    admin_key: str | None = None  # required when role == admin


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    avatar_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class FirebaseLoginIn(BaseModel):
    """Exchange a Firebase ID token (from the web app) for a local MedRec JWT."""
    id_token: str
    role: str | None = Field(default=None, pattern="^(patient|doctor)$")
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    specialization: str | None = None
    license_no: str | None = None
    hospital: str | None = None


class PatientProfileIn(BaseModel):
    dob: date | None = None
    gender: str | None = None
    blood_group: str | None = None
    phone: str | None = None
    address: str | None = None
    allergies: str | None = None
    chronic_conditions: str | None = None
    emergency_contact: str | None = None


class PatientProfileOut(PatientProfileIn):
    id: str
    user_id: str

    class Config:
        from_attributes = True


class DoctorProfileIn(BaseModel):
    specialization: str | None = None
    license_no: str | None = None
    hospital: str | None = None
    phone: str | None = None


class DoctorProfileOut(DoctorProfileIn):
    id: str
    user_id: str

    class Config:
        from_attributes = True


class AssignmentCreate(BaseModel):
    # doctor adds patient by email OR patient adds doctor by email
    email: EmailStr


class AssignmentOut(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    doctor_name: str | None = None
    doctor_email: str | None = None
    patient_name: str | None = None
    patient_email: str | None = None
    created_at: datetime


class DocumentOut(BaseModel):
    id: str
    owner_id: str
    title: str
    doc_type: str
    doctor_name: str | None = None
    hospital: str | None = None
    visit_date: date | None = None
    notes: str | None = None
    family_member_id: str | None = None
    file_mimetype: str | None = None
    file_size: int | None = None
    has_summary: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class AiSummaryOut(BaseModel):
    id: str
    document_id: str
    summary_text: str
    key_findings: list | None = None
    model_used: str | None = None
    language: str = "en"
    created_at: datetime

    class Config:
        from_attributes = True


class OverallSummaryOut(BaseModel):
    patient_id: str
    summary_text: str
    model_used: str
    documents_used: int


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    subject: str | None = Field(default=None, max_length=255)
    message: str = Field(min_length=10, max_length=5000)


class ContactOut(BaseModel):
    id: str
    name: str
    email: str
    subject: str | None = None
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class FamilyMemberIn(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    relation: str | None = None
    dob: date | None = None
    gender: str | None = None
    blood_group: str | None = None
    phone: str | None = None
    allergies: str | None = None
    chronic_conditions: str | None = None
    notes: str | None = None


class FamilyMemberOut(FamilyMemberIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class MedicineIn(BaseModel):
    name: str
    dosage: str | None = None
    frequency: str | None = None
    duration: str | None = None


class VisitNoteIn(BaseModel):
    patient_id: str
    note_type: str = Field(default="note", pattern="^(note|prescription)$")
    title: str | None = None
    content: str = Field(min_length=3)
    medicines: list[MedicineIn] | None = None
    visit_date: date | None = None
    follow_up_date: date | None = None


class VisitNoteOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    doctor_name: str | None = None
    note_type: str
    title: str | None = None
    content: str
    medicines: list | None = None
    visit_date: date | None = None
    follow_up_date: date | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AvailabilityIn(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")  # HH:MM
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")


class AvailabilityOut(BaseModel):
    id: str
    doctor_id: str
    weekday: int
    start_time: str
    end_time: str

    class Config:
        from_attributes = True


class AppointmentIn(BaseModel):
    doctor_id: str
    date: date
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    reason: str | None = Field(default=None, max_length=500)


class AppointmentOut(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    doctor_name: str | None = None
    patient_name: str | None = None
    date: date
    start_time: str
    end_time: str
    reason: str | None = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class LabRangeIn(BaseModel):
    test_key: str
    display_name: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    unit: str | None = None
    patient_id: str | None = None  # set => per-patient doctor-approved override


class LabRangeOut(BaseModel):
    id: str
    test_key: str
    display_name: str
    min_value: float | None = None
    max_value: float | None = None
    unit: str | None = None
    patient_id: str | None = None
    is_default: bool = False

    class Config:
        from_attributes = True


class HealthAlertOut(BaseModel):
    id: str
    patient_id: str
    document_id: str | None = None
    test_name: str
    value: float | None = None
    unit: str | None = None
    flag: str
    message: str
    acknowledged: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    body: str | None = None
    link: str | None = None
    read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class AdminStatsOut(BaseModel):
    users_total: int
    patients: int
    doctors: int
    admins: int
    documents: int
    appointments_booked: int
    visit_notes: int
    contact_messages: int
    unread_contact: int = 0
    reviews: int = 0


class ReviewIn(BaseModel):
    doctor_id: str
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class ReviewOut(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    doctor_name: str | None = None
    patient_name: str | None = None
    rating: int
    comment: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class DoctorRatingOut(BaseModel):
    doctor_id: str
    doctor_name: str | None = None
    average: float | None = None
    count: int = 0
