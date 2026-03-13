#!/usr/bin/env python3
"""Validate that service dependency constraints on platform libs are satisfied.

Scans all libs under monorepo/libs/ and all services under monorepo/services/,
then checks that every service dependency referencing a platform lib is satisfied
by the lib's declared version.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:
    try:
        import tomli as tomllib  # type: ignore[no-redef]
    except ModuleNotFoundError:
        print("ERROR: neither tomllib (Python 3.11+) nor tomli is available", file=sys.stderr)
        sys.exit(2)

from packaging.requirements import Requirement, InvalidRequirement
from packaging.specifiers import SpecifierSet
from packaging.version import Version


def discover_libs(monorepo_root: Path) -> dict[str, Version]:
    """Return a mapping of lib name -> version for every lib with a pyproject.toml."""
    libs_dir = monorepo_root / "libs"
    if not libs_dir.is_dir():
        return {}

    libs: dict[str, Version] = {}
    for child in sorted(libs_dir.iterdir()):
        pyproject = child / "pyproject.toml"
        if not pyproject.is_file():
            continue
        with open(pyproject, "rb") as f:
            data = tomllib.load(f)
        project = data.get("project", {})
        name = project.get("name")
        version = project.get("version")
        if name and version:
            libs[name] = Version(version)
    return libs


def check_service(
    service_pyproject: Path,
    libs: dict[str, Version],
) -> list[str]:
    """Check a single service's dependencies against known libs.

    Returns a list of error messages (empty means all OK).
    """
    with open(service_pyproject, "rb") as f:
        data = tomllib.load(f)

    project = data.get("project", {})
    service_name = project.get("name", service_pyproject.parent.name)
    deps = project.get("dependencies", [])

    errors: list[str] = []
    for dep_str in deps:
        try:
            req = Requirement(dep_str)
        except InvalidRequirement:
            continue  # skip unparseable entries

        if req.name not in libs:
            continue  # not a platform lib

        lib_version = libs[req.name]
        specifier: SpecifierSet = req.specifier

        if not specifier.contains(lib_version):
            errors.append(
                f"  FAIL: {service_name} requires {req} "
                f"but {req.name} is {lib_version}"
            )
        else:
            print(f"  OK: {service_name} requires {req} — {req.name} {lib_version} satisfies")

    return errors


def main() -> int:
    # Determine monorepo root: the script lives at monorepo/scripts/
    script_dir = Path(__file__).resolve().parent
    monorepo_root = script_dir.parent

    # Discover platform libs
    libs = discover_libs(monorepo_root)
    if not libs:
        print("No platform libs with pyproject.toml found under libs/. Nothing to check.")
        return 0

    print(f"Discovered {len(libs)} platform lib(s):")
    for name, version in sorted(libs.items()):
        print(f"  {name} = {version}")
    print()

    # Discover services
    services_dir = monorepo_root / "services"
    if not services_dir.is_dir():
        print("No services/ directory found. Nothing to check.")
        return 0

    service_pyprojects: list[Path] = []
    for child in sorted(services_dir.iterdir()):
        pyproject = child / "pyproject.toml"
        if pyproject.is_file():
            service_pyprojects.append(pyproject)

    if not service_pyprojects:
        print("No services with pyproject.toml found. Nothing to check.")
        return 0

    all_errors: list[str] = []
    for sp in service_pyprojects:
        print(f"Checking {sp.parent.name}...")
        errors = check_service(sp, libs)
        all_errors.extend(errors)

    print()
    if all_errors:
        print("Version constraint violations found:")
        for err in all_errors:
            print(err)
        return 1

    print("All version constraints satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
