import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Camera, Clock3, HeartPulse, Instagram, MapPin, Menu, PhoneCall, Stethoscope, Youtube, X, ChevronDown,
} from 'lucide-react';
import { DoctorsSection } from './components/DoctorsSection';
import { HeroDotField } from './components/HeroDotField';
import { VideosSection } from './components/VideosSection';
import { galleryItems } from './data/gallery';

const GalleryPage = lazy(() => import('./components/GalleryPage').then((module) => ({ default: module.GalleryPage })));

const phone = '+918819224466';
const directions = 'https://www.google.com/maps/dir/?api=1&destination=16.7536433,81.6862207';
const reviewsUrl = 'https://www.google.com/maps/place/Sri+Siri+hospital/@16.7536484,81.6836458,840m/data=!3m1!1e3!4m18!1m9!3m8!1s0x3a37b72ffc38c451:0xf66d8993ec198c1a!2sSri+Siri+hospital!8m2!3d16.7536433!4d81.6862207!9m1!1b1!16s%2Fg%2F11j1yzzytn!3m7!1s0x3a37b72ffc38c451:0xf66d8993ec198c1a!8m2!3d16.7536433!4d81.6862207!9m1!1b1!16s%2Fg%2F11j1yzzytn?entry=ttu';
const youtubeChannel = 'https://www.youtube.com/channel/UCoZrqTftw_z7tXwagHrw2oA';

const services = [
  { title: 'Neurology and stroke care', text: 'Evaluation and ongoing management of stroke, seizures, and neurological conditions.', icon: 'brain' },
  { title: 'Diabetes and endocrine management', text: 'Structured care for diabetes, thyroid disorders, and related metabolic conditions.', icon: 'pulse' },
  { title: 'General and internal medicine', text: 'Comprehensive assessment and treatment of acute and chronic medical illnesses.', icon: 'stethoscope' },
  { title: 'Psychiatry and mental health', text: 'Thoughtful, evidence-based care for mental health and behavioural conditions.', icon: 'heart-hand' },
  { title: 'Migraine and headache treatment', text: 'Diagnosis and management of migraine, cluster headaches, and chronic head pain.', icon: 'headache' },
  { title: 'Critical care and casualty, 24 hours', text: 'Round-the-clock emergency care for acute medical situations and casualties.', icon: 'clock' },
];

const reviews = [
  { quote: 'Best hospital in tanuku. Doctors are very friendly and staff also good working staff.', name: 'Karuna Chintapalli', age: '10 months ago' },
  { quote: 'Hospital was very clean and staff also good receiving, doctor Stitha madam was consulting to patient good and good treatment', name: 'Mana Manchili tri', age: 'a year ago' },
  { quote: 'A hospital with very good doctors, staff with lab and medical facilities. This hospital cares about Patients not money.', name: 'Supriya Reddy', age: '4 years ago' },
  { quote: 'Good hospital staff, best doctors in the city.', name: 'Sai', age: 'a year ago' },
];

function getOpenState(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const day = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const totalMinutes = hour * 60 + minute;
  const sundayDate = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(date));
  const sundayAppointment = day === 'Sun' && (Math.floor((sundayDate - 1) / 7) + 1 === 1 || Math.floor((sundayDate - 1) / 7) + 1 === 3);
  const scheduledDay = (day !== 'Sun' && day !== 'Sat') || day === 'Sat' || sundayAppointment;
  const openPeriod = (totalMinutes >= 570 && totalMinutes < 840) || (day !== 'Sun' && totalMinutes >= 1050 && totalMinutes < 1230);
  return scheduledDay && openPeriod;
}

