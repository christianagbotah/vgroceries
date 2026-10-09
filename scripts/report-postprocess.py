#!/usr/bin/env python3
"""Post-process the architect report docx for WPS/Office page-number compatibility.

Patches (per docx skill toc.md):
 1. Footer instrText: bare PAGE -> 'PAGE \\* ROMAN \\* MERGEFORMAT' (front-matter section)
    and 'PAGE \\* arabic \\* MERGEFORMAT' (body section).
 2. Remove empty <w:pgNumType/> elements (docx-js emits them on the cover section).

Footer XML files map to sections in creation order: footer1 -> section 2 (roman),
footer2 -> section 3 (arabic). We detect by scanning document.xml section order
and matching relationship ids, with a fallback of patching by format hints.
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "download/Variety-Groceries-Delivery-and-Integration-Report.docx")

def main():
    work = SRC.with_suffix(".tmp.docx")
    with zipfile.ZipFile(SRC, "r") as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}

    doc_xml = data["word/document.xml"].decode("utf-8")

    # -- 2. strip empty pgNumType (cover section artifact)
    before = doc_xml
    doc_xml = doc_xml.replace("<w:pgNumType/>", "")
    if doc_xml != before:
        print("Removed empty <w:pgNumType/>")

    # -- map sections -> footer rIds in order
    sect_footers = []  # list of (fmt_hint, footer_rid)
    for sect in re.findall(r"<w:sectPr[ >].*?</w:sectPr>", doc_xml, flags=re.S):
        fmt = None
        m = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect)
        if m:
            fmt = m.group(1)
        fm = re.search(r'<w:footerReference[^>]*r:id="([^"]+)"', sect)
        sect_footers.append((fmt, fm.group(1) if fm else None))
    print("Section->footer map:", sect_footers)

    # -- resolve rIds to footer part names via document rels
    rels = data["word/_rels/document.xml.rels"].decode("utf-8")
    rid_to_target = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

    for fmt, rid in sect_footers:
        if not rid:
            continue
        target = rid_to_target.get(rid)
        if not target:
            continue
        part = "word/" + target.lstrip("/")
        if part not in data:
            continue
        xml = data[part].decode("utf-8")
        switch = "ROMAN" if fmt == "upperRoman" else "arabic"
        patched = re.sub(
            r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
            r"\g<1> PAGE \\* " + switch + r" \\* MERGEFORMAT \g<2>",
            xml,
        )
        if patched != xml:
            data[part] = patched.encode("utf-8")
            print(f"Patched {part} -> PAGE \\* {switch}")

    data["word/document.xml"] = doc_xml.encode("utf-8")

    with zipfile.ZipFile(work, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, data[n])
    shutil.move(work, SRC)
    print("Post-processed OK:", SRC)

if __name__ == "__main__":
    main()
