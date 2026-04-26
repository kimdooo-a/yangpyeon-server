-- =============================================================================
-- Almanac (tenant) — content_categories 시드 (multi-tenant 적응본)
-- -----------------------------------------------------------------------------
-- 출처: docs/assets/yangpyeon-aggregator-spec/seeds/categories.sql
-- 변경:
--   1. BEGIN + SET LOCAL app.tenant_id = '<almanac UUID>'
--      → schema 의 dbgenerated default ((current_setting('app.tenant_id'))::uuid)
--        가 발동하여 tenant_id 가 자동 채워짐. INSERT 본문은 변경 없음.
--   2. ON CONFLICT ("slug") → ON CONFLICT ("tenant_id", "slug")
--      → T1.6 composite unique 변경 반영.
--
-- 적용:
--   psql ... -f prisma/seeds/almanac-aggregator-categories.sql
-- 멱등성 유지 (재실행 시 신규 row 만 INSERT).
-- =============================================================================

BEGIN;
SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000001';

-- =============================================================================
-- Almanac × yangpyeon-server — content_categories 시드 (raw SQL)
-- -----------------------------------------------------------------------------
-- 사용:
--   psql $DATABASE_URL -f categories.sql
--
-- 권장 경로는 `tsx prisma/seed-aggregator.ts` (Prisma 시드)이며,
-- 이 SQL은 (a) DB shell 직접 실행이 필요할 때, (b) staging/prod 동기화용 fallback.
--
-- 멱등성: ON CONFLICT (slug) DO NOTHING — 슬러그 충돌 시 무시.
-- ID는 cuid 텍스트 시드를 직접 박아둠 (앱 레이어 cuid()와 충돌 안 하도록 prefix "seedcat_").
--   - 이렇게 하면 SQL 시드와 TS 시드를 동시 실행해도 동일 슬러그는 1행만 존재.
-- =============================================================================

INSERT INTO "content_categories" (
  "id", "track", "slug", "name", "name_en", "description", "icon", "sort_order"
) VALUES

-- ──── hustle ────
('seedcat_h_sideproject',     'hustle',    'side-project',         '사이드 프로젝트',     'Side Project',          '주말·퇴근 후 만드는 작은 프로젝트', 'Rocket',         1),
('seedcat_h_indiehacker',     'hustle',    'indie-hacker',         '인디 해커',           'Indie Hacker',          '1인·소규모 자영 빌더 이야기',       'User',           2),
('seedcat_h_monetization',    'hustle',    'monetization',         '수익화',              'Monetization',          '프로덕트로 돈 버는 전략',           'DollarSign',     3),
('seedcat_h_freelance',       'hustle',    'freelance',            '프리랜서',            'Freelance',             '프리랜서 단가·수주·운영',           'Briefcase',      4),
('seedcat_h_creator',         'hustle',    'creator-economy',      '크리에이터 이코노미', 'Creator Economy',       '콘텐츠 크리에이터 비즈니스',        'Megaphone',      5),
('seedcat_h_saasboot',        'hustle',    'saas-bootstrap',       'SaaS 부트스트랩',     'SaaS Bootstrap',        'VC 없이 키우는 SaaS',               'Layers',         6),

-- ──── work ────
('seedcat_w_aiworkflow',      'work',      'ai-workflow',          'AI 워크플로우',       'AI Workflow',           '업무에 AI를 끼우는 패턴',           'Workflow',       1),
('seedcat_w_productivity',    'work',      'productivity',         '생산성',              'Productivity',          '개인·팀 생산성 도구와 습관',        'CheckCircle2',   2),
('seedcat_w_nocode',          'work',      'no-code',              '노코드',              'No-Code',               '코드 없이 만드는 자동화',           'MousePointer',   3),
('seedcat_w_teamops',         'work',      'team-ops',             '팀 운영',             'Team Ops',              '리더십·1on1·OKR·문화',              'Users',          4),
('seedcat_w_remote',          'work',      'remote-work',          '원격 근무',           'Remote Work',           '분산 팀·비동기 협업',               'Globe2',         5),
('seedcat_w_knowledge',       'work',      'knowledge-mgmt',       '지식 관리',           'Knowledge Mgmt',        'PKM·노트·내부 위키',                'BookOpen',       6),

