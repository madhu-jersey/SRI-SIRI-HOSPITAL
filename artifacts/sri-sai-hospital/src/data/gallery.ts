export type GalleryCategory = 'building' | 'reception' | 'consultation' | 'waiting' | 'laboratory';

export type GalleryItem = {
  id: string;
  src: string | null;
  alt: string;
  caption: string;
  category: GalleryCategory;
};

export const galleryItems: GalleryItem[] = [
  { id: 'building', src: null, alt: 'Sri Siri Hospital building, Tanuku', caption: 'Building', category: 'building' },
  { id: 'reception', src: null, alt: 'Reception at Sri Siri Hospital', caption: 'Reception', category: 'reception' },
  { id: 'consultation', src: null, alt: 'Consultation room at Sri Siri Hospital', caption: 'Consultation room', category: 'consultation' },
  { id: 'waiting', src: null, alt: 'Waiting area at Sri Siri Hospital', caption: 'Waiting area', category: 'waiting' },
  { id: 'laboratory', src: null, alt: 'Laboratory at Sri Siri Hospital', caption: 'Laboratory', category: 'laboratory' },
];
