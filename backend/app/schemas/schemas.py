from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    role: str = Field(pattern="^(patient|doctor|admin)$")
    phone: str | None = None
    specialization: str | None = None
    license_no: str | None = None
    hospital: str | None = None
    admin_key: str | None = None  # required when role == admin


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    health_id: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class FirebaseLoginIn(BaseModel):
    """Exchange a Firebase ID token (from the web app) for a local MedRec JWT."""
    id_token: str
    role: str | None = Field(default=None, pattern="^(patient|doctor)$")
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = None
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
    height_cm: float | None = None
    weight_kg: float | None = None
    marital_status: str | None = None
    occupation: str | None = None
    smoking_status: str | None = None
    alcohol_use: str | None = None
    diet: str | None = None
    activity_level: str | None = None
    past_illnesses: str | None = None
    surgeries: str | None = None
    current_medications: str | None = None
    immunizations: str | None = None
    family_history_text: str | None = None
    menstrual_history: str | None = None
    mental_health: str | None = None


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
    education: str | None = None
    experience_years: int | None = None
    consultation_fee: float | None = None
    languages: str | None = None
    bio: str | None = None
    clinic_address: str | None = None
    timings: str | None = None


class DoctorProfileOut(DoctorProfileIn):
    id: str
    user_id: str

    class Config:
        from_attributes = True


class AssignmentCreate(BaseModel):
    # Link by email OR by AH-XXXX health ID (or raw UUID). One of them required.
    email: EmailStr | None = None
    health_id: str | None = None
    user_id: str | None = None


