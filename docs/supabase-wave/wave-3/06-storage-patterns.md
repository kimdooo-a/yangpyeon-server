# Supabase 파일 업로드/관리 운영 패턴

> Wave 3 | 작성일: 2026-04-06 | 참고: Supabase Storage 공식 문서 (2025 기준)

---

## 목차

1. [업로드 패턴](#1-업로드-패턴)
2. [이미지 최적화](#2-이미지-최적화)
3. [접근 제어 패턴](#3-접근-제어-패턴)
4. [운영](#4-운영)
5. [S3 호환 API 활용](#5-s3-호환-api-활용)

---

## 개요

Supabase Storage는 세 가지 버킷 타입을 제공한다:

| 버킷 타입 | 설명 | 주요 사용 사례 |
|-----------|------|---------------|
| **Files** | 일반 파일, 이미지, 비디오 | 프로필 사진, 첨부파일, 미디어 |
| **Analytics** | Apache Iceberg 형식 데이터 분석 | 데이터 레이크, ETL |
| **Vector** | AI/ML 벡터 인덱싱 | 시맨틱 검색, 임베딩 저장 |

이 문서는 **Files 버킷** 운영 패턴에 집중한다.

```
클라이언트
   │
   ├─ 직접 업로드 ──────────▶ Supabase Storage (RESTful API)
   │                              │
   ├─ 재개 가능 업로드 ────────▶  │ (TUS 프로토콜)
   │                              │
   └─ S3 멀티파트 업로드 ──────▶  │ (S3 호환 API)
                                  │
                             Global CDN (Cloudflare)
                                  │
                             클라이언트 (이미지 변환 포함)
```

---

## 1. 업로드 패턴

### 1.1 프로필 이미지 업로드 (리사이징 + CDN)

```typescript
// lib/storage/upload-avatar.ts
import { createClient } from '@/lib/supabase/client'

interface UploadAvatarOptions {
  userId: string
  file: File
  maxSizeKB?: number
}

interface UploadResult {
  publicUrl: string
  path: string
}

/**
 * 프로필 이미지 업로드
 * - 경로: avatars/{userId}/{timestamp}.{ext}
 * - 동일 경로에 덮어쓰기 (upsert: true)
 * - CDN 캐시 1시간
 */
export async function uploadAvatar({
  userId,
  file,
  maxSizeKB = 2048,
}: UploadAvatarOptions): Promise<UploadResult> {
  const supabase = createClient()

  // 1) 클라이언트 사이드 유효성 검사
  validateImageFile(file, maxSizeKB)

  // 2) 고유 파일명 생성 (타임스탬프 + 확장자)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const fileName = `${Date.now()}.${ext}`
  const filePath = `${userId}/${fileName}`

  // 3) 업로드 (사용자 폴더로 격리)
  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      cacheControl: '3600',    // CDN 캐시 1시간
      upsert: true,            // 같은 경로 덮어쓰기
      contentType: file.type,
      metadata: {
        userId,
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    })

  if (error) throw new Error(`업로드 실패: ${error.message}`)

  // 4) 공개 URL 생성 (이미지 변환 포함)
  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(data.path, {
      transform: {
        width: 200,
        height: 200,
        resize: 'cover',    // 크롭 방식
        quality: 85,        // 품질 (기본 80)
      },
    })

  return { publicUrl: urlData.publicUrl, path: data.path }
}

/**
 * 파일 유효성 검사 (클라이언트 사이드)
 */
function validateImageFile(file: File, maxSizeKB: number) {
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`허용되지 않는 파일 형식: ${file.type}. (허용: JPEG, PNG, GIF, WebP)`)
  }

  const fileSizeKB = file.size / 1024
  if (fileSizeKB > maxSizeKB) {
    throw new Error(`파일 크기 초과: ${fileSizeKB.toFixed(0)}KB / 최대 ${maxSizeKB}KB`)
  }
}
```

```typescript
// components/profile/AvatarUpload.tsx
'use client'

import { useState, useRef } from 'react'
import { uploadAvatar } from '@/lib/storage/upload-avatar'

interface AvatarUploadProps {
  userId: string
  currentAvatarUrl?: string
  onSuccess: (url: string) => void
}

export function AvatarUpload({ userId, currentAvatarUrl, onSuccess }: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 로컬 미리보기 (업로드 전)
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    setError(null)

    setUploading(true)
    try {
      const { publicUrl } = await uploadAvatar({ userId, file })
      onSuccess(publicUrl)
      URL.revokeObjectURL(objectUrl) // 메모리 해제
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패')
      setPreview(currentAvatarUrl ?? null) // 롤백
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative w-24 h-24 rounded-full overflow-hidden cursor-pointer group bg-gray-700"
        onClick={() => fileInputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="프로필" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            사진 없음
          </div>
        )}
        <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-sm transition-opacity">
          {uploading ? '업로드 중...' : '변경'}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}
```

### 1.2 대용량 파일 업로드 (재개 가능 업로드 - TUS 프로토콜)

TUS 프로토콜을 사용하면 네트워크 중단 시 이어 올리기가 가능하다. Uppy 라이브러리와 함께 사용한다.

```bash
# 필요 패키지 설치
npm install @uppy/core @uppy/tus @uppy/dashboard @uppy/drag-drop @uppy/progress-bar
```

```typescript
// hooks/use-resumable-upload.ts
import { useEffect, useState } from 'react'
import Uppy from '@uppy/core'
import Tus from '@uppy/tus'
import { createClient } from '@/lib/supabase/client'

interface UseResumableUploadOptions {
  bucketName: string
  folder?: string
  maxFileSizeMB?: number
  allowedFileTypes?: string[]
  onComplete?: (fileUrl: string, fileName: string) => void
  onError?: (error: Error) => void
}

export function useResumableUpload({
  bucketName,
  folder = '',
  maxFileSizeMB = 100,
  allowedFileTypes,
  onComplete,
  onError,
}: UseResumableUploadOptions) {
  const [uppy, setUppy] = useState<Uppy | null>(null)
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const supabase = createClient()

  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL!
    .replace('https://', '')
    .replace('.supabase.co', '')

  useEffect(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxFileSize: maxFileSizeMB * 1024 * 1024,
        allowedFileTypes: allowedFileTypes,
      },
    })

    const initUppy = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      uppyInstance.use(Tus, {
        endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],  // 재시도 간격 (ms)
        headers: {
          authorization: `Bearer ${session?.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,  // 완료 후 핑거프린트 제거
        chunkSize: 6 * 1024 * 1024,        // 6MB 청크 (Supabase 요구사항)
        allowedMetaFields: [
          'bucketName',
          'objectName',
          'contentType',
          'cacheControl',
          'metadata',
        ],
        onError: (error) => {
          setIsUploading(false)
          onError?.(error)
        },
      })

      // 파일 추가 시 메타데이터 설정
      uppyInstance.on('file-added', (file) => {
        const objectName = folder
          ? `${folder}/${Date.now()}-${file.name}`
          : `${Date.now()}-${file.name}`

        file.meta = {
          ...file.meta,
          bucketName,
          objectName,
          contentType: file.type,
          cacheControl: '3600',
          metadata: JSON.stringify({
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          }),
        }
      })

      // 진행률 업데이트
      uppyInstance.on('progress', (progress) => {
        setProgress(progress)
        setIsUploading(progress > 0 && progress < 100)
      })

      // 완료
      uppyInstance.on('complete', (result) => {
        setIsUploading(false)
        setProgress(100)

        result.successful?.forEach((file) => {
          const objectName = file.meta.objectName as string
          const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(objectName)

          onComplete?.(publicUrl, file.name)
        })
      })
    }

    initUppy()
    setUppy(uppyInstance)

    return () => {
      uppyInstance.destroy()
    }
  }, [bucketName, folder, supabase])

  return { uppy, progress, isUploading }
}
```

```typescript
// components/upload/LargeFileUploader.tsx
'use client'