-- ──── build ────
('seedcat_b_oss_llm',         'build',     'open-source-llm',      '오픈소스 LLM',        'Open Source LLM',       'Llama·Mistral·Qwen 등 OSS 모델',    'Cpu',            1),
('seedcat_b_aicompanies',     'build',     'ai-companies',         'AI 기업',             'AI Companies',          'OpenAI·Anthropic·Google 등 동향',   'Building2',      2),
('seedcat_b_infra',           'build',     'infrastructure',       '인프라',              'Infrastructure',        'GPU·클러스터·MLOps',                'Server',         3),
('seedcat_b_ragagents',       'build',     'rag-agents',           'RAG·에이전트',        'RAG & Agents',          'RAG 파이프라인과 자율 에이전트',     'Network',        4),
('seedcat_b_devtools',        'build',     'devtools',             '개발자 도구',         'Developer Tools',       'Cursor·Linear·Vercel 등 툴',        'Wrench',         5),
('seedcat_b_koreantech',      'build',     'korean-tech',          '한국 테크',           'Korean Tech',           '네이버·카카오·라인·우아한 등',      'Flag',           6),
('seedcat_b_paper',           'build',     'research-paper',       '논문',                'Research Papers',       'arXiv 등 최신 ML 논문',             'FileText',       7),

-- ──── invest ────
('seedcat_i_funding',         'invest',    'funding',              '펀딩',                'Funding',               'Seed·Series A·B·C 라운드',          'Banknote',       1),
('seedcat_i_ipoma',           'invest',    'ipo-acquisition',      'IPO·인수',            'IPO & M&A',             '상장과 기업 인수 합병',             'TrendingUp',     2),
('seedcat_i_market',          'invest',    'market-analysis',      '시장 분석',           'Market Analysis',       '산업·섹터 리서치',                  'BarChart3',      3),
('seedcat_i_vc',              'invest',    'vc-thesis',            'VC 인사이트',         'VC Thesis',             '벤처캐피털 관점·투자 논리',         'Target',         4),
('seedcat_i_public',          'invest',    'public-markets',       '공개 시장',           'Public Markets',        '주식·환율·채권',                    'LineChart',      5),
('seedcat_i_macro',           'invest',    'macro-economy',        '거시 경제',           'Macro Economy',         '금리·인플레이션·정책',              'Globe',          6),

-- ──── learn ────
('seedcat_l_tutorial',        'learn',     'tutorial',             '튜토리얼',            'Tutorial',              '실습 가능한 가이드',                'GraduationCap',  1),
('seedcat_l_deepdive',        'learn',     'deep-dive',            '딥 다이브',           'Deep Dive',             '한 주제를 깊게 파는 글',            'Microscope',     2),
('seedcat_l_papersummary',    'learn',     'paper-summary',        '논문 요약',           'Paper Summary',         '논문 한 편 요약',                   'Notebook',       3),
('seedcat_l_datascience',     'learn',     'data-science',         '데이터 사이언스',     'Data Science',          '분석·시각화·통계',                  'PieChart',       4),
('seedcat_l_systemdesign',    'learn',     'system-design',        '시스템 설계',         'System Design',         '아키텍처·확장성',                   'Boxes',          5),
('seedcat_l_career',          'learn',     'career-growth',        '커리어 성장',         'Career Growth',         '이직·연봉 협상·성장',               'Sprout',         6),

-- ──── community ────
('seedcat_c_hiring',          'community', 'hiring',               '채용',                'Hiring',                'AI·테크 기업 채용 공고',            'UserPlus',       1),
('seedcat_c_conference',      'community', 'conference',           '컨퍼런스',            'Conference',            '기술 컨퍼런스·밋업',                'Mic',            2),
('seedcat_c_hackathon',       'community', 'hackathon',            '해커톤',              'Hackathon',             '해커톤 일정과 결과',                'Trophy',         3),
('seedcat_c_discussion',      'community', 'discussion',           '토론',                'Discussion',            '이슈·논쟁·인터뷰',                  'MessageCircle',  4),
('seedcat_c_korean',          'community', 'korean-community',     '한국 커뮤니티',       'Korean Community',      '긱뉴스·요즘IT·모각코 등',           'Coffee',         5),
('seedcat_c_layoff',          'community', 'layoff-restructure',   '구조조정',            'Layoff & Restructure',  '정리해고·구조조정 동향',            'AlertTriangle',  6)

ON CONFLICT ("tenant_id", "slug") DO NOTHING;

COMMIT;
