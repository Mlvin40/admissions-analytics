"""Contraste independiente CSV → estadísticas esperadas → API; solo POST al resumen derivado"""

import csv
import hashlib
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
FIELDS = ("fecha_asignacion", "sexo", "anio_nacimiento", "materia", "numero_de_fecha_de_evaluacion",
          "anio_de_ingreso", "aprobacion", "carrera_objetivo", "departamento_institucion_educativa",
          "municipio_institucion_educativa", "tipo_institucion_educativa", "correlativo_aspirante")
ALIASES = dict(zip(("numero_de_fecha_de_evaluaci", "departamento_institucion_ed", "municipio_institucion_"),
                   (FIELDS[4], FIELDS[8], FIELDS[9])))
RAW = set(FIELDS[7:10])
PATHS = ("applicants-by-institution-type", "approvals-by-subject", "approved-applicants-by-career-year",
         "approval-rate-by-subject", "mean-age-by-career", "career-summary", "mean-age-approved-by-career-institution",
         "approved-applicants-by-municipality-career", "public-evaluations-by-month-subject", "top-careers-age-16-18",
         "applicant-performance", "applicants-by-sex-institution", "approval-rate-by-age", "mean-observed-attempts-by-subject",
         "applicant-history", "first-attempt-failures-by-career", "top-municipalities", "approval-rate-by-institution-type",
         "career-demand-by-department", "approval-evolution-by-entry-year")


def nfc(value):
    return unicodedata.normalize("NFC", value)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def known(value):
    return value.strip().upper() not in ("", "SIN REGISTRO", "SIN DATOS", "NINGUNO")


def positive(value):
    return int(value) if re.fullmatch(r"[0-9]+", value) and 0 < int(value) <= 2147483647 else None


