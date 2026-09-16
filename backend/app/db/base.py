from app.db.session import Base  # noqa: F401
from app.models.tables import (  # noqa: F401
    User,
    PatientProfile,
    DoctorProfile,
    DoctorPatientAssignment,
    Document,
    AiSummary,
    ContactMessage,
    FamilyMember,
    VisitNote,
    AvailabilitySlot,
    Appointment,
    LabReferenceRange,
    HealthAlert,
    Notification,
    Review,
)
