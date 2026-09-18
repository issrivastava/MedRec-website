from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.deps import get_current_user, require_patient, is_assigned
from app.db.session import get_db
from app.models.tables import Review, SiteReview, User
from app.schemas.schemas import ReviewIn, ReviewOut, DoctorRatingOut, SiteReviewIn, SiteReviewOut
from app.services.notify import notify

router = APIRouter()


def _out(db: Session, r: Review, mask_patient: bool = False) -> dict:
    doc = db.query(User).filter_by(id=r.doctor_id).first()
    pat = db.query(User).filter_by(id=r.patient_id).first()
    pname = None
    if pat:
        # privacy: public views see first name only
        pname = pat.full_name.split(" ")[0] if mask_patient else pat.full_name
    return {"id": r.id, "doctor_id": r.doctor_id, "patient_id": r.patient_id,
            "doctor_name": doc.full_name if doc else None, "patient_name": pname,
            "rating": r.rating, "comment": r.comment, "created_at": r.created_at}


def _average(db: Session, doctor_id: str) -> tuple[float | None, int]:
    avg, count = db.query(func.avg(Review.rating), func.count(Review.id))\
        .filter_by(doctor_id=doctor_id).first()
    return (round(float(avg), 1) if avg is not None else None, count or 0)


@router.post("", response_model=ReviewOut, status_code=201)
def leave_review(data: ReviewIn, db: Session = Depends(get_db), user: User = Depends(require_patient)):
    """Rate an assigned doctor (one review per patient — resubmitting updates it)."""
    if not is_assigned(db, data.doctor_id, user.id):
        raise HTTPException(status_code=403, detail="You can only review your own doctors")
    existing = db.query(Review).filter_by(doctor_id=data.doctor_id, patient_id=user.id).first()
    if existing:
        existing.rating = data.rating
        existing.comment = data.comment
        db.commit()
        db.refresh(existing)
        return _out(db, existing)
    r = Review(doctor_id=data.doctor_id, patient_id=user.id, rating=data.rating, comment=data.comment)
    db.add(r)
    db.commit()
    db.refresh(r)
    notify(db, data.doctor_id, "review", f"New {data.rating}★ review from {user.full_name}",
           (data.comment or "")[:200], link="/doctor")
    return _out(db, r)


@router.get("/my", response_model=list[ReviewOut])
def my_reviews(db: Session = Depends(get_db), user: User = Depends(require_patient)):
    rows = db.query(Review).filter_by(patient_id=user.id).order_by(Review.created_at.desc()).all()
    return [_out(db, r) for r in rows]


@router.get("/received", response_model=list[ReviewOut])
def received_reviews(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Doctors only")
    rows = db.query(Review).filter_by(doctor_id=user.id).order_by(Review.created_at.desc()).all()
    return [_out(db, r) for r in rows]


@router.get("/doctor/{doctor_id}", response_model=list[ReviewOut])
def doctor_reviews(doctor_id: str, db: Session = Depends(get_db)):
    """Public: reviews for a doctor (patient names masked to first name)."""
    rows = db.query(Review).filter_by(doctor_id=doctor_id).order_by(Review.created_at.desc()).limit(50).all()
    return [_out(db, r, mask_patient=True) for r in rows]


@router.get("/doctor/{doctor_id}/rating", response_model=DoctorRatingOut)
def doctor_rating(doctor_id: str, db: Session = Depends(get_db)):
    doc = db.query(User).filter_by(id=doctor_id).first()
    avg, count = _average(db, doctor_id)
    return {"doctor_id": doctor_id, "doctor_name": doc.full_name if doc else None,
            "average": avg, "count": count}


@router.get("/recent", response_model=list[ReviewOut])
def recent_reviews(db: Session = Depends(get_db)):
    """Public: top recent reviews for landing-page testimonials."""
    rows = db.query(Review).filter(Review.rating >= 4).order_by(Review.created_at.desc()).limit(6).all()
    return [_out(db, r, mask_patient=True) for r in rows]


@router.delete("/{review_id}", status_code=204)
def delete_review(review_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.query(Review).filter_by(id=review_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role != "admin" and r.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    db.delete(r)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Own review of MedRec itself — visible only in the writer's own dashboard
# ---------------------------------------------------------------------------

@router.post("/site", response_model=SiteReviewOut, status_code=201)
def leave_site_review(data: SiteReviewIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Write your own review of MedRec (any logged-in user, one per user — resubmitting updates it)."""
    existing = db.query(SiteReview).filter_by(user_id=user.id).first()
    if existing:
        existing.rating = data.rating
        existing.comment = data.comment
        db.commit()
        db.refresh(existing)
        return existing
    r = SiteReview(user_id=user.id, rating=data.rating, comment=data.comment)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/site/my", response_model=SiteReviewOut | None)
def my_site_review(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """My own MedRec review (or null). Never listed publicly."""
    return db.query(SiteReview).filter_by(user_id=user.id).first()


@router.delete("/site/my", status_code=204)
def delete_site_review(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.query(SiteReview).filter_by(user_id=user.id).first()
    if r:
        db.delete(r)
        db.commit()
    return None
