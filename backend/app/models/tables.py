"""SQLAlchemy models for MedRec."""
import uuid
from datetime import datetime, date, time
from sqlalchemy import (
    String, Text, DateTime, Date, Time, Float, Boolean, ForeignKey, Integer, BigInteger,
    UniqueConstraint, JSON, Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import enum

from app.db.session import Base


def _uuid_col():
    # Use String UUID so the same models work on Postgres + SQLite
    return mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))


class Role(str, enum.Enum):
    patient = "patient"
    doctor = "doctor"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = _uuid_col()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True, index=True, default=None)
    firebase_uid: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True, index=True, default=None)
    avatar_path: Mapped[str | None] = mapped_column(String(1024), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def avatar_url(self) -> str | None:
        # Served by the /avatars static mount in main.py
        if not self.avatar_path:
            return None
        from pathlib import Path
        return f"/avatars/{Path(self.avatar_path).name}"

    patient_profile: Mapped["PatientProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    doctor_profile: Mapped["DoctorProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan",
        foreign_keys="Document.owner_id",
    )


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    allergies: Mapped[str | None] = mapped_column(Text, nullable=True)
    chronic_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Detailed clinical history
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    marital_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smoking_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    alcohol_use: Mapped[str | None] = mapped_column(String(100), nullable=True)
    diet: Mapped[str | None] = mapped_column(String(100), nullable=True)
    activity_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    past_illnesses: Mapped[str | None] = mapped_column(Text, nullable=True)
    surgeries: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_medications: Mapped[str | None] = mapped_column(Text, nullable=True)
    immunizations: Mapped[str | None] = mapped_column(Text, nullable=True)
    family_history_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    menstrual_history: Mapped[str | None] = mapped_column(Text, nullable=True)
    mental_health: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="patient_profile")


class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    specialization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    license_no: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    hospital: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)

    user: Mapped[User] = relationship(back_populates="doctor_profile")


class DoctorPatientAssignment(Base):
    """Links a doctor to a patient. Doctors only see assigned patients."""
    __tablename__ = "doctor_patient_assignments"
    __table_args__ = (UniqueConstraint("doctor_id", "patient_id", name="uq_doctor_patient"),)

    id: Mapped[str] = _uuid_col()
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = _uuid_col()
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), default="report")  # report|prescription|lab|scan|other
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # lab|imaging|cardiology|prescription|other
    report_kind: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # cbc|xray|mri|tsh|lft|...
    doctor_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    hospital: Mapped[str | None] = mapped_column(String(255), nullable=True)
    visit_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    file_mimetype: Mapped[str | None] = mapped_column(String(128), nullable=True)
    file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    owner: Mapped[User] = relationship(back_populates="documents", foreign_keys=[owner_id])
    ai_summary: Mapped["AiSummary | None"] = relationship(
        back_populates="document", cascade="all, delete-orphan", uselist=False
    )


class AiSummary(Base):
    __tablename__ = "ai_summaries"

    id: Mapped[str] = _uuid_col()
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), unique=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    key_findings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped[Document] = relationship(back_populates="ai_summary")