import { useEffect } from 'react'
import { useResumableUpload } from '@/hooks/use-resumable-upload'
import Dashboard from '@uppy/dashboard'
import '@uppy/core/dist/style.min.css'
import '@uppy/dashboard/dist/style.min.css'

interface LargeFileUploaderProps {
  bucketName: string
  folder?: string
  onFileUploaded?: (url: string, name: string) => void
}

export function LargeFileUploader({ bucketName, folder, onFileUploaded }: LargeFileUploaderProps) {
  const { uppy, progress, isUploading } = useResumableUpload({
    bucketName,
    folder,
    maxFileSizeMB: 500,
    onComplete: onFileUploaded,
    onError: (err) => console.error('업로드 오류:', err),
  })

  useEffect(() => {
    if (!uppy) return

    uppy.use(Dashboard, {
      inline: true,
      target: '#large-file-upload-area',
      showProgressDetails: true,
      note: '최대 500MB. 중단 후 이어 올리기 지원.',
      locale: {
        strings: {
          dropPasteFiles: '파일을 여기에 끌어다 놓거나 %{browseFiles}',
          browseFiles: '파일 선택',
          uploadComplete: '업로드 완료',
          uploadPaused: '업로드 일시 중지',
          resumeUpload: '이어서 올리기',
          pauseUpload: '일시 중지',
          retryUpload: '다시 시도',
          cancelUpload: '취소',
        },
      },
    })
  }, [uppy])

  return (
    <div>
      <div id="large-file-upload-area" />
      {isUploading && (
        <div className="mt-2">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>업로드 중...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

### 1.3 다중 파일 업로드 (갤러리)

```typescript
// lib/storage/upload-gallery.ts
import { createClient } from '@/lib/supabase/client'

interface GalleryUploadResult {
  path: string
  publicUrl: string
  thumbnailUrl: string
  name: string
  size: number
  type: string
}

/**
 * 다중 파일 동시 업로드 (갤러리용)
 * - concurrency: 동시 업로드 수 (기본 3)
 */
export async function uploadGalleryImages(
  files: File[],
  userId: string,
  albumId: string,
  concurrency = 3,
  onProgress?: (uploaded: number, total: number) => void
): Promise<GalleryUploadResult[]> {
  const supabase = createClient()
  const results: GalleryUploadResult[] = []
  let uploadedCount = 0

  // 배치 처리 (동시 업로드 제한)
  const uploadBatch = async (batch: File[]): Promise<GalleryUploadResult[]> => {
    return Promise.all(
      batch.map(async (file) => {
        validateImageFile(file)

        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const filePath = `${userId}/${albumId}/${fileName}`

        const { data, error } = await supabase.storage
          .from('gallery')
          .upload(filePath, file, {
            cacheControl: '31536000',  // CDN 캐시 1년 (불변 파일)
            upsert: false,
            contentType: file.type,
          })

        if (error) throw new Error(`"${file.name}" 업로드 실패: ${error.message}`)

        // 원본 URL
        const { data: { publicUrl } } = supabase.storage
          .from('gallery')
          .getPublicUrl(data.path)

        // 썸네일 URL (이미지 변환)
        const { data: { publicUrl: thumbnailUrl } } = supabase.storage
          .from('gallery')
          .getPublicUrl(data.path, {
            transform: {
              width: 400,
              height: 400,
              resize: 'cover',
              quality: 75,
            },
          })

        uploadedCount++
        onProgress?.(uploadedCount, files.length)

        return {
          path: data.path,
          publicUrl,
          thumbnailUrl,
          name: file.name,
          size: file.size,
          type: file.type,
        }
      })
    )
  }

  // 파일을 배치로 나누어 업로드
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    const batchResults = await uploadBatch(batch)
    results.push(...batchResults)
  }

  return results
}

function validateImageFile(file: File) {
  const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
  const MAX_SIZE_MB = 25  // Supabase 이미지 변환 최대 25MB

  if (!ALLOWED.includes(file.type)) {
    throw new Error(`허용되지 않는 파일 타입: ${file.type}`)
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`파일 크기 초과: 최대 ${MAX_SIZE_MB}MB`)
  }
}
```

### 1.4 드래그 앤 드롭 + 프리뷰

```typescript
// components/upload/DropZone.tsx
'use client'

import { useState, useRef, useCallback, DragEvent } from 'react'

interface DropZoneProps {
  accept?: string[]
  maxFiles?: number
  maxSizeMB?: number
  onFilesSelected: (files: File[]) => void
}

interface FilePreview {
  file: File
  preview: string
  id: string
}

export function DropZone({
  accept = ['image/*'],
  maxFiles = 10,
  maxSizeMB = 10,
  onFilesSelected,
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(
    (rawFiles: FileList | File[]) => {
      const files = Array.from(rawFiles)
      const newErrors: string[] = []
      const validFiles: File[] = []

      files.forEach((file) => {
        // 수 제한
        if (previews.length + validFiles.length >= maxFiles) {
          newErrors.push(`최대 ${maxFiles}개까지만 선택 가능합니다.`)
          return
        }

        // 크기 제한
        if (file.size > maxSizeMB * 1024 * 1024) {
          newErrors.push(`"${file.name}": ${maxSizeMB}MB 초과`)
          return
        }

        // 타입 확인
        const isAccepted = accept.some((type) => {
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.replace('/*', '/'))
          }
          return file.type === type
        })

        if (!isAccepted) {
          newErrors.push(`"${file.name}": 허용되지 않는 파일 형식`)
          return
        }

        validFiles.push(file)
      })

      setErrors(newErrors)

      if (validFiles.length > 0) {
        const newPreviews: FilePreview[] = validFiles.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          id: `${file.name}-${Date.now()}`,
        }))

        setPreviews((prev) => [...prev, ...newPreviews])
        onFilesSelected(validFiles)
      }
    },
    [accept, maxFiles, maxSizeMB, previews.length, onFilesSelected]
  )

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      processFiles(e.dataTransfer.files)
    },
    [processFiles]
  )

  const removePreview = (id: string) => {
    setPreviews((prev) => {
      const item = prev.find((p) => p.id === id)
      if (item) URL.revokeObjectURL(item.preview)  // 메모리 해제
      return prev.filter((p) => p.id !== id)
    })
  }

  return (
    <div>
      {/* 드롭 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragOver
            ? 'border-green-500 bg-green-500/10'
            : 'border-gray-600 hover:border-gray-400 bg-gray-800/50'
          }
        `}
      >
        <div className="text-4xl mb-3">+</div>
        <p className="text-gray-300">파일을 여기에 끌어다 놓거나 클릭하여 선택</p>
        <p className="text-gray-500 text-sm mt-1">
          최대 {maxFiles}개, 파일당 {maxSizeMB}MB
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept.join(',')}
        onChange={(e) => processFiles(e.target.files!)}
        className="hidden"
      />

      {/* 오류 메시지 */}
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {errors.map((err, i) => (
            <li key={i} className="text-red-400 text-sm">{err}</li>
          ))}
        </ul>
      )}

      {/* 미리보기 그리드 */}
      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {previews.map((item) => (
            <div key={item.id} className="relative group aspect-square">
              <img
                src={item.preview}
                alt={item.file.name}
                className="w-full h-full object-cover rounded"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removePreview(item.id) }}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                x
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate rounded-b opacity-0 group-hover:opacity-100 transition-opacity">
                {item.file.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## 2. 이미지 최적화

### 2.1 자동 리사이징 + WebP 변환

Supabase Storage는 Accept 헤더의 `image/webp`가 있으면 자동으로 WebP로 변환한다. 원본 포맷을 유지하려면 `format: 'origin'`을 지정한다.

```typescript
// lib/storage/image-url.ts
import { createClient } from '@/lib/supabase/client'

interface ImageOptions {
  width?: number
  height?: number
  quality?: number
  resize?: 'cover' | 'contain' | 'fill'
  format?: 'origin' | 'avif'  // 기본값: 자동 WebP
}

/**
 * 이미지 최적화 URL 생성 헬퍼
 */
export function getOptimizedImageUrl(
  bucket: string,
  path: string,
  options: ImageOptions = {}
): string {
  const supabase = createClient()

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path, {
      transform: {
        width: options.width,
        height: options.height,
        quality: options.quality ?? 80,
        resize: options.resize ?? 'cover',
        format: options.format,
      },
    })

  return publicUrl
}

// 사전 정의된 프리셋
export const ImagePresets = {
  thumbnail: (bucket: string, path: string) =>
    getOptimizedImageUrl(bucket, path, { width: 150, height: 150, quality: 70 }),

  card: (bucket: string, path: string) =>
    getOptimizedImageUrl(bucket, path, { width: 400, height: 300, quality: 80 }),

  hero: (bucket: string, path: string) =>
    getOptimizedImageUrl(bucket, path, { width: 1200, height: 630, quality: 85, resize: 'cover' }),

  avatar: (bucket: string, path: string) =>
    getOptimizedImageUrl(bucket, path, { width: 200, height: 200, quality: 85, resize: 'cover' }),

  preview: (bucket: string, path: string) =>
    getOptimizedImageUrl(bucket, path, { width: 800, quality: 85, resize: 'contain' }),
}
```

### 2.2 Next.js 이미지 최적화 통합

```typescript
// lib/supabase-image-loader.ts
// next.config.ts에서 커스텀 로더로 등록

const projectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID!

export default function supabaseLoader({
  src,
  width,
  quality,
}: {
  src: string
  width: number
  quality?: number
}) {
  // Supabase Storage URL 변환
  return (
    `https://${projectId}.supabase.co/storage/v1/render/image/public/${src}` +
    `?width=${width}&quality=${quality ?? 75}`
  )
}
```

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './src/lib/supabase-image-loader.ts',
    // 외부 도메인 허용 (Cloudflare 경유)
    domains: [
      `${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID}.supabase.co`,
    ],
  },
}

export default nextConfig
```

