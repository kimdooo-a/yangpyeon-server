/**
 * =========================================================================
 * Almanac × yangpyeon-server — 콘텐츠 어그리게이터 시드 스크립트
 * -------------------------------------------------------------------------
 * 실행:
 *   pnpm tsx prisma/seed-aggregator.ts
 *   또는 package.json scripts:
 *     "db:seed:aggregator": "tsx prisma/seed-aggregator.ts"
 *
 * 동작:
 *   1) ContentCategory 시드 (6 트랙 × 6~7 카테고리 ≈ 41개)
 *   2) ContentSource 시드 (RSS/HTML/API/FIRECRAWL = 60+ 개)
 *   - 둘 다 upsert: slug 기준 멱등성 보장 → 반복 실행 안전.
 *
 * 정책:
 *   - 카테고리/소스의 한국어 이름은 도메인 어휘로 통일.
 *   - parserConfig 는 RSS는 빈 객체, HTML은 cheerio 셀렉터를 채워둠.
 *   - country 필드는 "ko"/"en"/"ja" 등 ISO 639-1 표기.
 *
 * ⚠️ output path: prisma/schema.prisma 의
 *      generator client { output = "../src/generated/prisma" }
 *    설정에 따라 import 경로는 "@/generated/prisma" 가 됨.
 * =========================================================================
 */

// yangpyeon의 PrismaClient는 PrismaPg 어댑터(@prisma/adapter-pg)를 요구한다.
// 직접 instantiate 하지 않고 기존 lazy proxy를 재사용한다.
import { prisma } from "@/lib/prisma";

// -------------------------------------------------------------------------
// 1) Categories master data
// -------------------------------------------------------------------------

type CategorySeed = {
  track: string;
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  icon: string; // Lucide 아이콘 이름
  sortOrder: number;
};

