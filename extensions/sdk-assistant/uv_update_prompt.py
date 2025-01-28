# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pyright",
#     "posit-sdk",
# ]
#
# [tool.uv.sources]
# chatlas = { git = "https://github.com/posit-dev/chatlas", rev = "main" }
# posit-sdk = { git = "https://github.com/posit-dev/posit-sdk-py", rev = "main" }
# ///
from __future__ import annotations

import asyncio
import os
import pathlib
import shutil

import pyright


here = pathlib.Path(__file__).parent
os.chdir(here)


def cleanup() -> None:
    # Clean slate
    print("Clean up")
    for f in [
        "typings",
        "_repomix-instructions.md",
    ]:
        path = here / f
        if path.exists():
            print("Removing path:", path.relative_to(here))
            if path.is_file():
                path.unlink()
            else:
                shutil.rmtree(path)
    print("--\n")


async def main() -> None:
    # Clean slate
    cleanup()

    print("Creating type stubs: ./typings")
    pyright.run("--createstub", "posit")
    print("--\n")

    print("Trimming type stubs")
    remove_prefix_from_files(
        "typings",
        '"""\nThis type stub file was generated by pyright.\n"""\n\n',
    )
    print("--\n")

    print("Getting Swagger information")
    os.system("python ./_update_swagger.py")

    with open(here / "_repomix-instructions.md", "w") as prompt_f:
        prompt_f.write((here / "custom-prompt-instructions.md").read_text())
        prompt_f.write("\n")
        prompt_f.write((here / "_swagger_prompt.md").read_text())

    print("--\n")

    # repomix GitHub Repo: https://github.com/yamadashy/repomix
    # Python alternative: https://pypi.org/project/code2prompt/
    # * Does not contain XML output (suggested by anthropic)
    print("Creating repomix output")
    # Assert npx exists in system
    assert os.system("npx --version") == 0, (
        "npx not found in system. Please install Node.js"
    )
    exit_code = os.system(
        "npx --package repomix --yes repomix --config repomix.config.json --output _prompt.xml typings/posit"
    )
    assert exit_code == 0, "repomix failed to build prompt file: _prompt.xml"
    print("--\n")

    # Clean slate
    cleanup()


def remove_prefix_from_files(folder: str | pathlib.Path, prefix: str) -> None:
    root_folder = pathlib.Path(folder)
    for path in root_folder.rglob("*.pyi"):
        file_txt = path.read_text().removeprefix(prefix)
        path.write_text(file_txt)


if __name__ == "__main__":
    asyncio.run(main())