```typescript
// components/ui/SupabaseImage.tsx
import Image from 'next/image'

interface SupabaseImageProps {
  bucket: string
  path: string
  alt: string
  width: number
  height: number
  quality?: number
  className?: string
  priority?: boolean
}

export function SupabaseImage({
  bucket,
  path,
  alt,
  width,
  height,
  quality = 80,
  className,
  priority = false,
}: SupabaseImageProps) {
  // Next.js Image 컴포넌트 + Supabase 변환 로더
  const src = `${bucket}/${path}`

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      quality={quality}
      className={className}
      priority={priority}
    />
  )
}
```

### 2.3 썸네일 생성 전략

```typescript
// lib/storage/thumbnails.ts

interface ThumbnailSet {
  small: string    // 150x150
  medium: string   // 400x400
  large: string    // 800x800
  original: string // 원본
}

/**
 * 이미지 업로드 후 다양한 크기의 썸네일 URL 세트 생성
 * Supabase는 On-demand 변환을 제공하므로 별도 저장 불필요
 */
export function generateThumbnailSet(bucket: string, path: string): ThumbnailSet {
  const supabase = createClient()

  const makeUrl = (width: number, height: number) => {
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path, {
        transform: { width, height, resize: 'cover', quality: 75 },
      })
    return publicUrl
  }

  const { data: { publicUrl: original } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)

  return {
    small: makeUrl(150, 150),
    medium: makeUrl(400, 400),
    large: makeUrl(800, 800),
    original,
  }
}
```

