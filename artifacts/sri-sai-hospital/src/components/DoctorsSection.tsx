import { useEffect } from 'react';
import { CalendarDays, Check, PhoneCall } from 'lucide-react';

const doctors = [
  {
    name: 'Dr. Sritha',
    specialty: 'Neuro-Psychiatry',
    degree: 'MBBS, MD (Neuro-Psychiatry)',
    registration: 'APMC Reg. No. 85598',
    image: '/assets/doctor-sritha.png',
    alt: 'Portrait of Dr. Sritha',
    bookingName: 'Dr. Sritha',
    areas: [
      'Psychiatry and behavioural health',
      'Neurological evaluation',
      'Migraine and headache disorders',
      'Anxiety and stress management',
    ],
  },
  {
    name: 'Dr. Jayavardhan Reddy Bijjam',
    specialty: 'General Medicine',
    degree: 'MBBS, MD (Physician)',
    registration: 'APMC Reg. No. 77460',
    image: '/assets/doctor-jayavardhan-reddy.png',
    alt: 'Portrait of Dr. Jayavardhan Reddy Bijjam',
    bookingName: 'Dr. Jayavardhan',
    areas: [
      'General medicine',
      'Diabetes management',
      'Hypertension care',
      'Acute medical fevers',
    ],
  },
];

const phone = '+918819224466';
const whatsapp = 'https://wa.me/918819224466';

function useDoctorPortraitEffects() {
  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine) and (hover: hover)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches) return;

    const portraits = Array.from(document.querySelectorAll<HTMLElement>('.doctor-image'));
    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches) return;
      const portrait = event.currentTarget as HTMLElement;
      const rect = portrait.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      portrait.style.setProperty('--spotlight-x', `${x * 100}%`);
      portrait.style.setProperty('--spotlight-y', `${y * 100}%`);
      portrait.style.setProperty('--portrait-tilt-x', `${(0.5 - y) * 8}deg`);
      portrait.style.setProperty('--portrait-tilt-y', `${(x - 0.5) * 8}deg`);
    };
    const reset = (event: PointerEvent) => {
      const portrait = event.currentTarget as HTMLElement;
      portrait.style.setProperty('--spotlight-x', '50%');
      portrait.style.setProperty('--spotlight-y', '50%');
      portrait.style.setProperty('--portrait-tilt-x', '0deg');
      portrait.style.setProperty('--portrait-tilt-y', '0deg');
    };
    const onMotionChange = () => {
      if (reducedMotion.matches) {
        portraits.forEach((portrait) => {
          portrait.style.setProperty('--portrait-tilt-x', '0deg');
          portrait.style.setProperty('--portrait-tilt-y', '0deg');
          portrait.style.setProperty('--spotlight-x', '50%');
          portrait.style.setProperty('--spotlight-y', '50%');
        });
      }
    };

    portraits.forEach((portrait) => {
      portrait.addEventListener('pointermove', onPointerMove);
      portrait.addEventListener('pointerleave', reset);
    });
    reducedMotion.addEventListener('change', onMotionChange);
    return () => {
      portraits.forEach((portrait) => {
        portrait.removeEventListener('pointermove', onPointerMove);
        portrait.removeEventListener('pointerleave', reset);
      });
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, []);
}

export function DoctorsSection() {
  useDoctorPortraitEffects();

  return (
    <section className="section section-white doctors-section" id="doctors" aria-labelledby="doctors-heading">
      <div className="container">
        <div className="section-heading reveal">
          <span className="eyebrow">Meet your doctors</span>
          <h2 id="doctors-heading">Our doctors</h2>
          <p>Specialists who see patients at Sri Sai Hospital, Tanuku.</p>
        </div>
        <div className="doctor-grid">
          {doctors.map((doctor, doctorIndex) => (
            <article
              className={`doctor-card reveal reveal-delay-${doctorIndex + 1}`}
              key={doctor.name}
              data-testid={`card-doctor-${doctorIndex + 1}`}
            >
              <div className="doctor-image">
                <img
                  src={doctor.image}
                  alt={doctor.alt}
                  loading="lazy"
                  data-testid={`image-doctor-${doctorIndex + 1}`}
                />
              </div>
              <div className="doctor-info">
                <span className="doctor-specialty doctor-staged" style={{ transitionDelay: '0ms' }} data-testid={`text-doctor-specialty-${doctorIndex + 1}`}>
                  {doctor.specialty}
                </span>
                <h3 className="doctor-name doctor-staged" style={{ transitionDelay: '120ms' }} data-testid={`text-doctor-name-${doctorIndex + 1}`}>
                  {doctor.name}
                </h3>
                <p className="doctor-degree doctor-staged" style={{ transitionDelay: '240ms' }} data-testid={`text-doctor-degree-${doctorIndex + 1}`}>
                  {doctor.degree}
                </p>
                <p className="doctor-reg doctor-staged" style={{ transitionDelay: '360ms' }} data-testid={`text-doctor-registration-${doctorIndex + 1}`}>
                  {doctor.registration}
                </p>
                <hr className="doctor-divider doctor-staged" style={{ transitionDelay: '480ms' }} />
                <p className="doctor-focus-heading doctor-staged" style={{ transitionDelay: '600ms' }}>Areas of care</p>
                <ul className="focus-list">
                  {doctor.areas.map((area, areaIndex) => (
                    <li
                      key={area}
                      className="doctor-focus-item"
                      style={{ transitionDelay: `${720 + areaIndex * 120}ms` }}
                      data-testid={`text-doctor-focus-${doctorIndex + 1}-${areaIndex + 1}`}
                    >
                      <Check size={17} aria-hidden="true" />
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
                <div className="doctor-actions doctor-staged" style={{ transitionDelay: '1200ms' }}>
                  <a
                    className="button button-primary"
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Book with ${doctor.bookingName}`}
                    data-testid={`button-book-doctor-${doctorIndex + 1}`}
                  >
                    <CalendarDays size={17} />
                    Book with {doctor.bookingName}
                  </a>
                  <a className="doctor-call-link" href={`tel:${phone}`} data-testid={`link-call-doctor-${doctorIndex + 1}`}>
                    <PhoneCall size={15} aria-hidden="true" />
                    Call +91 88192 24466
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
