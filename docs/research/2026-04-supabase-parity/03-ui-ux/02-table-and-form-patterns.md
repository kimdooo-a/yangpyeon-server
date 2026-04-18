# 02. 테이블 및 폼 패턴 — 양평 부엌 서버 대시보드

> Wave 4 · Tier 3 (U1) 산출물 — kdywave W4-U1 (Agent UI/UX-1)
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [03-ui-ux/](./) → **이 문서**
> 참조: [02-architecture/09-table-editor-blueprint.md](../02-architecture/09-table-editor-blueprint.md) · [00-design-system.md](./00-design-system.md)
> 근거: ADR-002 (TanStack Table v8), DQ-1.9~1.12, NFR-PERF.1, NFR-UX.3

---

## 목차

- [1. 테이블 패턴 (TanStack v8)](#1-테이블-패턴-tanstack-v8)
- [2. 폼 패턴](#2-폼-패턴)
- [3. 데이터 조작 패턴](#3-데이터-조작-패턴)
- [4. 검색 및 필터 패턴](#4-검색-및-필터-패턴)
- [5. Empty State 디자인](#5-empty-state-디자인)
- [6. 토스트 및 알림 (Sonner)](#6-토스트-및-알림-sonner)

---

## 1. 테이블 패턴 (TanStack v8)

### 1.1 TanStack Table v8 채택 근거

ADR-002 (Accepted): "TanStack Table v8 헤드리스 자체구현 (AG Grid/Glide 거부)". Wave 1 점수 4.6/5, Wave 2 매트릭스 4.54/5. 헤드리스 아키텍처로 완전한 UI 커스터마이징 가능.

### 1.2 기본 테이블 구조

```tsx
// src/components/table-editor/table-data-grid.tsx 패턴
// Phase 14c-α/β에서 이미 구현됨 (세션 24 완료)

<div className="rounded-md border border-border overflow-hidden">
  {/* 테이블 툴바 */}
  <TableToolbar
    table={table}
    globalFilter={globalFilter}
    onGlobalFilterChange={setGlobalFilter}
  />

  {/* 테이블 본체 */}
  <div className="overflow-auto max-h-[calc(100vh-280px)]">
    <table className="w-full text-sm" role="grid" aria-rowcount={data.length}>
      <thead className="bg-muted/50 sticky top-0 z-10">
        <tr>
          {/* 체크박스 컬럼 */}
          <th className="w-10 px-3 py-2.5 border-b border-border">
            <Checkbox
              checked={table.getIsAllRowsSelected()}
              onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
              aria-label="전체 선택"
            />
          </th>
          {/* 데이터 컬럼 헤더 */}
          {table.getHeaderGroups()[0].headers.map((header) => (
            <TableHeader key={header.id} header={header} />
          ))}
          {/* 액션 컬럼 */}
          <th className="w-20 px-3 py-2.5 border-b border-border text-right">
            <span className="sr-only">액션</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} row={row} />
        ))}
      </tbody>
    </table>
  </div>

  {/* 페이지네이션 */}
  <TablePagination table={table} total={totalCount} />
</div>
```

### 1.3 테이블 행 스타일

```
기본 행:
  배경: 투명
  경계: border-b border-border-muted
  높이: h-10 (40px)

호버 행:
  배경: bg-muted/30
  전환: transition-colors duration-100

선택된 행:
  배경: bg-brand/10
  경계: border-border-brand

편집 중 행:
  배경: bg-info/5
  경계: border-border-brand (강조)
  cursor: text
```

### 1.4 테이블 컬럼 헤더

```tsx
function TableHeader({ header }: { header: Header<Row, unknown> }) {
  const canSort = header.column.getCanSort();
  const sortDirection = header.column.getIsSorted();

  return (
    <th
      className={cn(
        "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground border-b border-border",
        "whitespace-nowrap",
        canSort && "cursor-pointer select-none hover:text-foreground"
      )}
      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
      aria-sort={
        sortDirection === 'asc' ? 'ascending' :
        sortDirection === 'desc' ? 'descending' : 'none'
      }
    >
      <div className="flex items-center gap-1">
        {/* 컬럼 타입 아이콘 */}
        <ColumnTypeIcon type={header.column.columnDef.meta?.type} />
        {flexRender(header.column.columnDef.header, header.getContext())}
        {/* 정렬 인디케이터 */}
        {canSort && (
          <span className="ml-1">
            {sortDirection === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : sortDirection === 'desc' ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
            )}
          </span>
        )}
      </div>
    </th>
  );
}
```

### 1.5 페이지네이션

```
┌──────────────────────────────────────────────────────────┐
│ 총 1,234개 행  │  페이지당: [50 ▾]  │  1 / 25 페이지    │
│               │                   │  [◀] [1][2]...[25][▶]│
└──────────────────────────────────────────────────────────┘
```

```tsx
function TablePagination({
  table,
  total,
}: {
  table: TanstackTable<Row>;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      {/* 좌측: 총 행 수 + 선택 수 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>총 {total.toLocaleString('ko-KR')}개 행</span>
        {table.getSelectedRowModel().rows.length > 0 && (
          <span className="text-brand">
            ({table.getSelectedRowModel().rows.length}개 선택됨)
          </span>
        )}
      </div>

      {/* 우측: 페이지 크기 + 네비게이션 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">페이지당</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-7 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {table.getState().pagination.pageIndex + 1} /{' '}
            {table.getPageCount()}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### 1.6 인라인 셀 편집 (Phase 14c-α 패턴)

Phase 14c-α에서 구현 완료된 `EditableCell` + `useInlineEditMutation` 패턴:

```tsx
// 셀 더블클릭 또는 Enter 키로 편집 모드 진입
// 편집 가능 타입: text, number, boolean, date, datetime, json

function EditableCell({ value, column, row }: EditableCellProps) {
  const [isEditing, setIsEditing] = React.useState(false);

  if (isEditing) {
    return (
      <TypedInputControl
        type={column.meta?.pgType}
        value={value}
        onConfirm={(newValue) => {
          mutation.mutate({ rowId: row.id, column: column.id, value: newValue });
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
        autoFocus
      />
    );
  }

  return (
    <div
      className={cn(
        "min-h-[36px] px-3 py-2 cursor-text",
        "hover:bg-muted/50 rounded",
        column.meta?.isSystemColumn && "opacity-50 cursor-not-allowed"
      )}
      onDoubleClick={() => !column.meta?.isSystemColumn && setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          if (!column.meta?.isSystemColumn) setIsEditing(true);
        }
      }}
      tabIndex={0}
      role="gridcell"
      aria-label={`${column.id}: ${value ?? 'null'}`}
    >
      <CellValueDisplay value={value} type={column.meta?.pgType} />
    </div>
  );
}
```

**편집 충돌 처리 (409 CONFLICT → Sonner 3-액션 토스트)**:
```
충돌 발생 시 하단 알림:
┌─────────────────────────────────────────────────────────────┐
│ ⚠ 수정 충돌: 다른 세션에서 이미 변경됨                       │
│ [덮어쓰기]  [내용 유지]  [새로고침]                          │
└─────────────────────────────────────────────────────────────┘
```

### 1.7 FK 셀렉터 (cmdk 기반, DQ-1.12 확정)

DQ-1.12 확정: FK selector = cmdk 기반 (일관성 우위).

```tsx
// 외래키 셀 편집 시 cmdk Combobox
function ForeignKeySelector({
  fkTable,
  fkColumn,
  displayColumn,
  value,
  onSelect,
}: FKSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  // FK 테이블 데이터 로드 (검색 쿼리 기반)
  const { data: options } = useFKOptions(fkTable, fkColumn, displayColumn, query);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-sm font-normal"
        >
          {value ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="text-muted-foreground">선택...</span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={`${fkTable} 검색...`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {options?.map((option) => (
                <CommandItem
                  key={option.id}
                  value={String(option[fkColumn])}
                  onSelect={() => {
                    onSelect(option[fkColumn]);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === String(option[fkColumn]) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono text-xs text-muted-foreground mr-2">
                    {option[fkColumn]}
                  </span>
                  {option[displayColumn] && (
                    <span className="truncate">{option[displayColumn]}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

### 1.8 3-상태 표준 (빈/로딩/에러)

모든 데이터 표시 컴포넌트는 3가지 상태를 명시적으로 처리:

**로딩 상태**:
```tsx
function TableLoadingState() {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
```

**에러 상태**:
```tsx
function TableErrorState({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <AlertCircle className="h-10 w-10 text-danger mb-4" />
      <h3 className="text-base font-medium text-foreground mb-1">
        데이터를 불러오지 못했습니다
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {error.message}
      </p>
      <Button variant="outline" size="sm" onClick={() => refetch()}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        다시 시도
      </Button>
    </div>
  );
}
```

**빈 상태**: §5 참조.

### 1.9 CSV 가져오기/내보내기 (DQ-1.11 — Papa Parse 채택)

DQ-1.11 확정: Papa Parse(16KB) 정식 도입. 자체 파서는 따옴표/이스케이프 엣지케이스 위험으로 거부.

```tsx
// CSV 가져오기 Dialog
function CSVImportDialog({ tableName, onImport }: CSVImportDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = React.useState<Record<string, string>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);

    // Papa Parse 미리보기 (첫 5행)
    Papa.parse(selected, {
      header: true,
      preview: 5,
      complete: (result) => {
        setPreview(result.data as string[][]);
        // 자동 컬럼 매핑 시도
        autoMapColumns(result.meta.fields || [], tableColumns, setColumnMapping);
      },
    });
  };

  return (
    <Dialog>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tableName} — CSV 가져오기</DialogTitle>
          <DialogDescription>
            CSV 파일을 업로드하면 컬럼을 매핑하고 행을 일괄 삽입합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 파일 드롭존 */}
          <div
            className={cn(
              "border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer",
              "hover:border-brand hover:bg-brand/5 transition-colors",
              file && "border-brand bg-brand/5"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {file ? file.name : 'CSV 파일을 드롭하거나 클릭하여 선택'}
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />

          {/* 미리보기 */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">미리보기 (첫 5행)</h4>
              <div className="overflow-auto max-h-40 text-xs font-mono border border-border rounded">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      {Object.keys(preview[0] || {}).map((col) => (
                        <th key={col} className="px-2 py-1 text-left border-b border-border">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-border-muted">
                        {Object.values(row).map((cell, j) => (
                          <td key={j} className="px-2 py-1">{String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 컬럼 매핑 */}
          {Object.keys(columnMapping).length > 0 && (
            <ColumnMappingEditor
              csvColumns={Object.keys(preview[0] || {})}
              tableColumns={tableColumns}
              mapping={columnMapping}
              onChange={setColumnMapping}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button
            disabled={!file || Object.keys(columnMapping).length === 0}
            onClick={() => onImport(file!, columnMapping)}
          >
            <Upload className="mr-2 h-4 w-4" />
            가져오기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**CSV 내보내기 버튼**:
```tsx
function CSVExportButton({ table, tableName }: CSVExportButtonProps) {
  const handleExport = () => {
    const rows = table.getFilteredRowModel().rows.map((row) =>
      row.getVisibleCells().reduce((acc, cell) => {
        acc[cell.column.id] = cell.getValue();
        return acc;
      }, {} as Record<string, unknown>)
    );

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-2 h-3.5 w-3.5" />
      CSV 내보내기
    </Button>
  );
}
```

---

## 2. 폼 패턴

### 2.1 React Hook Form + Zod 검증 표준

모든 폼은 `react-hook-form` + `zod` 조합을 사용한다. 전역 규칙:

```typescript
// 폼 스키마 예시 (테이블 행 생성)
const rowInsertSchema = z.object({
  username: z.string().min(1, '사용자명은 필수입니다').max(100),
  email: z.string().email('유효한 이메일 형식이어야 합니다'),
  age: z.number().int().min(0).max(150).optional(),
  created_at: z.string().datetime().optional(),
});

type RowInsertForm = z.infer<typeof rowInsertSchema>;

// 폼 훅 초기화
const form = useForm<RowInsertForm>({
  resolver: zodResolver(rowInsertSchema),
  defaultValues: { username: '', email: '' },
});
```

### 2.2 표준 폼 필드 구조

```tsx
// 개별 폼 필드 — FormField (shadcn Form 컴포넌트 사용)
<FormField
  control={form.control}
  name="email"
  render={({ field, fieldState }) => (
    <FormItem>
      {/* 레이블 + 필수 표시 */}
      <FormLabel className="flex items-center gap-1">
        이메일
        <span className="text-danger text-xs" aria-label="필수">*</span>
      </FormLabel>

      {/* 입력 */}
      <FormControl>
        <Input
          {...field}
          type="email"
          placeholder="user@example.com"
          className={cn(fieldState.error && "border-danger focus-visible:ring-danger")}
          aria-invalid={!!fieldState.error}
          aria-describedby={fieldState.error ? `email-error` : undefined}
        />
      </FormControl>

      {/* 힌트 (에러 없을 때) */}
      {!fieldState.error && (
        <FormDescription>
          로그인에 사용할 이메일 주소를 입력하세요.
        </FormDescription>
      )}

      {/* 에러 메시지 */}
      <FormMessage id="email-error" />
    </FormItem>
  )}
/>
```

### 2.3 필수 vs 선택 표시 규칙

| 표시 방법 | 사용 조건 | 구현 |
|---------|---------|------|
| `*` 빨간 별표 | 필수 필드 | `<span className="text-danger">*</span>` |
| "(선택)" 텍스트 | 선택 필드 (필수가 다수일 때) | `<span className="text-muted-foreground text-xs ml-1">(선택)</span>` |
| 기본값 있는 필드 | 선택 + 기본값 | 플레이스홀더에 기본값 표시 |

### 2.4 저장 상태 버튼

저장 버튼은 3가지 상태를 명확히 표시:

```tsx
function SaveButton({ isPending, isSuccess, isError }: SaveButtonProps) {
  return (
    <Button
      type="submit"
      disabled={isPending}
      className={cn(
        isSuccess && "bg-success hover:bg-success text-white",
        isError && "bg-danger hover:bg-danger text-white"
      )}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          저장 중...
        </>
      ) : isSuccess ? (
        <>
          <Check className="mr-2 h-4 w-4" />
          저장됨
        </>
      ) : isError ? (
        <>
          <AlertCircle className="mr-2 h-4 w-4" />
          저장 실패
        </>
      ) : (
        '저장'
      )}
    </Button>
  );
}
```

저장 완료 후 isSuccess → false 전환 타이밍: 2초 후 자동 리셋.

### 2.5 폼 레이아웃 표준

```
단순 폼 (모달 내부):
┌─────────────────────────────────────────┐
│ 제목 *                                  │
│ ┌────────────────────────────────────┐  │
│ │ 입력 필드                          │  │
│ └────────────────────────────────────┘  │
│ 힌트 텍스트                             │
│                                         │
│ 이메일 *                                │
│ ┌────────────────────────────────────┐  │
│ │ 입력 필드                          │  │
│ └────────────────────────────────────┘  │
│                                         │
│ [취소]                      [저장]      │
└─────────────────────────────────────────┘

복잡한 폼 (전체 페이지):
  - 2열 그리드: `grid grid-cols-1 md:grid-cols-2 gap-4`
  - 섹션 구분: `Separator` + 섹션 제목
  - 고정 푸터: 스크롤되어도 [저장] 버튼 항상 보임
```

### 2.6 폼 에러 표시 규칙

**인라인 에러** (각 필드 아래):
```
입력 필드 경계선: border-danger
에러 텍스트: text-xs text-danger
아이콘: AlertCircle h-3.5 w-3.5 mr-1 inline
```

**폼 레벨 에러** (제출 실패 시):
```tsx
{formError && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>저장 실패</AlertTitle>
    <AlertDescription>{formError.message}</AlertDescription>
  </Alert>
)}
```

---

## 3. 데이터 조작 패턴

### 3.1 삭제 확인 모달 (Destructive Action)

모든 삭제(DELETE) 작업은 확인 모달을 통해야 한다. 파괴적 액션은 2단계 확인.

```tsx
function DeleteConfirmDialog({
  title,
  description,
  destructiveText,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = React.useState('');

  return (
    <Dialog>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger/10">
              <AlertCircle className="h-4 w-4 text-danger" />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* 중요 삭제의 경우: 대상명 직접 입력 확인 */}
        {destructiveText && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              확인을 위해{' '}
              <code className="bg-muted px-1 rounded text-xs font-mono text-foreground">
                {destructiveText}
              </code>
              를 입력하세요.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={destructiveText}
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>취소</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={destructiveText ? confirmText !== destructiveText : false}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**삭제 확인 레벨**:

| 수준 | 예시 | 확인 방법 |
|------|------|---------|
| 낮음 | 테이블 행 1개 삭제 | 단순 "삭제" 버튼 모달 |
| 중간 | 여러 행 일괄 삭제 | 선택 수 표시 + 확인 |
| 높음 | 테이블 자체 삭제 | 테이블명 직접 입력 |
| 최고 | 데이터베이스 초기화 | 테이블명 + "DELETE" 입력 |

### 3.2 Bulk Action (일괄 작업)

테이블 행 선택 후 일괄 작업 바:

```
행 선택 시 테이블 상단에 표시:
┌─────────────────────────────────────────────────────────────┐
│ ✓ 12개 행 선택됨     [선택 해제]   [CSV 내보내기]  [삭제]   │
└─────────────────────────────────────────────────────────────┘
```

```tsx
function BulkActionBar({
  selectedCount,
  onClear,
  onExport,
  onDelete,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2",
        "bg-brand/10 border-b border-brand/20",
        "animate-in slide-in-from-top-2 duration-150"
      )}
      role="status"
      aria-live="polite"
    >
      <Check className="h-4 w-4 text-brand" />
      <span className="text-sm font-medium text-brand">
        {selectedCount}개 행 선택됨
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          선택 해제
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="mr-2 h-3.5 w-3.5" />
          CSV 내보내기
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          삭제 ({selectedCount})
        </Button>
      </div>
    </div>
  );
}
```

### 3.3 Optimistic UI + 롤백 (SQLite audit 연계)

Phase 14c-α에서 구현된 낙관적 잠금 패턴. 모든 인라인 편집은 Optimistic UI를 적용하며, 충돌 또는 에러 시 롤백:

```typescript
// 낙관적 업데이트 패턴 (useInlineEditMutation.ts)
const mutation = useMutation({
  mutationFn: (data: UpdatePayload) =>
    fetch(`/api/v1/tables/${tableName}/${data.pk}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...data.changes,
        expected_updated_at: data.expectedUpdatedAt, // 낙관적 잠금 필드
      }),
    }),

  // 낙관적 업데이트: 서버 응답 전에 UI 먼저 업데이트
  onMutate: async (variables) => {
    await queryClient.cancelQueries({ queryKey: ['table', tableName] });
    const previousData = queryClient.getQueryData(['table', tableName]);
    queryClient.setQueryData(['table', tableName], (old: Row[]) =>
      old.map((row) =>
        row[pkColumn] === variables.pk
          ? { ...row, ...variables.changes, updated_at: new Date().toISOString() }
          : row
      )
    );
    return { previousData };
  },

  // 에러 시 롤백
  onError: (error, variables, context) => {
    if (context?.previousData) {
      queryClient.setQueryData(['table', tableName], context.previousData);
    }
    // 409 충돌
    if (error instanceof ConflictError) {
      toast.warning('수정 충돌', {
        description: '다른 세션에서 이미 변경됨',
        action: {
          label: '덮어쓰기',
          onClick: () => mutation.mutate({ ...variables, force: true }),
        },
      });
    }
  },

  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['table', tableName] });
  },
});
```

---

## 4. 검색 및 필터 패턴

### 4.1 글로벌 검색 (Cmd+K 커맨드 팔레트)

§ 01-layout-navigation.md §6 참조. 모든 페이지에서 Cmd+K로 접근 가능.

### 4.2 테이블 필터 (TanStack Filters)

Table Editor의 컬럼별 필터 + 글로벌 검색:

```
테이블 툴바:
┌─────────────────────────────────────────────────────────────────┐
│ [🔍 검색...           ] [필터 추가 ▾] [컬럼 표시 ▾]  [새 행 +]  │
└─────────────────────────────────────────────────────────────────┘

필터 적용 후:
┌─────────────────────────────────────────────────────────────────┐
│ [🔍 검색... ] [role = admin ×] [created_at > 2026-01 ×] [+ 필터]│
└─────────────────────────────────────────────────────────────────┘
```

**필터 칩 컴포넌트**:
```tsx
function FilterChip({ column, operator, value, onRemove }: FilterChipProps) {
  return (
    <div className={cn(
      "flex items-center gap-1 h-7",
      "rounded bg-brand/10 border border-brand/20",
      "px-2 text-xs text-brand"
    )}>
      <span className="font-medium">{column}</span>
      <span className="text-brand/70">{operator}</span>
      <code className="font-mono">{value}</code>
      <button
        onClick={onRemove}
        className="ml-1 hover:text-foreground"
        aria-label={`${column} 필터 제거`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
```

**필터 추가 드롭다운**:
```
[필터 추가 ▾]
└─ 컬럼 선택
   ├── username (text)
   ├── email (text)
   ├── role (enum)
   ├── created_at (timestamp)
   └── is_active (boolean)

→ 연산자 선택 (컬럼 타입에 따라)
   text: 포함/시작/끝/같음/다름
   number: =/≠/>/</≥/≤
   boolean: 참/거짓
   timestamp: >/</사이/오늘/이번 주

→ 값 입력
```

### 4.3 URL 동기화

필터, 정렬, 페이지 상태를 URL 쿼리 파라미터와 동기화:

```typescript
// 테이블 상태 → URL 파라미터
// /database/tables/users?sort=created_at:desc&filter=role:eq:admin&page=2&size=50

const searchParams = useSearchParams();
const router = useRouter();

const tableState = {
  sorting: parseSortingParam(searchParams.get('sort')),
  columnFilters: parseFiltersParam(searchParams.get('filter')),
  pagination: {
    pageIndex: Number(searchParams.get('page') ?? 0),
    pageSize: Number(searchParams.get('size') ?? 50),
  },
};

// 상태 변경 시 URL 업데이트 (replace, 히스토리 미생성)
const updateTableState = useCallback((updates: Partial<typeof tableState>) => {
  const params = new URLSearchParams(searchParams.toString());
  if (updates.sorting) params.set('sort', serializeSorting(updates.sorting));
  if (updates.columnFilters) params.set('filter', serializeFilters(updates.columnFilters));
  if (updates.pagination) {
    params.set('page', String(updates.pagination.pageIndex));
    params.set('size', String(updates.pagination.pageSize));
  }
  router.replace(`?${params.toString()}`, { scroll: false });
}, [searchParams, router]);
```

---

## 5. Empty State 디자인

### 5.1 Empty State 컴포넌트

이미 구현된 `src/components/ui/empty-state.tsx` 기반으로 표준화:

```tsx
// src/components/ui/empty-state.tsx
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps['variant'];
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
}

export function EmptyState({
  icon: Icon = Database,
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <Button
          variant={action.variant ?? 'default'}
          size="sm"
          onClick={action.onClick}
        >
          {action.icon && <action.icon className="mr-2 h-4 w-4" />}
          {action.label}
        </Button>
      )}
      {secondaryAction && (
        <a
          href={secondaryAction.href}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
        >
          {secondaryAction.label}
        </a>
      )}
    </div>
  );
}
```

### 5.2 페이지별 Empty State 정의

| 페이지 | 아이콘 | 제목 | 설명 | CTA |
|--------|--------|------|------|-----|
| Table Editor (테이블 없음) | `Table2` | "테이블이 없습니다" | "새 테이블을 생성하거나 SQL Editor에서 CREATE TABLE을 실행하세요." | "테이블 생성" |
| Table Editor (행 없음) | `Rows` | "데이터가 없습니다" | "아직 이 테이블에 행이 없습니다." | "새 행 추가" |
| Table Editor (검색 결과 없음) | `Search` | "검색 결과가 없습니다" | "다른 검색어나 필터를 시도해 보세요." | "필터 초기화" |
| SQL Editor (저장된 쿼리 없음) | `Code2` | "저장된 쿼리가 없습니다" | "자주 사용하는 SQL 쿼리를 저장하고 재사용하세요." | "새 쿼리 작성" |
| Auth (사용자 없음) | `Users` | "등록된 사용자가 없습니다" | "첫 번째 사용자를 초대하거나 생성하세요." | "사용자 초대" |
| Storage (버킷 없음) | `FolderOpen` | "버킷이 없습니다" | "파일을 저장하려면 먼저 버킷을 생성하세요." | "버킷 생성" |
| Edge Functions (없음) | `Activity` | "Edge Function이 없습니다" | "서버리스 함수를 작성하고 배포하세요." | "함수 생성" |
| Advisors (문제 없음) | `CheckCircle2` | "권장 사항 없음" | "현재 감지된 성능 문제나 보안 취약점이 없습니다." | — (성공 상태) |
| Realtime (채널 없음) | `Radio` | "활성 채널 없음" | "실시간 채널에 클라이언트가 연결되면 여기에 표시됩니다." | — |
| Cron Jobs (없음) | `Clock` | "예약 작업이 없습니다" | "반복 실행이 필요한 SQL 작업을 스케줄링하세요." | "작업 추가" |

---

## 6. 토스트 및 알림 (Sonner)

### 6.1 Sonner 통합 설정

```tsx
// src/app/(dashboard)/layout.tsx
import { Toaster } from 'sonner';

// 레이아웃 내 위치
<Toaster
  position="bottom-right"
  richColors
  expand={false}
  closeButton
  duration={4000}
  toastOptions={{
    classNames: {
      toast: 'bg-card border-border text-foreground font-sans',
      title: 'text-sm font-medium',
      description: 'text-xs text-muted-foreground',
      actionButton: 'bg-primary text-primary-foreground text-xs',
      cancelButton: 'bg-muted text-muted-foreground text-xs',
    },
  }}
/>
```

### 6.2 토스트 타입별 사용 규칙

```typescript
// src/lib/toast.ts — 프로젝트 전역 토스트 래퍼
import { toast } from 'sonner';

export const notify = {
  // 성공: 작업 완료
  success: (message: string, description?: string) =>
    toast.success(message, { description }),

  // 에러: 작업 실패 (자동 닫힘 없음 — 사용자가 명시적으로 닫아야)
  error: (message: string, description?: string) =>
    toast.error(message, { description, duration: Infinity }),

  // 경고: 주의 필요 (7초)
  warning: (message: string, description?: string) =>
    toast.warning(message, { description, duration: 7000 }),

  // 정보: 일반 알림 (4초 기본)
  info: (message: string, description?: string) =>
    toast.info(message, { description }),

  // 로딩: 비동기 작업 + 자동 완료/에러 전환
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    }
  ) => toast.promise(promise, messages),

  // 충돌/파괴적 액션 경고 (액션 버튼 포함)
  conflict: (
    description: string,
    actions: {
      label: string;
      onClick: () => void;
    }[]
  ) =>
    toast.warning('수정 충돌', {
      description,
      duration: Infinity,
      action: actions[0],
    }),
};
```

### 6.3 토스트 사용 예시

```typescript
// 성공
notify.success('테이블 저장됨', '변경사항이 저장되었습니다.');

// 에러
notify.error('저장 실패', '데이터베이스 연결 오류: ' + error.message);

// 경고
notify.warning('권한 부족', 'MANAGER 이상의 권한이 필요합니다.');

// 로딩 → 완료
notify.promise(
  createTable(formData),
  {
    loading: '테이블 생성 중...',
    success: (data) => `${data.tableName} 테이블이 생성되었습니다.`,
    error: (err) => `테이블 생성 실패: ${err.message}`,
  }
);

// SQL 실행 결과
notify.success(
  `${rowCount.toLocaleString('ko-KR')}개 행 영향받음`,
  `실행 시간: ${executionTime}ms`
);
```

### 6.4 인라인 Alert (페이지 내 고정 알림)

토스트가 아닌 페이지 내 고정 경고:

```tsx
// 정보 알림
<Alert>
  <Info className="h-4 w-4" />
  <AlertTitle>정보</AlertTitle>
  <AlertDescription>
    이 설정은 서버 재시작 후 적용됩니다.
  </AlertDescription>
</Alert>

// 경고 알림
<Alert variant="warning">
  <AlertTriangle className="h-4 w-4" />
  <AlertTitle>주의</AlertTitle>
  <AlertDescription>
    이 테이블에 RLS 정책이 없습니다. 모든 인증된 사용자가 접근 가능합니다.
  </AlertDescription>
</Alert>

// 에러 알림
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>오류</AlertTitle>
  <AlertDescription>
    PostgreSQL 연결 실패: {error.message}
  </AlertDescription>
</Alert>
```

Alert variant 정의:
```typescript
// shadcn Alert 기본 variant + warning 추가
const alertVariants = cva("...", {
  variants: {
    variant: {
      default: "bg-info/10 border-info/30 text-foreground",
      destructive: "bg-danger/10 border-danger/30 text-danger",
      warning: "bg-warning/10 border-warning/30 text-warning",
      success: "bg-success/10 border-success/30 text-success",
    },
  },
});
```