### 2.4 반응형 이미지 (srcset)

```typescript
// components/ui/ResponsiveImage.tsx
import { createClient } from '@/lib/supabase/client'

interface ResponsiveImageProps {
  bucket: string
  path: string
  alt: string
  className?: string
  sizes?: string
}

export function ResponsiveImage({
  bucket,
  path,
  alt,
  className,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
}: ResponsiveImageProps) {
  const supabase = createClient()

  const makeUrl = (width: number): string => {
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path, {
        transform: { width, quality: 80 },
      })
    return publicUrl
  }

  // 다양한 해상도의 srcset 생성
  const srcSet = [320, 480, 640, 768, 1024, 1280, 1536]
    .map((w) => `${makeUrl(w)} ${w}w`)
    .join(', ')

  return (
    <img
      src={makeUrl(800)}      // 기본 이미지
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
    />
  )
}
```

### 2.5 OG 이미지 자동 생성

```typescript
// app/api/og/route.tsx
// Next.js App Router OG 이미지 API (Vercel OG)
import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title') ?? '기본 제목'
  const description = searchParams.get('description') ?? ''
  const imageId = searchParams.get('imageId') ?? ''

  // Supabase Storage에서 배경 이미지 URL 생성
  let bgImageUrl = ''
  if (imageId) {
    const supabase = createClient()
    const { data: { publicUrl } } = supabase.storage
      .from('og-backgrounds')
      .getPublicUrl(imageId, {
        transform: { width: 1200, height: 630, resize: 'cover', quality: 90 },
      })
    bgImageUrl = publicUrl
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 60,
          backgroundImage: bgImageUrl ? `url(${bgImageUrl})` : 'none',
          backgroundColor: '#1a1a2e',
          backgroundSize: 'cover',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
            position: 'absolute',
            inset: 0,
          }}
        />
        <h1 style={{ fontSize: 64, fontWeight: 700, color: 'white', margin: 0 }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 32, color: 'rgba(255,255,255,0.8)', margin: '16px 0 0' }}>
            {description}
          </p>
        )}
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

---

## 3. 접근 제어 패턴

### 3.1 사용자별 폴더 구조 (user_id/filename)

```sql
-- 버킷 생성 (SQL 마이그레이션)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('documents', 'documents', false, 52428800, NULL),
  ('gallery', 'gallery', true, 26214400, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

-- avatars 버킷: 사용자별 폴더 접근 제어
-- 업로드: 인증된 사용자가 자신의 폴더에만 업로드 가능
CREATE POLICY "사용자 본인 폴더에 업로드"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (SELECT auth.jwt()->>'sub')
);

