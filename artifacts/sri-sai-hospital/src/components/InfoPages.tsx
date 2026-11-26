import { Fragment, useState } from 'react';
import {
  ArrowLeft, ChevronDown,
} from 'lucide-react';

const phone = '+918819224466';

export const questions = [
  {
    question: 'What are your clinic hours?',
    answer: (
      <>Morning and evening clinic: Monday to Saturday, 9:30 AM to 2:00 PM and 5:30 PM to 8:30 PM. On the 1st and 3rd Sunday of each month: 9:30 AM to 2:00 PM. Casualty services are available 24 hours.</>
    ),
  },
  {
    question: 'Is casualty open at night?',
    answer: (
      <>Yes. Casualty services run 24 hours. For an emergency, call <a href={`tel:${phone}`}>+91 88192 24466</a> at any time, or call <a href="tel:112">112</a>.</>
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
      <>Book a video consultation with Dr. Sritha on the <a href="/consult">online consultation page</a> (evening slots, Monday to Saturday): pick a time and send the request on WhatsApp. For Dr. Jayavardhan Reddy Bijjam or other timings, call <a href={`tel:${phone}`}>+91 88192 24466</a> during clinic hours, or use the "Book with" button on each doctor's profile.</>
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
        <p className="faq-contact">Still have a question? <a href={`tel:${phone}`}>Call +91 88192 24466.</a></p>
      </div>
    </main>
  );
}
