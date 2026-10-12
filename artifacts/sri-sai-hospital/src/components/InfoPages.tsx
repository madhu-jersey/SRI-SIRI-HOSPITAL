import { Fragment, useState } from 'react';
import {
  Activity, ArrowLeft, Brain, CalendarClock, Check, ChevronDown, Clock3, MapPin, PhoneCall, Stethoscope,
} from 'lucide-react';

const phone = '+918819224466';

const reasons = [
  {
    title: 'Internal medicine and diabetes care',
    text: 'Structured care for diabetes, thyroid disorders, and general medical illness.',
    icon: Activity,
  },
  {
    title: 'Neuro-psychiatry and stroke care',
    text: 'Evaluation and ongoing management of brain, nerve, and mental health conditions.',
    icon: Brain,
  },
  {
    title: 'Specialist doctors',
    text: 'Two doctors, each with a listed qualification and registration number on their profile.',
    icon: Stethoscope,
  },
  {
    title: '24-hour casualty',
    text: 'Round-the-clock casualty services at the same number as the clinic.',
    icon: Clock3,
  },
  {
    title: 'Easy to reach',
    text: 'Call 88192 24466 for directions or to ask a question.',
    icon: MapPin,
  },
  {
    title: 'Clear timings',
    text: 'Outpatient hours are published on the site, with the current open or closed status.',
    icon: CalendarClock,
  },
];

const questions = [
  {
    question: 'What are your clinic hours?',
    answer: (
      <>Morning and evening clinic: Monday to Saturday, 9:30 AM to 2:00 PM and 5:30 PM to 8:30 PM. On the 1st and 3rd Sunday of each month: 9:30 AM to 2:00 PM. Casualty services are available 24 hours.</>
    ),
  },
  {
    question: 'Is casualty open at night?',
    answer: (
      <>Yes. Casualty services run 24 hours. For an emergency, call <a href={`tel:${phone}`}>08819-224246</a> at any time, or call <a href="tel:112">112</a>.</>
    ),
  },
  {
    question: 'Who are the doctors?',
    answer: <>Dr. Sritha, MBBS, MD (Neuro-Psychiatry), Reg. No. 85598, and Dr. Jayavardhan Reddy Bijjam, MBBS, MD (Physician), Reg. No. 77460.</>,
  },
  {
    question: 'What conditions do you treat?',
    answer: <>Internal medicine, neuro-psychiatry, stroke care, diabetes and endocrine care, migraine and headache treatment, psychiatry and mental health, and 24-hour critical care and casualty.</>,
  },
  {
    question: 'How do I book an appointment?',
    answer: (
      <>Call <a href={`tel:${phone}`}>08819-224246</a> during clinic hours, or use the "Call to book" button next to each doctor.</>
    ),
  },
  {
    question: 'Where is the hospital?',
    answer: <>DRNO.28-6-15, Sri Matha Tower, Velpur Road, Tanuku, West Godavari, Andhra Pradesh 534211</>,
  },
];

function BackToHome() {
  return <a className="info-back-link" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to home</a>;
}

function Heading({ id, label, words, italic }: { id: string; label: string; words: string[]; italic: string }) {
  return (
    <header className="info-heading">
      <BackToHome />
      <span className="eyebrow">{label}</span>
      <h1 id={id}>
        {words.map((word, index) => (
          <Fragment key={word}>
            <span className="info-heading-word" style={{ '--word-index': index } as React.CSSProperties}>
              <span>{word}</span>
            </span>
            {index < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
        {' '}
        <em className="info-heading-word" style={{ '--word-index': words.length } as React.CSSProperties}>
          <span>{italic}</span>
        </em>
      </h1>
    </header>
  );
}

export function WhyChoosePage() {
  return (
    <main className="info-page why-choose-page" aria-labelledby="why-choose-heading">
      <div className="container info-container">
        <div className="info-intro">
          <Heading id="why-choose-heading" label="Why choose us" words={['Care', 'that', 'is']} italic="close to home." />
          <p>Internal medicine, neuro-psychiatry, stroke and diabetes care in Tanuku, with 24-hour casualty services.</p>
        </div>
        <div className="reason-grid">
          {reasons.map(({ title, text, icon: Icon }, index) => (
            <article className="reason-card" key={title} style={{ '--item-index': index } as React.CSSProperties}>
              <span className="reason-icon"><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span>
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div className="info-doctors">
          <a className="info-doctor-link" href="/#doctor-sritha"><span><Check size={17} aria-hidden="true" /> Dr. Sritha</span><ChevronDown size={17} aria-hidden="true" /></a>
          <a className="info-doctor-link" href="/#doctor-jayavardhan"><span><Check size={17} aria-hidden="true" /> Dr. Jayavardhan Reddy Bijjam</span><ChevronDown size={17} aria-hidden="true" /></a>
          <a className="button button-primary info-book-button" href={`tel:${phone}`}><PhoneCall size={17} aria-hidden="true" /> Call to book</a>
        </div>
      </div>
    </main>
  );
}

export function FaqPage() {
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  return (
    <main className="info-page faq-page" aria-labelledby="faq-heading">
      <div className="container info-container">
        <Heading id="faq-heading" label="FAQ" words={['Questions,']} italic="answered." />
        <div className="faq-list">
          {questions.map(({ question, answer }, index) => {
            const isOpen = openQuestion === index;
            const answerId = `faq-answer-${index + 1}`;
            return (
              <article className="faq-item" key={question} style={{ '--item-index': index } as React.CSSProperties}>
                <h2>
                  <button
                    className="faq-question"
                    id={`faq-question-${index + 1}`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenQuestion(isOpen ? null : index)}
                  >
                    <span>{question}</span>
                    <ChevronDown className="faq-chevron" size={20} aria-hidden="true" />
                  </button>
                </h2>
                <div
                  className={`faq-answer${isOpen ? ' is-open' : ''}`}
                  id={answerId}
                  role="region"
                  aria-labelledby={`faq-question-${index + 1}`}
                  aria-hidden={!isOpen}
                  inert={!isOpen}
                >
                  <div className="faq-answer-inner"><p>{answer}</p></div>
                </div>
              </article>
            );
          })}
        </div>
        <p className="faq-contact">Still have a question? <a href={`tel:${phone}`}>Call 08819-224246.</a></p>
      </div>
    </main>
  );
}