-- 조회: 모든 사람이 아바타 조회 가능 (공개 버킷)
CREATE POLICY "아바타 공개 조회"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- 수정: 본인 파일만 수정
CREATE POLICY "본인 아바타만 수정"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (SELECT auth.jwt()->>'sub')
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (SELECT auth.jwt()->>'sub')
);

-- 삭제: 본인 파일만 삭제
CREATE POLICY "본인 아바타만 삭제"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = (SELECT auth.jwt()->>'sub')
);
```

### 3.2 공개 vs 비공개 버킷 전략

```typescript
// lib/storage/bucket-strategy.ts

/**
 * 버킷 전략 가이드라인
 *
 * 공개(public) 버킷:
 * - CDN 캐시 효율 최대 (사용자별 권한 확인 불필요)
 * - 사용 사례: 프로필 사진, 공개 갤러리, 마케팅 이미지
 *
 * 비공개(private) 버킷:
 * - 요청마다 RLS 정책 확인 (CDN 히트율 낮음)
 * - 사용 사례: 개인 문서, 결제 영수증, 의료 기록
 */

// 공개 버킷 URL 생성
export function getPublicUrl(bucket: string, path: string): string {
  const supabase = createClient()
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)
  return publicUrl
}

// 비공개 버킷: 서명된 URL 생성 (서버 사이드에서만)
export async function getPrivateFileUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const supabase = createServerClient()  // 서비스 롤 키 사용

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw error
  return data.signedUrl
}

// 여러 파일의 서명된 URL 일괄 생성
export async function getSignedUrlsBatch(
  bucket: string,
  paths: string[],
  expiresInSeconds = 3600
): Promise<Record<string, string>> {
  const supabase = createServerClient()

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresInSeconds)

  if (error) throw error

  return Object.fromEntries(
    (data ?? []).map((item) => [item.path, item.signedUrl ?? ''])
  )
}
```

### 3.3 시간 제한 URL (만료되는 공유)

```typescript
// lib/storage/temporary-share.ts
import { createServerClient } from '@/lib/supabase/server'

interface ShareLinkOptions {
  bucket: string
  path: string
  expiresInHours?: number
  downloadAs?: string  // 다운로드 파일명 지정
  transform?: {
    width?: number
    height?: number
    quality?: number
  }
}

/**
 * 만료 공유 링크 생성
 * - 비공개 파일을 임시로 공유
 * - 이미지 변환 포함 가능
 */
export async function createShareLink({
  bucket,
  path,
  expiresInHours = 24,
  downloadAs,
  transform,
}: ShareLinkOptions): Promise<string> {
  const supabase = createServerClient()
  const expiresIn = expiresInHours * 3600

  if (transform) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn, {
        transform: {
          width: transform.width,
          height: transform.height,
          quality: transform.quality,
        },
      })

    if (error) throw error
    return data.signedUrl
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, {
      download: downloadAs,  // 지정하면 강제 다운로드
    })

  if (error) throw error
  return data.signedUrl
}

// Server Action: 공유 링크 생성
export async function generateShareLinkAction(
  bucket: string,
  path: string
): Promise<{ url: string; expiresAt: Date }> {
  'use server'

  const url = await createShareLink({
    bucket,
    path,
    expiresInHours: 48,
  })

  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 48)

  return { url, expiresAt }
}
```

### 3.4 서버 사이드 파일 유효성 검사

```typescript
// lib/storage/validation.ts
import { z } from 'zod'

// 파일 유효성 검사 스키마 (Zod)
export const ImageUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size <= 10 * 1024 * 1024, '최대 10MB까지 업로드 가능합니다.')
    .refine(
      (f) => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type),
      'JPEG, PNG, WebP, GIF 파일만 업로드 가능합니다.'
    ),
})

export const DocumentUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size <= 50 * 1024 * 1024, '최대 50MB까지 업로드 가능합니다.')
    .refine(
      (f) =>
        [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ].includes(f.type),
      'PDF, DOC, DOCX 파일만 업로드 가능합니다.'
    ),
})

// Server Action에서의 서버 사이드 검증
export async function uploadDocumentAction(formData: FormData): Promise<{
  success: boolean
  url?: string
  error?: string
}> {
  'use server'

  try {
    const file = formData.get('file') as File
    const userId = formData.get('userId') as string

    // 서버 사이드 검증 (Zod)
    DocumentUploadSchema.parse({ file })

    // MIME 타입 재확인 (파일 헤더로 실제 검증)
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer.slice(0, 4))
    const pdfHeader = [0x25, 0x50, 0x44, 0x46]  // %PDF

    const isPdf = pdfHeader.every((byte, i) => bytes[i] === byte)
    if (!isPdf && file.type === 'application/pdf') {
      return { success: false, error: '파일 내용이 PDF 형식이 아닙니다.' }
    }

    const supabase = createServerClient()
    const fileName = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(fileName, file, {
        contentType: file.type,
        cacheControl: '86400',
      })

    if (error) return { success: false, error: error.message }

    const { data: { signedUrl } } = await supabase.storage
      .from('documents')
      .createSignedUrl(data.path, 7 * 24 * 3600)  // 7일 유효

    return { success: true, url: signedUrl }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors[0].message }
    }
    return { success: false, error: '알 수 없는 오류가 발생했습니다.' }
  }
}
```

---

## 4. 운영

### 4.1 고아 파일 정리

```sql
-- 고아 파일 탐지 쿼리
-- (storage.objects에는 있지만 참조하는 DB 레코드가 없는 파일)

