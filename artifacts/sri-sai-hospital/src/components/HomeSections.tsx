import { ArrowRight } from 'lucide-react';

const aboutStats = [
  { value: '6', label: 'Specialities' },
  { value: '2', label: 'Specialist doctors' },
  { value: '24h', label: 'Casualty' },
];

export function AboutSection() {
  return (
    <section className="section about-section" id="about" aria-labelledby="about-heading">
      <div className="container about-grid">
        <div className="about-card reveal">
          <p className="about-card-name">At a glance</p>
          <dl className="about-stats">
            {aboutStats.map(({ value, label }) => (
              <div className="about-stat" key={label}>
                <dt>{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="about-copy reveal reveal-delay-1">
          <span className="eyebrow">About</span>
          <h2 id="about-heading">A hospital <em>close to home</em></h2>
          <p className="about-lead">Sri Siri Hospital on Velpur Road, Tanuku, treats internal medicine, neuro-psychiatry, stroke and diabetes.</p>
          <p className="about-text">Two specialist doctors see patients six days a week, and the casualty ward is open around the clock.</p>
          <div className="about-actions">
            <a className="button button-outline" href="#doctors">Meet our doctors <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
