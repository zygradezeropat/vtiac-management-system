import io
import re
from typing import Dict, List, Any, Optional

try:
    import pypdf
except ImportError:
    pypdf = None


def extract_text_from_pdf_stream(stream) -> str:
    """Extract plain text across all pages in the PDF stream or bytes."""
    if pypdf is None:
        raise RuntimeError("pypdf is not installed. Please install pypdf to parse PDF files.")

    if isinstance(stream, (bytes, bytearray)):
        stream = io.BytesIO(stream)

    reader = pypdf.PdfReader(stream)
    text_chunks = []
    for page_idx, page in enumerate(reader.pages):
        try:
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_chunks.append(page_text)
        except Exception:
            continue
    return "\n\n".join(text_chunks)


def extract_qualification_name(full_text: str) -> Optional[str]:
    """
    Attempt to extract the qualification name (e.g., 'DRIVING (Passenger Bus/Straight Truck) NC III').
    """
    # Pattern 1: TRAINING REGULATIONS FOR <NAME>
    m1 = re.search(
        r"TRAINING\s+REGULATIONS\s+FOR\s+([A-Za-z0-9\s\(\)/,\.\-]+?)(?:\n\s*SECTION|\n\s*The|\n\s*1\.|\Z)",
        full_text,
        re.IGNORECASE,
    )
    if m1:
        name = m1.group(1).strip()
        name = re.sub(r"\s+", " ", name)
        if len(name) > 3 and len(name) < 120:
            return name

    # Pattern 2: SECTION 1 <NAME> QUALIFICATION
    m2 = re.search(r"SECTION\s*1\s+([A-Za-z0-9\s\(\)/,\.\-]+?)\s+QUALIFICATION", full_text, re.IGNORECASE)
    if m2:
        name = m2.group(1).strip()
        name = re.sub(r"\s+", " ", name)
        if len(name) > 3 and len(name) < 120:
            return name

    return None