function useClinicStatus() {
  const [isOpen, setIsOpen] = useState(() => getOpenState(new Date()));
  useEffect(() => {
    const update = () => setIsOpen(getOpenState(new Date()));
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return isOpen;
}

function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const isGalleryPage = window.location.pathname === '/gallery' || window.location.hash === '#gallery-view';
  useEffect(() => {
    let frame = 0;
    const update = () => {
      setScrolled(window.scrollY > 20);
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (window.location.pathname === '/gallery' || window.location.hash === '#gallery-view') {
          setActiveSection('');
          return;
        }
        const sections = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
        const current = sections.filter((section) => section.getBoundingClientRect().top <= 120).at(-1);
        setActiveSection(current?.id ?? '');
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [isGalleryPage]);
  const closeMenu = () => setMenuOpen(false);
  const homePrefix = isGalleryPage ? '/' : '';
  const navLink = (section: string) => `${homePrefix}#${section}`;
  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
      <div className="container nav-inner">
        <a className="brand" href={navLink('home')} aria-label="Sri Siri Hospital home" data-testid="link-brand-home" onClick={closeMenu}>
          <img src="/assets/sri-siri-hospital-logo.png" alt="Sri Siri Hospital logo" />
          <span className="brand-name">Sri Siri Hospital<small>Tanuku, Andhra Pradesh</small></span>
        </a>
        <nav className={`nav-links${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
          <a href={navLink('services')} aria-current={activeSection === 'services' ? 'location' : undefined} data-testid="link-nav-services" onClick={closeMenu}>Services</a>
          <a href={navLink('doctors')} aria-current={activeSection === 'doctors' ? 'location' : undefined} data-testid="link-nav-doctors" onClick={closeMenu}>Our doctors</a>
          <a href={navLink('gallery')} aria-current={activeSection === 'gallery' ? 'location' : undefined} data-testid="link-nav-hospital" onClick={closeMenu}>Hospital</a>
          <a href={navLink('reviews')} aria-current={activeSection === 'reviews' ? 'location' : undefined} data-testid="link-nav-reviews" onClick={closeMenu}>Reviews</a>
          <a href={navLink('visit')} aria-current={activeSection === 'visit' ? 'location' : undefined} data-testid="link-nav-visit" onClick={closeMenu}>Visit us</a>
          <a
            className="nav-instagram-mobile"
            href="https://www.instagram.com/sri_siri_hospital/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram: Sri Siri Hospital"
          >
            <Instagram size={20} strokeWidth={1.7} aria-hidden="true" />
          </a>
        </nav>
        <div className="header-contact-actions">
          <a className="nav-call" href={`tel:${phone}`} data-testid="button-call-header"><PhoneIcon /> Call now</a>
          <a
            className="header-instagram"
            href="https://www.instagram.com/sri_siri_hospital/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram: Sri Siri Hospital"
            data-testid="link-header-instagram"
          >
            <Instagram size={19} strokeWidth={1.7} aria-hidden="true" />
          </a>
        </div>
        <button className="nav-toggle" type="button" data-testid="button-toggle-navigation" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </header>
  );
}

function PhoneIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.7a15 15 0 0 0 4.8 4.8L15 13l5 2v4c0 1.1-.9 2-2 2C10.3 21 3 13.7 3 5c0-1.1.9-2 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ProgressLine() {
  const progressRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let scheduled = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      scheduled = false;
    };
    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return <div className="top-progress" aria-hidden="true"><span ref={progressRef} /></div>;
}

function useReveal(isGalleryPage: boolean) {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    let scoreTimer = 0;
    let scoreFrame = 0;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          if (entry.target.matches('.review-summary')) {
            const score = entry.target.querySelector<HTMLElement>('.review-score');
            if (score && score.dataset.countStarted !== 'true') {
              score.dataset.countStarted = 'true';
              score.textContent = '0.0';
              scoreTimer = window.setTimeout(() => {
                const start = performance.now();
                const updateScore = (now: number) => {
                  const progress = Math.min(1, (now - start) / 900);
                  score.textContent = `${(5 * progress).toFixed(1)}`;
                  if (progress < 1) scoreFrame = window.requestAnimationFrame(updateScore);
                };
                scoreFrame = window.requestAnimationFrame(updateScore);
              }, 1710);
            }
          }
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      window.clearTimeout(scoreTimer);
      window.cancelAnimationFrame(scoreFrame);
    };
  }, [isGalleryPage]);
}

function useMagneticButtons(isGalleryPage: boolean) {
  useEffect(() => {
    if (isGalleryPage) return;
    const finePointer = window.matchMedia('(pointer: fine) and (hover: hover)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reducedMotion.matches) return;

    const button = document.querySelector<HTMLElement>('.hero-actions .button-primary');
    if (!button) return;

    const handleMove = (event: PointerEvent) => {
      if (reducedMotion.matches) {
        button.style.removeProperty('--magnetic-x');
        button.style.removeProperty('--magnetic-y');
        return;
      }
      const rect = button.getBoundingClientRect();
      const nearestX = Math.max(rect.left, Math.min(event.clientX, rect.right));
      const nearestY = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
      const outsideDistance = Math.hypot(event.clientX - nearestX, event.clientY - nearestY);
      const strength = Math.max(0, 1 - outsideDistance / 60);
      const offsetX = event.clientX - (rect.left + rect.width / 2);
      const offsetY = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(offsetX, offsetY) || 1;
      const pull = Math.min(distance, 8) * strength;
      if (!strength) {
        button.style.removeProperty('--magnetic-x');
        button.style.removeProperty('--magnetic-y');
        return;
      }
      const x = offsetX / distance * pull;
      const y = offsetY / distance * pull;
      button.style.setProperty('--magnetic-x', `${x}px`);
      button.style.setProperty('--magnetic-y', `${y}px`);
    };
    const reset = () => {
      button.style.removeProperty('--magnetic-x');
      button.style.removeProperty('--magnetic-y');
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('blur', reset);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [isGalleryPage]);
}

function usePhotoParallax(isGalleryPage: boolean) {
  useEffect(() => {
    if (isGalleryPage) return;
    const finePointer = window.matchMedia('(min-width: 1024px) and (pointer: fine) and (hover: hover)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const art = document.querySelector<HTMLElement>('.hero-art');
    const panel = document.querySelector<HTMLElement>('.hero-photo-panel');
    if (!art || !panel) return;

    const restingX = 2;
    const restingY = -5;
    let currentX = restingX;
    let currentY = restingY;
    let targetX = restingX;
    let targetY = restingY;
    let animationFrame = 0;
    let isPointerActive = false;
    let listening = false;

    const animate = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      panel.style.setProperty('--hero-tilt-x', `${currentX}deg`);
      panel.style.setProperty('--hero-tilt-y', `${currentY}deg`);
      if (isPointerActive && (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01)) {
        animationFrame = window.requestAnimationFrame(animate);
      } else {
        animationFrame = 0;
      }
    };
    const handleMove = (event: PointerEvent) => {
      if (reducedMotion.matches) return;
      const rect = art.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      targetX = restingX + (0.5 - y) * 6;
      targetY = restingY + (x - 0.5) * 6;
      if (!isPointerActive) {
        isPointerActive = true;
        panel.classList.add('is-cursor-active');
        currentX = restingX;
        currentY = restingY;
      }
      if (!animationFrame) animationFrame = window.requestAnimationFrame(animate);
    };
    const reset = () => {
      isPointerActive = false;
      targetX = restingX;
      targetY = restingY;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      panel.classList.remove('is-cursor-active');
      panel.style.removeProperty('--hero-tilt-x');
      panel.style.removeProperty('--hero-tilt-y');
    };
    const updateListeners = () => {
      const shouldListen = finePointer.matches && !reducedMotion.matches;
      if (shouldListen === listening) return;
      listening = shouldListen;
      if (listening) {
        art.addEventListener('pointermove', handleMove, { passive: true });
        art.addEventListener('pointerleave', reset);
      } else {
        art.removeEventListener('pointermove', handleMove);
        art.removeEventListener('pointerleave', reset);
        reset();
      }
    };
    finePointer.addEventListener('change', updateListeners);
    reducedMotion.addEventListener('change', updateListeners);
    updateListeners();

    return () => {
      finePointer.removeEventListener('change', updateListeners);
      reducedMotion.removeEventListener('change', updateListeners);
      if (listening) {
        art.removeEventListener('pointermove', handleMove);
        art.removeEventListener('pointerleave', reset);
      }
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      reset();
    };
  }, [isGalleryPage]);
}

function Hero() {
  const isOpen = useClinicStatus();
  return (
    <section className="hero" id="home" aria-labelledby="hero-title">
      <HeroDotField />
      <div className="container hero-inner">
        <div className="hero-copy">
          <span className="hero-pill"><span aria-hidden="true" /> Sri Siri Hospital · Tanuku</span>
          <h1 id="hero-title"><span className="word"><span>Sri Siri</span></span><br /><span className="word"><span>Hospital</span></span></h1>
          <p className="telugu-title font-telugu" lang="te" data-testid="text-hospital-name-telugu">బిజ్జం వారి శ్రీ సిరి హాస్పిటల్</p>
          <p className="hero-description">Internal medicine, neuro-psychiatry, stroke and diabetes care, with 24-hour casualty services in Tanuku.</p>
          <div className="hero-actions">
            <a className="button button-primary" href={`tel:${phone}`} data-testid="button-call-hero"><PhoneIcon /> Call now</a>
            <a className="button button-outline" href={directions} target="_blank" rel="noreferrer" data-testid="button-directions"><MapPin size={17} /> Get directions</a>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-photo-wrap">
            <div className="hero-photo-stage">
              <div className="hero-photo-shadow" aria-hidden="true" />
              <div className="hero-photo-perspective">
                <div className="hero-photo-panel">
                  <div className="hero-photo-frame">
                    <img src="/assets/hero-building.jpg" alt="Sri Siri Hospital building, Velpur Road, Tanuku" fetchPriority="high" />
                  </div>
                </div>
              </div>
              <div className="seal" aria-label="Sri Siri Hospital logo"><img src="/assets/sri-siri-hospital-logo.png" alt="" /></div>
              <a className="explore-hint" href="#doctors" aria-label="Scroll to Our doctors">
                <ChevronDown size={14} aria-hidden="true" />
              </a>
            </div>

            <div className="status-card" aria-live="polite">
              <div className="status-top">
                <span className="status-label"><span className="live-dot" aria-hidden="true" /> Clinic hours</span>
                <span className={`status-text${isOpen ? '' : ' closed'}`} data-testid="status-open">{isOpen ? 'Open now' : 'Closed now'}</span>
              </div>
              <div className="hours-line"><span>Mon–Sat · Morning</span><strong>9:30 AM – 2:00 PM</strong></div>
              <div className="hours-line"><span>Mon–Sat · Evening</span><strong>5:30 PM – 8:30 PM</strong></div>
              <div className="hours-line"><span>1st &amp; 3rd Sunday</span><strong>9:30 AM – 2:00 PM</strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <div className="trust-strip" aria-label="Key facts about Sri Siri Hospital">
      <div className="trust-item">
        <HeartPulse size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>24/7 Casualty Services</span>
      </div>
      <span className="trust-sep" aria-hidden="true" />
      <div className="trust-item">
        <Stethoscope size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>Two Specialist Doctors</span>
      </div>
      <span className="trust-sep" aria-hidden="true" />
      <div className="trust-item">
        <Clock3 size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>Mon–Sat Outpatient Hours</span>
      </div>
    </div>
  );
}

function EmergencyStrip() {
  return (
    <div className="emergency-strip" data-testid="text-emergency-contact">
      <p>24-hour casualty and emergency care</p>
      <a href={`tel:${phone}`} data-testid="button-call-emergency"><PhoneIcon /> +91 88192 24466</a>
    </div>
  );
}

type ServiceIconName = typeof services[number]['icon'];

function ServiceIcon({ name }: { name: ServiceIconName }) {
  const shared = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'brain':
      return <svg className="service-icon-svg" viewBox="0 0 24 24" aria-hidden="true" {...shared}>
        <path pathLength="1" d="M12 4.2c-.9-1.2-2.7-1.4-3.9-.3-1.8-.1-3.2 1.5-2.8 3.3-1.5 1-1.7 3.2-.4 4.5-1.1 1.7-.2 4 1.7 4.6.1 1.8 1.8 3 3.5 2.4.6 1.4 2.2 2.1 3.6 1.4" />
        <path pathLength="1" d="M12 4.2c.9-1.2 2.7-1.4 3.9-.3 1.8-.1 3.2 1.5 2.8 3.3 1.5 1 1.7 3.2.4 4.5 1.1 1.7.2 4-1.7 4.6-.1 1.8-1.8 3-3.5 2.4-.6 1.4-2.2 2.1-3.6 1.4" />
        <path pathLength="1" d="M12 4.5v15M8.2 7.2c1.4.2 2 1.1 1.9 2.4m5.7-2.4c-1.4.2-2 1.1-1.9 2.4M7.4 13c1.4-.2 2.3.6 2.4 2m6.8-2c-1.4-.2-2.3.6-2.4 2" />
      </svg>;
    case 'pulse':
      return <svg className="service-icon-svg" viewBox="0 0 24 24" aria-hidden="true" {...shared}>
        <path pathLength="1" d="M3 12h4l2.2-5.5L13 18l2.5-6H21" />
      </svg>;
    case 'stethoscope':
      return <svg className="service-icon-svg" viewBox="0 0 24 24" aria-hidden="true" {...shared}>
        <path pathLength="1" d="M5 4v5a4 4 0 0 0 8 0V4M3.5 4h3M11.5 4h3M9 13v1.5a5.5 5.5 0 0 0 11 0v-1" />
        <path pathLength="1" d="M17 11.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
      </svg>;
    case 'heart-hand':
      return <svg className="service-icon-svg" viewBox="0 0 24 24" aria-hidden="true" {...shared}>
        <path pathLength="1" d="M12 19s-7.5-4.4-7.5-9.3a4.1 4.1 0 0 1 7.5-2.2 4.1 4.1 0 0 1 7.5 2.2c0 1.5-.7 2.9-1.8 4.2" />
        <path pathLength="1" d="M3 17h4l2 2h5.5a3 3 0 0 0 2.1-.9l3.1-3.1a1.4 1.4 0 0 0-2-2l-2.2 1.8H12" />
      </svg>;
    case 'headache':
      return <svg className="service-icon-svg" viewBox="0 0 24 24" aria-hidden="true" {...shared}>
        <path pathLength="1" d="M10 21v-2.8c-2.8-1.3-4.5-4.2-4.5-7.1V8.4a6.4 6.4 0 0 1 12.8 0v2.4c0 .6-.4 1.1-.9 1.4l-1.2.7.8 1.1c.3.4 0 .9-.5.9h-1.1c-.2 1.6-1.1 2.6-2.7 3.1V21" />
        <path pathLength="1" d="m7.3 5.3 1 1-1 1 1 1m5.2 2.6h.1" />
      </svg>;
    case 'clock':
      return <svg className="service-icon-svg" viewBox="0 0 24 24" aria-hidden="true" {...shared}>
        <path pathLength="1" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path pathLength="1" d="M12 7v5l3.5 2" />
      </svg>;
    default:
      return null;
  }
}

function Services() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!sectionRef.current) return;

    const cards = Array.from(sectionRef.current.querySelectorAll<HTMLElement>('.service-card'));
    const frames = new Map<HTMLElement, number>();
    const positions = new Map<HTMLElement, { clientX: number; clientY: number }>();
    const onEntranceEnd = (event: TransitionEvent) => {
      if (event.target === event.currentTarget && event.propertyName === 'transform') {
        (event.currentTarget as HTMLElement).classList.add('is-settled');
      }
    };
    const onMove = (event: PointerEvent) => {
      const card = event.currentTarget as HTMLElement;
      positions.set(card, { clientX: event.clientX, clientY: event.clientY });
      if (frames.has(card)) return;
      frames.set(card, window.requestAnimationFrame(() => {
        try {
          const position = positions.get(card);
          if (!position || reducedMotion.matches) return;
          const rect = card.getBoundingClientRect();
          const x = (position.clientX - rect.left) / rect.width;
          const y = (position.clientY - rect.top) / rect.height;
          card.style.setProperty('--spotlight-x', `${x * 100}%`);
          card.style.setProperty('--spotlight-y', `${y * 100}%`);
          card.style.setProperty('--service-tilt-x', `${(0.5 - y) * 8}deg`);
          card.style.setProperty('--service-tilt-y', `${(x - 0.5) * 8}deg`);
        } finally {
          frames.delete(card);
        }
      }));
    };
    const onLeave = (event: PointerEvent) => {
      const card = event.currentTarget as HTMLElement;
      const frame = frames.get(card);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frames.delete(card);
      positions.delete(card);
      card.style.removeProperty('--spotlight-x');
      card.style.removeProperty('--spotlight-y');
      card.style.removeProperty('--service-tilt-x');
      card.style.removeProperty('--service-tilt-y');
    };

    cards.forEach((card) => card.addEventListener('transitionend', onEntranceEnd));
    if (finePointer.matches && !reducedMotion.matches) {
      cards.forEach((card) => {
        card.addEventListener('pointermove', onMove);
        card.addEventListener('pointerleave', onLeave);
      });
    }
    return () => {
      cards.forEach((card) => {
        card.removeEventListener('transitionend', onEntranceEnd);
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerleave', onLeave);
      });
      frames.forEach((frame) => window.cancelAnimationFrame(frame));
    };
  }, []);

  return (
    <section className="section services-section" id="services" aria-labelledby="services-heading" ref={sectionRef}>
      <div className="container">
        <div className="section-heading service-heading reveal">
          <span className="eyebrow">Care at Sri Siri</span>
          <h2 id="services-heading">
            <span className="service-word"><span>Thoughtful</span></span>{' '}
            <span className="service-word"><span>care</span></span>{' '}
            <span className="service-word"><span>for</span></span>{' '}
            <em><span className="service-word"><span>every</span></span>{' '}
            <span className="service-word"><span>day.</span></span></em>
          </h2>
          <p>Medical care across key needs, with a focus on careful assessment and ongoing support.</p>
        </div>
        <div className="service-grid">
          {services.map(({ title, text, icon }, index) => (
            <article className="service-card reveal" key={title} data-service-icon={icon} data-testid={`card-service-${index + 1}`}>
              <div className="service-icon"><ServiceIcon name={icon} /></div>
              <h3 data-title={title}>{title}</h3>
              <p>{text}</p>
              <svg className="service-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" pathLength="1" />
              </svg>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Doctors() {
  return <DoctorsSection />;
}

function Gallery() {
  return (
    <section className="section" id="gallery" aria-labelledby="gallery-heading">
      <div className="container">
        <div className="section-heading gallery-section-heading reveal">
          <span className="eyebrow">A look around</span>
          <h2 id="gallery-heading"><span className="gallery-heading-word"><span>A place for</span></span>{' '}<em><span className="gallery-heading-word"><span>care.</span></span></em></h2>
          <p>Explore the spaces at Sri Siri Hospital.</p>
        </div>
        <div className="gallery-preview-grid">
          {galleryItems.map((item, index) => (
            <div className={`gallery-preview-card gallery-preview-card--${item.category} reveal`} key={item.id} style={{ '--gallery-index': index } as React.CSSProperties}>
              {item.src ? (
                <img src={item.src} alt={item.alt} loading="lazy" data-testid={`image-hospital-${index + 1}`} />
              ) : (
                <span className="gallery-placeholder" role="img" aria-label={item.caption}>
                  <Camera size={28} strokeWidth={1.3} aria-hidden="true" />
                </span>
              )}
              <span className="gallery-caption">{item.caption}</span>
            </div>
          ))}
        </div>
        <div className="gallery-view-link-row">
          <a className="gallery-view-link" href="#gallery-view">View photographs <ArrowRight size={18} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
  );
}

function Videos() {
  return <VideosSection />;
}

function Reviews() {
  const reviewButtonRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const button = reviewButtonRef.current;
    const finePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!button || !finePointer.matches || reducedMotion.matches) return;

    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const reset = () => {
      pointer = null;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      button.style.removeProperty('--magnetic-x');
      button.style.removeProperty('--magnetic-y');
    };
    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!pointer || reducedMotion.matches) {
          reset();
          return;
        }
        const rect = button.getBoundingClientRect();
        const nearestX = Math.max(rect.left, Math.min(pointer.x, rect.right));
        const nearestY = Math.max(rect.top, Math.min(pointer.y, rect.bottom));
        const outsideDistance = Math.hypot(pointer.x - nearestX, pointer.y - nearestY);
        const strength = Math.max(0, 1 - outsideDistance / 40);
        const offsetX = pointer.x - (rect.left + rect.width / 2);
        const offsetY = pointer.y - (rect.top + rect.height / 2);
        const distance = Math.hypot(offsetX, offsetY) || 1;
        const pull = Math.min(distance, 6) * strength;
        if (!strength) {
          button.style.removeProperty('--magnetic-x');
          button.style.removeProperty('--magnetic-y');
          return;
        }
        button.style.setProperty('--magnetic-x', `${offsetX / distance * pull}px`);
        button.style.setProperty('--magnetic-y', `${offsetY / distance * pull}px`);
      });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, []);

  return (
    <section className="section reviews-section" id="reviews" aria-labelledby="reviews-heading">
      <div className="container">
        <div className="section-heading review-heading reveal">
          <span className="eyebrow">Patient experiences</span>
          <h2 id="reviews-heading">
            <span className="review-heading-line">
              <span className="review-word"><span>Words</span></span>{' '}
              <span className="review-word"><span>from</span></span>{' '}
              <span className="review-word"><span>our</span></span>
            </span>
            <br />
            <em><span className="review-heading-line"><span className="review-word"><span>community.</span></span></span></em>
          </h2>
          <p>Experiences shared by people who have visited Sri Siri Hospital.</p>
        </div>
        <div className="review-summary reveal">
          <div className="review-rating">
            <span className="review-score" aria-label="5.0 out of 5">5.0</span>
            <span className="review-stars" aria-label="5 stars">
              {[0, 1, 2, 3, 4].map((star) => (
                  <svg className="review-star" key={star} style={{ '--star-index': star } as React.CSSProperties} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14l-5.63 2.96 1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z" />
                </svg>
              ))}
            </span>
          </div>
          <span className="review-count">· 31 Google reviews</span>
        </div>
        <div className="review-grid">
          {reviews.map((review, index) => (
            <article className="review-card reveal" key={review.name} style={{ '--review-index': index } as React.CSSProperties} data-testid={`card-review-${index + 1}`}>
              <blockquote>“{review.quote}”</blockquote>
              <div className="review-by"><span data-name={review.name}>{review.name}</span><time>{review.age}</time></div>
            </article>
          ))}
        </div>
        <div className="reviews-action reveal"><a ref={reviewButtonRef} className="button button-outline reviews-button" href={reviewsUrl} target="_blank" rel="noreferrer" data-testid="button-more-google-reviews"><span data-label="More Google reviews">More Google reviews</span><ArrowRight size={16} /></a></div>
      </div>
    </section>
  );
}

function Visit() {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInteractive, setMapInteractive] = useState(false);
  return (
    <section className="section section-white visit-section" id="visit" aria-labelledby="visit-heading">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Find us in Tanuku</span>
          <h2 id="visit-heading">
            <span className="visit-heading-word"><span>We’re</span></span>{' '}
            <span className="visit-heading-word"><span>here</span></span>{' '}
            <span className="visit-heading-word"><span>when</span></span>{' '}
            <em><span className="visit-heading-word"><span>you need us.</span></span></em>
          </h2>
          <p>Plan your visit or call the hospital for assistance.</p>
        </div>
        <div className="visit-grid">
          <div className="visit-panel">
            <div className="visit-block reveal" style={{ '--visit-index': 0 } as React.CSSProperties}>
              <p className="visit-label">Address</p>
              <p className="visit-value address">DRNO.28-6-15, Sri Matha Tower, Velpur Road, Tanuku, West Godavari, Andhra Pradesh 534211</p>
            </div>
            <div className="visit-block reveal" style={{ '--visit-index': 1 } as React.CSSProperties}>
              <p className="visit-label">Call</p>
              <div className="visit-actions">
                <a className="button button-primary" href={`tel:${phone}`} data-testid="button-call-visit"><PhoneIcon /> +91 88192 24466</a>
              </div>
            </div>
            <div className="visit-block reveal" style={{ '--visit-index': 2 } as React.CSSProperties}>
              <p className="visit-label">Consultation hours</p>
              <div className="hours-table">
                <div className="hours-row reveal" style={{ '--hours-index': 0 } as React.CSSProperties}><span>Monday–Saturday · Morning</span><span>9:30 AM – 2:00 PM</span></div>
                <div className="hours-row reveal" style={{ '--hours-index': 1 } as React.CSSProperties}><span>Monday–Saturday · Evening</span><span>5:30 PM – 8:30 PM</span></div>
                <div className="hours-row reveal" style={{ '--hours-index': 2 } as React.CSSProperties}><span>1st and 3rd Sunday</span><span>9:30 AM – 2:00 PM</span></div>
              </div>
            </div>
            <div className="visit-block casualty-block reveal" style={{ '--visit-index': 3 } as React.CSSProperties}>
              <p className="visit-label">Casualty</p>
              <p className="visit-value"><span className="casualty-dot" aria-hidden="true" />24-hour casualty services</p>
            </div>
          </div>
          <div
            className={`map-frame reveal${mapLoaded ? ' is-loaded' : ''}${mapInteractive ? ' is-interactive' : ''}`}
            data-testid="card-hospital-map"
          >
            <div className="map-shimmer" aria-hidden="true" />
            <a className="map-directions" href={directions} target="_blank" rel="noopener noreferrer" aria-label="Go to Sri Siri Hospital location in Google Maps" data-testid="link-go-to-location">
              <MapPin size={17} strokeWidth={1.8} aria-hidden="true" /> Go to location
            </a>
            <iframe
              title="Sri Siri Hospital, Velpur Road, Tanuku"
              data-testid="frame-hospital-map"
              src="https://www.google.com/maps?q=16.7536433,81.6862207&z=17&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              onLoad={() => setMapLoaded(true)}
            />
            {!mapInteractive && (
              <button
                className="map-interaction-enable"
                type="button"
                aria-label="Enable map interaction"
                onClick={() => setMapInteractive(true)}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const homePrefix = window.location.pathname === '/gallery' || window.location.hash === '#gallery-view' ? '/' : '';
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand reveal" style={{ '--footer-index': 0 } as React.CSSProperties}>
            <img src="/assets/sri-siri-hospital-logo.png" alt="Sri Siri Hospital logo" />
            <h2>Sri Siri Hospital</h2>
            <p className="font-telugu" lang="te">బిజ్జం వారి శ్రీ సిరి హాస్పిటల్</p>
            <p className="footer-location">Tanuku, West Godavari, Andhra Pradesh</p>
          </div>
          <div className="footer-explore-column reveal" style={{ '--footer-index': 1 } as React.CSSProperties}>
            <p className="footer-label">Explore</p>
            <nav className="footer-nav" aria-label="Footer navigation">
              <a href={`${homePrefix}#services`} data-testid="link-footer-services">Services</a><a href={`${homePrefix}#doctors`} data-testid="link-footer-doctors">Our doctors</a>
              <a href={`${homePrefix}#gallery`} data-testid="link-footer-hospital">Hospital</a><a href={`${homePrefix}#videos`} data-testid="link-footer-videos">Health videos</a>
              <a href={`${homePrefix}#reviews`} data-testid="link-footer-reviews">Reviews</a><a href={`${homePrefix}#visit`} data-testid="link-footer-visit">Visit us</a>
            </nav>
          </div>
          <div className="footer-connect-column reveal" style={{ '--footer-index': 2 } as React.CSSProperties}>
            <p className="footer-label">Connect</p>
            <div className="footer-social">
              <a href={`tel:${phone}`} data-testid="link-footer-call"><PhoneCall size={18} strokeWidth={1.6} aria-hidden="true" />Call +91 88192 24466</a>
              <a href={youtubeChannel} target="_blank" rel="noopener noreferrer" data-testid="link-footer-youtube"><Youtube size={18} strokeWidth={1.6} aria-hidden="true" />YouTube channel</a>
              <a href="https://www.instagram.com/sri_siri_hospital/" target="_blank" rel="noopener noreferrer" aria-label="Instagram: Sri Siri Hospital" data-testid="link-footer-instagram">
                <Instagram size={18} strokeWidth={1.6} aria-hidden="true" />Instagram
              </a>
            </div>
          </div>
        </div>
        <aside className="crisis-box" aria-label="Crisis and emergency information">
          <h3>If you are in crisis:</h3>
          <p><strong>Tele-MANAS, 14416</strong> (free, 24 hours). For a medical emergency, call <strong>112</strong> or the casualty number.</p>
        </aside>
        <div className="footer-bottom">
          <p>Information only. This website does not replace a consultation or emergency care.</p>
          <p>© Sri Siri Hospital · Tanuku</p>
        </div>
      </div>
    </footer>
  );
}

function MobileActions() {
  return (
    <div className="mobile-actions" aria-label="Quick contact">
      <a className="call" href={`tel:${phone}`} data-testid="button-call-mobile"><PhoneIcon /> Call</a>
    </div>
  );
}

function App() {
  const [isGalleryPage, setIsGalleryPage] = useState(
    () => window.location.pathname === '/gallery' || window.location.hash === '#gallery-view',
  );
  useReveal(isGalleryPage);
  useMagneticButtons(isGalleryPage);
  usePhotoParallax(isGalleryPage);
  useEffect(() => {
    const updateGalleryRoute = () => {
      const galleryRoute = window.location.pathname === '/gallery' || window.location.hash === '#gallery-view';
      setIsGalleryPage(galleryRoute);
    };
    window.addEventListener('hashchange', updateGalleryRoute);
    window.addEventListener('popstate', updateGalleryRoute);
    updateGalleryRoute();
    return () => {
      window.removeEventListener('hashchange', updateGalleryRoute);
      window.removeEventListener('popstate', updateGalleryRoute);
    };
  }, []);
  useEffect(() => {
    if (!isGalleryPage) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    return () => window.cancelAnimationFrame(frame);
  }, [isGalleryPage]);
  return (
    <>
      <ProgressLine />
      <SiteHeader />
      {isGalleryPage ? (
        <Suspense fallback={<main className="gallery-page" aria-busy="true" />}>
          <GalleryPage />
        </Suspense>
      ) : (
        <main>
          <Hero />
          <TrustStrip />
          <EmergencyStrip />
          <Services />
          <Doctors />
          <Gallery />
          <Videos />
          <Reviews />
          <Visit />
        </main>
      )}
      <Footer />
      {!isGalleryPage && <MobileActions />}
    </>
  );
}

export default App;