const CATEGORIES: CategorySeed[] = [
  // ──── hustle (사이드 프로젝트, 부수입, 인디 메이커) ────
  { track: "hustle", slug: "side-project",     name: "사이드 프로젝트",   nameEn: "Side Project",        description: "주말·퇴근 후 만드는 작은 프로젝트", icon: "Rocket",       sortOrder: 1 },
  { track: "hustle", slug: "indie-hacker",     name: "인디 해커",         nameEn: "Indie Hacker",        description: "1인·소규모 자영 빌더 이야기",       icon: "User",         sortOrder: 2 },
  { track: "hustle", slug: "monetization",     name: "수익화",            nameEn: "Monetization",        description: "프로덕트로 돈 버는 전략",           icon: "DollarSign",   sortOrder: 3 },
  { track: "hustle", slug: "freelance",        name: "프리랜서",          nameEn: "Freelance",           description: "프리랜서 단가·수주·운영",           icon: "Briefcase",    sortOrder: 4 },
  { track: "hustle", slug: "creator-economy",  name: "크리에이터 이코노미", nameEn: "Creator Economy",    description: "콘텐츠 크리에이터 비즈니스",        icon: "Megaphone",    sortOrder: 5 },
  { track: "hustle", slug: "saas-bootstrap",   name: "SaaS 부트스트랩",   nameEn: "SaaS Bootstrap",      description: "VC 없이 키우는 SaaS",               icon: "Layers",       sortOrder: 6 },

  // ──── work (업무 자동화, 생산성, 팀 운영) ────
  { track: "work", slug: "ai-workflow",       name: "AI 워크플로우",     nameEn: "AI Workflow",         description: "업무에 AI를 끼우는 패턴",           icon: "Workflow",     sortOrder: 1 },
  { track: "work", slug: "productivity",      name: "생산성",            nameEn: "Productivity",        description: "개인·팀 생산성 도구와 습관",        icon: "CheckCircle2", sortOrder: 2 },
  { track: "work", slug: "no-code",           name: "노코드",            nameEn: "No-Code",             description: "코드 없이 만드는 자동화",           icon: "MousePointer", sortOrder: 3 },
  { track: "work", slug: "team-ops",          name: "팀 운영",           nameEn: "Team Ops",            description: "리더십·1on1·OKR·문화",              icon: "Users",        sortOrder: 4 },
  { track: "work", slug: "remote-work",       name: "원격 근무",         nameEn: "Remote Work",         description: "분산 팀·비동기 협업",               icon: "Globe2",       sortOrder: 5 },
  { track: "work", slug: "knowledge-mgmt",    name: "지식 관리",         nameEn: "Knowledge Mgmt",      description: "PKM·노트·내부 위키",                icon: "BookOpen",     sortOrder: 6 },

  // ──── build (LLM, 인프라, 오픈소스, 한국 테크) ────
  { track: "build", slug: "open-source-llm",  name: "오픈소스 LLM",       nameEn: "Open Source LLM",     description: "Llama·Mistral·Qwen 등 OSS 모델",    icon: "Cpu",          sortOrder: 1 },
  { track: "build", slug: "ai-companies",     name: "AI 기업",           nameEn: "AI Companies",        description: "OpenAI·Anthropic·Google 등 동향",   icon: "Building2",    sortOrder: 2 },
  { track: "build", slug: "infrastructure",   name: "인프라",            nameEn: "Infrastructure",      description: "GPU·클러스터·MLOps",                icon: "Server",       sortOrder: 3 },
  { track: "build", slug: "rag-agents",       name: "RAG·에이전트",      nameEn: "RAG & Agents",        description: "RAG 파이프라인과 자율 에이전트",     icon: "Network",      sortOrder: 4 },
  { track: "build", slug: "devtools",         name: "개발자 도구",       nameEn: "Developer Tools",     description: "Cursor·Linear·Vercel 등 툴",        icon: "Wrench",       sortOrder: 5 },
  { track: "build", slug: "korean-tech",      name: "한국 테크",         nameEn: "Korean Tech",         description: "네이버·카카오·라인·우아한 등",      icon: "Flag",         sortOrder: 6 },
  { track: "build", slug: "research-paper",   name: "논문",              nameEn: "Research Papers",     description: "arXiv 등 최신 ML 논문",             icon: "FileText",     sortOrder: 7 },

  // ──── invest (펀딩, 시장, 매크로) ────
  { track: "invest", slug: "funding",         name: "펀딩",              nameEn: "Funding",             description: "Seed·Series A·B·C 라운드",          icon: "Banknote",     sortOrder: 1 },
  { track: "invest", slug: "ipo-acquisition", name: "IPO·인수",          nameEn: "IPO & M&A",           description: "상장과 기업 인수 합병",             icon: "TrendingUp",   sortOrder: 2 },
  { track: "invest", slug: "market-analysis", name: "시장 분석",         nameEn: "Market Analysis",     description: "산업·섹터 리서치",                  icon: "BarChart3",    sortOrder: 3 },
  { track: "invest", slug: "vc-thesis",       name: "VC 인사이트",       nameEn: "VC Thesis",           description: "벤처캐피털 관점·투자 논리",         icon: "Target",       sortOrder: 4 },
  { track: "invest", slug: "public-markets",  name: "공개 시장",         nameEn: "Public Markets",      description: "주식·환율·채권",                    icon: "LineChart",    sortOrder: 5 },
  { track: "invest", slug: "macro-economy",   name: "거시 경제",         nameEn: "Macro Economy",       description: "금리·인플레이션·정책",              icon: "Globe",        sortOrder: 6 },

  // ──── learn (튜토리얼, 딥다이브, 커리어) ────
  { track: "learn", slug: "tutorial",         name: "튜토리얼",          nameEn: "Tutorial",            description: "실습 가능한 가이드",                icon: "GraduationCap", sortOrder: 1 },
  { track: "learn", slug: "deep-dive",        name: "딥 다이브",         nameEn: "Deep Dive",           description: "한 주제를 깊게 파는 글",            icon: "Microscope",   sortOrder: 2 },
  { track: "learn", slug: "paper-summary",    name: "논문 요약",         nameEn: "Paper Summary",       description: "논문 한 편 요약",                   icon: "Notebook",     sortOrder: 3 },
  { track: "learn", slug: "data-science",     name: "데이터 사이언스",   nameEn: "Data Science",        description: "분석·시각화·통계",                  icon: "PieChart",     sortOrder: 4 },
  { track: "learn", slug: "system-design",    name: "시스템 설계",       nameEn: "System Design",       description: "아키텍처·확장성",                   icon: "Boxes",        sortOrder: 5 },
  { track: "learn", slug: "career-growth",    name: "커리어 성장",       nameEn: "Career Growth",       description: "이직·연봉 협상·성장",               icon: "Sprout",       sortOrder: 6 },

  // ──── community (구인, 커뮤니티, 컨퍼런스) ────
  { track: "community", slug: "hiring",                name: "채용",         nameEn: "Hiring",              description: "AI·테크 기업 채용 공고",            icon: "UserPlus",     sortOrder: 1 },
  { track: "community", slug: "conference",            name: "컨퍼런스",     nameEn: "Conference",          description: "기술 컨퍼런스·밋업",                icon: "Mic",          sortOrder: 2 },
  { track: "community", slug: "hackathon",             name: "해커톤",       nameEn: "Hackathon",           description: "해커톤 일정과 결과",                icon: "Trophy",       sortOrder: 3 },
  { track: "community", slug: "discussion",            name: "토론",         nameEn: "Discussion",          description: "이슈·논쟁·인터뷰",                  icon: "MessageCircle", sortOrder: 4 },
  { track: "community", slug: "korean-community",      name: "한국 커뮤니티", nameEn: "Korean Community",    description: "긱뉴스·요즘IT·모각코 등",           icon: "Coffee",       sortOrder: 5 },
  { track: "community", slug: "layoff-restructure",    name: "구조조정",     nameEn: "Layoff & Restructure", description: "정리해고·구조조정 동향",            icon: "AlertTriangle", sortOrder: 6 },
];

