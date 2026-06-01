"""TESDA Application Form (assessment-only) — parse, validate, and defaults."""

from __future__ import annotations

import re
from copy import deepcopy

from .models import StudentRegistration

ASSESSMENT_CLIENT_TYPES = (
    ("tvet_graduating", "TVET Graduating Student"),
    ("tvet_graduate", "TVET graduate"),
    ("industry_worker", "Industry worker"),
    ("k12", "K-12"),
    ("ofw", "OFW"),
)

ASSESSMENT_TYPE_OPTIONS = (
    ("full_qualification", "Full Qualification"),
    ("coc", "COC"),
    ("renewal", "Renewal"),
)

ASSESSMENT_DEFAULT_SCHOOL_NAME = (
    "Valiant Technical Institute and Assessment Center, Inc."
)
ASSESSMENT_DEFAULT_SCHOOL_ADDRESS = (
    "Bangoy St., Salvacion, Panabo, Philippines, 8105"
)

TESDA_ASSESSMENT_EMPLOYMENT_CHOICES = (
    ("casual", "Casual"),
    ("job_order", "Job Order"),
    ("probationary", "Probationary"),
    ("permanent", "Permanent"),
    ("self_employed", "Self-Employed"),
    ("ofw", "OFW"),
)

TESDA_ASSESSMENT_EDUCATION_CHOICES = (
    ("elementary_graduate", "Elementary Graduate"),
    ("high_school_graduate", "High School Graduate"),
    ("tvet_graduate", "TVET Graduate"),
    ("college_level", "College Level"),
    ("college_graduate", "College Graduate"),
    ("others", "Others"),
)

WORK_FIELDS = (
    "company",
    "position",
    "inclusive_dates",
    "monthly_salary",
    "appointment_status",
    "years_experience",
)
TRAINING_FIELDS = ("title", "venue", "inclusive_dates", "hours", "conducted_by")
LICENSE_FIELDS = ("title", "year_taken", "venue", "rating", "remarks", "expiry_date")
COMPETENCY_FIELDS = (
    "title",
    "qualification_level",
    "industry_sector",
    "certificate_number",
    "date_issued",
    "expiration_date",
)

MONTH_YEAR_FIELDS = frozenset(
    {
        "inclusive_dates",
        "expiry_date",
        "date_issued",
        "expiration_date",
    }
)

INITIAL_TABLE_ROWS = 1
MAX_TABLE_ROWS = 20


def _empty_row(fields: tuple[str, ...]) -> dict[str, str]:
    return {f: "" for f in fields}


def normalize_month_year(value: str) -> str:
    """Normalize to mm/yyyy for storage and display."""
    raw = (value or "").strip()
    if not raw:
        return ""

    slash = re.match(r"^(\d{1,2})\s*/\s*(\d{4})$", raw)
    if slash:
        month = int(slash.group(1))
        if 1 <= month <= 12:
            return f"{month:02d}/{slash.group(2)}"
        return ""

    iso = re.match(r"^(\d{4})-(\d{2})$", raw)
    if iso:
        month = int(iso.group(2))
        if 1 <= month <= 12:
            return f"{iso.group(2)}/{iso.group(1)}"
        return ""

    return raw


def default_assessment_application_data() -> dict:
    return {
        "school_name": ASSESSMENT_DEFAULT_SCHOOL_NAME,
        "school_address": ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
        "assessment_title": "",
        "assessment_types": [],
        "client_types": [],
        "mother_name": "",
        "father_name": "",
        "tel_number": "",
        "fax": "",
        "contact_other": "",
        "zip_code": "",
        "age": "",
        "work_experience": [_empty_row(WORK_FIELDS) for _ in range(INITIAL_TABLE_ROWS)],
        "training_seminars": [_empty_row(TRAINING_FIELDS) for _ in range(INITIAL_TABLE_ROWS)],
        "licensure_exams": [_empty_row(LICENSE_FIELDS) for _ in range(INITIAL_TABLE_ROWS)],
        "competency_assessments": [
            _empty_row(COMPETENCY_FIELDS) for _ in range(INITIAL_TABLE_ROWS)
        ],
    }


