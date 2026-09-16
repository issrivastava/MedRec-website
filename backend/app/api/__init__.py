from fastapi import APIRouter
from app.api.routes import auth, patients, doctors, documents, assignments, contact
from app.api.routes import visits, scheduling, family, timeline, alerts, notifications, admin, export_pdf
from app.api.routes import reviews

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
