// Titles and descriptions for every page. Used by the app in the browser and
// by the build step that writes a ready-made HTML file per public page.

export const SITE_URL = 'https://sri-siri-hospital-5nct-pink.vercel.app';

export type PageMeta = { title: string; description: string; path: string; indexable: boolean };

export const PAGE_META = {
  home: {
    path: '/',
    title: 'Sri Siri Hospital, Tanuku · Neuro-psychiatry, internal medicine and 24-hour casualty',
    description: 'Sri Siri Hospital on Velpur Road, Tanuku, Andhra Pradesh: internal medicine, neuro-psychiatry, stroke and diabetes care, with a 24-hour casualty. Call 88192 24466.',
    indexable: true,
  },
  about: {
    path: '/about',
    title: 'About · Sri Siri Hospital, Tanuku',
    description: 'Sri Siri Hospital on Velpur Road, Tanuku: internal medicine, neuro-psychiatry, stroke and diabetes care, with two specialist doctors and a 24-hour casualty.',
    indexable: true,
  },
  'why-choose': {
    path: '/why-choose',
    title: 'Why choose Sri Siri Hospital, Tanuku',
    description: 'Two specialist doctors, a laboratory, 24-hour casualty and video consultations at Sri Siri Hospital, Velpur Road, Tanuku. Rated 5.0 from 31 Google reviews.',
    indexable: true,
  },
  services: {
    path: '/services',
    title: 'Services · Sri Siri Hospital, Tanuku',
    description: 'Neurology and stroke care, diabetes and endocrine care, internal medicine, psychiatry, migraine treatment and 24-hour casualty at Sri Siri Hospital, Tanuku.',
    indexable: true,
  },
  doctors: {
    path: '/doctors',
    title: 'Doctors · Sri Siri Hospital, Tanuku · Dr. Sritha and Dr. Jayavardhan Reddy Bijjam',
    description: 'Dr. Sritha, MBBS, MD (Neuro-Psychiatry), and Dr. Jayavardhan Reddy Bijjam, MBBS, MD (Physician), at Sri Siri Hospital, Velpur Road, Tanuku.',
    indexable: true,
  },
  gallery: {
    path: '/gallery',
    title: 'Hospital photos · Sri Siri Hospital, Tanuku',
    description: 'Photos of Sri Siri Hospital, Tanuku: the building, reception, consultation rooms, laboratory and waiting area.',
    indexable: true,
  },
  videos: {
    path: '/videos',
    title: 'Health videos · Sri Siri Hospital, Tanuku',
    description: 'Health videos from the doctors of Sri Siri Hospital, Tanuku.',
    indexable: true,
  },
  reviews: {
    path: '/reviews',
    title: 'Reviews · Sri Siri Hospital, Tanuku',
    description: 'Sri Siri Hospital, Tanuku is rated 5.0 from 31 Google reviews. Read what patients say.',
    indexable: true,
  },
  faq: {
    path: '/faq',
    title: 'Frequently asked questions · Sri Siri Hospital, Tanuku',
    description: 'Answers about appointments, video consultations, timings, location and casualty at Sri Siri Hospital, Tanuku.',
    indexable: true,
  },
  contact: {
    path: '/contact',
    title: 'Contact and directions · Sri Siri Hospital, Tanuku',
    description: 'Address, phone, consultation hours and directions for Sri Siri Hospital, Velpur Road, Tanuku. Casualty open 24 hours.',
    indexable: true,
  },
  consult: {
    path: '/consult',
    title: 'Video consultation with Dr. Sritha · Sri Siri Hospital, Tanuku',
    description: 'Book a Zoom video consultation with Dr. Sritha at Sri Siri Hospital, Tanuku. Pick a time and send your request on WhatsApp.',
    indexable: true,
  },
  track: { path: '/a/', title: 'Your appointment · Sri Siri Hospital', description: 'Your video consultation with Sri Siri Hospital.', indexable: false },
  feedback: { path: '/f/', title: 'Feedback · Sri Siri Hospital', description: 'Tell us how your consultation went.', indexable: false },
  dashboard: { path: '/dashboard', title: 'Consultations dashboard · Sri Siri Hospital', description: 'Staff dashboard.', indexable: false },
} as const satisfies Record<string, PageMeta>;

export type MetaKey = keyof typeof PAGE_META;

const ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: 'DRNO.28-6-15, Sri Matha Tower, Velpur Road',
  addressLocality: 'Tanuku',
  addressRegion: 'Andhra Pradesh',
  postalCode: '534211',
  addressCountry: 'IN',
};

const HOSPITAL = {
  '@type': 'Hospital',
  '@id': `${SITE_URL}/#hospital`,
  name: 'Sri Siri Hospital',
  alternateName: 'బిజ్జం వారి శ్రీ సిరి హాస్పిటల్',
  url: `${SITE_URL}/`,
  telephone: '+91-88192-24466',
  image: `${SITE_URL}/assets/hero-building.jpg`,
  logo: `${SITE_URL}/assets/sri-siri-hospital-logo.png`,
  address: ADDRESS,
  geo: { '@type': 'GeoCoordinates', latitude: 16.7536433, longitude: 81.6862207 },
  medicalSpecialty: ['Psychiatric', 'Neurologic', 'Endocrine', 'Emergency'],
  openingHoursSpecification: [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:30', closes: '14:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '17:30', closes: '20:30' },
  ],
  sameAs: ['https://www.instagram.com/sri_siri_hospital/', 'https://www.youtube.com/channel/UCoZrqTftw_z7tXwagHrw2oA'],
};

const DOCTORS = [
  {
    '@type': 'Physician',
    '@id': `${SITE_URL}/doctors#doctor-sritha`,
    name: 'Dr. Sritha',
    medicalSpecialty: ['Psychiatric', 'Neurologic'],
    description: 'MBBS, MD (Neuro-Psychiatry). APMC Reg. No. 85598.',
    url: `${SITE_URL}/doctors#doctor-sritha`,
    image: `${SITE_URL}/assets/doctor-sritha.webp`,
    telephone: '+91-88192-24466',
    address: ADDRESS,
    hospitalAffiliation: { '@id': `${SITE_URL}/#hospital` },
  },
  {
    '@type': 'Physician',
    '@id': `${SITE_URL}/doctors#doctor-jayavardhan`,
    name: 'Dr. Jayavardhan Reddy Bijjam',
    medicalSpecialty: ['Endocrine', 'Cardiovascular'],
    description: 'MBBS, MD (Physician). APMC Reg. No. 77460. General medicine, diabetes and hypertension.',
    url: `${SITE_URL}/doctors#doctor-jayavardhan`,
    image: `${SITE_URL}/assets/doctor-jayavardhan-reddy.webp`,
    telephone: '+91-88192-24466',
    address: ADDRESS,
    hospitalAffiliation: { '@id': `${SITE_URL}/#hospital` },
  },
];

// Google's structured data for a page: the hospital everywhere, and the
// doctors on the pages that describe them.
export function structuredData(key: MetaKey) {
  const graph: object[] = [HOSPITAL];
  if (['home', 'doctors', 'about', 'why-choose', 'consult'].includes(key)) graph.push(...DOCTORS);
  return { '@context': 'https://schema.org', '@graph': graph };
}
