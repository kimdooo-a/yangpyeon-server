-- =============================================================================
-- Almanac (tenant) — content_sources 시드 (multi-tenant 적응본)
-- -----------------------------------------------------------------------------
-- 출처: docs/assets/yangpyeon-aggregator-spec/seeds/feed-sources.sql
-- 변경:
--   1. BEGIN + SET LOCAL app.tenant_id = '<almanac UUID>' (categories 시드와 동일).
--   2. ON CONFLICT ("slug") → ON CONFLICT ("tenant_id", "slug").
--   3. 모든 active TRUE → FALSE 강제. cron 이 자동 가동되어 외부 60개 사이트에
--      즉시 fetch 트래픽을 만드는 사고를 방지. 운영자가 점진 활성화한다.
--   4. 카테고리 FK 참조: spec seed 와 동일하게 'seedcat_*' id 사용 → 본 파일
--      실행 전 categories 시드가 먼저 적용되어야 함 (FK 의존).
--
-- 적용:
--   psql ... -f prisma/seeds/almanac-aggregator-categories.sql   (먼저)
--   psql ... -f prisma/seeds/almanac-aggregator-sources.sql      (다음)
-- =============================================================================

BEGIN;
SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000001';

-- =============================================================================
-- Almanac × yangpyeon-server — content_sources 시드 (raw SQL)
-- -----------------------------------------------------------------------------
-- 사용:
--   psql $DATABASE_URL -f categories.sql      -- 먼저 실행 (FK 의존)
--   psql $DATABASE_URL -f feed-sources.sql    -- 그 다음 실행
--
-- 권장 경로는 `tsx prisma/seed-aggregator.ts` (Prisma 시드)이며,
-- 이 SQL은 (a) DB shell 직접 실행, (b) staging/prod 동기화용 fallback.
--
-- 멱등성: ON CONFLICT (slug) DO NOTHING.
-- default_category_id 는 categories.sql 의 'seedcat_*' id 와 매핑되어 있음.
--   - 만약 카테고리를 cuid()로 생성한 경우(앱 시드 사용)에는 별도 UPDATE 필요.
-- parser_config 는 JSONB 리터럴.
-- =============================================================================

INSERT INTO "content_sources" (
  "slug", "name", "url", "kind",
  "default_track", "default_category_id", "country",
  "parser_config", "active", "notes"
) VALUES

-- =========================================================================
-- RSS — 영어권 (40개+)
-- =========================================================================

