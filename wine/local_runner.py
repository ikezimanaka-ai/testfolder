"""Run a Windows executable with a locally installed Wine runtime.

This intentionally binds no network port. It is a local execution path, not
an upload service or a public remote-execution endpoint.
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Run an EXE locally with Wine")
    parser.add_argument("exe", type=Path, help="Path to the Windows executable")
    parser.add_argument(
        "--prefix",
        type=Path,
        default=Path.home() / ".wine-phoenix",
        help="Wine prefix to use (default: ~/.wine-phoenix)",
    )
    parser.add_argument(
        "--wine",
        default="wine",
        help="Wine executable or path (default: wine)",
    )
    parser.add_argument("args", nargs=argparse.REMAINDER, help="Arguments passed to the EXE")
    return parser.parse_args()


def main():
    options = parse_args()
    exe = options.exe.expanduser().resolve()

    if not exe.is_file():
        print(f"EXE not found: {exe}", file=sys.stderr)
        return 2
    if exe.suffix.lower() != ".exe":
        print("The input file must have an .exe extension.", file=sys.stderr)
        return 2

    wine = shutil.which(options.wine) or (
        str(Path(options.wine).expanduser()) if Path(options.wine).expanduser().is_file() else None
    )
    if not wine:
        print(
            "Wine is not installed. Install wine or pass its path with --wine.",
            file=sys.stderr,
        )
        return 127

    prefix = options.prefix.expanduser().resolve()
    prefix.mkdir(parents=True, exist_ok=True)
    command = [wine, str(exe), *options.args]
    print(f"Starting locally: {exe.name}")
    print(f"Wine prefix: {prefix}")

    environment = os.environ.copy()
    environment["WINEPREFIX"] = str(prefix)
    try:
        completed = subprocess.run(command, cwd=exe.parent, env=environment)
    except OSError as error:
        print(f"Could not start Wine: {error}", file=sys.stderr)
        return 1
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())