class AssignmentOut(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    doctor_name: str | None = None
    doctor_email: str | None = None
    doctor_health_id: str | None = None
    patient_name: str | None = None
    patient_email: str | None = None
    patient_health_id: str | None = None
    created_at: datetime


class DirectoryLookupOut(BaseModel):
    id: str
    full_name: str
    role: str
    health_id: str | None = None
    specialization: str | None = None
    hospital: str | None = None
    already_linked: bool = False


class DocumentOut(BaseModel):
    id: str
    owner_id: str
    title: str
    doc_type: str
    category: str | None = None
    report_kind: str | None = None
    doctor_name: str | None = None
    hospital: str | None = None
    visit_date: date | None = None
    notes: str | None = None
    family_member_id: str | None = None
    file_mimetype: str | None = None
    file_size: int | None = None
    has_summary: bool = False
    ocr_chars: int = 0
    has_text: bool = False
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
    height_cm: float | None = None
    weight_kg: float | None = None
    marital_status: str | None = None
    occupation: str | None = None
    smoking_status: str | None = None
    alcohol_use: str | None = None
    diet: str | None = None
    activity_level: str | None = None
    past_illnesses: str | None = None
    surgeries: str | None = None
    current_medications: str | None = None
    immunizations: str | None = None
    family_history_text: str | None = None
    menstrual_history: str | None = None
    mental_health: str | None = None


class FamilyMemberOut(FamilyMemberIn):
    id: str
    owner_id: str
    health_id: str | None = None
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
    family_member_id: str | None = None
    note_type: str = Field(default="note", pattern="^(note|prescription)$")
    title: str | None = None
    content: str = Field(min_length=3)
    medicines: list[MedicineIn] | None = None
    visit_date: date | None = None
    follow_up_date: date | None = None
    diagnosis_code: str | None = Field(default=None, max_length=20)
    diagnosis_name: str | None = Field(default=None, max_length=255)


class VisitNoteOut(BaseModel):
    id: str
    patient_id: str
    family_member_id: str | None = None
    doctor_id: str
    doctor_name: str | None = None
    note_type: str
    title: str | None = None
    content: str
    medicines: list | None = None
    visit_date: date | None = None
    follow_up_date: date | None = None
    diagnosis_code: str | None = None
    diagnosis_name: str | None = None
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
    doctor_id: str | None = None
    patient_id: str | None = None
    family_member_id: str | None = None
    date: date
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    reason: str | None = Field(default=None, max_length=500)
    consult_type: str = Field(default="in_person", pattern="^(in_person|video)$")


class AppointmentOut(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    family_member_id: str | None = None
    doctor_name: str | None = None
    patient_name: str | None = None
    date: date
    start_time: str
    end_time: str
    reason: str | None = None
    status: str
    consult_type: str = "in_person"
    video_url: str | None = None
    cancel_reason: str | None = None
    token_no: int | None = None
    checked_in: bool = False
    fee: float | None = None
    payment_status: str = "unpaid"
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
    family_member_id: str | None = None
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


class SiteReviewIn(BaseModel):
    """The user's own review of MedRec itself."""
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class SiteReviewOut(BaseModel):
    id: str
    user_id: str
    rating: int
    comment: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class OtpRequestIn(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None
    health_id: str | None = None
    purpose: str = Field(default="login", pattern="^(login|reset|register)$")


class OtpRequestOut(BaseModel):
    ok: bool = True
    sent_via: str = "dev-log"  # e.g. email, sms, email+sms, dev-log
    channels: list[str] = []  # destinations tried: ["email", "sms"]
    expires_in_minutes: int = 10
    # Only present in local dev when neither SMTP nor SMS is configured.
    dev_code: str | None = None


class OtpVerifyIn(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None
    health_id: str | None = None
    code: str = Field(min_length=4, max_length=10)
    purpose: str = Field(default="login", pattern="^(login|reset|register)$")


class ResetPasswordIn(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None
    health_id: str | None = None
    code: str = Field(min_length=4, max_length=10)
    new_password: str = Field(min_length=6, max_length=128)


class DeleteAccountIn(BaseModel):
    confirm: str = Field(description='Type "DELETE" to confirm')
    password: str | None = Field(default=None, description="Current password (local accounts)")


class EmergencyAlertIn(BaseModel):
    message: str | None = Field(default=None, max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    # Doctors/admins pass the assigned patient's id to raise an SOS for them.
    # Patients omit it (alert is filed under themselves).
    patient_id: str | None = None


class EmergencyAlertOut(BaseModel):
    id: str
    patient_id: str
    patient_name: str | None = None
    patient_email: str | None = None
    message: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: str
    resolved_by: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class FamilyHistoryIn(BaseModel):
    family_member_id: str | None = None  # null => self profile
    relation: str = Field(min_length=2, max_length=100)
    condition: str = Field(min_length=2, max_length=255)
    age_onset: int | None = Field(default=None, ge=0, le=120)
    status: str = Field(default="unknown", pattern="^(alive|deceased|unknown)$")
    severity: str | None = None
    year_diagnosed: int | None = Field(default=None, ge=1900, le=2100)
    notes: str | None = None


class FamilyHistoryOut(FamilyHistoryIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class LabResultOut(BaseModel):
    id: str
    document_id: str
    owner_id: str
    family_member_id: str | None = None
    test_key: str
    display_name: str
    value: float | None = None
    unit: str | None = None
    flag: str | None = None
    measured_at: date | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentVersionOut(BaseModel):
    id: str
    document_id: str
    version_no: int
    title: str | None = None
    notes: str | None = None
    visit_date: date | None = None
    doctor_name: str | None = None
    hospital: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    notes: str | None = None
    visit_date: date | None = None
    doctor_name: str | None = None
    hospital: str | None = None
    category: str | None = None
    report_kind: str | None = None


class PrescriptionTrendOut(BaseModel):
    medicine: str
    entries: list = []  # [{date, dosage, frequency, duration, doctor, visit_id}]


# ---- Vitals ----
class VitalIn(BaseModel):
    vital_type: str = Field(pattern="^(bp|sugar|weight|height|bmi|temp|spo2|pulse)$")
    value: float | None = None
    systolic: float | None = None
    diastolic: float | None = None
    unit: str | None = None
    notes: str | None = None
    measured_at: date | None = None
    family_member_id: str | None = None


class VitalOut(VitalIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Vaccinations ----
class VaccinationIn(BaseModel):
    vaccine_name: str = Field(min_length=2, max_length=255)
    dose_no: int = Field(default=1, ge=1, le=10)
    due_date: date | None = None
    given_date: date | None = None
    status: str = Field(default="due", pattern="^(due|given|missed)$")
    provider: str | None = None
    notes: str | None = None
    family_member_id: str | None = None


class VaccinationOut(VaccinationIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Sharing / consent ----
class ShareLinkIn(BaseModel):
    scope: str = Field(default="documents", pattern="^(documents|vitals|prescriptions|all)$")
    document_ids: list[str] | None = None
    expires_in_hours: int = Field(default=72, ge=1, le=24 * 30)
    max_views: int = Field(default=0, ge=0, le=1000)
    label: str | None = Field(default=None, max_length=255)


class ShareLinkOut(BaseModel):
    id: str
    token: str
    url_path: str | None = None
    scope: str
    expires_at: datetime | None = None
    max_views: int = 0
    views: int = 0
    revoked: bool = False
    label: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConsentIn(BaseModel):
    doctor_id: str
    scope: str = Field(pattern="^(records|vitals|prescriptions|chat)$")
    allowed: bool = True


class ConsentOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    doctor_name: str | None = None
    scope: str
    allowed: bool
    updated_at: datetime

    class Config:
        from_attributes = True


# ---- Chat ----
class MessageIn(BaseModel):
    doctor_id: str | None = None
    patient_id: str | None = None
    body: str = Field(min_length=1, max_length=4000)
    priority: str = Field(default="normal", pattern="^(normal|urgent)$")
    category: str = Field(
        default="general",
        pattern="^(general|query|followup|prescription|report|appointment|video|system)$",
    )
    attachment_document_id: str | None = None


class MessageOut(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    sender_id: str
    sender_name: str | None = None
    body: str
    priority: str = "normal"
    category: str = "general"
    attachment_document_id: str | None = None
    attachment_title: str | None = None
    sos_detected: bool = False
    read: bool = False
    read_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class VideoRequestIn(BaseModel):
    # The other side's id (doctor_id for patients, patient_id for doctors).
    # Accepts UUID, AH-XXXX or email.
    other_id: str
    date: date
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    reason: str | None = Field(default=None, max_length=500)


class PresenceOut(BaseModel):
    doctor_id: str
    doctor_name: str | None = None
    timings_line: str = ""
    on_leave_today: bool = False
    next_available: date | None = None
    total_patients: int = 0


# ---- Referrals ----
class ReferralIn(BaseModel):
    patient_id: str
    to_doctor_email: str | None = None
    to_doctor_id: str | None = None
    reason: str = Field(min_length=3, max_length=2000)
    note: str | None = None


class ReferralOut(BaseModel):
    id: str
    from_doctor_id: str
    from_doctor_name: str | None = None
    to_doctor_id: str | None = None
    to_doctor_email: str | None = None
    patient_id: str
    patient_name: str | None = None
    reason: str
    note: str | None = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Rx templates ----
class RxTemplateIn(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    content: str | None = None
    medicines: list | None = None
    signature_name: str | None = None


class RxTemplateOut(RxTemplateIn):
    id: str
    doctor_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Second opinions ----
class SecondOpinionIn(BaseModel):
    target_doctor_id: str
    document_ids: list[str] | None = None
    question: str = Field(min_length=5, max_length=3000)


class SecondOpinionOut(BaseModel):
    id: str
    patient_id: str
    patient_name: str | None = None
    target_doctor_id: str
    target_doctor_name: str | None = None
    document_ids: list | None = None
    question: str
    answer: str | None = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class SecondOpinionAnswerIn(BaseModel):
    answer: str = Field(min_length=3, max_length=5000)


# ---- Announcements ----
class AnnouncementIn(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    body: str = Field(min_length=5, max_length=5000)
    audience: str = Field(default="all", pattern="^(all|patients|doctors)$")


class AnnouncementOut(BaseModel):
    id: str
    title: str
    body: str
    audience: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Doctor practice suite ----
class LabOrderIn(BaseModel):
    patient_id: str
    test_name: str = Field(min_length=2, max_length=255)
    instructions: str | None = None
    due_date: date | None = None


class LabOrderOut(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    patient_name: str | None = None
    test_name: str
    instructions: str | None = None
    status: str
    due_date: date | None = None
    result_doc_id: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CarePlanIn(BaseModel):
    patient_id: str
    title: str = Field(min_length=2, max_length=255)
    diagnosis_code: str | None = Field(default=None, max_length=20)
    diagnosis_name: str | None = Field(default=None, max_length=255)
    tasks: list | None = None
    status: str = Field(default="active", pattern="^(active|completed|paused)$")
    start_date: date | None = None
    end_date: date | None = None


class CarePlanOut(CarePlanIn):
    id: str
    doctor_id: str
    patient_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CertificateIn(BaseModel):
    patient_id: str
    cert_type: str = Field(default="fitness", pattern="^(fitness|sick|leave|other)$")
    title: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=5, max_length=5000)
    valid_from: date | None = None
    valid_until: date | None = None


class CertificateOut(CertificateIn):
    id: str
    doctor_id: str
    patient_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class LeaveIn(BaseModel):
    date: date
    reason: str | None = Field(default=None, max_length=500)


class LeaveOut(BaseModel):
    id: str
    doctor_id: str
    date: date
    reason: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class BroadcastIn(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    body: str = Field(min_length=5, max_length=2000)


class BroadcastOut(BaseModel):
    id: str
    doctor_id: str
    title: str
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class PreVisitIn(BaseModel):
    appointment_id: str
    questions: list[str] | None = None
    answers: list | None = None


class PreVisitOut(BaseModel):
    id: str
    appointment_id: str
    doctor_id: str
    patient_id: str
    questions: list | None = None
    answers: list | None = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewReplyIn(BaseModel):
    review_id: str
    reply: str = Field(min_length=2, max_length=2000)


class ReviewReplyOut(BaseModel):
    id: str
    review_id: str
    doctor_id: str
    reply: str
    created_at: datetime

    class Config:
        from_attributes = True


class AuditOut(BaseModel):
    id: str
    actor_id: str
    actor_name: str | None = None
    action: str
    patient_id: str | None = None
    patient_name: str | None = None
    detail: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CheckinIn(BaseModel):
    checked_in: bool = True
    fee: float | None = None
    payment_status: str | None = Field(default=None, pattern="^(unpaid|paid|waived)$")


class SoapIn(BaseModel):
    notes: str = Field(min_length=5, max_length=5000)
    patient_id: str | None = None


class InteractionIn(BaseModel):
    medicines: list[str] = Field(min_length=1, max_length=30)


class RxSafetyIn(BaseModel):
    """Pre-prescription safety screen: patient + proposed medicine names."""
    patient_id: str
    medicines: list[str] = Field(min_length=1, max_length=30)


class NudgeIn(BaseModel):
    """Recall/nudge one assigned patient (overdue follow-up, due visit...)."""
    patient_id: str
    message: str = Field(min_length=3, max_length=500)


# ---- Structured clinical records (allergies / conditions / medications / surgeries) ----
class AllergyIn(BaseModel):
    allergen: str = Field(min_length=2, max_length=255)
    reaction: str | None = Field(default=None, max_length=500)
    severity: str | None = Field(default=None, pattern="^(mild|moderate|severe)$")
    status: str = Field(default="active", pattern="^(active|resolved)$")
    diagnosed_date: date | None = None
    notes: str | None = None
    family_member_id: str | None = None


class AllergyOut(AllergyIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConditionIn(BaseModel):
    condition_name: str = Field(min_length=2, max_length=255)
    kind: str = Field(default="chronic", pattern="^(chronic|past)$")
    status: str = Field(default="active", pattern="^(active|managed|resolved)$")
    severity: str | None = Field(default=None, pattern="^(mild|moderate|severe)$")
    diagnosed_date: date | None = None
    resolved_date: date | None = None
    notes: str | None = None
    family_member_id: str | None = None


class ConditionOut(ConditionIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class MedicationIn(BaseModel):
    medicine_name: str = Field(min_length=2, max_length=255)
    dosage: str | None = Field(default=None, max_length=255)
    frequency: str | None = Field(default=None, max_length=255)
    start_date: date | None = None
    end_date: date | None = None
    status: str = Field(default="ongoing", pattern="^(ongoing|stopped|completed)$")
    prescribed_by: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    family_member_id: str | None = None


class MedicationOut(MedicationIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class SurgeryIn(BaseModel):
    procedure_name: str = Field(min_length=2, max_length=255)
    surgery_date: date | None = None
    hospital: str | None = Field(default=None, max_length=255)
    surgeon: str | None = Field(default=None, max_length=255)
    outcome: str | None = Field(default=None, pattern="^(recovered|follow-up|complications)$")
    notes: str | None = None
    family_member_id: str | None = None


class SurgeryOut(SurgeryIn):
    id: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True
