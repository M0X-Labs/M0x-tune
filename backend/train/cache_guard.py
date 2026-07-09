from __future__ import annotations

"""Stale compiled-trainer-cache detection/invalidation.

IMPORTANT: this module must NOT import , torch, pyarrow, trl, transformers, or
anything that transitively imports them. 's compiled-trainer cache
(_compiled_cache/, written by _zoo/compiler.py) is populated as a *side
effect* of `import `, so the staleness check here has to run and finish BEFORE
that import happens anywhere in the process -- which means this module has to be
importable (and its check callable) with zero risk of pulling in  itself first.
"""

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

COMPILED_CACHE_DIR = PROJECT_ROOT / "_compiled_cache"
COMPILED_CACHE_STAMP = COMPILED_CACHE_DIR / ".version_stamp"

# Libraries whose combined version identifies "what compiled trainer code should look
# like". 's compiled-trainer cache is generated once against whatever
# trl/transformers/peft/ happen to be installed the first time it's imported, and
# nothing invalidates it afterwards. If a later `pip`/`uv install -U` upgrades any of
# these (e.g. picking up a newer trl release), the stale compiled trainer source can
# silently mismatch the newly-installed library internals -- producing a confusing,
# unrelated-looking crash that only reproduces on whichever device happened to upgrade
# first. Fingerprinting these versions lets us detect that drift and wipe the cache
# before  regenerates it fresh.
_CACHE_FINGERPRINT_PACKAGES = ("unsloth", "unsloth_zoo", "trl", "transformers", "peft", "accelerate")


def _compute_cache_fingerprint() -> str:
    from importlib import metadata

    parts = []
    for package in _CACHE_FINGERPRINT_PACKAGES:
        try:
            parts.append(f"{package}=={metadata.version(package)}")
        except metadata.PackageNotFoundError:
            parts.append(f"{package}=missing")
    return "\n".join(parts)


def invalidate_stale_compiled_cache() -> None:
    """Wipe _compiled_cache/ if it was generated against different library
    versions than are currently installed, so  regenerates it fresh instead of
    reusing a compiled trainer that no longer matches trl/transformers/peft/accelerate.

    Must be called before `import ` happens anywhere in the current process.
    """
    fingerprint = _compute_cache_fingerprint()

    previous_fingerprint = None
    if COMPILED_CACHE_STAMP.exists():
        try:
            previous_fingerprint = COMPILED_CACHE_STAMP.read_text(encoding="utf-8")
        except OSError:
            previous_fingerprint = None

    if COMPILED_CACHE_DIR.exists() and previous_fingerprint != fingerprint:
        print(
            "Detected a change in installed /trl/transformers/peft/accelerate "
            "versions since the compiled trainer cache was last generated. Clearing "
            f"'{COMPILED_CACHE_DIR.name}/' so  recompiles against the current "
            "versions (this avoids stale-cache crashes after a library upgrade)..."
        )
        shutil.rmtree(COMPILED_CACHE_DIR, ignore_errors=True)

    COMPILED_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        COMPILED_CACHE_STAMP.write_text(fingerprint, encoding="utf-8")
    except OSError:
        pass