-- AI 모델 회사 공식 블로그
('openai-blog',        'OpenAI Blog',                'https://openai.com/news/rss.xml',                                              'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('anthropic-news',     'Anthropic News',             'https://www.anthropic.com/news/rss.xml',                                       'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('google-ai-blog',     'Google AI Blog',             'https://blog.google/technology/ai/rss/',                                       'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('huggingface-blog',   'HuggingFace Blog',           'https://huggingface.co/blog/feed.xml',                                         'RSS',  'build',     'seedcat_b_oss_llm',     'en', '{}'::jsonb, FALSE, NULL),
('meta-ai-blog',       'Meta AI Blog',               'https://ai.meta.com/blog/rss/',                                                'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('microsoft-ai-blog',  'Microsoft AI Blog',          'https://blogs.microsoft.com/ai/feed/',                                         'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('cohere-blog',        'Cohere Blog',                'https://cohere.com/blog/rss.xml',                                              'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('mistral-news',       'Mistral News',               'https://mistral.ai/news/feed.xml',                                             'RSS',  'build',     'seedcat_b_oss_llm',     'en', '{}'::jsonb, FALSE, 'URL은 공식 RSS 경로 변동 가능'),

-- 개발자 도구 공식 블로그
('cursor-changelog',   'Cursor Changelog',           'https://changelog.cursor.com/rss',                                             'RSS',  'build',     'seedcat_b_devtools',    'en', '{}'::jsonb, FALSE, NULL),
('cursor-blog',        'Cursor Blog',                'https://www.cursor.com/blog/rss',                                              'RSS',  'build',     'seedcat_b_devtools',    'en', '{}'::jsonb, FALSE, NULL),
('vercel-blog',        'Vercel Blog',                'https://vercel.com/atom',                                                      'RSS',  'build',     'seedcat_b_devtools',    'en', '{}'::jsonb, FALSE, NULL),
('notion-blog',        'Notion Blog',                'https://www.notion.so/blog/rss',                                               'RSS',  'work',      'seedcat_w_productivity','en', '{}'::jsonb, FALSE, NULL),
('github-blog',        'GitHub Blog',                'https://github.blog/feed/',                                                    'RSS',  'build',     'seedcat_b_devtools',    'en', '{}'::jsonb, FALSE, NULL),
('stripe-blog',        'Stripe Blog',                'https://stripe.com/blog/feed.rss',                                             'RSS',  'build',     'seedcat_b_devtools',    'en', '{}'::jsonb, FALSE, NULL),
('linear-blog',        'Linear Blog',                'https://linear.app/rss.xml',                                                   'RSS',  'work',      'seedcat_w_teamops',     'en', '{}'::jsonb, FALSE, NULL),
('replit-blog',        'Replit Blog',                'https://blog.replit.com/rss.xml',                                              'RSS',  'build',     'seedcat_b_devtools',    'en', '{}'::jsonb, FALSE, NULL),
('lovable-blog',       'Lovable Blog',               'https://lovable.dev/blog/rss.xml',                                             'RSS',  'build',     'seedcat_b_devtools',    'en', '{}'::jsonb, FALSE, NULL),

-- VC / 투자
('a16z-feed',          'Andreessen Horowitz',        'https://a16z.com/feed/',                                                       'RSS',  'invest',    'seedcat_i_vc',          'en', '{}'::jsonb, FALSE, NULL),
('sequoia-blog',       'Sequoia Capital',            'https://www.sequoiacap.com/feed/',                                             'RSS',  'invest',    'seedcat_i_vc',          'en', '{}'::jsonb, FALSE, NULL),
('yc-blog',            'Y Combinator Blog',          'https://www.ycombinator.com/blog/rss',                                         'RSS',  'invest',    'seedcat_i_vc',          'en', '{}'::jsonb, FALSE, NULL),

-- 테크 미디어
('techcrunch-ai',      'TechCrunch AI',              'https://techcrunch.com/category/artificial-intelligence/feed/',                'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('verge-ai',           'The Verge AI',               'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',            'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('wired-ai',           'Wired AI',                   'https://www.wired.com/feed/tag/ai/latest/rss',                                 'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('arstechnica-ai',     'Ars Technica AI',            'https://feeds.arstechnica.com/arstechnica/technology-lab',                     'RSS',  'build',     'seedcat_b_aicompanies', 'en', '{}'::jsonb, FALSE, NULL),
('mit-tech-review-ai', 'MIT Tech Review AI',         'https://www.technologyreview.com/feed/',                                       'RSS',  'learn',     'seedcat_l_deepdive',    'en', '{}'::jsonb, FALSE, NULL),
('wsj-tech',           'WSJ Tech',                   'https://feeds.a.dj.com/rss/RSSWSJD.xml',                                       'RSS',  'invest',    'seedcat_i_market',      'en', '{}'::jsonb, FALSE, NULL),
('nyt-tech',           'NYT Tech',                   'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',                  'RSS',  'invest',    'seedcat_i_market',      'en', '{}'::jsonb, FALSE, NULL),
('bloomberg-tech',     'Bloomberg Tech',             'https://feeds.bloomberg.com/technology/news.rss',                              'RSS',  'invest',    'seedcat_i_market',      'en', '{}'::jsonb, FALSE, NULL),

-- 인디 해커 / 부수입
('indie-hackers',      'Indie Hackers',              'https://www.indiehackers.com/feed.xml',                                        'RSS',  'hustle',    'seedcat_h_indiehacker', 'en', '{}'::jsonb, FALSE, NULL),
('product-hunt-rss',   'Product Hunt RSS',           'https://www.producthunt.com/feed',                                             'RSS',  'hustle',    'seedcat_h_sideproject', 'en', '{}'::jsonb, FALSE, NULL),

-- 뉴스레터 / 큐레이션
('the-gradient',       'The Gradient',               'https://thegradient.pub/rss/',                                                 'RSS',  'learn',     'seedcat_l_deepdive',    'en', '{}'::jsonb, FALSE, NULL),
('import-ai',          'Import AI',                  'https://importai.substack.com/feed',                                           'RSS',  'learn',     'seedcat_l_papersummary','en', '{}'::jsonb, FALSE, NULL),
('ai-snake-oil',       'AI Snake Oil',               'https://www.aisnakeoil.com/feed',                                              'RSS',  'community', 'seedcat_c_discussion',  'en', '{}'::jsonb, FALSE, NULL),
('latent-space',       'Latent Space',               'https://www.latent.space/feed',                                                'RSS',  'build',     'seedcat_b_ragagents',   'en', '{}'::jsonb, FALSE, NULL),

-- 팟캐스트 RSS
('lex-fridman-rss',    'Lex Fridman Podcast',        'https://lexfridman.com/feed/podcast/',                                         'RSS',  'community', 'seedcat_c_discussion',  'en', '{}'::jsonb, FALSE, NULL),
('dwarkesh-rss',       'Dwarkesh Patel',             'https://api.substack.com/feed/podcast/68003.rss',                              'RSS',  'community', 'seedcat_c_discussion',  'en', '{}'::jsonb, FALSE, 'Substack 팟캐스트 ID는 변동 가능'),

-- 논문 / 코드
('arxiv-cs-lg',        'ArXiv cs.LG',                'http://arxiv.org/rss/cs.LG',                                                   'RSS',  'build',     'seedcat_b_paper',       'en', '{}'::jsonb, FALSE, NULL),
('arxiv-cs-cl',        'ArXiv cs.CL',                'http://arxiv.org/rss/cs.CL',                                                   'RSS',  'build',     'seedcat_b_paper',       'en', '{}'::jsonb, FALSE, NULL),
('papers-with-code',   'Papers with Code',           'https://paperswithcode.com/feed.xml',                                          'RSS',  'build',     'seedcat_b_paper',       'en', '{}'::jsonb, FALSE, NULL),
('github-trending',    'GitHub Trending RSS',        'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml',                 'RSS',  'build',     'seedcat_b_oss_llm',     'en', '{}'::jsonb, FALSE, NULL),

-- =========================================================================
-- HTML — 한국어 (cheerio 기반)
-- =========================================================================

('geeknews-rss',       'GeekNews',                   'https://news.hada.io/rss/news',                                                'RSS',  'community', 'seedcat_c_korean',      'ko', '{}'::jsonb, FALSE, '공식 RSS 제공 — HTML 스크랩 불필요'),

('yozm-it',            '요즘IT',                      'https://yozm.wishket.com/magazine/list/',                                      'HTML', 'learn',     'seedcat_l_tutorial',    'ko',
  '{"list_selector":"article.list-item","title_selector":".title, h2 a","link_selector":"a.title, h2 a","summary_selector":".summary, .description","image_selector":"img.thumbnail","base_url":"https://yozm.wishket.com","pagination":{"next_selector":"a.next","max_pages":3}}'::jsonb,
  FALSE, NULL),

('naver-d2',           '네이버 D2',                    'https://d2.naver.com/d2.atom',                                                 'RSS',  'build',     'seedcat_b_koreantech',  'ko', '{}'::jsonb, FALSE, NULL),
('kakao-tech',         '카카오 기술 블로그',            'https://tech.kakao.com/blog/feed/',                                            'RSS',  'build',     'seedcat_b_koreantech',  'ko', '{}'::jsonb, FALSE, NULL),
('toss-tech',          '토스 기술 블로그',              'https://toss.tech/rss.xml',                                                    'RSS',  'build',     'seedcat_b_koreantech',  'ko', '{}'::jsonb, FALSE, NULL),
('woowahan-tech',      '우아한형제들 기술블로그',        'https://techblog.woowahan.com/feed/',                                          'RSS',  'build',     'seedcat_b_koreantech',  'ko', '{}'::jsonb, FALSE, NULL),
('line-engineering',   'LINE Engineering',           'https://engineering.linecorp.com/ko/blog/feed.xml',                            'RSS',  'build',     'seedcat_b_koreantech',  'ko', '{}'::jsonb, FALSE, NULL),

('brunch-it-popular',  '브런치 인기 IT',                'https://brunch.co.kr/keyword/IT',                                              'HTML', 'learn',     'seedcat_l_deepdive',    'ko',
  '{"list_selector":"li.wrap_keyword_list","title_selector":"strong.tit_subject","link_selector":"a.link_post","summary_selector":"p.wrap_subject","image_selector":"img","base_url":"https://brunch.co.kr"}'::jsonb,
  FALSE, NULL),

('velog-popular',      '벨로그 인기',                   'https://velog.io/trending/week',                                               'HTML', 'build',     'seedcat_b_koreantech',  'ko',
  '{"list_selector":"div[class*=PostCard]","title_selector":"h2","link_selector":"a","summary_selector":"p","image_selector":"img","base_url":"https://velog.io","notes_for_dev":"velog는 SSR 일부만 — Firecrawl 폴백 권장"}'::jsonb,
  FALSE, NULL),

-- =========================================================================
-- API — JSON / GraphQL
-- =========================================================================

('hn-algolia-ai',      'HN Algolia (AI)',            'https://hn.algolia.com/api/v1/search?tags=story&query=AI&hitsPerPage=50',     'API',  'community', 'seedcat_c_discussion',  'en',
  '{"response_path":"hits","title_field":"title","url_field":"url","published_field":"created_at","author_field":"author","points_field":"points"}'::jsonb,
  FALSE, NULL),

('hn-algolia-front',   'HN Front Page (Algolia)',    'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50',          'API',  'community', 'seedcat_c_discussion',  'en',
  '{"response_path":"hits","title_field":"title","url_field":"url","published_field":"created_at","author_field":"author","points_field":"points"}'::jsonb,
  FALSE, '뉴스 헤드라인 — 매일 30분 주기 권장'),

('reddit-mlearning',   'Reddit r/MachineLearning',   'https://www.reddit.com/r/MachineLearning/.json',                              'API',  'build',     'seedcat_b_paper',       'en',
  '{"headers":{"User-Agent":"almanac-aggregator/1.0"},"response_path":"data.children","item_path":"data","title_field":"title","url_field":"url","published_field":"created_utc","author_field":"author"}'::jsonb,
  FALSE, NULL),

('reddit-localllama',  'Reddit r/LocalLLaMA',        'https://www.reddit.com/r/LocalLLaMA/.json',                                   'API',  'build',     'seedcat_b_oss_llm',     'en',
  '{"headers":{"User-Agent":"almanac-aggregator/1.0"},"response_path":"data.children","item_path":"data","title_field":"title","url_field":"url","published_field":"created_utc","author_field":"author"}'::jsonb,
  FALSE, NULL),

('reddit-startups',    'Reddit r/startups',          'https://www.reddit.com/r/startups/.json',                                     'API',  'hustle',    'seedcat_h_saasboot',    'en',
  '{"headers":{"User-Agent":"almanac-aggregator/1.0"},"response_path":"data.children","item_path":"data","title_field":"title","url_field":"url","published_field":"created_utc","author_field":"author"}'::jsonb,
  FALSE, NULL),

('producthunt-graphql','Product Hunt GraphQL',       'https://api.producthunt.com/v2/api/graphql',                                  'API',  'hustle',    'seedcat_h_sideproject', 'en',
  '{"method":"POST","headers":{"Content-Type":"application/json","Authorization":"Bearer ${PRODUCT_HUNT_TOKEN}"},"body_template":"{\"query\":\"{ posts(first: 30) { edges { node { name tagline url createdAt thumbnail { url } } } } }\"}","response_path":"data.posts.edges","item_path":"node","title_field":"name","summary_field":"tagline","url_field":"url","published_field":"createdAt"}'::jsonb,
  FALSE, NULL),

('arxiv-api-cscl',     'ArXiv API cs.CL',            'http://export.arxiv.org/api/query?search_query=cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=30', 'API', 'build', 'seedcat_b_paper', 'en',
  '{"response_format":"atom"}'::jsonb,
  FALSE, NULL),

-- =========================================================================
-- FIRECRAWL 폴백
-- =========================================================================

('fc-xai',             'xAI News (Firecrawl)',       'https://x.ai/news',                                                            'FIRECRAWL', 'build',     'seedcat_b_aicompanies', 'en',
  '{"firecrawl":{"mode":"scrape","formats":["markdown"]}}'::jsonb,
  FALSE, 'RSS 미제공 → Firecrawl 폴백'),

('fc-perplexity',      'Perplexity Blog (Firecrawl)','https://www.perplexity.ai/hub',                                                'FIRECRAWL', 'build',     'seedcat_b_aicompanies', 'en',
  '{"firecrawl":{"mode":"scrape","formats":["markdown"]}}'::jsonb,
  FALSE, NULL),

('fc-dwarkesh-blog',   'Dwarkesh Blog (Firecrawl)',  'https://www.dwarkeshpatel.com/',                                               'FIRECRAWL', 'community', 'seedcat_c_discussion',  'en',
  '{"firecrawl":{"mode":"scrape","formats":["markdown"]}}'::jsonb,
  FALSE, NULL),

('fc-elad-blog',       'Elad Gil Blog (Firecrawl)',  'https://blog.eladgil.com/',                                                    'FIRECRAWL', 'invest',    'seedcat_i_vc',          'en',
  '{"firecrawl":{"mode":"scrape","formats":["markdown"]}}'::jsonb,
  FALSE, NULL)

ON CONFLICT ("tenant_id", "slug") DO NOTHING;

COMMIT;