def clean_ocr_text(text: str) -> str:
    """Repair common OCR/PDF kerning breaks (e.g. 'R oad' -> 'Road', 'a nd' -> 'and')."""
    text = re.sub(r"\b([A-Za-z])\s+([a-z]{2,})\b", r"\1\2", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_tesda_competencies(full_text: str) -> List[Dict[str, Any]]:
    """
    Parse units of competency from a TESDA Training Regulations (TR) document text.
    Extracts Category (Basic, Common, Core), Unit Code, Title, and Nominal Hours.
    Handles wrapped multi-line titles seamlessly.
    """
    lines = [ln.strip() for ln in full_text.splitlines()]
    results: List[Dict[str, Any]] = []

    # State tracking
    current_category: Optional[str] = None
    in_units_section = False
    last_item: Optional[Dict[str, Any]] = None

    # Regex for Unit Code:
    # Supports numeric, alphanumeric, and space-split codes like 'ALT83230 9'
    code_pattern = re.compile(
        r"^([A-Z]{2,6}\s*[-_./]?\s*(?:\d\s*){4,12}|(?:\d\s*){5,12}|(?:CORE|BASIC|COMMON|UNIT|UOC)[-_ ]?\d+)\s+(.*)$",
        re.IGNORECASE,
    )

    # Patterns indicating the start of units section
    start_indicators = (
        "the units of competency comprising this qualification",
        "units of competency comprising",
        "units of competency include the following",
        "list of units of competency",
        "units of competency:",
    )

    # Patterns indicating the end of units section
    end_indicators = (
        "a person who has achieved this qualification",
        "a person who achieved this qualification",
        "career opportunities",
        "section 2",
        "section ii",
        "trainee requirements",
        "trainee entry requirements",
    )

    for line in lines:
        if not line:
            continue

        lower_line = line.lower()
        upper_line = line.upper()

        # Check section start trigger
        if any(ind in lower_line for ind in start_indicators):
            in_units_section = True

        # Check section end trigger
        if in_units_section and any(lower_line.startswith(end_ind) for end_ind in end_indicators):
            # Once we already collected competencies and reach Section 2 or career notes, stop
            if len(results) > 0:
                break

        # Category switches
        if "BASIC COMPETENC" in upper_line:
            current_category = "basic"
            in_units_section = True
            last_item = None
            continue
        elif "COMMON COMPETENC" in upper_line:
            current_category = "common"
            in_units_section = True
            last_item = None
            continue
        elif "CORE COMPETENC" in upper_line:
            current_category = "core"
            in_units_section = True
            last_item = None
            continue
        elif "ELECTIVE COMPETENC" in upper_line:
            current_category = "core"
            in_units_section = True
            last_item = None
            continue

        if not in_units_section or not current_category:
            continue

        # Skip table column headers or horizontal rules
        if re.match(r"^(CODE\s*NO\.?|CODE|UNITS?\s*OF\s*COMPETENCY|NOMINAL\s*HOURS?|HOURS?|MODULE\s*TITLE)$", line, re.IGNORECASE):
            continue
        if re.match(r"^[-=_*]{3,}$", line):
            continue

        # Check if line matches a unit code + title
        match = code_pattern.match(line)
        if match:
            code_raw = re.sub(r"\s+", "", match.group(1)).upper()
            title_raw = clean_ocr_text(match.group(2))

            # Check if title has trailing hours, e.g. "Lead Workplace Communication 10 hrs" or "10"
            hours = 10 if current_category == "basic" else (20 if current_category == "common" else 40)
            hours_match = re.search(r"^(.*?)\s+(\d{1,4})\s*(?:hours|hrs|hr)?\s*$", title_raw, re.IGNORECASE)
            if hours_match:
                candidate_title = hours_match.group(1).strip()
                # Ensure candidate title is substantial, not just a single word
                if len(candidate_title) > 3:
                    title_raw = candidate_title
                    try:
                        hours = int(hours_match.group(2))
                    except (ValueError, TypeError):
                        pass

            item = {
                "category": current_category,
                "code": code_raw,
                "title": title_raw,
                "nominal_hours": hours,
                "learning_outcomes": [],
            }
            results.append(item)
            last_item = item
        elif last_item:
            # Check if line is not footer noise, page number, or document code
            is_noise = (
                re.match(r"^(page\s*\d+|\d+|tesda|tr\s*[-_]|date\s*promulgated).*$", lower_line)
                or "tesda-sop" in lower_line
                or lower_line.startswith("issued by")
            )
            if not is_noise:
                # Wrapped continuation of the previous unit title
                last_item["title"] = clean_ocr_text(f"{last_item['title']} {line}")

    # Clean up results (remove duplicates and strip whitespace)
    cleaned_results: List[Dict[str, Any]] = []
    seen_codes = set()

    for idx, r in enumerate(results, start=1):
        code_key = (r["code"].lower(), r["title"].lower())
        if code_key in seen_codes:
            continue
        seen_codes.add(code_key)

        r["title"] = clean_ocr_text(r["title"])
        r["sort_order"] = idx
        cleaned_results.append(r)

    return cleaned_results


def attach_learning_outcomes_from_standards(full_text: str, competencies: List[Dict[str, Any]]) -> None:
    """
    Scans Section 2 (Competency Standards) and Section 3 of the TESDA TR text
    to extract the specific Elements / Learning Outcomes for each competency unit.
    """
    for comp in competencies:
        code = comp.get("code", "").strip()
        if not code:
            continue

        # Pattern 1: Search for Section 2 standard unit header: UNIT CODE : <code>
        pattern1 = re.compile(
            rf"(?:UNIT\s+CODE|CODE\s*NO\.?|CODE)\s*:\s*{re.escape(code)}\b.*?(?:ELEMENT\s*P?\s*ERFORMANCE\s+CRITERIA|ELEMENT\b)(.*?)(?:\n\s*RANGE\s+OF\s+VARIABLES?|\n\s*EVIDENCE\s+GUIDE|\n\s*UNIT\s*O?\s*F?\s+COMPETENCY|\n\s*UNIT\s+TITLE|\Z)",
            re.DOTALL | re.IGNORECASE,
        )
        match = pattern1.search(full_text)

        # Pattern 2: Search by Title keywords (handles TESDA TR typos like ALT723307 vs ALT723205)
        if not match:
            words = [re.escape(w) for w in re.sub(r"[^\w\s]", "", comp.get("title", "")).split() if len(w) > 3][:4]
            if words:
                pattern2 = re.compile(
                    r"(?:UNIT\s*O?\s*F?\s+COMPETENCY|UNIT\s+TITLE)\s*:\s*.*?"
                    + r"\s+.*?".join(words)
                    + r".*?(?:ELEMENT\s*P?\s*ERFORMANCE\s+CRITERIA|ELEMENT\b)(.*?)(?:\n\s*RANGE\s+OF\s+VARIABLES?|\n\s*EVIDENCE\s+GUIDE|\n\s*UNIT\s*O?\s*F?\s+COMPETENCY|\n\s*UNIT\s+TITLE|\Z)",
                    re.DOTALL | re.IGNORECASE,
                )
                match = pattern2.search(full_text)

        if not match:
            continue

        elem_text = match.group(1)
        elements = []
        current_elem = []

        for line in elem_text.splitlines():
            line_str = line.strip()
            if not line_str:
                continue

            # Elements start with "1.", "2.", "3.", etc. (never decimals like 1.1 or 2.1)
            em_full = re.match(r"^([1-9])\.\s+(.*?)(?:\s+[1-9]\.[0-9]\b.*)?$", line_str)
            if em_full and not re.match(r"^[1-9]\.\d", line_str):
                if current_elem:
                    elements.append(" ".join(current_elem))
                has_criteria_on_line = bool(re.search(r"\s+[1-9]\.[0-9]\b", line_str))
                title_part = em_full.group(2).strip()
                if has_criteria_on_line:
                    elements.append(title_part)
                    current_elem = []
                else:
                    current_elem = [title_part]
            elif current_elem:
                if re.match(r"^[1-9]\.\d", line_str):
                    elements.append(" ".join(current_elem))
                    current_elem = []
                elif not re.match(r"^(italic|performance|element|variable|assessment|range|evidence)", line_str, re.IGNORECASE):
                    if not re.search(r"TR\s*[–-]|Promulgated|\bPage\b", line_str, re.IGNORECASE):
                        current_elem.append(line_str)

        if current_elem:
            elements.append(" ".join(current_elem))

        cleaned = [clean_ocr_text(e) for e in elements if len(e.strip()) > 3]
        if cleaned:
            comp["learning_outcomes"] = cleaned


def extract_competencies_from_pdf_stream(stream: io.BytesIO) -> Dict[str, Any]:
    """
    Main entrypoint: parses text from a PDF stream and returns detected program name and competencies list.
    """
    full_text = extract_text_from_pdf_stream(stream)
    if not full_text.strip():
        raise ValueError("Could not extract any text from the uploaded PDF. The file may be empty or an image-only scan.")

    program_name = extract_qualification_name(full_text)
    competencies = parse_tesda_competencies(full_text)

    if not competencies:
        raise ValueError(
            "No competencies could be detected in the PDF. Please verify that the PDF contains standard "
            "TESDA 'BASIC COMPETENCIES', 'COMMON COMPETENCIES', or 'CORE COMPETENCIES' headings with unit codes."
        )

    # Automatically extract and attach Learning Outcomes (Elements) from Section 2
    attach_learning_outcomes_from_standards(full_text, competencies)

    return {
        "program_name": program_name,
        "competencies": competencies,
        "count": len(competencies),
        "basic_count": sum(1 for c in competencies if c["category"] == "basic"),
        "common_count": sum(1 for c in competencies if c["category"] == "common"),
        "core_count": sum(1 for c in competencies if c["category"] == "core"),
    }
