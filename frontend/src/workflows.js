export const workflows = [
  {
    id: "seo-audit",
    badge: "SEO",
    badgeClass: "badge-seo",
    icon: "ti-zoom-code",
    title: "SEO audit",
    desc: "Technical audit, content gaps, optimization opportunities",
    detailDesc: "Paste a URL and Claude scrapes it live — real meta tags, heading structure, link counts, image alt data — then audits it with Gemini.",
    label: "SEO-AUDIT",
    fields: [
      { id: "url", label: "Website URL (will be scraped live)", placeholder: "https://yoursite.com", type: "text", isUrl: true },
      { id: "focus", label: "Specific focus areas (optional)", placeholder: "e.g. local SEO, e-commerce, blog content", type: "text" },
    ],
    buildPrompt(vals) {
      let p = `Analyze this website for technical SEO, content gaps, and optimization opportunities: ${vals.url || "[website URL]"}`;
      if (vals.focus) p += `. Focus areas: ${vals.focus}`;
      p += `. Use the scraped data provided. Label every finding CRITICAL / WARNING / OPPORTUNITY and prioritize by impact.`;
      return p;
    },
  },
  {
    id: "keyword",
    badge: "Research",
    badgeClass: "badge-research",
    icon: "ti-filter-search",
    title: "Keyword research",
    desc: "Low competition, high intent keywords for your niche",
    detailDesc: "Find low-competition, high-intent keywords that are realistically rankable for your niche and audience.",
    label: "KEYWORD-RESEARCH",
    fields: [
      { id: "niche", label: "Your niche or industry", placeholder: "e.g. sustainable fashion, B2B SaaS, fitness coaching", type: "text" },
      { id: "audience", label: "Target audience (optional)", placeholder: "e.g. small business owners, new moms, developers", type: "text" },
    ],
    buildPrompt(vals) {
      let p = `Find low competition high intent keywords for my niche: ${vals.niche || "[your niche]"}`;
      if (vals.audience) p += `. Target audience: ${vals.audience}`;
      p += `. Group by intent (Informational, Commercial, Transactional). Include difficulty (1-100), content format, and monthly search volume range.`;
      return p;
    },
  },
  {
    id: "content",
    badge: "Content",
    badgeClass: "badge-content",
    icon: "ti-calendar-event",
    title: "Content plan",
    desc: "30-day SEO content strategy with blog topics & keyword mapping",
    detailDesc: "Create a 30-day SEO content strategy with blog topics, keyword mapping, and a publishing schedule.",
    label: "CONTENT-PLAN",
    fields: [
      { id: "site", label: "Website or blog URL", placeholder: "https://yourblog.com", type: "text" },
      { id: "topic", label: "Niche or topic focus", placeholder: "e.g. personal finance, SaaS marketing, travel hacks", type: "text" },
    ],
    buildPrompt(vals) {
      let p = `Create a 30-day SEO content strategy with blog topics and keyword mapping`;
      if (vals.topic) p += ` for: ${vals.topic}`;
      if (vals.site) p += `. Website: ${vals.site}`;
      p += `. Include: title, target keyword, content type, word count, internal linking, traffic potential. Focus on rankable, high-intent topics.`;
      return p;
    },
  },
  {
    id: "cro",
    badge: "CRO",
    badgeClass: "badge-cro",
    icon: "ti-cursor-text",
    title: "Landing page CRO",
    desc: "Analyze and improve landing pages for higher conversions",
    detailDesc: "Scrapes your landing page live and audits hero, CTAs, trust signals, friction points, and psychological triggers.",
    label: "LANDING-PAGE-CRO",
    fields: [
      { id: "lurl", label: "Landing page URL (will be scraped live)", placeholder: "https://yoursite.com/landing-page", type: "text", isUrl: true },
      { id: "goal", label: "Page goal (optional)", placeholder: "e.g. email signups, product purchases, demo bookings", type: "text" },
    ],
    buildPrompt(vals) {
      let p = `Analyze this landing page and suggest improvements for higher conversions: ${vals.lurl || "[landing page URL]"}`;
      if (vals.goal) p += `. Page goal: ${vals.goal}`;
      p += `. Cover: headline clarity, hero effectiveness, CTA copy and placement, trust signals, visual hierarchy, funnel friction, psychological triggers. Top 5 issues with fixes and estimated CVR impact. Then A/B test recommendations.`;
      return p;
    },
    getUrl(vals) { return vals.lurl; }
  },
  {
    id: "competitor",
    badge: "SEO",
    badgeClass: "badge-seo",
    icon: "ti-arrows-diff",
    title: "Competitor analysis",
    desc: "Identify competitor SEO gaps and opportunities to target",
    detailDesc: "Analyze competitors to find content gaps, keyword opportunities, and backlink sources you can exploit.",
    label: "COMPETITOR-ANALYSIS",
    single: true,
    fields: [
      { id: "mysite", label: "Your website URL", placeholder: "https://yoursite.com", type: "text" },
      { id: "comps", label: "Competitor URLs (comma separated)", placeholder: "https://competitor1.com, https://competitor2.com", type: "text" },
    ],
    buildPrompt(vals) {
      let p = `Analyze my competitors and identify SEO opportunities I can target.`;
      if (vals.mysite) p += ` My website: ${vals.mysite}.`;
      if (vals.comps) p += ` Competitors: ${vals.comps}.`;
      p += ` Cover: content gaps, keyword overlaps, backlink opportunities, their top pages, and 5 priority opportunities ranked by impact.`;
      return p;
    },
  },
];
