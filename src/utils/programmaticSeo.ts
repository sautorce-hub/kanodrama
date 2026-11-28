export interface ProgrammaticFaqItem {
  q: string;
  a: string;
}

export interface ProgrammaticLandingConfig {
  slug: string;
  label: string;
  basePath: 'genre' | 'tag' | 'category';
  canonicalPath: string;
  routeKindLabel: string;
  h1: string;
  title: string;
  description: string;
  keywords: string;
  intro: string;
  filter: {
    genre?: string;
    status?: 'all' | 'Ongoing' | 'Completed';
    sort?: 'popular' | 'rating' | 'newest';
    q?: string;
  };
  searchFallbackQuery: string;
  relatedSlugs: Array<{ path: string; label: string }>;
  faqs: ProgrammaticFaqItem[];
}

export interface CuratedLandingPreset {
  slug: string;
  label: string;
  h1: string;
  title: string;
  description: string;
  intro: string;
  genre?: string;
  status?: 'all' | 'Ongoing' | 'Completed';
  sort?: 'popular' | 'rating' | 'newest';
  q?: string;
  searchFallbackQuery: string;
  keywords: string[];
}

export const CURATED_PROGRAMMATIC_PAGES: CuratedLandingPreset[] = [
  {
    slug: 'ceo',
    label: 'CEO Dramas',
    h1: 'Best CEO Vertical Short Dramas Online in HD',
    title: 'Genre CEO Dramas — Watch Free Best Short Series HD | KanoDrama',
    description:
      'Explore the CEO genre catalog: trending boss romances, secret tycoons, and office power-couple vertical short dramas in HD on KanoDrama.',
    intro:
      'Discover binge-worthy CEO short dramas featuring dominant tech moguls, contract marriages, hidden identities, and unforgettable boardroom twists across 82+ global platforms.',
    genre: 'CEO',
    sort: 'popular',
    searchFallbackQuery: 'CEO',
    keywords: ['CEO short drama', 'watch free CEO series online', 'dominating boss romance', 'vertical CEO drama'],
  },
  {
    slug: 'romance',
    label: 'Romance',
    h1: 'Top Romance Vertical Short Dramas & Love Stories',
    title: 'Genre Romance — Watch Free Top Love Stories HD | KanoDrama',
    description:
      'Browse the Romance genre directory featuring second-chance love stories, sweet crushes, and flash marriage vertical dramas in HD on KanoDrama.',
    intro:
      'Explore heartwarming first loves, whirlwind flash marriages, and passionate reunion mini-series crafted in crisp 9:16 vertical cinema quality with English and Indonesian subtitles.',
    genre: 'Romance',
    sort: 'popular',
    searchFallbackQuery: 'Romance',
    keywords: ['romance short drama', 'watch free love stories online', 'Asian romance mini series', 'sweet vertical drama'],
  },
  {
    slug: 'billionaire',
    label: 'Billionaire',
    h1: 'Trending Billionaire Short Dramas & Secret Heir Series',
    title: 'Genre Billionaire — Watch Free Secret Heir Dramas HD | KanoDrama',
    description:
      'Explore the Billionaire genre hub for undercover tycoon sagas, luxury heiress twists, and secret empire short dramas in HD on KanoDrama.',
    intro:
      'Watch underdog heroes reveal secret multi-billion empires and humble brides marry into the world’s wealthiest families—updated daily with fast episode streaming.',
    genre: 'Billionaire',
    sort: 'popular',
    searchFallbackQuery: 'Billionaire',
    keywords: ['billionaire short drama', 'secret billionaire series', 'tycoon romance drama', 'wealthy heir mini series'],
  },
  {
    slug: 'revenge',
    label: 'Revenge',
    h1: 'Best Revenge & Rebirth Short Dramas Online',
    title: 'Genre Revenge & Rebirth — Watch Free Short Dramas HD | KanoDrama',
    description:
      'Stream the Revenge genre catalog packed with betrayal payback arcs, reborn heiresses, and high-stakes time-loop thrillers in HD on KanoDrama.',
    intro:
      'Experience gripping payback plots, reborn heiresses reclaiming their destiny, and poetic justice delivered minute-by-minute in sharp HD vertical episodes.',
    genre: 'Revenge',
    sort: 'popular',
    searchFallbackQuery: 'Revenge',
    keywords: ['revenge short drama', 'rebirth drama series', 'betrayal payback drama', 'watch free revenge mini series'],
  },
  {
    slug: 'fantasy',
    label: 'Fantasy',
    h1: 'Fantasy, Cultivation & Supernatural Short Dramas',
    title: 'Genre Fantasy & Cultivation — Watch Free Dramas HD | KanoDrama',
    description:
      'Dive into the Fantasy genre catalog with immortal cultivation, dragon gods, time travel, and supernatural romance mini-series on KanoDrama.',
    intro:
      'Step into worlds of immortal masters, hidden dragon kings, mythical systems, and supernatural romance with seamless multi-provider HD playback.',
    genre: 'Fantasy',
    sort: 'popular',
    searchFallbackQuery: 'Fantasy',
    keywords: ['fantasy short drama', 'immortal cultivation series', 'dragon king drama', 'supernatural vertical drama'],
  },
  {
    slug: 'historical',
    label: 'Historical',
    h1: 'Historical Palace & Royal Dynasty Short Dramas',
    title: 'Genre Historical Palace — Watch Free Costume Dramas | KanoDrama',
    description:
      'Explore the Historical genre collection of royal palace intrigue, emperor romance, and ancient dynasty costume short dramas in HD on KanoDrama.',
    intro:
      'Immerse yourself in royal court rivalries, noble generals, and forbidden palace love stories rendered with rich period costumes and dramatic cliffhangers.',
    genre: 'Historical',
    sort: 'popular',
    searchFallbackQuery: 'Historical',
    keywords: ['historical short drama', 'palace intrigue series', 'ancient costume mini drama', 'empress romance'],
  },
  {
    slug: 'action',
    label: 'Action',
    h1: 'Action, Martial Arts & Undercover Agent Short Dramas',
    title: 'Genre Action & Martial Arts — Watch Free Series HD | KanoDrama',
    description:
      'Watch the Action genre lineup of martial arts masters, special forces heroes, and undercover bodyguard vertical short dramas in HD on KanoDrama.',
    intro:
      'High-impact choreography, fearless lone warriors, and covert protectors defending those they love across explosive short-form episodes.',
    genre: 'Action',
    sort: 'popular',
    searchFallbackQuery: 'Action',
    keywords: ['action short drama', 'martial arts mini series', 'undercover hero drama', 'bodyguard short drama'],
  },
  {
    slug: 'dubbed',
    label: 'Dubbed Series',
    h1: 'English & Multi-Language Dubbed Short Dramas',
    title: 'Genre Dubbed Series — Watch Free Voiceover Dramas HD | KanoDrama',
    description:
      'Browse the Dubbed genre catalog featuring clear voiceovers and synchronized subtitles across top Asian short-drama platforms on KanoDrama.',
    intro:
      'Prefer hands-free bingeing? Browse full-season dubbed short dramas ready for instant vertical playback without missing a single line of dialogue.',
    genre: 'Dubbed',
    sort: 'popular',
    searchFallbackQuery: 'Dubbed',
    keywords: ['dubbed short drama', 'English dubbed mini series', 'voiceover vertical drama'],
  },
  {
    slug: 'ceo-romance',
    label: 'CEO Romance',
    h1: 'Best CEO Romance Short Dramas & Contract Marriage Hits',
    title: 'Genre CEO Romance — Watch Free Boss Love Series HD | KanoDrama',
    description:
      'Watch top-rated CEO Romance genre vertical short dramas, cold boss falls first tropes, and secret office love stories in HD on KanoDrama.',
    intro:
      'From icy billionaires falling head-over-heels to whirlwind contract marriages turned real love, stream the most popular CEO romance short dramas in one curated hub.',
    genre: 'CEO',
    q: 'Romance',
    sort: 'popular',
    searchFallbackQuery: 'CEO Romance',
    keywords: ['CEO romance drama', 'cold boss love story', 'contract marriage short drama'],
  },
  {
    slug: 'billionaire-revenge',
    label: 'Billionaire Revenge',
    h1: 'Billionaire Revenge & Hidden Identity Payback Dramas',
    title: 'Genre Billionaire Revenge — Watch Free Payback Hits | KanoDrama',
    description:
      'Watch explosive Billionaire Revenge genre short dramas where underestimated heirs expose traitors and reclaim their empire in HD on KanoDrama.',
    intro:
      'Nothing beats the moment a disguised tycoon drops the mask. Explore top billionaire revenge mini-series packed with high-society karma and fast-paced cliffhangers.',
    genre: 'Revenge',
    q: 'Billionaire',
    sort: 'popular',
    searchFallbackQuery: 'Billionaire Revenge',
    keywords: ['billionaire revenge drama', 'hidden identity tycoon', 'payback short series'],
  },
  {
    slug: 'hidden-identity-ceo',
    label: 'Hidden Identity CEO',
    h1: 'Hidden Identity CEO & Undercover Tycoon Short Dramas',
    title: 'Genre Hidden Identity CEO — Undercover Tycoon HD | KanoDrama',
    description:
      'Watch undercover billionaire and Hidden Identity CEO genre vertical short dramas in HD with instant episode streaming on KanoDrama.',
    intro:
      'Disguised as delivery drivers, interns, or humble spouses—discover fan-favorite hidden identity CEO dramas that deliver unforgettable reveal scenes.',
    genre: 'CEO',
    q: 'Secret',
    sort: 'popular',
    searchFallbackQuery: 'Secret CEO',
    keywords: ['hidden identity CEO', 'undercover billionaire drama', 'secret boss short series'],
  },
  {
    slug: 'flash-marriage-romance',
    label: 'Flash Marriage Romance',
    h1: 'Flash Marriage & Instant Husband Romance Short Dramas',
    title: 'Genre Flash Marriage — Instant Husband Romance HD | KanoDrama',
    description:
      'Watch trending Flash Marriage Romance genre short dramas where strangers wed overnight and discover unexpected love and wealth on KanoDrama.',
    intro:
      'Spontaneous courthouse weddings, secret billionaire grooms, and heartwarming slow-burn affection—binge complete flash marriage short dramas in HD.',
    genre: 'Romance',
    q: 'Marriage',
    sort: 'popular',
    searchFallbackQuery: 'Marriage',
    keywords: ['flash marriage drama', 'contract wife romance', 'secret husband short drama'],
  },
  {
    slug: 'completed-ceo-romance',
    label: 'Completed CEO Romance',
    h1: 'Completed CEO Romance Short Dramas (Full Seasons)',
    title: 'Genre Completed CEO Romance — Watch Full Seasons | KanoDrama',
    description:
      'Watch completed CEO Romance genre short dramas from Episode 1 to the finale with zero waiting on KanoDrama.',
    intro:
      'Binge finished CEO romance seasons start-to-finish without cliffhanger delays. Every series here includes full completed episode arcs ready to stream.',
    genre: 'CEO',
    status: 'Completed',
    sort: 'rating',
    searchFallbackQuery: 'CEO',
    keywords: ['completed CEO drama', 'finished romance mini series', 'binge full short drama'],
  },
  {
    slug: 'completed-short-dramas',
    label: 'Completed Full Series',
    h1: 'Completed Vertical Short Dramas — Watch Free Full Seasons',
    title: 'Genre Completed Series — Watch Free Full Seasons | KanoDrama',
    description:
      'Watch 100% completed vertical short drama series from premiere to finale in crisp HD across 82+ platforms on KanoDrama.',
    intro:
      'Skip the wait for weekly updates. Browse full-length completed short drama seasons sorted by top viewer ratings and ready for marathon streaming.',
    status: 'Completed',
    sort: 'popular',
    searchFallbackQuery: 'Complete',
    keywords: ['completed short dramas', 'full season vertical series', 'watch free finished mini drama'],
  },
  {
    slug: 'top-rated-romance',
    label: 'Top Rated Romance',
    h1: 'Highest Rated Romance Short Dramas of 2026',
    title: 'Genre Top Rated Romance — Best Love Mini-Series | KanoDrama',
    description:
      'Watch the highest-rated Romance genre short dramas loved by global viewers—handpicked emotional hits in crisp HD on KanoDrama.',
    intro:
      'Curated by viewer ratings and repeat replays, these top-rated romance short dramas deliver unforgettable chemistry, sharp pacing, and high production value.',
    genre: 'Romance',
    sort: 'rating',
    searchFallbackQuery: 'Love',
    keywords: ['top rated romance drama', 'best love mini series', 'highest rated short drama'],
  },
  {
    slug: 'rebirth-revenge',
    label: 'Rebirth & Time-Loop',
    h1: 'Rebirth & Second-Chance Revenge Short Dramas',
    title: 'Genre Rebirth & Time-Loop — Second-Chance Dramas | KanoDrama',
    description:
      'Watch reborn heiress and second-chance time-travel Rebirth genre short dramas where heroes rewrite fate in HD on KanoDrama.',
    intro:
      'Sent back in time after a tragic betrayal, watch fierce protagonists outsmart schemers, protect loved ones, and rise to the top.',
    genre: 'Revenge',
    q: 'Rebirth',
    sort: 'popular',
    searchFallbackQuery: 'Rebirth',
    keywords: ['rebirth short drama', 'reborn heiress revenge', 'time travel payback series'],
  },
  {
    slug: 'royal-palace-drama',
    label: 'Royal Palace & Empress',
    h1: 'Royal Palace, Empress & Court Intrigue Short Dramas',
    title: 'Genre Royal Palace & Empress — Watch Free Dramas HD | KanoDrama',
    description:
      'Watch imperial palace intrigue, strong empress comebacks, and royal romance vertical short dramas in HD on KanoDrama.',
    intro:
      'Enter opulent imperial courts filled with strategic alliances, forbidden royal love, and dramatic throne room reversals.',
    genre: 'Historical',
    q: 'Royal',
    sort: 'popular',
    searchFallbackQuery: 'Queen',
    keywords: ['royal palace drama', 'empress short drama', 'imperial court mini series'],
  },
  {
    slug: 'best-vertical-short-dramas',
    label: 'Best Vertical Dramas',
    h1: 'Best Vertical Short Dramas & Viral Mini-Series Worldwide',
    title: 'Genre Best Vertical Dramas — Viral Short Series HD | KanoDrama',
    description:
      'Watch the most-watched vertical 9:16 short dramas trending globally across DramaBox V2, NetShort, ReelShort V2, and 79+ platforms on KanoDrama.',
    intro:
      'Your global gateway to the top vertical micro-dramas taking over mobile screens—ranked by real-time views, completion rates, and audience ratings.',
    sort: 'popular',
    searchFallbackQuery: 'Love',
    keywords: ['best vertical dramas', 'viral short dramas', 'micro drama streaming', 'top mini series'],
  },
];

