import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight } from 'lucide-react';

const youtubeChannel = 'https://www.youtube.com/channel/UCoZrqTftw_z7tXwagHrw2oA';

const videos = [
  {
    id: 'aqTzReeaaTY',
    title: 'Health advice from our doctors',
    summary: 'A short health talk from Sri Sai Hospital. Summary to be added by the doctor.',
  },
  {
    id: 'g-w7LMnzEa4',
    title: 'Health advice from our doctors',
    summary: 'A short health talk from Sri Sai Hospital. Summary to be added by the doctor.',
  },
  {
    id: '-HCu-2afK34',
    title: 'Health advice from our doctors',
    summary: 'A short health talk from Sri Sai Hospital. Summary to be added by the doctor.',
  },
];

export function VideosSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const [focusAfterSwitch, setFocusAfterSwitch] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const queueButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const switchTimer = useRef<number | undefined>(undefined);
  const activeVideo = videos[activeIndex];
  const queueOrder = videos.map((_, offset) => (activeIndex + offset) % videos.length);

  useEffect(() => {
    if (!focusAfterSwitch) return;
    queueButtonRefs.current[focusAfterSwitch]?.focus();
    setFocusAfterSwitch(null);
  }, [activeIndex, focusAfterSwitch]);

  useEffect(() => () => {
    if (switchTimer.current !== undefined) window.clearTimeout(switchTimer.current);
  }, []);

  function selectVideo(videoId: string) {
    const nextIndex = videos.findIndex((video) => video.id === videoId);
    if (nextIndex < 0 || nextIndex === activeIndex) return;

    if (window.innerWidth < 1280) {
      setFocusAfterSwitch(videos[(nextIndex + 1) % videos.length].id);
    }
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsSwitching(!prefersReducedMotion);
    setActiveIndex(nextIndex);
    if (switchTimer.current !== undefined) window.clearTimeout(switchTimer.current);
    switchTimer.current = window.setTimeout(() => setIsSwitching(false), prefersReducedMotion ? 0 : 300);
    playerRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }

  function handleQueueKeyDown(event: KeyboardEvent<HTMLButtonElement>, videoId: string) {
    const tabletOrMobile = window.innerWidth < 1280;
    const visibleOrder = tabletOrMobile
      ? queueOrder.filter((index) => index !== activeIndex)
      : queueOrder;
    const currentPosition = visibleOrder.findIndex((index) => videos[index].id === videoId);
    if (currentPosition < 0 || !visibleOrder.length) return;

    let destination: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      destination = (currentPosition + 1) % visibleOrder.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      destination = (currentPosition - 1 + visibleOrder.length) % visibleOrder.length;
    } else if (event.key === 'Home') {
      destination = 0;
    } else if (event.key === 'End') {
      destination = visibleOrder.length - 1;
    }

    if (destination === null) return;
    event.preventDefault();
    const nextVideo = videos[visibleOrder[destination]];
    queueButtonRefs.current[nextVideo.id]?.focus();
    selectVideo(nextVideo.id);
  }

  return (
    <section className="section section-dark videos" id="videos" aria-labelledby="videos-heading">
      <div className="container">
        <div className="video-heading-row reveal">
          <div>
            <span className="eyebrow video-eyebrow">From our doctors</span>
            <h2 id="videos-heading">Health, in <em>conversation.</em></h2>
          </div>
          <a className="button button-ghost" href={youtubeChannel} target="_blank" rel="noreferrer" data-testid="link-visit-youtube-channel">
            Visit our channel <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>

        <div className="videos-content-grid">
          <div className="video-main-column">
            <div
              className="video-player reveal"
              ref={playerRef}
              data-testid="player-current-video"
              aria-labelledby="video-main-title"
            >
              <div className={`video-frame${isSwitching ? ' is-switching' : ''}`}>
                <iframe
                  key={activeVideo.id}
                  src={`https://www.youtube-nocookie.com/embed/${activeVideo.id}?rel=0&modestbranding=1`}
                  title={activeVideo.title}
                  loading="eager"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  data-testid={`frame-video-${activeVideo.id}`}
                />
              </div>
              <div className={`video-details${isSwitching ? ' is-switching' : ''}`} aria-live="polite">
                <span className="video-playing-status" data-testid="status-current-video">Now playing</span>
                <h3 id="video-main-title" data-testid="text-current-video-title">{activeVideo.title}</h3>
                <p data-testid="text-current-video-summary">{activeVideo.summary}</p>
                <a
                  href={`https://www.youtube.com/watch?v=${activeVideo.id}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`link-watch-video-${activeVideo.id}`}
                >
                  Watch on YouTube <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>

          <aside className="video-queue reveal reveal-delay-1" aria-label="Up next videos">
            <div className="video-queue-heading">
              <span className="eyebrow">Up next</span>
              <div className="queue-current-summary" aria-live="polite">
                <span>Now playing</span>
                <h3>{activeVideo.title}</h3>
                <p data-testid="text-video-queue-summary">{activeVideo.summary}</p>
              </div>
            </div>
            <div className="video-queue-items">
              {queueOrder.map((videoIndex, order) => {
                const video = videos[videoIndex];
                const isCurrent = videoIndex === activeIndex;
                return (
                  <button
                    key={video.id}
                    ref={(element) => { queueButtonRefs.current[video.id] = element; }}
                    className={`video-queue-item${isCurrent ? ' is-current' : ''}`}
                    type="button"
                    aria-current={isCurrent ? 'true' : undefined}
                    aria-pressed={isCurrent}
                    data-playing={isCurrent ? 'true' : 'false'}
                    data-testid={`button-video-queue-${video.id}`}
                    onClick={() => selectVideo(video.id)}
                    onKeyDown={(event) => handleQueueKeyDown(event, video.id)}
                    style={{ transitionDelay: `${order * 100}ms` }}
                  >
                    <span className="video-queue-title">{video.title}</span>
                    <span className="video-queue-state" data-testid={`status-video-${video.id}`}>
                      {isCurrent ? 'Now playing' : 'Play'}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
