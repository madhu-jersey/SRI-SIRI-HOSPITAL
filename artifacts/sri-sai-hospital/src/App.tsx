import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Brain, Clock3,
  HeartPulse, MapPin, Menu, MessageCircle, Stethoscope, X, ChevronDown,
} from 'lucide-react';
import { DoctorsSection } from './components/DoctorsSection';
import { HeroDotField } from './components/HeroDotField';
import { VideosSection } from './components/VideosSection';

const phone = '+918819224466';
const whatsapp = 'https://wa.me/918819224466';
const directions = 'https://www.google.com/maps?q=16.7536433,81.6862207&z=17';
const reviewsUrl = 'https://www.google.com/maps/place/Sri+Siri+hospital/@16.7536484,81.6836458,840m/data=!3m1!1e3!4m18!1m9!3m8!1s0x3a37b72ffc38c451:0xf66d8993ec198c1a!2sSri+Siri+hospital!8m2!3d16.7536433!4d81.6862207!9m1!1b1!16s%2Fg%2F11j1yzzytn!3m7!1s0x3a37b72ffc38c451:0xf66d8993ec198c1a!8m2!3d16.7536433!4d81.6862207!9m1!1b1!16s%2Fg%2F11j1yzzytn?entry=ttu';
const youtubeChannel = 'https://www.youtube.com/channel/UCoZrqTftw_z7tXwagHrw2oA';

const services = [
  { title: 'Neurology and stroke care', text: 'Evaluation and ongoing management of stroke, seizures, and neurological conditions.', Icon: Brain },
  { title: 'Diabetes and endocrine management', text: 'Structured care for diabetes, thyroid disorders, and related metabolic conditions.', Icon: Activity },
  { title: 'General and internal medicine', text: 'Comprehensive assessment and treatment of acute and chronic medical illnesses.', Icon: Stethoscope },
  { title: 'Psychiatry and mental health', text: 'Thoughtful, evidence-based care for mental health and behavioural conditions.', Icon: HeartPulse },
  { title: 'Migraine and headache treatment', text: 'Diagnosis and management of migraine, cluster headaches, and chronic head pain.', Icon: Brain },
  { title: 'Critical care and casualty, 24 hours', text: 'Round-the-clock emergency care for acute medical situations and casualties.', Icon: Clock3 },
];

