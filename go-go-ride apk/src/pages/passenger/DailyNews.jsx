import { ExternalLink, Newspaper } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui'
import { newsService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { timeAgo } from '../../utils/format'
import './passenger.css'

export default function DailyNews() {
  const news = useAsync(() => newsService.latest(), [])
  const items = news.data ?? []

  return (
    <div className="px-page">
      <PageHeader title="Daily News" subtitle="Kolkata and West Bengal" back={false} />

      {news.loading && !items.length ? (
        <div className="px-news-list" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={86} radius={14} />
          ))}
        </div>
      ) : news.error && !items.length ? (
        <ErrorState error={news.error} onRetry={news.reload} />
      ) : !items.length ? (
        <EmptyState icon={<Newspaper size={26} />} title="No news right now" message="Please check again in a little while." />
      ) : (
        <>
          <div className="px-news-list">
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
          <p className="px-news-note">Headlines from Times of India and The Hindu. Tap one to read it on their site.</p>
        </>
      )}
    </div>
  )
}