-- 예시: user_profiles 테이블과 avatars 버킷 대조
SELECT
  o.name AS storage_path,
  o.created_at,
  o.metadata->>'size' AS file_size
FROM storage.objects o
WHERE
  o.bucket_id = 'avatars'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.avatar_path = o.name
  )
  AND o.created_at < NOW() - INTERVAL '1 day'  -- 1일 이상 된 파일만
ORDER BY o.created_at DESC;
```

```typescript
// lib/storage/cleanup.ts
import { createServerClient } from '@/lib/supabase/server'

/**
 * 고아 파일 정리 (배치 처리)
 * - DB 레코드가 없는 Storage 파일 탐지 및 삭제
 * - 안전을 위해 1일 이상 된 파일만 삭제
 */
export async function cleanupOrphanFiles(
  bucket: string,
  tableName: string,
  pathColumn: string,
  batchSize = 100,
  dryRun = true  // dryRun=true이면 실제 삭제 안 함
): Promise<{ found: number; deleted: number; errors: string[] }> {
  const supabase = createServerClient()
  const errors: string[] = []
  let totalFound = 0
  let totalDeleted = 0

  // 1) Storage에서 전체 파일 목록 조회 (페이지네이션)
  let offset = 0
  const orphanPaths: string[] = []

  while (true) {
    const { data: storageFiles, error } = await supabase.storage
      .from(bucket)
      .list('', {
        limit: batchSize,
        offset,
        sortBy: { column: 'created_at', order: 'asc' },
      })

    if (error) {
      errors.push(`Storage 목록 조회 실패: ${error.message}`)
      break
    }

    if (!storageFiles || storageFiles.length === 0) break

    // 2) 각 파일의 DB 레코드 존재 여부 확인
    const paths = storageFiles.map((f) => f.name)

    const { data: dbRecords } = await supabase
      .from(tableName)
      .select(pathColumn)
      .in(pathColumn, paths)

    const existingPaths = new Set(
      (dbRecords ?? []).map((r: Record<string, string>) => r[pathColumn])
    )

    // DB에 없는 파일만 선별
    const orphans = storageFiles.filter(
      (f) =>
        !existingPaths.has(f.name) &&
        // 생성 후 1일 이상 된 파일만 (방금 업로드된 파일 보호)
        new Date(f.created_at ?? 0) < new Date(Date.now() - 24 * 60 * 60 * 1000)
    )

    orphanPaths.push(...orphans.map((f) => f.name))
    totalFound += orphans.length

    offset += batchSize
    if (storageFiles.length < batchSize) break
  }

  if (dryRun) {
    console.log(`[DRY RUN] 고아 파일 ${totalFound}개 발견:`, orphanPaths)
    return { found: totalFound, deleted: 0, errors }
  }

  // 3) 실제 삭제 (배치 단위, 최대 1000개)
  for (let i = 0; i < orphanPaths.length; i += 1000) {
    const batch = orphanPaths.slice(i, i + 1000)
    const { error } = await supabase.storage.from(bucket).remove(batch)

    if (error) {
      errors.push(`삭제 실패 (배치 ${i / 1000 + 1}): ${error.message}`)
    } else {
      totalDeleted += batch.length
    }
  }

  console.log(`고아 파일 정리 완료: ${totalDeleted}/${totalFound}개 삭제`)
  return { found: totalFound, deleted: totalDeleted, errors }
}

// 스케줄 실행 (예: Vercel Cron, Next.js API Route)
// app/api/cron/cleanup-storage/route.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await cleanupOrphanFiles('gallery', 'photos', 'storage_path', 100, false)
  return Response.json(result)
}
```

### 4.2 CDN 캐싱 최적화

```typescript
// lib/storage/cdn-strategy.ts

/**
 * CDN 캐시 전략별 cacheControl 값 가이드
 *
 * Smart CDN (Pro 플랜 이상): 자동 캐시 무효화 (변경/삭제 시 최대 60초 내 반영)
 * 기본 CDN: 수동 캐시 버스팅 필요
 */

export const CDN_CACHE_STRATEGIES = {
  // 절대 변경 안 되는 파일 (콘텐츠 해시 포함 파일명 사용)
  immutable: '31536000, immutable',  // 1년

  // 프로필 이미지 (가끔 변경)
  userContent: '3600',  // 1시간

  // 자주 변경되는 콘텐츠
  dynamic: '60',  // 1분

  // 캐시 비활성화 (민감한 파일)
  noCache: 'no-store, no-cache',
} as const

/**
 * 캐시 버스팅: 파일명에 버전 포함
 * Smart CDN 없는 경우 사용
 */
export function getVersionedUrl(baseUrl: string, version: string | number): string {
  const url = new URL(baseUrl)
  url.searchParams.set('v', String(version))
  return url.toString()
}

/**
 * 업로드 시 캐시 제어 설정 포함
 */
