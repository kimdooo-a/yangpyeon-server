"""
v1 docx의 실제 비주얼(인라인 단락 오버라이드까지 포함) 을 styles.xml 에 baked-in
한 reference docx 를 생성한다. 결과 파일은 매뉴얼 갱신 때마다 재사용.

v1 실측 양식 (document.xml 분석 결과):
  - 본문        : 맑은 고딕 10.5pt, 단락 간격 after=100 (5pt)
  - Heading1    : 맑은 고딕 14pt bold #1A73E8 + 하단 1pt #1A73E8 테두리, before=360 after=160
  - Heading2    : 맑은 고딕 12pt bold #333333, before=240 after=120
  - Heading3    : 맑은 고딕 11pt bold #1F4D78, before=200 after=100
  - 코드 인라인 : Consolas 10pt, 회색 배경 + 다크그린 #1B5E20
  - 코드 블럭   : Consolas 10pt #1B5E20, 회색 배경, 좌우 패딩
  - 표 테두리   : single 1pt #CCCCCC (연회색), 셀 마진 80/120
  - 표 헤더 행  : 배경 #F0F4FA, bold

사용:
  python3 scripts/build-pandoc-ref-from-v1.py \
      docs/guides/양평서버_부팅매뉴얼_v1.docx \
      docs/guides/_pandoc-ref-v1plus.docx \
      2026.05.01
"""
import sys
import shutil
import zipfile
import re
from pathlib import Path

if len(sys.argv) < 3:
    print("usage: build-pandoc-ref-from-v1.py <v1.docx> <out.docx> [footer-date]", file=sys.stderr)
    sys.exit(2)

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
footer_date = sys.argv[3] if len(sys.argv) >= 4 else "2026.05.01"

work = Path("/tmp/_v1plus_work")
if work.exists():
    shutil.rmtree(work)
work.mkdir()

with zipfile.ZipFile(src) as z:
    z.extractall(work)

