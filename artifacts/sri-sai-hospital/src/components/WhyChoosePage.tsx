import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, Brain, Clock3, FlaskConical, MapPin, PhoneCall, Siren, Star, Video,
} from 'lucide-react';
import { doctors } from './DoctorsSection';
import './why-choose.css';

const phone = '+918819224466';
const directions = 'https://www.google.com/maps/dir/?api=1&destination=16.7536433,81.6862207';

// Only facts already shown elsewhere on the site: doctors and registration
// numbers, Google reviews, gallery rooms, casualty and opening hours.
const facts = [
  { value: '5.0 on Google', note: 'All 31 reviews are five stars' },
  { value: '2 specialist doctors', note: 'Neuro-psychiatry and general medicine' },
  { value: '24-hour casualty', note: 'Every day, at 88192 24466' },
  { value: 'Video consultations', note: 'Book up to 7 days ahead' },
];

const reasons = [
  {
    icon: BadgeCheck,
    title: 'Doctors you can check',
    text: 'Both doctors are named here with their degrees and Andhra Pradesh Medical Council registration numbers (APMC 85598 and 77460), so you know who will see you.',
  },
  {
    icon: Brain,
    title: 'Care for the mind and the brain',
    text: 'Dr. Sritha (MD, Neuro-Psychiatry) sees psychiatric and behavioural concerns, neurological problems, migraine and anxiety, in the same hospital as general medicine.',
  },
  {
    icon: Activity,
    title: 'Diabetes and blood pressure, over time',
    text: 'Dr. Jayavardhan Reddy Bijjam (MD, Physician) looks after diabetes, high blood pressure and fevers, with regular follow-up visits and clear explanations.',
  },
  {
    icon: Siren,
    title: 'Casualty, day and night',
    text: 'The casualty is open 24 hours, every day, on the same number as the clinic. Call 88192 24466 in an emergency or for directions.',
  },
  {
    icon: FlaskConical,
    title: 'Laboratory on site',
    text: 'Reception, consultation rooms, a waiting area and a laboratory are all at the hospital on Velpur Road, so most visits happen in one place.',
    link: { href: '/gallery', label: 'See the hospital' },
  },
  {
    icon: Video,
    title: 'Consult from home',
    text: 'Book a Zoom consultation with Dr. Sritha online. The hospital confirms it on WhatsApp and sends the link 30 minutes before your time.',
    link: { href: '/consult', label: 'Book a video consultation' },
  },
];

const quotes = [
  { quote: 'A hospital with very good doctors, staff with lab and medical facilities. This hospital cares about Patients not money.', name: 'Supriya Reddy' },
  { quote: 'Best hospital in tanuku. Doctors are very friendly and staff also good working staff.', name: 'Karuna Chintapalli' },
];

// Short version for the home page, right after About. About already covers
// the doctors and the casualty, so these four points add what it doesn't.
const homePoints = [
  { icon: BadgeCheck, title: 'Doctors you can check', text: 'Both doctors list their degrees and medical council registration numbers.' },
  { icon: FlaskConical, title: 'Laboratory on site', text: 'Tests, consultation rooms and the waiting area are all in one building.' },
  { icon: Activity, title: 'Follow-up over time', text: 'Diabetes and blood pressure care continues with regular review visits.' },
  { icon: Video, title: 'Consult from home', text: 'Book a Zoom consultation online, confirmed on WhatsApp.' },
];