const CURATED_MAP = new Map<string, CuratedLandingPreset>(
  CURATED_PROGRAMMATIC_PAGES.map((p) => [p.slug, p])
);

const KNOWN_GENRES = [
  'CEO',
  'Romance',
  'Billionaire',
  'Revenge',
  'Fantasy',
  'Historical',
  'Action',
  'Dubbed',
  'Comedy',
  'Thriller',
  'Mystery',
  'Family',
  'Campus',
  'Medical',
];

function toTitleCase(input: string): string {
  return input
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function cleanSlugSegment(raw: string): string {
  return decodeURIComponent(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clampMeta(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
}

function buildDynamicFaqs(
  topicTitle: string,
  basePath: 'genre' | 'tag' | 'category',
  lang: string = 'en'
): ProgrammaticFaqItem[] {
  const isId = lang === 'id';
  if (basePath === 'tag') {
    return isId
      ? [
          {
            q: `Apa keunggulan koleksi topik / tag #${topicTitle} di KanoDrama?`,
            a: `Halaman tag #${topicTitle} menghimpun serial pendek berfokus tema dan trope spesifik dari 82+ platform resmi, diurutkan dari rilisan terbaru hingga rating tertinggi.`,
          },
          {
            q: `Apakah daftar drama pada topik #${topicTitle} tersedia dengan Sub Indo?`,
            a: `Ya. Seluruh serial pada topik #${topicTitle} mendukung subtitle Bahasa Indonesia (Sub Indo) serta pilihan subtitle multibahasa langsung di pemutar HD KanoDrama.`,
          },
          {
            q: `Apa perbedaan halaman Topik / Tag #${topicTitle} dengan halaman Genre?`,
            a: `Halaman Genre mengelompokkan katalog utama berdasarkan kategori besar, sedangkan halaman Topik / Tag #${topicTitle} menyaring rilisan terbaru dan topik spesifik antar-genre.`,
          },
        ]
      : [
          {
            q: `What makes the #${topicTitle} topic & tag collection unique on KanoDrama?`,
            a: `The #${topicTitle} tag hub curates trope-focused vertical short dramas ranked by newest updates and viewer ratings across 82+ streaming platforms.`,
          },
          {
            q: `Do #${topicTitle} tagged mini-series include English and Indonesian subtitles?`,
            a: `Yes. Episodes in the #${topicTitle} topic playlist automatically load available subtitles including English, Indonesian (Sub Indo), and Mandarin.`,
          },
          {
            q: `How does this #${topicTitle} tag hub differ from a Genre directory?`,
            a: `Genre directories index flagship catalogs by overall popularity, whereas Topic & Tag hubs surface fresh updates and cross-genre storylines matching #${topicTitle}.`,
          },
        ];
  }

  return isId
    ? [
        {
          q: `Di mana nonton drama pendek genre ${topicTitle} sub Indo HD gratis?`,
          a: `Anda dapat menonton katalog lengkap genre ${topicTitle} secara gratis di KanoDrama dalam mode layar vertikal 9:16 maupun sinema penuh lintas 82+ platform.`,
        },
        {
          q: `Apakah serial genre ${topicTitle} dilengkapi subtitle Indonesia?`,
          a: `Ya. KanoDrama menyediakan subtitle Bahasa Indonesia (Sub Indo), Inggris, dan multibahasa otomatis untuk setiap judul genre ${topicTitle} yang tersedia.`,
        },
        {
          q: `Bisakah menyaring genre ${topicTitle} berdasarkan status Tamat atau Rating?`,
          a: `Bisa. Gunakan filter Status (Completed / Ongoing) dan Urutan (Popular / Top Rated / Newest) di bagian atas katalog genre ${topicTitle}.`,
        },
      ]
    : [
        {
          q: `Where can I watch free ${topicTitle} genre short dramas online in HD?`,
          a: `You can watch the complete ${topicTitle} genre catalog directly on KanoDrama in crisp 9:16 vertical theater or cinema mode across 82+ connected platforms.`,
        },
        {
          q: `Are ${topicTitle} genre series updated with English and Indonesian subtitles?`,
          a: `Yes. KanoDrama supports multi-language subtitles (including English, Indonesian, Mandarin, and Vietnamese) across available ${topicTitle} genre releases.`,
        },
        {
          q: `Can I filter ${topicTitle} genre titles by completed seasons or top ratings?`,
          a: `Yes. Use the status and sort toggles at the top of this genre hub to filter between Completed full-season binges, Ongoing updates, Most Popular hits, and Highest Rated series.`,
        },
      ];
}

export function resolveProgrammaticLanding(
  rawSlug: string,
  basePath: 'genre' | 'tag' | 'category' = 'genre',
  rawModifier?: string,
  lang: string = 'en'
): ProgrammaticLandingConfig {
  const s1 = cleanSlugSegment(rawSlug) || 'romance';
  const s2 = rawModifier ? cleanSlugSegment(rawModifier) : '';
  const combinedSlug = s2 ? `${s1}-${s2}` : s1;
  const canonicalPath = s2 ? `/${basePath}/${s1}/${s2}` : `/${basePath}/${s1}`;
  const isId = lang === 'id';

  const exactPreset = CURATED_MAP.get(combinedSlug) || (!s2 ? CURATED_MAP.get(s1) : undefined);

  const related = CURATED_PROGRAMMATIC_PAGES.filter(
    (p) => p.slug !== (exactPreset?.slug || combinedSlug)
  )
    .slice(0, 8)
    .map((p) => ({
      path: `/${basePath}/${p.slug}`,
      label: basePath === 'tag' ? `#${p.label}` : p.label,
    }));

  if (exactPreset) {
    if (basePath === 'tag') {
      const tagSort: 'popular' | 'rating' | 'newest' =
        exactPreset.sort === 'newest' ? 'rating' : 'newest';
      const title = isId
        ? clampMeta(`Topik & Tag #${exactPreset.label}: Koleksi Drama Populer | KanoDrama`, 70)
        : clampMeta(`Topic & Tag #${exactPreset.label}: Latest Vertical Dramas | KanoDrama`, 70);
      const description = isId
        ? clampMeta(
            `Koleksi topik & tag #${exactPreset.label} terbaru sub Indo HD. Temukan daftar episode pilihan, trope favorit, dan update harian di KanoDrama.`,
            160
          )
        : clampMeta(
            `Explore the #${exactPreset.label} topic & tag playlist: fresh vertical short drama releases, trope spotlights, and top-rated picks on KanoDrama.`,
            160
          );
      return {
        slug: combinedSlug,
        label: exactPreset.label,
        basePath,
        canonicalPath,
        routeKindLabel: isId ? 'Topik & Tag Pilihan' : 'Topic & Tag Hub',
        h1: isId
          ? `Topik & Tag #${exactPreset.label} — Koleksi Drama Pendek Terbaru`
          : `#${exactPreset.label} Topic & Tag Vertical Short Dramas`,
        title,
        description,
        keywords: [
          `#${exactPreset.label} tag`,
          `${exactPreset.label} topic dramas`,
          ...exactPreset.keywords,
          'KanoDrama',
          'Topik Drama Pendek',
        ].join(', '),
        intro: isId
          ? `Jelajahi kurasi khusus bertema topik #${exactPreset.label} yang diurutkan dari episode dan judul paling baru across 82+ platform—lengkap dengan subtitle Indonesia dan progres tontonan tersimpan.`
          : `Curated specifically around the #${exactPreset.label} tag and story tropes, this topic feed prioritizes recent updates and viewer-favorite episodes across 82+ streaming platforms.`,
        filter: {
          genre: exactPreset.genre,
          status: exactPreset.status || 'all',
          sort: tagSort,
          q: exactPreset.q || exactPreset.searchFallbackQuery,
        },
        searchFallbackQuery: exactPreset.searchFallbackQuery,
        relatedSlugs: related,
        faqs: buildDynamicFaqs(exactPreset.label, 'tag', lang),
      };
    }

    if (basePath === 'category') {
      const title = isId
        ? clampMeta(`Kategori ${exactPreset.label}: Katalog Drama Pendek HD | KanoDrama`, 70)
        : clampMeta(`Category ${exactPreset.label}: Curated Drama Series HD | KanoDrama`, 70);
      const description = isId
        ? clampMeta(
            `Katalog kategori ${exactPreset.label} sub Indo full episode HD. Streaming drama pendek vertikal gratis lintas 82+ platform hanya di KanoDrama.`,
            160
          )
        : clampMeta(
            `Browse the ${exactPreset.label} category hub with curated full-season short dramas and multi-language subtitles on KanoDrama.`,
            160
          );
      return {
        slug: combinedSlug,
        label: exactPreset.label,
        basePath,
        canonicalPath,
        routeKindLabel: isId ? 'Kategori Pilihan' : 'Curated Category',
        h1: isId
          ? `Kategori ${exactPreset.label} — Serial Drama Pendek HD`
          : `${exactPreset.label} Category — Vertical Short Dramas`,
        title,
        description,
        keywords: [
          `${exactPreset.label} category`,
          ...exactPreset.keywords,
          'KanoDrama',
          'Vertical Short Drama',
        ].join(', '),
        intro: exactPreset.intro,
        filter: {
          genre: exactPreset.genre,
          status: exactPreset.status || 'all',
          sort: exactPreset.sort || 'popular',
          q: exactPreset.q,
        },
        searchFallbackQuery: exactPreset.searchFallbackQuery,
        relatedSlugs: related,
        faqs: buildDynamicFaqs(exactPreset.label, 'category', lang),
      };
    }

    // Default: 'genre'
    const genreTitle = isId
      ? clampMeta(`Genre ${exactPreset.label}: Nonton Drama Pendek Sub Indo HD | KanoDrama`, 70)
      : clampMeta(exactPreset.title, 70);
    const genreDesc = isId
      ? clampMeta(
          `Nonton katalog genre ${exactPreset.label} terpopuler sub Indo full HD tanpa iklan. Pilihan serial vertikal terbaik dari 82+ platform di KanoDrama.`,
          160
        )
      : clampMeta(exactPreset.description, 160);
    return {
      slug: combinedSlug,
      label: exactPreset.label,
      basePath,
      canonicalPath,
      routeKindLabel: isId ? 'Direktori Genre' : 'Curated Genre Guide',
      h1: isId ? `Genre ${exactPreset.label} — ${exactPreset.h1}` : exactPreset.h1,
      title: genreTitle,
      description: genreDesc,
      keywords: [
        `${exactPreset.label} genre`,
        ...exactPreset.keywords,
        'KanoDrama',
        'Vertical Short Drama',
        'Watch Free Online HD',
      ].join(', '),
      intro: exactPreset.intro,
      filter: {
        genre: exactPreset.genre,
        status: exactPreset.status || 'all',
        sort: exactPreset.sort || 'popular',
        q: exactPreset.q,
      },
      searchFallbackQuery: exactPreset.searchFallbackQuery,
      relatedSlugs: related,
      faqs: buildDynamicFaqs(exactPreset.label, 'genre', lang),
    };
  }

  // Dynamic programmatic parsing for arbitrary /genre/:genre/:modifier or /tag/:slug
  const tokens = combinedSlug.split('-').filter(Boolean);
  let status: 'all' | 'Ongoing' | 'Completed' = 'all';
  let sort: 'popular' | 'rating' | 'newest' = basePath === 'tag' ? 'newest' : 'popular';
  let matchedGenre: string | undefined;
  const extraQueryTokens: string[] = [];

  for (const tok of tokens) {
    if (tok === 'completed' || tok === 'complete' || tok === 'finished' || tok === 'full') {
      status = 'Completed';
      continue;
    }
    if (tok === 'ongoing' || tok === 'updating') {
      status = 'Ongoing';
      continue;
    }
    if (tok === 'top' || tok === 'rated' || tok === 'best' || tok === 'highest') {
      sort = 'rating';
      continue;
    }
    if (tok === 'new' || tok === 'newest' || tok === 'latest' || tok === 'recent') {
      sort = 'newest';
      continue;
    }
    if (tok === 'popular' || tok === 'trending' || tok === 'hot' || tok === 'series' || tok === 'dramas' || tok === 'drama' || tok === 'short') {
      continue;
    }
    const gMatch = KNOWN_GENRES.find((g) => g.toLowerCase() === tok);
    if (gMatch && !matchedGenre) {
      matchedGenre = gMatch;
    } else {
      extraQueryTokens.push(tok);
    }
  }

  const readableLabel = toTitleCase(combinedSlug.replace(/-/g, ' '));
  const primarySubject =
    matchedGenre || (extraQueryTokens.length > 0 ? toTitleCase(extraQueryTokens.join(' ')) : readableLabel);
  const queryTerm = extraQueryTokens.length > 0 ? toTitleCase(extraQueryTokens.join(' ')) : undefined;

  if (basePath === 'tag') {
    const title = isId
      ? clampMeta(`Topik & Tag #${readableLabel} — Drama Pendek Sub Indo | KanoDrama`, 70)
      : clampMeta(`Topic & Tag #${readableLabel} — Short Dramas HD | KanoDrama`, 70);
    const description = isId
      ? clampMeta(
          `Daftar drama pendek bertema topik & tag #${readableLabel} sub Indo HD terbaru. Jelajahi episode pilihan lintas 82+ platform di KanoDrama.`,
          160
        )
      : clampMeta(
          `Watch #${readableLabel} topic & tag vertical short dramas sorted by latest updates and viewer ratings across 82+ platforms on KanoDrama.`,
          160
        );
    return {
      slug: combinedSlug,
      label: readableLabel,
      basePath,
      canonicalPath,
      routeKindLabel: isId ? 'Koleksi Topik & Tag' : 'Topic & Tag Collection',
      h1: isId
        ? `Topik & Tag #${readableLabel} — Koleksi Serial Pendek HD`
        : `#${readableLabel} Topic & Tag Vertical Short Dramas`,
      title,
      description,
      keywords: [
        `#${readableLabel} tag drama`,
        `${readableLabel} topic playlist`,
        `${primarySubject} vertical mini series`,
        'KanoDrama',
        'Topik Drama Pendek',
      ].join(', '),
      intro: isId
        ? `Kumpulan drama pendek bertopik #${readableLabel} dengan update episode terbaru, rating penonton tertinggi, dan subtitle Indonesia lengkap di KanoDrama.`
        : `Discover vertical mini-series tagged #${readableLabel} featuring recent episode updates, trope highlights, and instant HD streaming on KanoDrama.`,
      filter: {
        genre: matchedGenre,
        status,
        sort: sort === 'popular' ? 'newest' : sort,
        q: matchedGenre ? queryTerm || primarySubject : queryTerm || readableLabel,
      },
      searchFallbackQuery: queryTerm || matchedGenre || readableLabel,
      relatedSlugs: related,
      faqs: buildDynamicFaqs(readableLabel, 'tag', lang),
    };
  }

  if (basePath === 'category') {
    const title = isId
      ? clampMeta(`Kategori ${readableLabel} — Koleksi Drama Pendek HD | KanoDrama`, 70)
      : clampMeta(`Category ${readableLabel} — Vertical Short Dramas HD | KanoDrama`, 70);
    const description = isId
      ? clampMeta(
          `Katalog kategori ${readableLabel} sub Indo HD di KanoDrama. Tonton serial pendek gratis dari 82+ platform resmi tanpa iklan.`,
          160
        )
      : clampMeta(
          `Explore the ${readableLabel} category catalog of vertical short dramas and Asian mini-series in HD on KanoDrama.`,
          160
        );
    return {
      slug: combinedSlug,
      label: readableLabel,
      basePath,
      canonicalPath,
      routeKindLabel: isId ? 'Kategori Katalog' : 'Curated Category',
      h1: isId
        ? `Kategori ${readableLabel} — Serial Drama Pendek HD`
        : `${readableLabel} Category — Vertical Short Dramas`,
      title,
      description,
      keywords: [
        `${readableLabel} category drama`,
        `Watch Free ${readableLabel} online`,
        `${primarySubject} mini series`,
        'KanoDrama',
      ].join(', '),
      intro: `Browse our curated ${readableLabel} category featuring crisp vertical HD playback, episode-by-episode cloud progress sync, and live popularity rankings across top global streaming providers.`,
      filter: {
        genre: matchedGenre,
        status,
        sort,
        q: matchedGenre ? queryTerm : queryTerm || readableLabel,
      },
      searchFallbackQuery: queryTerm || matchedGenre || readableLabel,
      relatedSlugs: related,
      faqs: buildDynamicFaqs(`${readableLabel}`, 'category', lang),
    };
  }

  const genreTitle = isId
    ? clampMeta(`Genre ${readableLabel} — Nonton Drama Pendek Sub Indo HD | KanoDrama`, 70)
    : clampMeta(`Genre ${readableLabel} — Watch Free Short Dramas HD | KanoDrama`, 70);
  const genreDesc = isId
    ? clampMeta(
        `Nonton serial drama pendek genre ${readableLabel} terpopuler sub Indo full HD. Katalog resmi lintas 82+ platform streaming di KanoDrama.`,
        160
      )
    : clampMeta(
        `Explore the ${readableLabel} genre catalog featuring top vertical short dramas and Asian mini-series in full HD across 82+ platforms on KanoDrama.`,
        160
      );

  return {
    slug: combinedSlug,
    label: readableLabel,
    basePath,
    canonicalPath,
    routeKindLabel: isId ? 'Direktori Genre' : 'Programmatic Genre Hub',
    h1: isId
      ? `Genre ${readableLabel} — Drama Pendek & Serial Vertikal HD`
      : `${readableLabel} Genre Vertical Short Dramas & Mini-Series`,
    title: genreTitle,
    description: genreDesc,
    keywords: [
      `${readableLabel} genre short drama`,
      `Watch Free ${readableLabel} online`,
      `${primarySubject} mini series`,
      'KanoDrama',
      'Vertical Drama HD',
    ].join(', '),
    intro: isId
      ? `Jelajahi direktori genre ${readableLabel} terpopuler di KanoDrama dengan pemutaran HD vertikal, sinkronisasi riwayat tontonan, dan peringkat popularitas langsung.`
      : `Browse our curated ${readableLabel} genre catalog featuring crisp vertical HD playback, episode-by-episode cloud progress sync, and live popularity rankings across top global streaming providers.`,
    filter: {
      genre: matchedGenre,
      status,
      sort,
      q: matchedGenre ? queryTerm : queryTerm || readableLabel,
    },
    searchFallbackQuery: queryTerm || matchedGenre || readableLabel,
    relatedSlugs: related,
    faqs: buildDynamicFaqs(readableLabel, 'genre', lang),
  };
}