# v1 의 styles.xml 은 pandoc 이 사용하기에 너무 빈약하므로, 본문/헤딩/코드/표 모두를
# v1 실측 양식 그대로 baked-in 한 새 styles.xml 을 통째로 작성한다.
styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" mc:Ignorable="w14 w15">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/>
      <w:sz w:val="21"/><w:szCs w:val="21"/>
      <w:lang w:val="ko-KR" w:eastAsia="ko-KR" w:bidi="ar-SA"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="100" w:line="276" w:lineRule="auto"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/><w:qFormat/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="80"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:bCs/>
      <w:color w:val="1A73E8"/>
      <w:sz w:val="40"/><w:szCs w:val="40"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="400"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:color w:val="333333"/>
      <w:sz w:val="28"/><w:szCs w:val="28"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:keepNext/><w:keepLines/>
      <w:pBdr><w:bottom w:val="single" w:color="1A73E8" w:sz="2" w:space="4"/></w:pBdr>
      <w:spacing w:before="360" w:after="160"/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:bCs/>
      <w:color w:val="1A73E8"/>
      <w:sz w:val="28"/><w:szCs w:val="28"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:keepNext/><w:keepLines/>
      <w:spacing w:before="240" w:after="120"/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:bCs/>
      <w:color w:val="333333"/>
      <w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:keepNext/><w:keepLines/>
      <w:spacing w:before="200" w:after="100"/>
      <w:outlineLvl w:val="2"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:bCs/>
      <w:color w:val="1F4D78"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="Heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:color w:val="333333"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Compact">
    <w:name w:val="Compact"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="BodyText">
    <w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="100" w:after="100"/></w:pPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="FirstParagraph">
    <w:name w:val="First Paragraph"/><w:basedOn w:val="BodyText"/><w:qFormat/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="BlockText">
    <w:name w:val="Block Text"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:ind w:left="480"/>
      <w:spacing w:before="120" w:after="120"/>
      <w:pBdr><w:left w:val="single" w:sz="12" w:space="6" w:color="D0D0D0"/></w:pBdr>
    </w:pPr>
    <w:rPr><w:i/><w:color w:val="595959"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="SourceCode">
    <w:name w:val="Source Code"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:spacing w:before="40" w:after="40" w:line="260" w:lineRule="auto"/>
      <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
      <w:ind w:left="120" w:right="120"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
      <w:color w:val="1B5E20"/>
      <w:sz w:val="20"/><w:szCs w:val="20"/>
    </w:rPr>
  </w:style>

  <w:style w:type="character" w:styleId="VerbatimChar">
    <w:name w:val="Verbatim Char"/><w:basedOn w:val="DefaultParagraphFont"/>
    <w:rPr>
      <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
      <w:color w:val="1B5E20"/>
      <w:sz w:val="20"/><w:szCs w:val="20"/>
      <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="TOCHeading">
    <w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr>
      <w:keepNext/><w:keepLines/>
      <w:pBdr><w:bottom w:val="single" w:color="1A73E8" w:sz="2" w:space="4"/></w:pBdr>
      <w:spacing w:before="240" w:after="160"/>
    </w:pPr>
    <w:rPr><w:b/><w:color w:val="1A73E8"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="TOC1">
    <w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/>
    <w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="TOC2">
    <w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/>
    <w:pPr><w:spacing w:before="0" w:after="60"/><w:ind w:left="240"/></w:pPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="0" w:after="60"/><w:ind w:left="320"/></w:pPr>
  </w:style>

  <w:style w:type="character" w:styleId="Strong">
    <w:name w:val="Strong"/><w:basedOn w:val="DefaultParagraphFont"/><w:qFormat/>
    <w:rPr><w:b/><w:bCs/></w:rPr>
  </w:style>

  <w:style w:type="character" w:styleId="Hyperlink">
    <w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/>
    <w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>
  </w:style>

  <w:style w:type="table" w:default="1" w:styleId="TableNormal">
    <w:name w:val="Normal Table"/><w:semiHidden/><w:unhideWhenUsed/><w:qFormat/>
    <w:tblPr>
      <w:tblCellMar>
        <w:top w:w="80" w:type="dxa"/>
        <w:left w:w="120" w:type="dxa"/>
        <w:bottom w:w="80" w:type="dxa"/>
        <w:right w:w="120" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  </w:style>

  <w:style w:type="table" w:styleId="Table">
    <w:name w:val="Table"/><w:basedOn w:val="TableNormal"/>
    <w:tblPr>
      <w:tblCellMar>
        <w:top w:w="80" w:type="dxa"/>
        <w:left w:w="120" w:type="dxa"/>
        <w:bottom w:w="80" w:type="dxa"/>
        <w:right w:w="120" w:type="dxa"/>
      </w:tblCellMar>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblStylePr w:type="firstRow">
      <w:rPr><w:b/></w:rPr>
      <w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F0F4FA"/></w:tcPr>
    </w:tblStylePr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="FootnoteText">
    <w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:semiHidden/><w:unhideWhenUsed/>
    <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
  </w:style>

  <w:style w:type="character" w:styleId="FootnoteReference">
    <w:name w:val="footnote reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:semiHidden/><w:unhideWhenUsed/>
    <w:rPr><w:vertAlign w:val="superscript"/></w:rPr>
  </w:style>
</w:styles>
"""

# 1) styles.xml 통째로 교체
(work / "word" / "styles.xml").write_text(styles_xml, encoding="utf-8")

# 2) footer1.xml 의 날짜만 갱신 (헤더·푸터 시각 양식은 v1 그대로)
footer_path = work / "word" / "footer1.xml"
if footer_path.exists():
    footer = footer_path.read_text(encoding="utf-8")
    footer = re.sub(r"\d{4}\.\d{2}\.\d{2}", footer_date, footer)
    footer_path.write_text(footer, encoding="utf-8")

# 3) re-zip
dst.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
    for path in sorted(work.rglob("*")):
        if path.is_file():
            arcname = str(path.relative_to(work)).replace("\\", "/")
            zout.write(path, arcname)

print(f"[OK] v1+ reference docx → {dst}")
print(f"     footer 날짜: {footer_date}")
print(f"     v1 인라인 양식 baked-in: Heading1 #1A73E8 + 하단테두리, Heading2 #333333, "
      f"코드 #1B5E20, 표 테두리 #CCCCCC + 헤더행 #F0F4FA")