export async function uploadWithCacheStrategy(
  file: File,
  bucket: string,
  path: string,
  strategy: keyof typeof CDN_CACHE_STRATEGIES = 'userContent'
) {
  const supabase = createClient()

  return supabase.storage.from(bucket).upload(path, file, {
    cacheControl: CDN_CACHE_STRATEGIES[strategy],
    upsert: true,
    contentType: file.type,
  })
}
```

### 4.3 저장 비용 최적화

```typescript
// lib/storage/cost-optimization.ts

/**
 * 비용 최적화 전략
 *
 * 1. 중복 파일 제거: 해시 기반 중복 탐지
 * 2. 압축: 업로드 전 클라이언트 사이드 압축
 * 3. 오래된 버전 정리
 */

// 1) 클라이언트 사이드 이미지 압축
export async function compressImage(
  file: File,
  options: { maxWidthOrHeight?: number; quality?: number } = {}
): Promise<File> {
  const { maxWidthOrHeight = 1920, quality = 0.85 } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      const canvas = document.createElement('canvas')

      // 비율 유지하며 리사이징
      let { width, height } = img
      if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
        if (width > height) {
          height = Math.round((height * maxWidthOrHeight) / width)
          width = maxWidthOrHeight
        } else {
          width = Math.round((width * maxWidthOrHeight) / height)
          height = maxWidthOrHeight
        }
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl)
          if (!blob) {
            reject(new Error('압축 실패'))
            return
          }
          const compressedFile = new File([blob], file.name, {
            type: 'image/webp',  // WebP로 변환
            lastModified: Date.now(),
          })
          console.log(
            `압축: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`
          )
          resolve(compressedFile)
        },
        'image/webp',
        quality
      )
    }

    img.onerror = reject
    img.src = objectUrl
  })
}

// 2) 파일 해시 기반 중복 탐지
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 3) 오래된 버전 정리 (사용자 폴더에서 최신 N개만 유지)
export async function pruneOldVersions(
  bucket: string,
  userFolder: string,
  keepCount = 3
): Promise<number> {
  const supabase = createClient()

  const { data: files } = await supabase.storage
    .from(bucket)
    .list(userFolder, {
      sortBy: { column: 'created_at', order: 'desc' },
    })

  if (!files || files.length <= keepCount) return 0

  const toDelete = files.slice(keepCount).map((f) => `${userFolder}/${f.name}`)

  const { error } = await supabase.storage.from(bucket).remove(toDelete)
  if (error) throw error

  return toDelete.length
}
```

### 4.4 백업 및 복원 전략

```typescript
// lib/storage/backup.ts
import { createServerClient } from '@/lib/supabase/server'

/**
 * 버킷 내 파일 목록 내보내기 (백업 매니페스트)
 * 실제 파일 복사는 S3 CLI 또는 관리자 도구 사용
 */
export async function exportBucketManifest(
  bucket: string,
  outputPath?: string
): Promise<Array<{ name: string; size: number; created_at: string; metadata: unknown }>> {
  const supabase = createServerClient()
  const manifest: Array<{ name: string; size: number; created_at: string; metadata: unknown }> = []

  let offset = 0
  const limit = 1000

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list('', { limit, offset })

    if (error) throw error
    if (!data || data.length === 0) break

    manifest.push(
      ...data.map((f) => ({
        name: f.name,
        size: f.metadata?.size ?? 0,
        created_at: f.created_at ?? '',
        metadata: f.metadata,
      }))
    )

    offset += limit
    if (data.length < limit) break
  }

  console.log(`버킷 "${bucket}" 매니페스트: ${manifest.length}개 파일`)
  return manifest
}

/**
 * 개별 파일 복원 (서명된 URL로 다운로드 → 재업로드)
 */
export async function restoreFile(
  sourceBucket: string,
  targetBucket: string,
  filePath: string
): Promise<void> {
  const supabase = createServerClient()

  // 1) 원본에서 다운로드
  const { data: blob, error: downloadError } = await supabase.storage
    .from(sourceBucket)
    .download(filePath)

  if (downloadError) throw downloadError

  // 2) 대상 버킷에 업로드
  const { error: uploadError } = await supabase.storage
    .from(targetBucket)
    .upload(filePath, blob, { upsert: true })

  if (uploadError) throw uploadError

  console.log(`파일 복원 완료: ${filePath}`)
}
```

---

## 5. S3 호환 API 활용

Supabase Storage는 S3 호환 API를 제공한다. AWS SDK v3를 사용해 직접 접근할 수 있다.

### 5.1 S3 클라이언트 설정

```typescript
// lib/storage/s3-client.ts
import { S3Client } from '@aws-sdk/client-s3'

const projectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID!

/**
 * Supabase S3 호환 클라이언트 초기화
 * - 엔드포인트: https://{project_id}.supabase.co/storage/v1/s3
 * - 인증: Supabase 서비스 롤 키 (서버 사이드 전용)
 */
export function createS3Client(): S3Client {
  return new S3Client({
    forcePathStyle: true,  // Supabase S3 호환을 위해 필수
    region: 'ap-northeast-2',  // 실제 지역 관계없음 (임의 지정)
    endpoint: `https://${projectId}.supabase.co/storage/v1/s3`,
    credentials: {
      accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,
    },
  })
}
```

> **S3 자격증명 발급**: Supabase 대시보드 → Storage → S3 접근 자격증명

```bash
# .env.local에 추가
SUPABASE_S3_ACCESS_KEY_ID=your_access_key_id
SUPABASE_S3_SECRET_ACCESS_KEY=your_secret_access_key
NEXT_PUBLIC_SUPABASE_PROJECT_ID=your_project_id
```

### 5.2 AWS SDK를 통한 파일 관리

```typescript
// lib/storage/s3-operations.ts
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createS3Client } from './s3-client'

