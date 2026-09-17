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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class VisitNote(Base):
    """Doctor-written e-prescription / visit note for a patient."""
    __tablename__ = "visit_notes"

    id: Mapped[str] = _uuid_col()
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
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
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="booked", index=True)  # booked|cancelled|completed
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


class OtpCode(Base):
    """Short-lived email OTP for login / registration / password reset.

    Only the SHA-256 hash of the code is stored. One row per request;
    verification marks the newest non-expired, non-consumed row consumed.
    """
    __tablename__ = "otp_codes"

    id: Mapped[str] = _uuid_col()
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
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