const gallery = [
  { name: 'Building', file: 'building.svg', alt: 'Hospital photograph placeholder: building' },
  { name: 'Reception', file: 'reception.svg', alt: 'Hospital photograph placeholder: reception' },
  { name: 'Consultation room', file: 'consultation-room.svg', alt: 'Hospital photograph placeholder: consultation room' },
  { name: 'Waiting area', file: 'waiting-area.svg', alt: 'Hospital photograph placeholder: waiting area' },
  { name: 'Laboratory', file: 'laboratory.svg', alt: 'Hospital photograph placeholder: laboratory' },
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
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
      <div className="container nav-inner">
        <a className="brand" href="#home" aria-label="Sri Sai Hospital home" data-testid="link-brand-home" onClick={closeMenu}>
          <img src="/assets/sri-sai-hospital-logo.png" alt="Sri Sai Hospital emblem" />
          <span className="brand-name">Sri Sai Hospital<small>Tanuku, Andhra Pradesh</small></span>
        </a>
        <nav className={`nav-links${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
          <a href="#services" data-testid="link-nav-services" onClick={closeMenu}>Services</a>
          <a href="#doctors" data-testid="link-nav-doctors" onClick={closeMenu}>Our doctors</a>
          <a href="#gallery" data-testid="link-nav-hospital" onClick={closeMenu}>Hospital</a>
          <a href="#reviews" data-testid="link-nav-reviews" onClick={closeMenu}>Reviews</a>
          <a href="#visit" data-testid="link-nav-visit" onClick={closeMenu}>Visit us</a>
        </nav>
        <a className="nav-call" href={`tel:${phone}`} data-testid="button-call-header"><PhoneIcon /> Call now</a>
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
      if (progressRef.current) progressRef.current.style.width = `${max > 0 ? window.scrollY / max * 100 : 0}%`;
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

function useReveal() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}

function useMagneticButtons() {
  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine) and (hover: hover)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reducedMotion.matches) return;

    const buttons = Array.from(document.querySelectorAll<HTMLElement>('.button, .nav-call'));
    const handleMove = (event: PointerEvent) => {
      const button = event.currentTarget as HTMLElement;
      const rect = button.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
      button.style.setProperty('--magnetic-x', `${x}px`);
      button.style.setProperty('--magnetic-y', `${y}px`);
    };
    const reset = (event: PointerEvent) => {
      const button = event.currentTarget as HTMLElement;
      button.style.removeProperty('--magnetic-x');
      button.style.removeProperty('--magnetic-y');
    };
    buttons.forEach((button) => {
      button.addEventListener('pointermove', handleMove);
      button.addEventListener('pointerleave', reset);
    });

    return () => buttons.forEach((button) => {
      button.removeEventListener('pointermove', handleMove);
      button.removeEventListener('pointerleave', reset);
    });
  }, []);
}

function Hero() {
  const isOpen = useClinicStatus();
  return (
    <section className="hero" id="home" aria-labelledby="hero-title">
      <HeroDotField />
      <div className="container hero-inner">
        <div className="hero-copy">
          <span className="hero-pill"><span aria-hidden="true" /> Sri Sai Hospital · Tanuku</span>
          <h1 id="hero-title"><span className="word"><span>Sri Sai</span></span><br /><span className="word"><span>Hospital</span></span></h1>
          <p className="telugu-title font-telugu" lang="te" data-testid="text-hospital-name-telugu">బిజ్జం వారి శ్రీ సాయి హాస్పిటల్</p>
          <p className="hero-description">Internal medicine, neuro-psychiatry, stroke and diabetes care, with 24-hour casualty services in Tanuku.</p>
          <div className="hero-actions">
            <a className="button button-primary" href={`tel:${phone}`} data-testid="button-call-hero"><PhoneIcon /> Call now</a>
            <a className="button button-outline" href={directions} target="_blank" rel="noreferrer" data-testid="button-directions"><MapPin size={17} /> Get directions</a>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-photo">
            <img src="/assets/hero-building.jpg" alt="Sri Sai Hospital building, Velpur Road, Tanuku" fetchPriority="high" />
            {/* Floating service cards — percentage positions anchored to real building features */}
            <div className="float-cards" aria-hidden="true">
              <div className="float-card float-card--tl" style={{ top: '14%', left: '4%' }}>
                <span className="float-card-anchor" />
                <span className="float-card-icon"><Brain size={14} strokeWidth={1.6} /></span>
                <span className="float-card-text"><strong>Neuro-Psychiatry</strong>Expert mental wellness care</span>
              </div>
              <div className="float-card float-card--ml" style={{ top: '50%', left: '4%' }}>
                <span className="float-card-anchor" />
                <span className="float-card-icon"><Stethoscope size={14} strokeWidth={1.6} /></span>
                <span className="float-card-text"><strong>Internal Medicine</strong>Comprehensive adult care</span>
              </div>
              <div className="float-card float-card--tr" style={{ top: '10%', right: '3%' }}>
                <span className="float-card-anchor" />
                <span className="float-card-icon"><HeartPulse size={14} strokeWidth={1.6} /></span>
                <span className="float-card-text"><strong>24/7 Casualty</strong>Always here for you</span>
              </div>
              <div className="float-card float-card--mr" style={{ top: '44%', right: '3%' }}>
                <span className="float-card-anchor" />
                <span className="float-card-icon"><Activity size={14} strokeWidth={1.6} /></span>
                <span className="float-card-text"><strong>Stroke Care</strong>Advanced monitoring</span>
              </div>
              <div className="float-card float-card--br" style={{ bottom: '13%', right: '3%' }}>
                <span className="float-card-anchor" />
                <span className="float-card-icon"><Clock3 size={14} strokeWidth={1.6} /></span>
                <span className="float-card-text"><strong>Diabetes Care</strong>Personalised management</span>
              </div>
            </div>
          </div>
          <div className="seal" aria-label="Sri Sai Hospital emblem"><img src="/assets/sri-sai-hospital-logo.png" alt="" /></div>
          <div className="status-card" aria-live="polite">
            <div className="status-top">
              <span className="status-label"><span className="live-dot" aria-hidden="true" /> Clinic hours</span>
              <span className={`status-text${isOpen ? '' : ' closed'}`} data-testid="status-open">{isOpen ? 'Open now' : 'Closed now'}</span>
            </div>
            <div className="hours-line"><span>Mon–Sat · Morning</span><strong>9:30 AM – 2:00 PM</strong></div>
            <div className="hours-line"><span>Mon–Sat · Evening</span><strong>5:30 PM – 8:30 PM</strong></div>
            <div className="hours-line"><span>1st &amp; 3rd Sunday</span><strong>9:30 AM – 2:00 PM</strong></div>
          </div>
          <a className="explore-hint" href="#doctors" aria-label="Explore our hospital – scroll to doctors">
            <ChevronDown size={14} aria-hidden="true" />
            Explore our hospital
          </a>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <div className="trust-strip" aria-label="Key facts about Sri Sai Hospital">
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

function Services() {
  return (
    <section className="section" id="services" aria-labelledby="services-heading">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Care at Sri Sai</span>
          <h2 id="services-heading">Thoughtful care for <em>every day.</em></h2>
          <p>Medical care across key needs, with a focus on careful assessment and ongoing support.</p>
        </div>
        <div className="service-grid">
          {services.map(({ title, text, Icon }, index) => (
            <article className={`service-card reveal reveal-delay-${(index % 3) + 1}`} key={title} data-testid={`card-service-${index + 1}`}>
              <div className="service-icon"><Icon size={21} strokeWidth={1.65} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
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
        <div className="section-heading reveal">
          <span className="eyebrow">A look around</span>
          <h2 id="gallery-heading">A place for <em>care.</em></h2>
          <p>Explore the spaces at Sri Sai Hospital.</p>
        </div>
        <div className="gallery-layout">
          {gallery.map((item, index) => (
            <figure className={`gallery-item reveal reveal-delay-${(index % 3) + 1}`} key={item.name}>
              <img src={`/assets/photos/${item.file}`} alt={item.alt} loading="lazy" data-testid={`image-hospital-${index + 1}`} />
              <figcaption className="gallery-caption">{item.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Videos() {
  return <VideosSection />;
}

function Reviews() {
  return (
    <section className="section" id="reviews" aria-labelledby="reviews-heading">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Patient experiences</span>
          <h2 id="reviews-heading">Words from our <em>community.</em></h2>
          <p>Experiences shared by people who have visited Sri Sai Hospital.</p>
        </div>
        <div className="review-summary reveal">
          <div className="review-rating"><span>5.0</span><span className="review-stars" aria-label="5 stars">★★★★★</span></div>
          <span className="review-count">· 31 Google reviews</span>
        </div>
        <div className="review-grid">
          {reviews.map((review, index) => (
            <article className={`review-card reveal reveal-delay-${(index % 2) + 1}`} key={review.name} data-testid={`card-review-${index + 1}`}>
              <blockquote>“{review.quote}”</blockquote>
              <div className="review-by"><span>{review.name}</span><time>{review.age}</time></div>
            </article>
          ))}
        </div>
        <div className="reviews-action reveal"><a className="button button-outline" href={reviewsUrl} target="_blank" rel="noreferrer" data-testid="button-more-google-reviews">More Google reviews <ArrowRight size={16} /></a></div>
      </div>
    </section>
  );
}

function Visit() {
  return (
    <section className="section section-white visit-section" id="visit" aria-labelledby="visit-heading">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Find us in Tanuku</span>
          <h2 id="visit-heading">We’re here when <em>you need us.</em></h2>
          <p>Plan your visit or call the hospital for assistance.</p>
        </div>
        <div className="visit-grid">
          <div className="visit-panel reveal">
            <div className="visit-block">
              <p className="visit-label">Address</p>
              <p className="visit-value address">DRNO.28-6-15, Sri Matha Tower, Velpur Road, Tanuku, West Godavari, Andhra Pradesh 534211</p>
              <div className="visit-actions">
                <a className="button button-primary" href={`tel:${phone}`} data-testid="button-call-visit"><PhoneIcon /> +91 88192 24466</a>
                <a className="button button-outline" href={whatsapp} target="_blank" rel="noreferrer" data-testid="button-whatsapp-visit"><MessageCircle size={16} /> WhatsApp</a>
              </div>
            </div>
            <div className="visit-block">
              <p className="visit-label">Consultation hours</p>
              <table className="hours-table">
                <tbody>
                  <tr><td>Monday–Saturday · Morning</td><td>9:30 AM – 2:00 PM</td></tr>
                  <tr><td>Monday–Saturday · Evening</td><td>5:30 PM – 8:30 PM</td></tr>
                  <tr><td>1st and 3rd Sunday</td><td>9:30 AM – 2:00 PM</td></tr>
                </tbody>
              </table>
            </div>
            <div className="visit-block">
              <p className="visit-label">Casualty</p>
              <p className="visit-value">24-hour casualty services</p>
            </div>
          </div>
          <div className="map-frame reveal reveal-delay-1">
            <iframe
              title="Sri Sai Hospital, Velpur Road, Tanuku"
              data-testid="frame-hospital-map"
              src="https://www.google.com/maps?q=16.7536433,81.6862207&z=17&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <img src="/assets/sri-sai-hospital-logo.png" alt="Sri Sai Hospital emblem" loading="lazy" />
            <h2>Sri Sai Hospital</h2>
            <p className="font-telugu" lang="te">బిజ్జం వారి శ్రీ సాయి హాస్పిటల్</p>
          </div>
          <div>
            <p className="footer-label">Explore</p>
            <nav className="footer-nav" aria-label="Footer navigation">
              <a href="#services" data-testid="link-footer-services">Services</a><a href="#doctors" data-testid="link-footer-doctors">Our doctors</a>
              <a href="#gallery" data-testid="link-footer-hospital">Hospital</a><a href="#videos" data-testid="link-footer-videos">Health videos</a>
              <a href="#reviews" data-testid="link-footer-reviews">Reviews</a><a href="#visit" data-testid="link-footer-visit">Visit us</a>
            </nav>
            <div className="footer-social" style={{ marginTop: 22 }}>
              <a href={youtubeChannel} target="_blank" rel="noreferrer" data-testid="link-footer-youtube">YouTube channel</a>
            </div>
          </div>
          <aside className="crisis-box" aria-label="Crisis and emergency information">
            <h3>If you are in crisis:</h3>
            <p><strong>Tele-MANAS, 14416</strong> (free, 24 hours). For a medical emergency, call <strong>112</strong> or the casualty number.</p>
          </aside>
        </div>
        <div className="footer-bottom">
          <p>Information only. This website does not replace a consultation or emergency care.</p>
          <p>Sri Sai Hospital · Tanuku</p>
        </div>
      </div>
    </footer>
  );
}

function MobileActions() {
  return (
    <div className="mobile-actions" aria-label="Quick contact">
      <a className="call" href={`tel:${phone}`} data-testid="button-call-mobile"><PhoneIcon /> Call</a>
      <a className="whatsapp" href={whatsapp} target="_blank" rel="noreferrer" data-testid="button-whatsapp-mobile"><MessageCircle size={17} /> WhatsApp</a>
    </div>
  );
}

function App() {
  useReveal();
  useMagneticButtons();
  return (
    <>
      <ProgressLine />
      <SiteHeader />
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
      <Footer />
      <MobileActions />
    </>
  );
}

export default App;
