from fastapi import APIRouter
from app.api.routes import auth, patients, doctors, documents, assignments, contact
from app.api.routes import visits, scheduling, family, timeline, alerts, notifications, admin, export_pdf
from app.api.routes import reviews, emergency, history, analytics
from app.api.routes import medicines
from app.api.routes import diseases
from app.api.routes import hospitals
from app.api.routes import assistant
from app.api.routes import wellness, sharing, messages, care, compare
from app.api.routes import practice
from app.api.routes import clinical

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(patients.router, prefix="/patients", tags=["patients"])
api_router.include_router(doctors.router, prefix="/doctors", tags=["doctors"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["assignments"])
api_router.include_router(contact.router, prefix="/contact", tags=["contact"])
api_router.include_router(visits.router, prefix="/visits", tags=["visits"])
api_router.include_router(scheduling.router, prefix="/scheduling", tags=["scheduling"])
api_router.include_router(family.router, prefix="/family", tags=["family"])
api_router.include_router(timeline.router, prefix="/timeline", tags=["timeline"])
api_router.include_router(alerts.router, prefix="/labs", tags=["labs"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(export_pdf.router, prefix="/export", tags=["export"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(emergency.router, prefix="/emergency", tags=["emergency"])
api_router.include_router(history.router, prefix="/history", tags=["history"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(medicines.router, prefix="/medicines", tags=["medicines"])
api_router.include_router(diseases.router, prefix="/diseases", tags=["diseases"])
api_router.include_router(hospitals.router, prefix="/hospitals", tags=["hospitals"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
api_router.include_router(wellness.router, prefix="/wellness", tags=["wellness"])
api_router.include_router(sharing.router, prefix="/sharing", tags=["sharing"])
api_router.include_router(messages.router, prefix="/messages", tags=["messages"])
api_router.include_router(care.router, prefix="/care", tags=["care"])
api_router.include_router(compare.router, prefix="/compare", tags=["compare"])
api_router.include_router(practice.router, prefix="/practice", tags=["practice"])
api_router.include_router(clinical.router, prefix="/clinical", tags=["clinical"])