def load():
    evaluations, rows, checksums = {}, 0, {}
    files = sorted((ROOT / "datas/ArchivosCSV").glob("*.csv"))
    assert len(files) == 10
    for path in files:
        checksums[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open(encoding="utf-8-sig", newline="") as stream:
            dialect = csv.Sniffer().sniff(stream.read(8192), delimiters=",;\t|")
            stream.seek(0)
            reader = csv.reader(stream, dialect, strict=True)
            header = [ALIASES.get(h, h) for h in next(reader)]
            assert set(header) == set(FIELDS) and len(header) == 12
            for number, cells in enumerate(reader, 1):
                rows += 1
                assert len(cells) == 12
                raw = dict(zip(header, cells))
                source = {f: nfc(raw[f] if f in RAW else raw[f].strip()) for f in FIELDS}
                identity = source[FIELDS[11]]
                scheme = "full32" if re.fullmatch("[0-9a-f]{32}", identity) else "short" if re.fullmatch("[0-9a-f]{20,23}", identity) else "other"
                applicant = scheme + ":" + identity
                eid = digest(["v1", applicant, *(source[f] for f in FIELDS)])
                provenance = (checksums[path.name], number)
                if eid in evaluations:
                    evaluations[eid]["sources"].append(provenance)
                    continue
                entry, opportunity = positive(source[FIELDS[5]]), positive(source[FIELDS[4]])
                birth = positive(source[FIELDS[2]]) if re.fullmatch("[0-9]{4}", source[FIELDS[2]]) else None
                try:
                    assignment = date.fromisoformat(source[FIELDS[0]]) if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", source[FIELDS[0]]) else None
                except ValueError:
                    assignment = None
                age = entry - birth if entry and birth else None
                if age is not None and (not 0 <= age <= 100 or (assignment and birth > assignment.year)):
                    age = None
                e = dict(id=eid, applicant=applicant, identity=identity, entryYear=entry, opportunity=opportunity,
                         assignmentDate=assignment.isoformat() if assignment else None, age=age,
                         passed={"APROBADO": True, "NO APROBADO": False}.get(source[FIELDS[6]].upper()),
                         sex=source[FIELDS[1]].upper() if known(source[FIELDS[1]]) else None,
                         sources=[provenance])
                dimensions = (("career", "Career", source[FIELDS[7]]), ("department", "Department", source[FIELDS[8]]),
                              ("municipality", "Municipality", source[FIELDS[9]]),
                              ("institutionType", "InstitutionType", source[FIELDS[10]].upper()),
                              ("subject", "Subject", source[FIELDS[3]].upper()))
                for field, label, value in dimensions:
                    parts = [label, value]
                    if field == "municipality":
                        parts = [label, e["department"] if e["departmentKnown"] else None, value]
                    e[field], e[field + "Known"], e[field + "Name"] = digest(parts), known(value), value.strip()
                evaluations[eid] = e
    assert all(hashlib.sha256((ROOT / "datas/ArchivosCSV" / name).read_bytes()).hexdigest() == sha for name, sha in checksums.items())
    return list(evaluations.values()), rows, checksums


def request(path, parameters=None, post=False):
    url = BASE + "/api/analytics/" + path
    if parameters:
        url += "?" + urlencode(parameters)
    with urlopen(Request(url, method="POST" if post else "GET"), timeout=60) as response:
        return json.load(response)


def fetch(query, parameters=None):
    parameters = dict(parameters or {})
    items, timings = [], []
    while True:
        result = request(PATHS[query - 1], dict(parameters, limit=100, offset=len(items)))
        items.extend(result["items"])
        timings.append(result["executionMs"])
        if len(items) >= result["total"]:
            return items, result, timings
        assert result["items"], "Paginación sin progreso"


def outcomes(rows):
    counts = Counter(e["passed"] for e in rows)
    approved, failed = counts[True], counts[False]
    denominator = approved + failed
    return dict(evaluationCount=len(rows), approvedCount=approved, failedCount=failed,
                knownOutcomeCount=denominator, unknownOutcomeCount=counts[None],
                approvalRate=100 * approved / denominator if denominator else None,
                failureRate=100 * failed / denominator if denominator else None)


def ages(rows):
    representatives = {}
    for e in rows:
        sort_key = (e["entryYear"] or -1, e["assignmentDate"] or "", e["opportunity"] or -1, e["id"])
        previous = representatives.get(e["applicant"])
        if previous is None or sort_key > previous[0]:
            representatives[e["applicant"]] = sort_key, e["age"]
    values = [value for _, value in representatives.values() if value is not None]
    return dict(applicantCount=len(representatives), meanAge=sum(values) / len(values) if values else None,
                ageSampleCount=len(values), excludedAgeApplicantCount=len(representatives) - len(values))


def expected(query, evaluations):
    selected = evaluations
    if query in (2, 3, 7, 8):
        selected = [e for e in selected if e["passed"] is True]
    elif query == 9:
        selected = [dict(e, month=e["assignmentDate"][:7]) for e in selected
                    if e["institutionTypeName"] == "PUBLICO" and e["assignmentDate"]]
    elif query == 10:
        selected = [e for e in selected if e["careerKnown"] and e["age"] is not None and 16 <= e["age"] <= 18]
    elif query == 13:
        selected = [e for e in selected if e["age"] is not None]
    elif query == 14:
        selected = [e for e in selected if e["entryYear"] and e["subjectKnown"]]
    elif query == 16:
        selected = [e for e in selected if e["opportunity"] == 1 and e["passed"] is False and e["careerKnown"]]
    elif query == 17:
        selected = [e for e in selected if e["municipalityKnown"]]
    elif query == 19:
        selected = [e for e in selected if e["careerKnown"] and e["departmentKnown"]]
    dimensions = {1: ("institutionType",), 2: ("subject",), 3: ("career", "entryYear"), 4: ("subject",),
                  5: ("career",), 6: ("career",), 7: ("career", "institutionType"), 8: ("municipality", "career"),
                  9: ("month", "subject"), 10: ("career",), 12: ("sex", "institutionType"), 13: ("age",),
                  14: ("subject",), 16: ("career",), 17: ("municipality",), 18: ("institutionType",),
                  19: ("department", "career"), 20: ("entryYear",)}[query]
    groups = defaultdict(list)
    for e in selected:
        groups[tuple(e[d] for d in dimensions)].append(e)
    results = {}
    for key, rows in groups.items():
        if query in (1, 3, 8, 10, 12, 16, 17, 19):
            metric = dict(applicantCount=len({e["applicant"] for e in rows}))
        elif query in (2, 9):
            metric = dict(evaluationCount=len(rows))
        elif query in (4, 13, 18, 20):
            metric = outcomes(rows)
        elif query in (5, 7):
            metric = ages(rows)
        elif query == 6:
            metric = outcomes(rows)
            del metric["failureRate"]
            metric.update(ages(rows))
            metric["applicantsWithApproval"] = len({e["applicant"] for e in rows if e["passed"] is True})
        else:
            cycles = defaultdict(set)
            for e in rows:
                cycle = cycles[e["applicant"], e["entryYear"]]
                if e["opportunity"]:
                    cycle.add(e["opportunity"])
            counts = [len(opportunities) for opportunities in cycles.values() if opportunities]
            metric = dict(evaluationCount=len(rows), meanAttempts=sum(counts) / len(counts) if counts else None,
                          applicantCycleCount=len(counts), excludedAttemptGroups=len(cycles) - len(counts))
        results[key] = metric
    if query in (10, 17):
        results = dict(sorted(results.items(), key=lambda pair: (-pair[1]["applicantCount"], pair[0]))[:5])
    if query == 19:
        for department in {key[0] for key in results}:
            for rank, key in enumerate(sorted((key for key in results if key[0] == department),
                                             key=lambda key: (-results[key]["applicantCount"], key[1])), 1):
                results[key]["rank"] = rank
    return dimensions, results


def check(query, evaluations, parameters=None):
    dimensions, reference = expected(query, evaluations)
    items, metadata, timings = fetch(query, parameters)
    assert len(items) == len(reference), (query, len(items), len(reference))
    seen = set()
    for item in items:
        key = tuple(item["group"][d]["key"] if isinstance(item["group"][d], dict) else item["group"][d] for d in dimensions)
        assert key not in seen
        seen.add(key)
        assert key in reference, (query, key)
        for field, value in reference[key].items():
            actual = item[field]
            assert actual == value or (isinstance(value, float) and isinstance(actual, (int, float))
                                       and math.isclose(actual, value, rel_tol=1e-10, abs_tol=1e-10)), (query, key, field, value, actual)
    exclusions = {
        9: lambda e: e["institutionTypeName"] == "PUBLICO" and not e["assignmentDate"],
        10: lambda e: e["age"] is None or (16 <= e["age"] <= 18 and not e["careerKnown"]),
        13: lambda e: e["age"] is None,
        14: lambda e: not e["entryYear"] or not e["subjectKnown"] or not e["opportunity"],
        16: lambda e: e["opportunity"] == 1 and e["passed"] is False and not e["careerKnown"],
        17: lambda e: not e["municipalityKnown"],
        19: lambda e: not e["careerKnown"] or not e["departmentKnown"],
    }
    excluded = sum(bool(exclusions[query](e)) for e in evaluations) if query in exclusions else 0
    assert metadata["excludedEvaluations"] == excluded, (query, excluded, metadata["excludedEvaluations"])
    return dict(groups=len(items), requests=len(timings), maxExecutionMs=max(timings), excludedEvaluations=excluded)


def verify_histories(evaluations):
    by_applicant = defaultdict(list)
    for e in evaluations:
        by_applicant[e["identity"]].append(e)
    identity, rows = max(by_applicant.items(), key=lambda pair: len(pair[1]))
    rows.sort(key=lambda e: (e["entryYear"] or 9223372036854775807, e["assignmentDate"] or "9999-12-31", e["id"]))
    report = {}
    for query in (11, 15):
        parameters, items, timings = dict(correlativo=identity, limit=7), [], []
        while True:
            result = request(PATHS[query - 1], parameters)
            assert result["total"] == len(rows)
            items.extend(result["items"])
            timings.append(result["executionMs"])
            if result["nextCursor"] is None:
                break
            parameters["cursor"] = result["nextCursor"]
        assert [r["evaluationId"] for r in items] == [r["id"] for r in rows]
        for actual, reference in zip(items, rows):
            for field in ("entryYear", "opportunity", "passed"):
                assert actual[field] == reference[field]
            assert actual["assignmentDate"] == (reference["assignmentDate"] + "T00:00:00Z" if reference["assignmentDate"] else None)
            assert actual["subject"]["key"] == reference["subject"]
            assert actual["career"]["key"] == reference["career"]
            if query == 15:
                assert actual["applicant"]["key"] == reference["applicant"]
                assert actual["entryAge"] == reference["age"]
                assert sorted((s["fileSha256"], s["recordNumber"]) for s in actual["sources"]) == sorted(reference["sources"])
        report[f"M{query:02}"] = dict(evaluations=len(rows), cycles=len({e["entryYear"] for e in rows}),
                                     requests=len(timings), maxExecutionMs=max(timings))
    assert not request("applicant-history", dict(correlativo=identity[:10]))["items"]
    return report


def main():
    evaluations, raw_count, checksums = load()
    assert len(evaluations) == 207619 and raw_count == 208453
    assert len({e["applicant"] for e in evaluations}) == 42371
    refresh = request("career-summary/refresh", post=True)
    assert refresh["summary"]["sourceEvaluationCount"] == len(evaluations)
    queries = {f"M{q:02}": check(q, evaluations) for q in range(1, 21) if q not in (11, 15)}
    queries.update(verify_histories(evaluations))
    # Cohorte y filtros combinados, además del contraste global
    filtered = [e for e in evaluations if e["entryYear"] == 2024 and e["passed"] is True and e["age"] is not None and 16 <= e["age"] <= 18]
    check(5, filtered, dict(entryYear=2024, passed="true", minAge=16, maxAge=18))
    check(4, [e for e in evaluations if e["assignmentDate"] and "2023-01-01" <= e["assignmentDate"] <= "2023-12-31"],
          dict(assignmentFrom="2023-01-01", assignmentTo="2023-12-31"))
    refreshed = request("career-summary/refresh", post=True)
    assert refreshed["careerCount"] == refresh["careerCount"]
    assert refreshed["summary"]["sourceSnapshot"] == refresh["summary"]["sourceSnapshot"]
    check(6, evaluations)
    assert not request("career-summary")["summary"]["refreshRequired"]
    report = dict(files=len(checksums), rawRows=raw_count, evaluations=len(evaluations), exactDuplicateExcess=raw_count - len(evaluations),
                  applicants=len({e["applicant"] for e in evaluations}), approved=sum(e["passed"] is True for e in evaluations),
                  failed=sum(e["passed"] is False for e in evaluations), invalidAge=sum(e["age"] is None for e in evaluations),
                  summaryCareers=refresh["careerCount"], queries=dict(sorted(queries.items())), csvSha256=checksums)
    destination = ROOT / ".local/analytics-verification.json"
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "csvSha256"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