def merge_assessment_application_data(stored: dict | None) -> dict:
    base = default_assessment_application_data()
    if not stored:
        return base
    merged = deepcopy(base)
    for key in (
        "school_name",
        "school_address",
        "assessment_title",
        "mother_name",
        "father_name",
        "tel_number",
        "fax",
        "contact_other",
        "zip_code",
        "age",
    ):
        if key in stored:
            merged[key] = stored.get(key) or ""

    merged["school_name"] = ASSESSMENT_DEFAULT_SCHOOL_NAME
    merged["school_address"] = ASSESSMENT_DEFAULT_SCHOOL_ADDRESS

    for list_key, fields in (
        ("assessment_types", None),
        ("client_types", None),
        ("work_experience", WORK_FIELDS),
        ("training_seminars", TRAINING_FIELDS),
        ("licensure_exams", LICENSE_FIELDS),
        ("competency_assessments", COMPETENCY_FIELDS),
    ):
        if list_key not in stored:
            continue
        value = stored[list_key]
        if fields is None:
            items = list(value) if isinstance(value, list) else []
            if list_key in ("assessment_types", "client_types") and len(items) > 1:
                items = items[:1]
            merged[list_key] = items
            continue
        rows = value if isinstance(value, list) else []
        merged_rows = []
        for item in rows:
            if not isinstance(item, dict):
                continue
            row = _empty_row(fields)
            row.update({k: str(item.get(k, "") or "") for k in fields})
            if any(row.values()):
                merged_rows.append(row)
        merged[list_key] = merged_rows or [_empty_row(fields)]
    return merged


def _table_row_indices(post, prefix: str, fields: tuple[str, ...]) -> list[int]:
    indices: set[int] = set()
    for field in fields:
        pattern = re.compile(rf"^{re.escape(prefix)}_{re.escape(field)}_(\d+)$")
        for key in post:
            match = pattern.match(key)
            if match:
                indices.add(int(match.group(1)))
    return sorted(indices)


def _parse_table_rows(post, prefix: str, fields: tuple[str, ...]) -> list[dict[str, str]]:
    rows = []
    for index in _table_row_indices(post, prefix, fields):
        row = {}
        has_value = False
        for field in fields:
            value = post.get(f"{prefix}_{field}_{index}", "").strip()
            if field in MONTH_YEAR_FIELDS and value:
                value = normalize_month_year(value)
            row[field] = value
            if value:
                has_value = True
        if has_value:
            rows.append(row)
    return rows


def parse_assessment_types(post) -> list[str]:
    """Single choice — stored as a one-item list for compatibility."""
    valid = {c[0] for c in ASSESSMENT_TYPE_OPTIONS}
    choice = (post.get("assessment_type") or "").strip()
    if choice in valid:
        return [choice]
    return []


def parse_assessment_client_types(post) -> list[str]:
    """Single choice — stored as a one-item list for compatibility."""
    valid = {c[0] for c in ASSESSMENT_CLIENT_TYPES}
    choice = (post.get("assessment_client_type") or "").strip()
    if choice in valid:
        return [choice]
    return []


def build_assessment_application_payload(post) -> dict:
    return {
        "school_name": ASSESSMENT_DEFAULT_SCHOOL_NAME,
        "school_address": ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
        "assessment_title": post.get("assessment_title", "").strip(),
        "assessment_types": parse_assessment_types(post),
        "client_types": parse_assessment_client_types(post),
        "mother_name": post.get("mother_name", "").strip(),
        "father_name": post.get("father_name", "").strip(),
        "tel_number": post.get("tel_number", "").strip(),
        "fax": post.get("fax", "").strip(),
        "contact_other": post.get("contact_other", "").strip(),
        "zip_code": post.get("zip_code", "").strip(),
        "age": post.get("age", "").strip(),
        "work_experience": _parse_table_rows(post, "work", WORK_FIELDS),
        "training_seminars": _parse_table_rows(post, "training", TRAINING_FIELDS),
        "licensure_exams": _parse_table_rows(post, "license", LICENSE_FIELDS),
        "competency_assessments": _parse_table_rows(post, "competency", COMPETENCY_FIELDS),
    }


