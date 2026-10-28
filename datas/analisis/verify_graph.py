"""Contraste independiente de las cinco consultas Neo4j con los CSV locales; HTTP GET únicamente"""

import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

sys.dont_write_bytecode = True
from verify_analytics import load

ROOT = Path(__file__).resolve().parents[2]
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
REPORT = {f"N{i:02}": dict(requests=0, maxExecutionMs=0, maxDatabaseMs=0, verifiedRows=0) for i in range(1, 6)}
PATHS = {1: "applicant-history", 2: "approval-by-subject-career", 3: "top-careers-by-department",
         4: "improved-outcomes", 5: "municipality-peers"}


def request(query, **parameters):
    with urlopen(BASE + "/api/graph/" + PATHS[query] + "?" + urlencode(parameters), timeout=30) as response:
        page = json.load(response)
    assert page["query"] == f"N{query:02}"
    assert len(page["items"]) <= page["limit"]
    summary = REPORT[page["query"]]
    summary["requests"] += 1
    summary["maxExecutionMs"] = max(summary["maxExecutionMs"], page["executionMs"])
    summary["maxDatabaseMs"] = max(summary["maxDatabaseMs"], page["databaseMs"])
    summary["verifiedRows"] += len(page["items"])
    return page


def fetch(query, **parameters):
    parameters.setdefault("limit", 100)
    rows = []
    while True:
        page = request(query, **parameters, offset=len(rows))
        rows.extend(page["items"])
        if not page["hasMore"]:
            return rows
        assert page["items"]
        assert len(rows) <= 10000, "El caso excede el límite operativo de offset"


def evaluation(actual, reference):
    assert actual["key"] == reference["id"]
    for actual_field, reference_field in (("assignmentDate", "assignmentDate"), ("entryYear", "entryYear"),
                                          ("opportunity", "opportunity"), ("passed", "passed")):
        assert actual[actual_field] == reference[reference_field], (actual_field, actual, reference)


def check_history(rows, applicant, year, subject=None):
    expected = sorted((e for e in rows if e["applicant"] == applicant and e["entryYear"] == year
                       and (subject is None or e["subject"] == subject)),
                      key=lambda e: (e["assignmentDate"] or "9999-12-31", e["id"]))
    parameters = dict(entryYear=year, applicantKey=applicant, limit=2)
    if subject:
        parameters["subjectKey"] = subject
    actual = fetch(1, **parameters)
    assert len(actual) == len(expected)
    for a, e in zip(actual, expected):
        assert a["applicantKey"] == e["applicant"]
        evaluation(a["evaluation"], e)
        assert a["subject"]["key"] == e["subject"]
        assert a["subject"]["name"] == e["subjectName"]
        if e["careerKnown"]:
            assert a["career"]["key"] == e["career"]
            assert a["career"]["name"] == e["careerName"]
        else:
            assert a["career"] is None


def check_approvals(rows, year, subject=None, career=None, limit=100):
    grouped = defaultdict(list)
    for e in rows:
        if e["entryYear"] == year and e["subjectKnown"] and e["careerKnown"] and (not subject or e["subject"] == subject) and (not career or e["career"] == career):
            grouped[e["subjectName"], e["career"]].append(e)
    parameters = dict(entryYear=year, limit=limit)
    if subject:
        parameters["subjectKey"] = subject
    if career:
        parameters["careerKey"] = career
    actual = fetch(2, **parameters)
    assert len(actual) == len(grouped), (year, len(actual), len(grouped))
    for a, (_, group) in zip(actual, sorted(grouped.items())):
        approved = sum(e["passed"] is True for e in group)
        failed = sum(e["passed"] is False for e in group)
        assert a["evaluationCount"] == len(group)
        assert a["approvedCount"] == approved and a["failedCount"] == failed
        assert a["unknownOutcomeCount"] == len(group) - approved - failed
        assert a["subject"]["key"] == group[0]["subject"] and a["career"]["key"] == group[0]["career"]
        if approved + failed:
            assert math.isclose(a["approvalRate"], 100 * approved / (approved + failed), rel_tol=1e-10)
        else:
            assert a["approvalRate"] is None
    return sum(a["evaluationCount"] for a in actual)


