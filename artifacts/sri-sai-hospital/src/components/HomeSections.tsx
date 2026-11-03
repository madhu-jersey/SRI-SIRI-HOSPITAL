import { useState } from 'react';
import { Activity, ArrowRight, Brain, ChevronDown, Clock3, HeartHandshake, MapPin, Stethoscope } from 'lucide-react';
import { questions, reasons } from './InfoPages';

const phone = '+918819224466';

const aboutStats = [
  { value: '6', label: 'Specialities under one roof' },
  { value: '2', label: 'Specialist doctors' },
  { value: '24h', label: 'Casualty services' },
];

const aboutFeatures = [
  { title: 'Neurology and stroke care', text: 'Stroke, seizures and nerve conditions.', icon: Brain },
  { title: 'Diabetes and internal medicine', text: 'Diabetes, thyroid and general illness.', icon: Activity },
  { title: 'Mental health', text: 'Psychiatry and behavioural health.', icon: HeartHandshake },
  { title: '24-hour casualty', text: 'Emergency care at any hour.', icon: Clock3 },
];

export function AboutSection() {
  return (
    <section className="section about-section" id="about" aria-labelledby="about-heading">
      <div className="container about-grid">
        <div className="about-card reveal">
          <div className="about-card-brand">
            <img src="/assets/sri-siri-hospital-logo.png" alt="" />
            <div>
              <p className="about-card-name">Sri Siri Hospital</p>
              <p className="about-card-telugu font-telugu" lang="te">బిజ్జం వారి శ్రీ సిరి హాస్పిటల్</p>
            </div>
          </div>
          <dl className="about-stats">
            {aboutStats.map(({ value, label }) => (
              <div className="about-stat" key={label}>
                <dt>{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
          <p className="about-card-address"><MapPin size={18} aria-hidden="true" /> Sri Matha Tower, Velpur Road, Tanuku</p>
        </div>
        <div className="about-copy reveal reveal-delay-1">
          <span className="eyebrow">Who we are</span>
          <h2 id="about-heading">About <em>Sri Siri Hospital</em></h2>
          <p className="about-lead">A hospital in Tanuku for internal medicine, neuro-psychiatry, stroke and diabetes care, with 24-hour casualty services.</p>
          <p className="about-text">Two specialist doctors see patients six days a week, and casualty services run around the clock at the same number as the clinic.</p>
          <ul className="about-features">
            {aboutFeatures.map(({ title, text, icon: Icon }) => (
              <li key={title}>
                <span className="about-feature-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="about-actions">
            <a className="button button-primary" href="#book-appointment">Book appointment <ArrowRight size={18} aria-hidden="true" /></a>
            <a className="button button-outline" href="#doctors">Meet our doctors <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

const whyIcons = [Stethoscope, Brain, Activity, Clock3];
const whyReasons = [reasons[2], reasons[1], reasons[0], reasons[3]];

export function WhyChooseSection() {
  return (
    <section className="section why-section" aria-labelledby="why-heading">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Why choose us</span>
          <h2 id="why-heading">Why patients choose <em>Sri Siri</em></h2>
        </div>
        <ol className="why-grid">
          {whyReasons.map(({ title, text }, index) => {
            const Icon = whyIcons[index];
            return (
              <li className="why-item reveal" key={title} style={{ transitionDelay: `${index * 90}ms` }}>
                <div className="why-item-top">
                  <span className="why-icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                  <span className="why-number">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function FaqSection() {
  const [openQuestion, setOpenQuestion] = useState<number | null>(0);

  return (
    <section className="section faq-section" id="faq-home" aria-labelledby="faq-home-heading">
      <div className="container faq-split">
        <div className="faq-intro reveal">
          <span className="eyebrow">Good to know</span>
          <h2 id="faq-home-heading">Frequently asked <em>questions</em></h2>
          <p>Still have questions? Call the hospital on <a href={`tel:${phone}`}>88192 24466</a>.</p>
        </div>
        <div className="faq-list faq-home-list">
          {questions.map(({ question, answer }, index) => {
            const isOpen = openQuestion === index;
            const answerId = `faq-home-answer-${index + 1}`;
            return (
              <article className={`faq-item reveal${isOpen ? ' is-open' : ''}`} key={question} style={{ transitionDelay: `${index * 70}ms` }}>
                <h3>
                  <button
                    className="faq-question"
                    id={`faq-home-question-${index + 1}`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenQuestion(isOpen ? null : index)}
                  >
                    <span>{question}</span>
                    <ChevronDown className="faq-chevron" size={20} aria-hidden="true" />
                  </button>
                </h3>
                <div
                  className={`faq-answer${isOpen ? ' is-open' : ''}`}
                  id={answerId}
                  role="region"
                  aria-labelledby={`faq-home-question-${index + 1}`}
                  aria-hidden={!isOpen}
                  inert={!isOpen}
                >
                  <div className="faq-answer-inner"><p>{answer}</p></div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
