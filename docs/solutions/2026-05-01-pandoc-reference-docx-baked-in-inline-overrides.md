---
title: pandoc reference docx — 사용자 손-꾸민 docx 의 인라인 양식을 styles.xml 에 baked-in
date: 2026-05-01
session: 70
tags: [pandoc, docx, reference-doc, ooxml, styles-xml, korean, mammoth]
category: pattern
confidence: high
---

## 문제

손으로 직접 워드에서 꾸민 v1 docx (Heading 마다 색상 코드 + 하단 테두리, 표 셀 색상, 코드 색상 등) 와 동일한 양식으로 마크다운 → docx 를 자동 생성하고 싶다. 그런데 pandoc 의 `--reference-doc` 으로 v1 docx 를 그대로 넘겨도 결과 docx 의 비주얼이 v1 과 매우 다르게 나온다 — Heading 색상은 다르고, 표 테두리는 검정이고, 코드 색은 빠지고, 단락 spacing 도 0 으로 떨어진다.

증상:
- v1 docx Heading1 = #1A73E8 (Google Blue) + 하단 테두리
- 새로 만든 docx Heading1 = #2E74B5 (Office Word 기본 블루) + 테두리 없음
- v1 docx Heading2 = #333333 (다크 그레이)
- 새 docx Heading2 = #2E74B5 (블루)
- v1 docx 코드 = Consolas + #1B5E20 (다크 그린)
- 새 docx 코드 = 검정 평문

## 원인

손-꾸민 docx 의 진짜 양식은 **`word/styles.xml` 이 아니라 `word/document.xml` 의 단락별 인라인 오버라이드** 에 있다.

```xml
<!-- v1/word/styles.xml — 비교적 빈약 -->
<w:style w:styleId="Heading1">
  <w:rPr><w:color w:val="2E74B5"/><w:sz w:val="32"/></w:rPr>  <!-- 16pt 블루 -->
</w:style>

<!-- v1/word/document.xml — 매 Heading1 단락마다 인라인 override -->
<w:p>
  <w:pPr>
    <w:pStyle w:val="Heading1"/>
    <w:pBdr><w:bottom w:val="single" w:color="1A73E8" w:sz="2" w:space="4"/></w:pBdr>
    <w:spacing w:after="160" w:before="360"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:b/><w:color w:val="1A73E8"/><w:sz w:val="28"/>  <!-- 14pt #1A73E8, override -->
    </w:rPr>
    <w:t>서버 정보 요약</w:t>
  </w:r>
</w:p>
```

사용자가 워드에서 텍스트를 선택해 색상/크기를 변경하면 워드는 **스타일 정의를 수정하는 게 아니라 그 단락에만 적용되는 인라인 rPr/pPr 을 추가** 한다. 그래서 v1 docx 는:

- styles.xml 에는 Heading1 = #2E74B5 16pt 로 정의돼 있음
- 매 단락마다 `<w:color="1A73E8"/><w:sz="28"/>` 로 override → 실제 보이는 건 #1A73E8 14pt
- 추가로 `<w:pBdr>` 인라인 단락 테두리

**pandoc 은 마크다운 변환 시 인라인 오버라이드를 만들지 못한다.** 모든 Heading 단락에는 `<w:pStyle w:val="Heading1"/>` 만 박을 뿐, `<w:color>` 인라인 override 는 추가하지 않는다. 따라서:

- `--reference-doc=v1.docx` 로 넘겨도 pandoc 은 v1.docx 의 styles.xml 만 가져가 적용
- 결과 docx 의 Heading1 = styles.xml 정의대로 #2E74B5 16pt (테두리 없음)

이게 1차 시도가 실패한 이유다.

## 해결

**v1 docx 의 인라인 오버라이드 사양을 styles.xml 에 baked-in 한 새 reference docx** 를 만들면, pandoc 이 그 스타일을 적용하기만 해도 v1 비주얼이 자동 재현된다.

### Step 1 — v1 의 진짜 양식 추출 (인라인 오버라이드 분석)

```bash
# docx 풀어서 document.xml 의 인라인 형태 검사
python3 -c "
import zipfile, re
zipfile.ZipFile('v1.docx').extractall('/tmp/v1')
doc = open('/tmp/v1/word/document.xml').read()

# Heading1 단락의 인라인 색상/크기/테두리 모두 추출
h1s = re.findall(r'<w:p>.*?<w:pStyle w:val=\"Heading1\".*?</w:p>', doc, re.DOTALL)
print(h1s[0][:600])  # 첫 Heading1 단락
"
```

추출 결과 → spec 표:

| 요소 | v1 인라인 실측 |
|------|----------------|
| Heading1 | 맑은 고딕 14pt bold **#1A73E8** + 하단 1pt #1A73E8 테두리 |
| Heading2 | 맑은 고딕 12pt bold **#333333** (블루 아님!) |
| 코드 | Consolas 10pt **#1B5E20** (다크 그린) |
| 표 테두리 | single 1pt **#CCCCCC** (검정 아님!) |
| 표 헤더 셀 | shading **#F0F4FA** (연하늘) |
| 본문 단락 spacing | after=100 (5pt) |

### Step 2 — styles.xml 통째로 교체 (baked-in)

```python
# scripts/build-pandoc-ref-from-v1.py 핵심
new_styles = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ...>
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕"/>
      <w:sz w:val="21"/>  <!-- 10.5pt -->
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="100" w:line="276" w:lineRule="auto"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:pPr>
      <w:keepNext/><w:keepLines/>
      <w:pBdr><w:bottom w:val="single" w:color="1A73E8" w:sz="2" w:space="4"/></w:pBdr>
      <w:spacing w:before="360" w:after="160"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:color w:val="1A73E8"/><w:sz w:val="28"/>
    </w:rPr>
  </w:style>
  <!-- Heading2/Heading3/SourceCode/VerbatimChar/Table 모두 동일 패턴 -->
  ...
  <w:style w:type="table" w:styleId="Table">
    <w:tblPr>
      <w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/>...</w:tblBorders>
    </w:tblPr>
    <w:tblStylePr w:type="firstRow">
      <w:tcPr><w:shd w:fill="F0F4FA"/></w:tcPr>
    </w:tblStylePr>
  </w:style>
</w:styles>"""

# v1.docx 풀어서 word/styles.xml 통째 교체 → 다시 zip
work = Path("/tmp/_v1plus_work"); shutil.rmtree(work, ignore_errors=True); work.mkdir()
with zipfile.ZipFile("v1.docx") as z: z.extractall(work)
(work / "word/styles.xml").write_text(new_styles, encoding="utf-8")
with zipfile.ZipFile("ref-v1plus.docx", "w", zipfile.ZIP_DEFLATED) as zout:
    for p in sorted(work.rglob("*")):
        if p.is_file(): zout.write(p, str(p.relative_to(work)).replace("\\", "/"))
```

### Step 3 — pandoc 변환 시 reference 로 사용

```bash
pandoc input.md -f gfm -t docx \
    --reference-doc=ref-v1plus.docx \
    --toc --toc-depth=2 \
    -o output.docx
```

이제 pandoc 이 `<w:pStyle w:val="Heading1"/>` 만 박아도 v1 비주얼이 그대로 적용된다.

### 보너스: pandoc 보조 스타일도 함께 baked-in

pandoc 이 추가로 사용하는 스타일(VerbatimChar, SourceCode, BlockText, Compact, FirstParagraph, TOCHeading, TOC1, TOC2)도 reference docx 의 styles.xml 에 정의해 두면 pandoc 변환 결과의 비주얼이 완전해진다. 정의되지 않으면 pandoc 은 단락에 그 스타일을 박지만 Word 가 fallback 으로 Normal 을 쓴다 (코드 인라인이 회색 배경 없는 일반 텍스트로 보임 등).

## 교훈

- **워드 docx 의 시각 사양은 styles.xml 단독으로 결정되지 않는다.** 사용자가 손으로 꾸민 문서는 거의 항상 인라인 오버라이드를 갖는다 — `word/document.xml` 을 직접 읽어 실측해야 한다.
- **pandoc 의 한계**: pandoc 은 마크다운 → docx 변환 시 인라인 오버라이드를 만들지 못한다. 인라인 비주얼을 styles.xml 에 baked-in 해야 자동 적용된다.
- **mammoth + CSS 시각 비교의 한계**: mammoth 는 docx → HTML 변환 시 단락 spacing, SourceCode 매핑, 인라인 색상 일부를 무시한다. true 시각 검증은 LibreOffice (`soffice --convert-to png`) 또는 Word 가 필요하다 — 본 세션에서 이 한계로 사용자 측 시각 검증 의존.
- **WSL 한글/특수문자 변수 함정**: `wsl -d Ubuntu -- bash -ilc 'A="$X"; cmd "$A"'` 형태에서 한글/특수문자 변수가 외부 셸 quoting 단계에서 빈 문자열로 잘린다. 인라인 경로 직접 사용 또는 `/tmp` 경유 후 `cp` 로 회피.

## 관련 파일

- `scripts/build-pandoc-ref-from-v1.py` — v1 docx → 강화 reference docx 빌더
- `docs/guides/_pandoc-ref-v1plus.docx` — 양평 매뉴얼 갱신 시 재사용용 reference
- `docs/guides/server-boot-manual.md` — 매뉴얼 .md 원본
- `docs/guides/양평서버_부팅매뉴얼.docx` — 변환 산출물
- `docs/guides/양평서버_부팅매뉴얼_v1.docx` — 원본 v1 (보존, 분석 source)