def assessment_form_initial_extra(profile, reg) -> dict:
    """Assessment-only fields for template context."""
    if profile and profile.assessment_application_data:
        aa = merge_assessment_application_data(profile.assessment_application_data)
    elif reg:
        aa = default_assessment_application_data()
        aa["assessment_title"] = reg.selected_program or ""
    else:
        aa = default_assessment_application_data()
    return {"assessment_application": aa}


PH_MOBILE_RE = re.compile(r"^09\d{9}$")
PHONE_MSG = "Enter 11 digits including 09 (example: 09171234567)."


def validate_assessment_enrollment_data(data, *, require_photo=True) -> list[str]:
    errors = []
    required = [
        ("last_name", "Surname is required."),
        ("first_name", "First name is required."),
        ("email", "E-mail is required."),
        ("contact_number", "Mobile number is required."),
        ("region_code", "Region is required."),
        ("province_code", "Province is required."),
        ("city_code", "City / Municipality is required."),
        ("barangay_code", "Barangay is required."),
        ("street_house", "Number and street is required."),
        ("sex", "Sex is required."),
        ("civil_status", "Civil status is required."),
        ("employment_status", "Employment status is required."),
        ("birth_date", "Birth date is required."),
        ("birthplace", "Birth place is required."),
        ("educational_attainment", "Highest educational attainment is required."),
        ("signature", "Applicant's signature is required."),
    ]
    for field, message in required:
        if not data.get(field):
            errors.append(message)

    aa = data.get("assessment_application") or {}
    if not aa.get("school_name"):
        errors.append("Name of School / Training Center / Company is required.")
    if not aa.get("school_address"):
        errors.append("School / Training Center address is required.")
    if not aa.get("assessment_title"):
        errors.append("Title of Assessment applied for is required.")
    if not aa.get("assessment_types"):
        errors.append("Select an Assessment Type.")
    if not aa.get("client_types"):
        errors.append("Select a Client Type.")

    if data.get("contact_number") and not PH_MOBILE_RE.match(data["contact_number"]):
        errors.append(f"Mobile: {PHONE_MSG}")

    tel = aa.get("tel_number", "")
    if tel and not re.match(r"^0\d{6,10}$", re.sub(r"\D", "", tel)[:11] if tel else ""):
        pass  # tel optional, loose validation

    if not data.get("privacy_consent"):
        errors.append("You must certify that the information provided is true and correct.")

    photo = data.get("photo")
    if require_photo and not photo:
        errors.append("Passport-size photo is required.")
    elif photo:
        if photo.size > 5 * 1024 * 1024:
            errors.append("Photo must be 5MB or smaller.")
        content_type = getattr(photo, "content_type", "") or ""
        if content_type and content_type not in ("image/jpeg", "image/png"):
            errors.append("Photo must be JPEG or PNG format.")

    valid_sex = {c[0] for c in StudentRegistration.Gender.choices}
    if data.get("sex") and data["sex"] not in valid_sex:
        errors.append("Invalid sex value.")

    valid_civil = {c[0] for c in StudentRegistration.CivilStatus.choices}
    if data.get("civil_status") and data["civil_status"] not in valid_civil:
        errors.append("Invalid civil status.")

    valid_employment = {c[0] for c in TESDA_ASSESSMENT_EMPLOYMENT_CHOICES}
    if data.get("employment_status") and data["employment_status"] not in valid_employment:
        errors.append("Invalid employment status.")

    valid_education = {c[0] for c in TESDA_ASSESSMENT_EDUCATION_CHOICES}
    if data.get("educational_attainment") and data["educational_attainment"] not in valid_education:
        errors.append("Invalid educational attainment.")

    return errors