class LabResult(Base):
    """Persisted per-report lab values for trends + data analysis."""
    __tablename__ = "lab_results"

    id: Mapped[str] = _uuid_col()
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    test_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    flag: Mapped[str | None] = mapped_column(String(20), nullable=True)  # low|high|normal
    measured_at: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class DocumentVersion(Base):
    """Edit history for each report/prescription."""
    __tablename__ = "document_versions"

    id: Mapped[str] = _uuid_col()
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hospital: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AiSummaryHistory(Base):
    """Keeps every AI summary generation per report (language + model)."""
    __tablename__ = "ai_summary_history"

    id: Mapped[str] = _uuid_col()
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    key_findings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ContactMessage(Base):
    """Public 'Contact Us' submissions."""
    __tablename__ = "contact_messages"

    id: Mapped[str] = _uuid_col()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class FamilyMember(Base):
    """One account manages kids/parents/elder records."""
    __tablename__ = "family_members"

    id: Mapped[str] = _uuid_col()
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    relation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    allergies: Mapped[str | None] = mapped_column(Text, nullable=True)
    chronic_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Detailed clinical history (mirrors PatientProfile)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    marital_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smoking_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    alcohol_use: Mapped[str | None] = mapped_column(String(100), nullable=True)
    diet: Mapped[str | None] = mapped_column(String(100), nullable=True)
    activity_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    past_illnesses: Mapped[str | None] = mapped_column(Text, nullable=True)
    surgeries: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_medications: Mapped[str | None] = mapped_column(Text, nullable=True)
    immunizations: Mapped[str | None] = mapped_column(Text, nullable=True)
    family_history_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    menstrual_history: Mapped[str | None] = mapped_column(Text, nullable=True)
    mental_health: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FamilyHistoryEntry(Base):
    """Structured family history: condition per relative, per profile."""
    __tablename__ = "family_history_entries"

    id: Mapped[str] = _uuid_col()
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # null => self profile, else a family member profile
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="CASCADE"), nullable=True, index=True
    )
    relation: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. father, mother, sibling
    condition: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. diabetes, hypertension
    age_onset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="unknown")  # alive|deceased|unknown
    severity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    year_diagnosed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class VisitNote(Base):
    """Doctor-written e-prescription / visit note for a patient."""
    __tablename__ = "visit_notes"

    id: Mapped[str] = _uuid_col()
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    note_type: Mapped[str] = mapped_column(String(20), default="note")  # note|prescription
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    medicines: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{name,dosage,frequency,duration}]
    visit_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    follow_up_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AvailabilitySlot(Base):
    """Doctor's recurring weekly availability."""
    __tablename__ = "availability_slots"
    __table_args__ = (UniqueConstraint("doctor_id", "weekday", "start_time", name="uq_slot"),)

    id: Mapped[str] = _uuid_col()
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Monday
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = _uuid_col()
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="booked", index=True)  # booked|cancelled|completed
    consult_type: Mapped[str] = mapped_column(String(20), default="in_person")  # in_person|video
    video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LabReferenceRange(Base):
    """Default ranges + per-patient doctor-approved overrides (patient_id set)."""
    __tablename__ = "lab_reference_ranges"

    id: Mapped[str] = _uuid_col()
    test_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    min_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    patient_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class HealthAlert(Base):
    __tablename__ = "health_alerts"

    id: Mapped[str] = _uuid_col()
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    document_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    test_name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    flag: Mapped[str] = mapped_column(String(20), nullable=False)  # low|high
    message: Mapped[str] = mapped_column(Text, nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ref: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)  # dedup key
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Review(Base):
    """Patient rating + comment for an assigned doctor. One per patient per doctor."""
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("doctor_id", "patient_id", name="uq_review_doctor_patient"),)

    id: Mapped[str] = _uuid_col()
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..5
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class SiteReview(Base):
    """A user's own review of MedRec itself. Shown only in the writer's own dashboard."""
    __tablename__ = "site_reviews"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..5
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class OtpCode(Base):
    """Short-lived email OTP for login / registration / password reset.

    Only the SHA-256 hash of the code is stored. One row per request;
    verification marks the newest non-expired, non-consumed row consumed.
    """
    __tablename__ = "otp_codes"

    id: Mapped[str] = _uuid_col()
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True, default=None)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # login|reset|register
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class EmergencyAlert(Base):
    """Patient-triggered SOS. Notifies assigned doctors + emergency contact."""
    __tablename__ = "emergency_alerts"

    id: Mapped[str] = _uuid_col()
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active|resolved
    resolved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


# ---------------------------------------------------------------------------
# New feature tables: vitals, vaccinations, sharing, consent, chat,
# referrals, Rx templates, second opinions, announcements.
# ---------------------------------------------------------------------------

class Vital(Base):
    """Patient vitals time-series (BP, sugar, weight, BMI, temp, SpO2, pulse)."""
    __tablename__ = "vitals"

    id: Mapped[str] = _uuid_col()
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vital_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)  # bp|sugar|weight|bmi|temp|spo2|pulse
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    systolic: Mapped[float | None] = mapped_column(Float, nullable=True)
    diastolic: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    measured_at: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Vaccination(Base):
    """Vaccination schedule per profile."""
    __tablename__ = "vaccinations"

    id: Mapped[str] = _uuid_col()
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("family_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vaccine_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    dose_no: Mapped[int] = mapped_column(Integer, default=1)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    given_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="due", index=True)  # due|given|missed
    provider: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ShareLink(Base):
    """Time-expiring secure share link for records (public token, no login)."""
    __tablename__ = "share_links"

    id: Mapped[str] = _uuid_col()
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scope: Mapped[str] = mapped_column(String(30), default="documents")  # documents|vitals|prescriptions|all
    document_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)  # None => all docs
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_views: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unlimited
    views: Mapped[int] = mapped_column(Integer, default=0)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Consent(Base):
    """Granular per-doctor consent: which scopes a doctor may see."""
    __tablename__ = "consents"
    __table_args__ = (UniqueConstraint("patient_id", "doctor_id", "scope", name="uq_consent"),)

    id: Mapped[str] = _uuid_col()
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scope: Mapped[str] = mapped_column(String(30), nullable=False, index=True)  # records|vitals|prescriptions|chat
    allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Message(Base):
    """Secure doctor-patient chat message."""
    __tablename__ = "messages"

    id: Mapped[str] = _uuid_col()
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Referral(Base):
    """Doctor-to-doctor referral for a patient."""
    __tablename__ = "referrals"

    id: Mapped[str] = _uuid_col()
    from_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    to_doctor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    to_doctor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|accepted|declined|completed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class RxTemplate(Base):
    """Doctor's reusable prescription/note snippet."""
    __tablename__ = "rx_templates"

    id: Mapped[str] = _uuid_col()
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    medicines: Mapped[list | None] = mapped_column(JSON, nullable=True)
    signature_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class SecondOpinion(Base):
    """Patient request for a second opinion from another doctor."""
    __tablename__ = "second_opinions"

    id: Mapped[str] = _uuid_col()
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    document_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|answered|closed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Announcement(Base):
    """Admin broadcast to all / patients / doctors."""
    __tablename__ = "announcements"

    id: Mapped[str] = _uuid_col()
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(String(20), default="all")  # all|patients|doctors
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
