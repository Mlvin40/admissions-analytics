"""Perfil reproducible de los CSV locales, sin persistencia ni conexiones a motores"""

import csv
import hashlib
import io
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

FIELDS = [
    "fecha_asignacion", "sexo", "anio_nacimiento", "materia",
    "numero_de_fecha_de_evaluacion", "anio_de_ingreso", "aprobacion",
    "carrera_objetivo", "departamento_institucion_educativa",
    "municipio_institucion_educativa", "tipo_institucion_educativa",
    "correlativo_aspirante",
]
ALIASES = {
    "numero_de_fecha_de_evaluaci": "numero_de_fecha_de_evaluacion",
    "departamento_institucion_ed": "departamento_institucion_educativa",
    "municipio_institucion_": "municipio_institucion_educativa",
}
DIMENSIONS = ("carrera_objetivo", "departamento_institucion_educativa",
              "municipio_institucion_educativa")
ATTRIBUTES = ("sexo", "anio_nacimiento", *DIMENSIONS, "tipo_institucion_educativa")
INDEX = {field: index for index, field in enumerate(FIELDS)}


def inspect_dataset(directory):
    expected = {f"pruebas_especificas_{year}.csv" for year in range(2015, 2025)}
    paths = sorted(directory.glob("*.csv"))
    if {path.name for path in paths} != expected:
        raise ValueError("Se requieren exactamente los diez archivos locales de 2015–2024")
    files, observations, malformed = [], [], []
    by_id, by_year, by_cycle = defaultdict(list), {}, defaultdict(list)
    global_rows = Counter()
    global_values = {field: Counter() for field in FIELDS}

    for path in paths:
        content = path.read_bytes()
        text = content.decode("utf-8-sig", errors="strict")
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
        reader = csv.reader(io.StringIO(text, newline=""), dialect, strict=True)
        header = next(reader)
        canonical = [ALIASES.get(name, name) for name in header]
        if len(canonical) != 12 or set(canonical) != set(FIELDS):
            raise ValueError(f"Encabezado no reconocido: {path.name}")
        positions = [canonical.index(field) for field in FIELDS]
        year = int(path.stem[-4:])
        raw_rows, ids, metrics = Counter(), set(), Counter()
        values = {field: Counter() for field in FIELDS}
        raw_variants = {field: Counter() for field in DIMENSIONS}
        dates, births, ages = [], [], []
        for record, cells in enumerate(reader, start=1):
            if len(cells) != 12:
                malformed.append({"file": path.name, "record": record, "columns": len(cells)})
                continue
            raw = tuple(cells[position] for position in positions)
            # Solo para diagnóstico; el modelo conserva espacios de las dimensiones
            stripped = tuple(unicodedata.normalize("NFC", value.strip()) for value in raw)
            normalized = tuple(unicodedata.normalize("NFC", value if field in DIMENSIONS else value.strip())
                               for field, value in zip(FIELDS, raw))
            raw_rows[raw] += 1
            global_rows[normalized] += 1
            row = dict(zip(FIELDS, stripped))
            identity = row["correlativo_aspirante"]
            ids.add(identity)
            observations.append((year, normalized))
            by_id[identity].append((year, normalized))
            by_cycle[(identity, year)].append(normalized)
            for field, source, value in zip(FIELDS, raw, stripped):
                values[field][value] += 1
                global_values[field][value] += 1
                if source != value:
                    metrics[f"trim_or_nfc:{field}"] += 1
                if not value:
                    metrics[f"empty:{field}"] += 1
                if field in DIMENSIONS and source != value:
                    raw_variants[field][source] += 1
            try:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["fecha_asignacion"]):
                    raise ValueError("Formato de fecha")
                assignment = date.fromisoformat(row["fecha_asignacion"])
                dates.append(assignment.isoformat())
                metrics[f"file_minus_assignment:{year - assignment.year}"] += 1
            except ValueError:
                assignment = None
                metrics["invalid_date"] += 1
            for field in ("anio_nacimiento", "numero_de_fecha_de_evaluacion", "anio_de_ingreso"):
                try:
                    int(row[field])
                    metrics[f"integer:{field}"] += 1
                except ValueError:
                    metrics[f"not_integer:{field}"] += 1
            if row["anio_de_ingreso"] != str(year):
                metrics["file_entry_mismatch"] += 1
            try:
                birth = int(row["anio_nacimiento"])
                age = int(row["anio_de_ingreso"]) - birth
                births.append(birth)
                ages.append(age)
                if not 0 <= age <= 100:
                    metrics["age_outside_0_100"] += 1
                if assignment and birth > assignment.year:
                    metrics["born_after_assignment"] += 1
            except ValueError:
                pass
        by_year[year] = ids
        files.append({
            "file": path.name, "sha256": hashlib.sha256(content).hexdigest(),
            "bytes": len(content), "encoding": "UTF-8",
            "bom": content.startswith(b"\xef\xbb\xbf"), "delimiter": dialect.delimiter,
            "quotechar": dialect.quotechar, "lf": text.count("\n"),
            "crlf": text.count("\r\n"), "header": header,
            "rows": sum(raw_rows.values()), "unique_ids": len(ids),
            "distinct_rows": len(raw_rows),
            "duplicate_excess": sum(count - 1 for count in raw_rows.values()),
            "duplicate_groups": sum(count > 1 for count in raw_rows.values()),
            "id_lengths": dict(Counter(map(len, ids))), "metrics": dict(metrics),
            "date_range": [min(dates), max(dates)] if dates else None,
            "birth_range": [min(births), max(births)] if births else None,
            "age_range": [min(ages), max(ages)] if ages else None,
            "values": {field: dict(counts) for field, counts in values.items()
                       if field not in ("fecha_asignacion", "correlativo_aspirante",
                                        "municipio_institucion_educativa", "anio_nacimiento")},
            "birth_unknown": values["anio_nacimiento"]["SIN REGISTRO"],
            "raw_variants": {field: dict(counts) for field, counts in raw_variants.items()},
        })

    old_ids = set().union(*(by_year[year] for year in range(2015, 2022)))
    new_ids = set().union(*(by_year[year] for year in range(2022, 2025)))
    prefixes = defaultdict(set)
    for identity in old_ids:
        for length in (20, 21, 22, 23):
            prefixes[identity[:length]].add(identity)
    candidates = {identity: prefixes[identity] for identity in new_ids if identity in prefixes}
    slot_rows, event_rows, origins = defaultdict(set), defaultdict(set), defaultdict(set)
    for year, row in observations:
        key = (row[-1], row[5], row[3], row[4])
        slot_rows[key].add(row)
        event_rows[(*key, row[0])].add(row)
        origins[(row[5], row[8], row[9])].add(row[-1])
    attempts = defaultdict(set)
    for identity, entry_year, subject, opportunity in slot_rows:
        attempts[(identity, entry_year, subject)].add(int(opportunity))
    progression = defaultdict(set)
    for row in global_rows:
        progression[(row[-1], row[5], row[3])].add((int(row[4]), row[6]))
    conflicts = lambda groups, field: sum(
        len({row[INDEX[field]] for row in rows}) > 1 for rows in groups)
    known_mismatches = {}
    for field in ("sexo", "anio_nacimiento"):
        mismatches = 0
        for short, matches in candidates.items():
            earlier = {row[INDEX[field]] for full in matches for year, row in by_id[full]}
            later = {row[INDEX[field]] for year, row in by_id[short]}
            earlier -= {"", "SIN REGISTRO", "SIN DATOS"}
            later -= {"", "SIN REGISTRO", "SIN DATOS"}
            mismatches += bool(earlier and later and earlier.isdisjoint(later))
        known_mismatches[field] = mismatches
    return {
        "files": files, "field_order": FIELDS, "header_aliases": ALIASES,
        "total_rows": len(observations), "malformed_rows": malformed,
        "global_unique_ids": len(by_id),
        "sum_year_unique_ids": sum(map(len, by_year.values())),
        "ids_multiple_files": sum(len({year for year, row in items}) > 1 for items in by_id.values()),
        "ids_multiple_subjects": sum(len({row[3] for year, row in items}) > 1 for items in by_id.values()),
        "distinct_evaluation_contents": len(global_rows),
        "duplicate_excess": sum(count - 1 for count in global_rows.values()),
        "maximum_multiplicity": max(global_rows.values()),
        "attribute_variations_by_exact_id": {
            field: conflicts(([row for year, row in items] for items in by_id.values()), field)
            for field in ATTRIBUTES},
        "within_year_attribute_variations": {
            field: conflicts(by_cycle.values(), field) for field in ATTRIBUTES},
        "overlap_pairs": {f"{year}-{other}": len(by_year[year] & by_year[other])
                          for year in by_year for other in by_year
                          if year < other and by_year[year] & by_year[other]},
        "old_new_exact_overlap": len(old_ids & new_ids),
        "short_ids_sharing_first20": sum(count > 1 for count in Counter(value[:20] for value in new_ids).values()),
        "prefix_candidate_count": len(candidates),
        "ambiguous_prefixes_in_sample": sum(len(matches) > 1 for matches in candidates.values()),
        "prefix_matches_by_length": dict(Counter(map(len, candidates))),
        "known_demographic_mismatches_in_prefix_candidates": known_mismatches,
        "nonhex_id_rows": sum(not bool(re.fullmatch("[0-9a-f]+", row[-1])) for year, row in observations),
        "event_key_conflicts": sum(len(items) > 1 for items in event_rows.values()),
        "same_opportunity_multiple_records": sum(len(items) > 1 for items in slot_rows.values()),
        "opportunity_groups": len(attempts),
        "multiple_opportunity_groups": sum(len(items) > 1 for items in attempts.values()),
        "opportunity_groups_count_diff_max": sum(len(items) != max(items) for items in attempts.values()),
        "opportunity_groups_without_first": sum(min(items) > 1 for items in attempts.values()),
        "failure_then_later_success_groups": sum(
            any(a < b and sa == "NO APROBADO" and sb == "APROBADO" for a, sa in items for b, sb in items)
            for items in progression.values()),
        "origin_year_groups_with_peers": sum(len(items) > 1 for items in origins.values()),
        "values": {field: dict(counts) for field, counts in global_values.items()
                   if field not in ("fecha_asignacion", "correlativo_aspirante")},
    }


if __name__ == "__main__":
    directory = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "ArchivosCSV"
    report = inspect_dataset(directory)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