const s3 = createS3Client()

// 파일 업로드
export async function s3Upload(
  bucket: string,
  key: string,
  body: Buffer | Blob | ReadableStream,
  contentType: string,
  metadata?: Record<string, string>
) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body as Buffer,
    ContentType: contentType,
    CacheControl: 'max-age=3600',
    Metadata: metadata,
  })

  return s3.send(command)
}

// 파일 다운로드
export async function s3Download(bucket: string, key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  const response = await s3.send(command)

  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// 파일 삭제
export async function s3Delete(bucket: string, key: string) {
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key })
  return s3.send(command)
}

// 파일 목록 조회 (페이지네이션)
export async function s3List(
  bucket: string,
  prefix = '',
  maxKeys = 1000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const results: Array<{ key: string; size: number; lastModified: Date }> = []
  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    })

    const response = await s3.send(command)

    response.Contents?.forEach((obj) => {
      if (obj.Key) {
        results.push({
          key: obj.Key,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ?? new Date(),
        })
      }
    })

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return results
}

// 파일 복사 (버킷 간 또는 폴더 간)
export async function s3Copy(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string
) {
  const command = new CopyObjectCommand({
    Bucket: destBucket,
    Key: destKey,
    CopySource: `${sourceBucket}/${sourceKey}`,
  })

  return s3.send(command)
}

// 파일 존재 여부 확인
export async function s3Exists(bucket: string, key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: key })
    await s3.send(command)
    return true
  } catch {
    return false
  }
}

// 프리사인드 URL 생성 (임시 접근)
export async function s3GetPresignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
}
```

### 5.3 S3 멀티파트 업로드 (대용량 파일)

```typescript
// lib/storage/s3-multipart.ts
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3'
import { createS3Client } from './s3-client'

const s3 = createS3Client()
const PART_SIZE = 10 * 1024 * 1024  // 10MB 파트 (최소 5MB)

/**
 * 대용량 파일 멀티파트 업로드
 * - 5MB 이상 파일 권장
 * - 진행률 콜백 지원
 */
export async function multipartUpload(
  bucket: string,
  key: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  let uploadId: string | undefined

  try {
    // 1) 멀티파트 업로드 시작
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: file.type,
      CacheControl: 'max-age=86400',
    })
    const createResponse = await s3.send(createCommand)
    uploadId = createResponse.UploadId!

    // 2) 파트 분할 업로드
    const totalParts = Math.ceil(file.size / PART_SIZE)
    const uploadedParts: CompletedPart[] = []

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * PART_SIZE
      const end = Math.min(start + PART_SIZE, file.size)
      const partBlob = file.slice(start, end)
      const partBuffer = await partBlob.arrayBuffer()

      const uploadPartCommand = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: Buffer.from(partBuffer),
        ContentLength: partBlob.size,
      })

      const partResponse = await s3.send(uploadPartCommand)

      uploadedParts.push({
        PartNumber: partNumber,
        ETag: partResponse.ETag,
      })

      onProgress?.((partNumber / totalParts) * 100)
    }

    // 3) 멀티파트 업로드 완료
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: uploadedParts },
    })

    await s3.send(completeCommand)
    console.log(`멀티파트 업로드 완료: ${key}`)
  } catch (error) {
    // 오류 시 중단된 업로드 정리
    if (uploadId) {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
          })
        )
      } catch (abortError) {
        console.error('업로드 중단 실패:', abortError)
      }
    }
    throw error
  }
}
```

---

## 요약 및 운영 체크리스트

### 버킷 설정 체크리스트

- [ ] `file_size_limit` 설정 (버킷별 최대 파일 크기)
- [ ] `allowed_mime_types` 설정 (허용 파일 타입 화이트리스트)
- [ ] RLS 정책 활성화 (모든 버킷)
- [ ] 공개/비공개 버킷 목적에 맞게 구분

### 업로드 구현 체크리스트

- [ ] 클라이언트 사이드 유효성 검사 (타입, 크기)
- [ ] 서버 사이드 유효성 검사 (Zod 스키마)
- [ ] 파일 해더 검증 (실제 MIME 타입 확인)
- [ ] 사용자별 폴더 격리 (`userId/filename` 구조)
- [ ] 고유 파일명 생성 (타임스탬프 + 랜덤)

### 성능 체크리스트

- [ ] 이미지: WebP 변환 활용 (자동 또는 명시적)
- [ ] CDN 캐시 전략 설정 (cacheControl)
- [ ] Smart CDN 활성화 (Pro 플랜 이상)
- [ ] 대용량 파일: TUS 재개 가능 업로드 사용

### 운영 체크리스트

- [ ] 고아 파일 정기 정리 (cron job)
- [ ] 버킷 용량 모니터링
- [ ] 만료 공유 링크 적절한 유효기간 설정
- [ ] 삭제는 항상 Storage API 사용 (SQL 직접 삭제 금지)

---

*참고 문서*:
- [Supabase Storage 공식 문서](https://supabase.com/docs/guides/storage)
- [재개 가능 업로드 (TUS)](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [이미지 변환](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [CDN 기초](https://supabase.com/docs/guides/storage/cdn/fundamentals)
- [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
- [접근 제어](https://supabase.com/docs/guides/storage/access-control)
- [파일 삭제](https://supabase.com/docs/reference/javascript/storage-from-remove)
