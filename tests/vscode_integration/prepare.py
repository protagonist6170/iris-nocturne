"""Prepare sample files and settings in an explicit, fresh validation root."""

import argparse
import json
import pathlib
import shutil


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path, required=True)
    parser.add_argument("--export-root", type=pathlib.Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    exported = args.export_root.resolve() / "vscode"
    if not (exported / "iris-nocturne.vsix").is_file():
        parser.error("build the VSIX before preparing validation")
    fixtures = pathlib.Path(__file__).resolve().parents[1] / "fixtures"
    workspace = root / "workspace"
    settings_path = root / "user-data/User/settings.json"
    if settings_path.exists() or workspace.exists():
        parser.error(
            "use a fresh root; validation preparation never merges existing settings"
        )
    settings = {"workbench.colorTheme": "Iris Nocturne"}
    settings.update(
        {
            "workbench.startupEditor": "none",
            "typescript.disableAutomaticTypeAcquisition": True,
            "update.mode": "none",
            "extensions.autoUpdate": False,
            "extensions.autoCheckUpdates": False,
            "telemetry.telemetryLevel": "off",
            "window.title": "IRIS VALIDATION — ${activeEditorShort}",
            "window.restoreWindows": "none",
            "security.workspace.trust.enabled": False,
        }
    )
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    workspace.mkdir(parents=True)
    for source, destination in {
        "syntax.py": "pipeline.py",
        "syntax.cpp": "scheduler.cpp",
        "syntax.tsx": "RunCard.tsx",
        "syntax.md": "README.md",
        "syntax.toml": "experiment.toml",
        "syntax.ipynb": "benchmark.ipynb",
    }.items():
        shutil.copyfile(fixtures / source, workspace / destination)
    (workspace / ".clangd").write_text("CompileFlags:\n  Add: [-std=c++20]\n")
    (workspace / "tsconfig.json").write_text(
        json.dumps(
            {
                "compilerOptions": {
                    "jsx": "preserve",
                    "target": "ES2022",
                    "strict": True,
                }
            },
            indent=2,
        )
        + "\n"
    )
    (workspace / "jsx.d.ts").write_text(
        "declare namespace JSX {\n"
        "  interface IntrinsicElements {\n"
        '    article: { children?: unknown; "data-complete"?: boolean };\n'
        "    h2: { children?: string };\n"
        "    p: { children?: string };\n"
        "  }\n}\n"
    )
    print(f"Prepared isolated settings and sample workspace in {root}.")


if __name__ == "__main__":
    main()