export function WhyChooseSection() {
  return (
    <section className="section why-home" id="why-us" aria-labelledby="why-home-title">
      <div className="container">
        <div className="why-home-head reveal">
          <div>
            <span className="eyebrow">Why choose us</span>
            <h2 id="why-home-title">Why patients choose <em>Sri Siri Hospital</em></h2>
          </div>
          <a className="why-text-link" href="/why-choose">See all six reasons <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
        <ul className="why-home-grid">
          {homePoints.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className={`why-home-item reveal reveal-delay-${Math.min(index + 1, 3)}`}>
              <span className="why-reason-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.7} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function WhyChoosePage() {
  return (
    <main className="why-page" aria-labelledby="why-title">
      <section className="why-intro">
        <div className="container">
          <a className="why-back" href="/"><ArrowLeft size={17} aria-hidden="true" /> Back to home</a>
          <span className="eyebrow">Why choose us</span>
          <h1 id="why-title">Why patients choose <span>Sri Siri Hospital</span></h1>
          <p className="why-lead">A hospital on Velpur Road, Tanuku, with two specialist doctors, a laboratory, and a casualty that is open day and night.</p>
          <ul className="why-facts" aria-label="At a glance">
            {facts.map((fact) => (
              <li key={fact.value}>
                <strong>{fact.value}</strong>
                <span>{fact.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="why-reasons" aria-labelledby="why-reasons-title">
        <div className="container">
          <h2 id="why-reasons-title" className="why-section-title">Six reasons</h2>
          <ol className="why-reason-list">
            {reasons.map(({ icon: Icon, title, text, link }, index) => (
              <li key={title} className="why-reason">
                <span className="why-reason-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="why-reason-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.7} /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  {link && <a className="why-text-link" href={link.href}>{link.label} <ArrowRight size={15} aria-hidden="true" /></a>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="why-doctors" aria-labelledby="why-doctors-title">
        <div className="container">
          <h2 id="why-doctors-title" className="why-section-title">Your doctors</h2>
          <div className="why-doctor-grid">
            {doctors.map((doctor, index) => (
              <article className="why-doctor" key={doctor.name}>
                <img src={doctor.image} alt={doctor.alt} loading="lazy" width="160" height="200" />
                <div className="why-doctor-body">
                  <span className="why-doctor-specialty">{doctor.specialty}</span>
                  <h3>{doctor.name}</h3>
                  <p className="why-doctor-degree">{doctor.degree}</p>
                  <p className="why-doctor-reg">{doctor.registration}</p>
                  <ul className="why-doctor-areas">
                    {doctor.areas.map((area) => <li key={area}>{area}</li>)}
                  </ul>
                  <div className="why-doctor-actions">
                    {index === 0 ? (
                      <a className="button button-primary" href="/consult"><Video size={16} aria-hidden="true" /> Book video consult</a>
                    ) : (
                      <a className="button button-primary" href={`tel:${phone}`}><PhoneCall size={16} aria-hidden="true" /> Call to book</a>
                    )}
                    <a className="why-text-link" href={`/#doctor-${index === 0 ? 'sritha' : 'jayavardhan'}`}>Full profile <ArrowRight size={15} aria-hidden="true" /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="why-voices" aria-labelledby="why-voices-title">
        <div className="container">
          <div className="why-voices-head">
            <h2 id="why-voices-title" className="why-section-title">What patients say</h2>
            <p className="why-rating"><span className="why-stars" aria-label="5 out of 5">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={18} aria-hidden="true" />)}</span> 5.0 from 31 Google reviews</p>
          </div>
          <div className="why-quote-grid">
            {quotes.map((item) => (
              <figure className="why-quote" key={item.name}>
                <blockquote>“{item.quote}”</blockquote>
                <figcaption>{item.name} · Google review</figcaption>
              </figure>
            ))}
          </div>
          <a className="why-text-link" href="/#reviews">Read all reviews <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
      </section>

      <section className="why-visit" aria-labelledby="why-visit-title">
        <div className="container why-visit-inner">
          <div>
            <h2 id="why-visit-title">Visit or consult</h2>
            <p className="why-visit-line"><MapPin size={17} aria-hidden="true" /> DRNO.28-6-15, Sri Matha Tower, Velpur Road, Tanuku</p>
            <p className="why-visit-line"><Clock3 size={17} aria-hidden="true" /> OPD Monday to Saturday, 9:30 am–2 pm and 5:30–8:30 pm · Casualty 24 hours</p>
          </div>
          <div className="why-visit-actions">
            <a className="button button-primary" href={`tel:${phone}`}><PhoneCall size={16} aria-hidden="true" /> Call 88192 24466</a>
            <a className="button why-button-light" href="/consult"><Video size={16} aria-hidden="true" /> Book video consultation</a>
            <a className="button why-button-ghost" href={directions} target="_blank" rel="noreferrer"><MapPin size={16} aria-hidden="true" /> Get directions</a>
          </div>
        </div>
      </section>
    </main>
  );
}
