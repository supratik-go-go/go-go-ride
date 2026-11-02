import { useState } from 'react'
import { ExternalLink, Newspaper } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui'
import { newsService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { timeAgo } from '../../utils/format'
import './passenger.css'

const LANG_KEY = 'gogo.newsLang'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা' },
]

const TEXT = {
  en: {
    national: 'National',
    international: 'International',
    local: 'West Bengal',
    empty: 'No news right now',
    tryLater: 'Please check again in a little while.',
    note: 'Tap a headline to read it on the publisher’s site.',
  },
  bn: {
    national: 'জাতীয়',
    international: 'আন্তর্জাতিক',
    local: 'পশ্চিমবঙ্গ',
    empty: 'এখন কোনও খবর নেই',
    tryLater: 'একটু পরে আবার দেখুন।',
    note: 'পুরো খবর পড়তে শিরোনামে ট্যাপ করুন।',
  },
}

const CATEGORIES = ['national', 'international', 'local']

function savedLanguage() {
  try {
    return localStorage.getItem(LANG_KEY) === 'bn' ? 'bn' : 'en'
  } catch {
    return 'en'
  }
}

export default function DailyNews() {
  const [lang, setLang] = useState(savedLanguage)
  const [category, setCategory] = useState('national')
  const news = useAsync(() => newsService.latest({ lang, category }), [lang, category])
  const items = news.data ?? []
  const text = TEXT[lang]

  const pickLanguage = (value) => {
    setLang(value)
    try {
      localStorage.setItem(LANG_KEY, value)
    } catch {
      /* the choice just won't be remembered */
    }
  }

  return (
    <div className="px-page">
      <PageHeader title="Daily News" back={false} />

      <div className="segmented px-news-langs" role="radiogroup" aria-label="News language">
        {LANGUAGES.map(({ value, label }) => (
          <button key={value} type="button" role="radio" aria-checked={lang === value} className={lang === value ? 'active' : ''} onClick={() => pickLanguage(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="px-chip-row px-news-cats" role="radiogroup" aria-label="News category">
        {CATEGORIES.map((value) => (
          <button key={value} type="button" role="radio" aria-checked={category === value} className={`chip ${category === value ? 'active' : ''}`} onClick={() => setCategory(value)}>
            {text[value]}
          </button>
        ))}
      </div>

      {news.loading ? (
        <div className="px-news-list" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={86} radius={14} />
          ))}
        </div>
      ) : news.error && !items.length ? (
        <ErrorState error={news.error} onRetry={news.reload} />
      ) : !items.length ? (
        <EmptyState icon={<Newspaper size={26} />} title={text.empty} message={text.tryLater} />
      ) : (
        <>
          <div className="px-news-list" lang={lang}>
            {items.map((item) => (
              <a key={item.url} className="card px-news-item" href={item.url} target="_blank" rel="noopener noreferrer">
                <h2>{item.title}</h2>
                <p>
                  <span>
                    {item.source}
                    {item.publishedAt ? ` · ${timeAgo(item.publishedAt)}` : ''}
                  </span>
                  <ExternalLink size={15} aria-hidden="true" />
                </p>
              </a>
            ))}
          </div>
          <p className="px-news-note">{text.note}</p>
        </>
      )}
    </div>
  )
}