// -------------------------------------------------------------------------
// 2) Sources master data
// -------------------------------------------------------------------------

type SourceSeed = {
  slug: string;
  name: string;
  url: string;
  kind: "RSS" | "HTML" | "API" | "FIRECRAWL";
  defaultTrack: string | null;
  defaultCategorySlug: string | null; // FK 결정에 사용 — 시드 단계에서 카테고리 id 룩업
  country: "ko" | "en" | "ja" | null;
  parserConfig: Record<string, unknown>;
  notes?: string;
};

const SOURCES: SourceSeed[] = [
  // =========================================================================
  // RSS — 영어권 (40개+)
  // =========================================================================

  // -- AI 모델 회사 공식 블로그
  { slug: "openai-blog",        name: "OpenAI Blog",            url: "https://openai.com/news/rss.xml",                              kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "anthropic-news",     name: "Anthropic News",         url: "https://www.anthropic.com/news/rss.xml",                       kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "google-ai-blog",     name: "Google AI Blog",         url: "https://blog.google/technology/ai/rss/",                       kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "huggingface-blog",   name: "HuggingFace Blog",       url: "https://huggingface.co/blog/feed.xml",                         kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "open-source-llm",  country: "en", parserConfig: {} },
  { slug: "meta-ai-blog",       name: "Meta AI Blog",           url: "https://ai.meta.com/blog/rss/",                                kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "microsoft-ai-blog",  name: "Microsoft AI Blog",      url: "https://blogs.microsoft.com/ai/feed/",                         kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "cohere-blog",        name: "Cohere Blog",            url: "https://cohere.com/blog/rss.xml",                              kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "mistral-news",       name: "Mistral News",           url: "https://mistral.ai/news/feed.xml",                             kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "open-source-llm",  country: "en", parserConfig: {}, notes: "URL은 공식 RSS 경로 변동 가능" },

  // -- 개발자 도구 공식 블로그
  { slug: "cursor-changelog",   name: "Cursor Changelog",       url: "https://changelog.cursor.com/rss",                             kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "devtools",         country: "en", parserConfig: {} },
  { slug: "cursor-blog",        name: "Cursor Blog",            url: "https://www.cursor.com/blog/rss",                              kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "devtools",         country: "en", parserConfig: {} },
  { slug: "vercel-blog",        name: "Vercel Blog",            url: "https://vercel.com/atom",                                      kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "devtools",         country: "en", parserConfig: {} },
  { slug: "notion-blog",        name: "Notion Blog",            url: "https://www.notion.so/blog/rss",                               kind: "RSS", defaultTrack: "work",   defaultCategorySlug: "productivity",     country: "en", parserConfig: {} },
  { slug: "github-blog",        name: "GitHub Blog",            url: "https://github.blog/feed/",                                    kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "devtools",         country: "en", parserConfig: {} },
  { slug: "stripe-blog",        name: "Stripe Blog",            url: "https://stripe.com/blog/feed.rss",                             kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "devtools",         country: "en", parserConfig: {} },
  { slug: "linear-blog",        name: "Linear Blog",            url: "https://linear.app/rss.xml",                                   kind: "RSS", defaultTrack: "work",   defaultCategorySlug: "team-ops",         country: "en", parserConfig: {} },
  { slug: "replit-blog",        name: "Replit Blog",            url: "https://blog.replit.com/rss.xml",                              kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "devtools",         country: "en", parserConfig: {} },
  { slug: "lovable-blog",       name: "Lovable Blog",           url: "https://lovable.dev/blog/rss.xml",                             kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "devtools",         country: "en", parserConfig: {} },

  // -- VC / 투자
  { slug: "a16z-feed",          name: "Andreessen Horowitz",    url: "https://a16z.com/feed/",                                       kind: "RSS", defaultTrack: "invest", defaultCategorySlug: "vc-thesis",        country: "en", parserConfig: {} },
  { slug: "sequoia-blog",       name: "Sequoia Capital",        url: "https://www.sequoiacap.com/feed/",                             kind: "RSS", defaultTrack: "invest", defaultCategorySlug: "vc-thesis",        country: "en", parserConfig: {} },
  { slug: "yc-blog",            name: "Y Combinator Blog",      url: "https://www.ycombinator.com/blog/rss",                         kind: "RSS", defaultTrack: "invest", defaultCategorySlug: "vc-thesis",        country: "en", parserConfig: {} },

  // -- 테크 미디어
  { slug: "techcrunch-ai",      name: "TechCrunch AI",          url: "https://techcrunch.com/category/artificial-intelligence/feed/", kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "verge-ai",           name: "The Verge AI",           url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", kind: "RSS", defaultTrack: "build", defaultCategorySlug: "ai-companies", country: "en", parserConfig: {} },
  { slug: "wired-ai",           name: "Wired AI",               url: "https://www.wired.com/feed/tag/ai/latest/rss",                 kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "arstechnica-ai",     name: "Ars Technica AI",        url: "https://feeds.arstechnica.com/arstechnica/technology-lab",     kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "ai-companies",     country: "en", parserConfig: {} },
  { slug: "mit-tech-review-ai", name: "MIT Tech Review AI",     url: "https://www.technologyreview.com/feed/",                       kind: "RSS", defaultTrack: "learn",  defaultCategorySlug: "deep-dive",        country: "en", parserConfig: {} },
  { slug: "wsj-tech",           name: "WSJ Tech",               url: "https://feeds.a.dj.com/rss/RSSWSJD.xml",                       kind: "RSS", defaultTrack: "invest", defaultCategorySlug: "market-analysis",  country: "en", parserConfig: {} },
  { slug: "nyt-tech",           name: "NYT Tech",               url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",  kind: "RSS", defaultTrack: "invest", defaultCategorySlug: "market-analysis",  country: "en", parserConfig: {} },
  { slug: "bloomberg-tech",     name: "Bloomberg Tech",         url: "https://feeds.bloomberg.com/technology/news.rss",              kind: "RSS", defaultTrack: "invest", defaultCategorySlug: "market-analysis",  country: "en", parserConfig: {} },

  // -- 인디 해커 / 부수입
  { slug: "indie-hackers",      name: "Indie Hackers",          url: "https://www.indiehackers.com/feed.xml",                        kind: "RSS", defaultTrack: "hustle", defaultCategorySlug: "indie-hacker",     country: "en", parserConfig: {} },
  { slug: "product-hunt-rss",   name: "Product Hunt RSS",       url: "https://www.producthunt.com/feed",                             kind: "RSS", defaultTrack: "hustle", defaultCategorySlug: "side-project",     country: "en", parserConfig: {} },

  // -- 뉴스레터 / 큐레이션
  { slug: "the-gradient",       name: "The Gradient",           url: "https://thegradient.pub/rss/",                                 kind: "RSS", defaultTrack: "learn",  defaultCategorySlug: "deep-dive",        country: "en", parserConfig: {} },
  { slug: "import-ai",          name: "Import AI",              url: "https://importai.substack.com/feed",                           kind: "RSS", defaultTrack: "learn",  defaultCategorySlug: "paper-summary",    country: "en", parserConfig: {} },
  { slug: "ai-snake-oil",       name: "AI Snake Oil",           url: "https://www.aisnakeoil.com/feed",                              kind: "RSS", defaultTrack: "community", defaultCategorySlug: "discussion",   country: "en", parserConfig: {} },
  { slug: "latent-space",       name: "Latent Space",           url: "https://www.latent.space/feed",                                kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "rag-agents",       country: "en", parserConfig: {} },

  // -- 팟캐스트 RSS
  { slug: "lex-fridman-rss",    name: "Lex Fridman Podcast",    url: "https://lexfridman.com/feed/podcast/",                         kind: "RSS", defaultTrack: "community", defaultCategorySlug: "discussion",   country: "en", parserConfig: {} },
  { slug: "dwarkesh-rss",       name: "Dwarkesh Patel",         url: "https://api.substack.com/feed/podcast/68003.rss",              kind: "RSS", defaultTrack: "community", defaultCategorySlug: "discussion",   country: "en", parserConfig: {}, notes: "Substack 팟캐스트 ID는 변동 가능" },

  // -- 논문 / 코드
  { slug: "arxiv-cs-lg",        name: "ArXiv cs.LG",            url: "http://arxiv.org/rss/cs.LG",                                    kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "research-paper",   country: "en", parserConfig: {} },
  { slug: "arxiv-cs-cl",        name: "ArXiv cs.CL",            url: "http://arxiv.org/rss/cs.CL",                                    kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "research-paper",   country: "en", parserConfig: {} },
  { slug: "papers-with-code",   name: "Papers with Code",       url: "https://paperswithcode.com/feed.xml",                          kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "research-paper",   country: "en", parserConfig: {} },
  { slug: "github-trending",    name: "GitHub Trending RSS",    url: "https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml", kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "open-source-llm",  country: "en", parserConfig: {} },

  // =========================================================================
  // HTML — 한국어 (cheerio 기반, 6+개)
  // =========================================================================

  { slug: "geeknews-rss",       name: "GeekNews",               url: "https://news.hada.io/rss/news",                                kind: "RSS", defaultTrack: "community", defaultCategorySlug: "korean-community", country: "ko", parserConfig: {}, notes: "공식 RSS 제공 — HTML 스크랩 불필요" },

  { slug: "yozm-it",            name: "요즘IT",                  url: "https://yozm.wishket.com/magazine/list/",                      kind: "HTML", defaultTrack: "learn", defaultCategorySlug: "tutorial",        country: "ko", parserConfig: {
      list_selector: "article.list-item",
      title_selector: ".title, h2 a",
      link_selector: "a.title, h2 a",
      summary_selector: ".summary, .description",
      image_selector: "img.thumbnail",
      base_url: "https://yozm.wishket.com",
      pagination: { next_selector: "a.next", max_pages: 3 },
  }},

  { slug: "naver-d2",           name: "네이버 D2",                url: "https://d2.naver.com/d2.atom",                                 kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "korean-tech",       country: "ko", parserConfig: {} },
  { slug: "kakao-tech",         name: "카카오 기술 블로그",       url: "https://tech.kakao.com/blog/feed/",                            kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "korean-tech",       country: "ko", parserConfig: {} },
  { slug: "toss-tech",          name: "토스 기술 블로그",         url: "https://toss.tech/rss.xml",                                    kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "korean-tech",       country: "ko", parserConfig: {} },
  { slug: "woowahan-tech",      name: "우아한형제들 기술블로그",   url: "https://techblog.woowahan.com/feed/",                          kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "korean-tech",       country: "ko", parserConfig: {} },
  { slug: "line-engineering",   name: "LINE Engineering",        url: "https://engineering.linecorp.com/ko/blog/feed.xml",            kind: "RSS", defaultTrack: "build",  defaultCategorySlug: "korean-tech",       country: "ko", parserConfig: {} },

  { slug: "brunch-it-popular",  name: "브런치 인기 IT",          url: "https://brunch.co.kr/keyword/IT",                              kind: "HTML", defaultTrack: "learn", defaultCategorySlug: "deep-dive",        country: "ko", parserConfig: {
      list_selector: "li.wrap_keyword_list",
      title_selector: "strong.tit_subject",
      link_selector: "a.link_post",
      summary_selector: "p.wrap_subject",
      image_selector: "img",
      base_url: "https://brunch.co.kr",
  }},

  { slug: "velog-popular",      name: "벨로그 인기",             url: "https://velog.io/trending/week",                               kind: "HTML", defaultTrack: "build", defaultCategorySlug: "korean-tech",      country: "ko", parserConfig: {
      list_selector: "div[class*=PostCard]",
      title_selector: "h2",
      link_selector: "a",
      summary_selector: "p",
      image_selector: "img",
      base_url: "https://velog.io",
      notes_for_dev: "velog는 SSR 일부만 — Firecrawl 폴백 권장",
  }},

  // =========================================================================
  // API — JSON / GraphQL (5+개)
  // =========================================================================

  { slug: "hn-algolia-ai",      name: "HN Algolia (AI)",        url: "https://hn.algolia.com/api/v1/search?tags=story&query=AI&hitsPerPage=50", kind: "API", defaultTrack: "community", defaultCategorySlug: "discussion", country: "en", parserConfig: {
      response_path: "hits",
      title_field: "title",
      url_field: "url",
      published_field: "created_at",
      author_field: "author",
      points_field: "points",
  }},

  { slug: "hn-algolia-front",   name: "HN Front Page (Algolia)", url: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50", kind: "API", defaultTrack: "community", defaultCategorySlug: "discussion", country: "en", parserConfig: {
      response_path: "hits",
      title_field: "title",
      url_field: "url",
      published_field: "created_at",
      author_field: "author",
      points_field: "points",
  }, notes: "뉴스 헤드라인 — 매일 30분 주기 권장" },

  { slug: "reddit-mlearning",   name: "Reddit r/MachineLearning", url: "https://www.reddit.com/r/MachineLearning/.json",            kind: "API", defaultTrack: "build",  defaultCategorySlug: "research-paper",  country: "en", parserConfig: {
      headers: { "User-Agent": "almanac-aggregator/1.0" },
      response_path: "data.children",
      item_path: "data",
      title_field: "title",
      url_field: "url",
      published_field: "created_utc",
      author_field: "author",
  }},

  { slug: "reddit-localllama",  name: "Reddit r/LocalLLaMA",    url: "https://www.reddit.com/r/LocalLLaMA/.json",                    kind: "API", defaultTrack: "build",  defaultCategorySlug: "open-source-llm", country: "en", parserConfig: {
      headers: { "User-Agent": "almanac-aggregator/1.0" },
      response_path: "data.children",
      item_path: "data",
      title_field: "title",
      url_field: "url",
      published_field: "created_utc",
      author_field: "author",
  }},

  { slug: "reddit-startups",    name: "Reddit r/startups",      url: "https://www.reddit.com/r/startups/.json",                      kind: "API", defaultTrack: "hustle", defaultCategorySlug: "saas-bootstrap",  country: "en", parserConfig: {
      headers: { "User-Agent": "almanac-aggregator/1.0" },
      response_path: "data.children",
      item_path: "data",
      title_field: "title",
      url_field: "url",
      published_field: "created_utc",
      author_field: "author",
  }},

  { slug: "producthunt-graphql", name: "Product Hunt GraphQL",  url: "https://api.producthunt.com/v2/api/graphql",                   kind: "API", defaultTrack: "hustle", defaultCategorySlug: "side-project",    country: "en", parserConfig: {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer ${PRODUCT_HUNT_TOKEN}" },
      body_template: "{\"query\":\"{ posts(first: 30) { edges { node { name tagline url createdAt thumbnail { url } } } } }\"}",
      response_path: "data.posts.edges",
      item_path: "node",
      title_field: "name",
      summary_field: "tagline",
      url_field: "url",
      published_field: "createdAt",
  }},

  { slug: "arxiv-api-cscl",     name: "ArXiv API cs.CL",        url: "http://export.arxiv.org/api/query?search_query=cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=30", kind: "API", defaultTrack: "build", defaultCategorySlug: "research-paper", country: "en", parserConfig: {
      response_format: "atom",
  }},

  // =========================================================================
  // FIRECRAWL 폴백 — 메타만 등록 (실제 fetch는 부재 시 동적)
  // =========================================================================

  { slug: "fc-xai",             name: "xAI News (Firecrawl)",   url: "https://x.ai/news",                                            kind: "FIRECRAWL", defaultTrack: "build",   defaultCategorySlug: "ai-companies",  country: "en", parserConfig: { firecrawl: { mode: "scrape", formats: ["markdown"] } }, notes: "RSS 미제공 → Firecrawl 폴백" },
  { slug: "fc-perplexity",      name: "Perplexity Blog (Firecrawl)", url: "https://www.perplexity.ai/hub",                          kind: "FIRECRAWL", defaultTrack: "build",   defaultCategorySlug: "ai-companies",  country: "en", parserConfig: { firecrawl: { mode: "scrape", formats: ["markdown"] } } },
  { slug: "fc-dwarkesh-blog",   name: "Dwarkesh Blog (Firecrawl)",   url: "https://www.dwarkeshpatel.com/",                        kind: "FIRECRAWL", defaultTrack: "community", defaultCategorySlug: "discussion",  country: "en", parserConfig: { firecrawl: { mode: "scrape", formats: ["markdown"] } } },
  { slug: "fc-elad-blog",       name: "Elad Gil Blog (Firecrawl)",   url: "https://blog.eladgil.com/",                             kind: "FIRECRAWL", defaultTrack: "invest",   defaultCategorySlug: "vc-thesis",     country: "en", parserConfig: { firecrawl: { mode: "scrape", formats: ["markdown"] } } },
];

// -------------------------------------------------------------------------
// 3) Seeders
// -------------------------------------------------------------------------

async function seedCategories(): Promise<Map<string, string>> {
  // slug -> id 매핑 (소스 시드 단계에서 defaultCategoryId 룩업용)
  const slugToId = new Map<string, string>();

  for (const cat of CATEGORIES) {
    const row = await prisma.contentCategory.upsert({
      where: { slug: cat.slug },
      create: {
        track: cat.track,
        slug: cat.slug,
        name: cat.name,
        nameEn: cat.nameEn,
        description: cat.description,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
      },
      update: {
        track: cat.track,
        name: cat.name,
        nameEn: cat.nameEn,
        description: cat.description,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
      },
    });
    slugToId.set(cat.slug, row.id);
  }

  console.log(`[seed] categories upserted: ${CATEGORIES.length}`);
  return slugToId;
}

async function seedSources(slugToId: Map<string, string>): Promise<void> {
  for (const src of SOURCES) {
    const defaultCategoryId =
      src.defaultCategorySlug != null
        ? slugToId.get(src.defaultCategorySlug) ?? null
        : null;

    if (src.defaultCategorySlug && !defaultCategoryId) {
      console.warn(
        `[seed] WARN: source ${src.slug} references unknown category slug "${src.defaultCategorySlug}"`,
      );
    }

    await prisma.contentSource.upsert({
      where: { slug: src.slug },
      create: {
        slug: src.slug,
        name: src.name,
        url: src.url,
        kind: src.kind,
        defaultTrack: src.defaultTrack,
        defaultCategoryId,
        country: src.country,
        parserConfig: src.parserConfig as never,
        active: true,
        notes: src.notes,
      },
      update: {
        name: src.name,
        url: src.url,
        kind: src.kind,
        defaultTrack: src.defaultTrack,
        defaultCategoryId,
        country: src.country,
        parserConfig: src.parserConfig as never,
        notes: src.notes,
      },
    });
  }

  console.log(`[seed] sources upserted: ${SOURCES.length}`);
}

// -------------------------------------------------------------------------
// 4) Main
// -------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[seed] starting aggregator seed…");
  const slugToId = await seedCategories();
  await seedSources(slugToId);
  console.log("[seed] done.");
}

main()
  .catch((err: unknown) => {
    console.error("[seed] FAILED", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