def check_demand(rows, year, department, municipality=None, limit=100):
    grouped = defaultdict(set)
    for e in rows:
        if e["entryYear"] == year and e["department"] == department and e["departmentKnown"] and e["municipalityKnown"] and e["careerKnown"] and (not municipality or e["municipality"] == municipality):
            grouped[e["career"]].add(e["applicant"])
    expected = sorted(((career, len(applicants)) for career, applicants in grouped.items()), key=lambda pair: (-pair[1], pair[0]))[:5]
    parameters = dict(entryYear=year, departmentKey=department, limit=limit)
    if municipality:
        parameters["municipalityKey"] = municipality
    actual = fetch(3, **parameters)
    assert [(a["career"]["key"], a["applicantCount"]) for a in actual] == expected, (year, department)


def check_progressions(rows, year, subject):
    by_applicant = defaultdict(list)
    for e in rows:
        if e["entryYear"] == year and e["subject"] == subject:
            by_applicant[e["applicant"]].append(e)
    expected = []
    for applicant, observations in by_applicant.items():
        failed = [e for e in observations if e["passed"] is False and e["opportunity"]]
        passed = [e for e in observations if e["passed"] is True and e["opportunity"]]
        expected.extend((applicant, f["id"], p["id"]) for f in failed for p in passed if f["opportunity"] < p["opportunity"])
    expected.sort()
    actual = fetch(4, entryYear=year, subjectKey=subject)
    assert [(a["applicantKey"], a["failed"]["key"], a["passed"]["key"]) for a in actual] == expected, (year, subject)
    by_id = {e["id"]: e for e in rows if e["entryYear"] == year and e["subject"] == subject}
    for a in actual:
        assert a["subject"]["key"] == subject
        evaluation(a["failed"], by_id[a["failed"]["key"]])
        evaluation(a["passed"], by_id[a["passed"]["key"]])
    return len(expected), {a for a, _, _ in expected}


def check_peers(rows, by_id, year, applicant, municipality=None):
    relevant = [e for e in rows if e["entryYear"] == year and e["municipalityKnown"] and (not municipality or e["municipality"] == municipality)]
    origins = defaultdict(list)
    for e in sorted(relevant, key=lambda e: e["id"]):
        origins[e["municipality"]].append(e)
    expected = []
    # Se necesitan solo las primeras 51 rutas para contrastar dos páginas y hasMore
    for e in sorted((e for e in relevant if e["applicant"] == applicant), key=lambda e: e["id"]):
        for peer in origins[e["municipality"]]:
            if peer["applicant"] != applicant:
                expected.append(dict(applicantKey=applicant, evaluationKey=e["id"], municipalityKey=e["municipality"],
                                     peerEvaluationKey=peer["id"], peerApplicantKey=peer["applicant"]))
                if len(expected) == 51:
                    break
        if len(expected) == 51:
            break
    for offset in (0, 25):
        parameters = dict(entryYear=year, applicantKey=applicant, limit=25, offset=offset)
        if municipality:
            parameters["municipalityKey"] = municipality
        page = request(5, **parameters)
        assert page["items"] == expected[offset:offset + 25]
        assert page["hasMore"] == (len(expected) > offset + 25)
        nodes, edges = {}, {}
        for path in page["items"]:
            for label, key in (("Applicant", path["applicantKey"]), ("Evaluation", path["evaluationKey"]),
                               ("Municipality", path["municipalityKey"]), ("Evaluation", path["peerEvaluationKey"]),
                               ("Applicant", path["peerApplicantKey"])):
                nodes[label + ":" + key] = label, key
            relations = (("TOOK", "Applicant:" + path["applicantKey"], "Evaluation:" + path["evaluationKey"]),
                         ("FROM_MUNICIPALITY", "Evaluation:" + path["evaluationKey"], "Municipality:" + path["municipalityKey"]),
                         ("FROM_MUNICIPALITY", "Evaluation:" + path["peerEvaluationKey"], "Municipality:" + path["municipalityKey"]),
                         ("TOOK", "Applicant:" + path["peerApplicantKey"], "Evaluation:" + path["peerEvaluationKey"]))
            for relation, source, target in relations:
                edges[relation + ":" + source + ":" + target] = relation, source, target
        assert len(page["graph"]["nodes"]) == len(nodes) <= 125
        assert len(page["graph"]["edges"]) == len(edges) <= 100
        municipality_reference = {e["municipality"]: e for e in relevant}
        for node in page["graph"]["nodes"]:
            assert (node["label"], node["key"]) == nodes[node["id"]]
            properties = node["properties"]
            if node["label"] == "Evaluation":
                ref = by_id[node["key"]]
                for field in ("assignmentDate", "entryYear", "opportunity", "passed"):
                    assert properties[field] == ref[field]
                assert properties["entryAge"] == ref["age"]
            elif node["label"] == "Applicant":
                scheme, identity = node["key"].split(":", 1)
                assert properties["correlativo_aspirante"] == identity and properties["identityScheme"] == scheme
            elif node["label"] == "Municipality":
                ref = municipality_reference[node["key"]]
                assert properties["name"] == ref["municipalityName"]
                assert properties["departmentKey"] == (ref["department"] if ref["departmentKnown"] else None)
        for edge in page["graph"]["edges"]:
            assert (edge["type"], edge["source"], edge["target"]) == edges[edge["id"]]


def main():
    rows, raw, checksums = load()
    by_id = {e["id"]: e for e in rows}
    years = sorted({e["entryYear"] for e in rows})
    departments = sorted({e["department"] for e in rows if e["departmentKnown"]})
    subjects = sorted({e["subject"] for e in rows if e["subjectKnown"]})
    approval_evaluations, progression_pairs, progression_applicants = 0, 0, set()
    for year in years:
        cohort = [e for e in rows if e["entryYear"] == year]
        applicant_groups = defaultdict(list)
        for e in cohort:
            applicant_groups[e["applicant"]].append(e)
        applicant, history = max(applicant_groups.items(), key=lambda item: len(item[1]))
        check_history(cohort, applicant, year)
        check_history(cohort, applicant, year, history[0]["subject"])
        approval_evaluations += check_approvals(cohort, year, limit=7 if year == 2024 else 100)
        chosen = next(e for e in cohort if e["careerKnown"])
        check_approvals(cohort, year, chosen["subject"], chosen["career"])
        for department in departments:
            check_demand(cohort, year, department)
        place = next(e for e in cohort if e["departmentKnown"] and e["municipalityKnown"] and e["careerKnown"])
        check_demand(cohort, year, place["department"], place["municipality"], limit=2)
        for subject in subjects:
            pairs, identities = check_progressions(cohort, year, subject)
            progression_pairs += pairs
            progression_applicants.update(identities)
        peer_source = next(e for e in history if e["municipalityKnown"])
        check_peers(cohort, by_id, year, peer_source["applicant"])
        check_peers(cohort, by_id, year, peer_source["applicant"], peer_source["municipality"])
    check_history(rows, "full32:" + "0" * 32, 2024)
    check_peers(rows, by_id, 2024, "full32:" + "0" * 32)
    assert not request(2, entryYear=9999)["items"]
    assert not request(4, entryYear=9999, subjectKey=subjects[0])["items"]
    report = dict(files=len(checksums), rawRows=raw, evaluations=len(rows), years=years,
                  departments=len(departments), subjects=len(subjects),
                  approvalEvaluationsWithCareer=approval_evaluations,
                  excludedNoCareer=len(rows) - approval_evaluations,
                  progressionPairs=progression_pairs, progressionApplicants=len(progression_applicants), queries=REPORT)
    destination = ROOT / ".local/graph-verification.json"
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
