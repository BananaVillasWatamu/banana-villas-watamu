// Amenities are a fixed part of the property rather than something worth
// editing from the dashboard, so they stay here.
const AMENITIES = [
  'Swimming Pool',
  'WiFi',
  'Air Conditioning',
  'Kitchen',
  'Parking',
  'BBQ',
];

const SCHEMA_DEFAULTS = {
  business_name: 'Banana Villas Watamu',
  business_description:
    'Luxury 3-bedroom villa with oasis pool, beach access, and tropical surroundings in Watamu, Kenya.',
  telephone: '+254715257111',
  email: 'contact@bananavillaswatamu.com',
  street_address: 'Plot 442 Turtle Bay Road',
  address_locality: 'Watamu',
  address_region: 'Kilifi County',
  address_country: 'KE',
  latitude: -3.364829,
  longitude: 39.998538,
  maps_url: 'https://maps.app.goo.gl/CpwYLHs1epv3yJTHA',
  number_of_rooms: 3,
};

const SITE_URL = 'https://www.bananavillaswatamu.com';

function pick(settings, key) {
  const value = settings?.[key];
  if (value === null || value === undefined || value === '') return SCHEMA_DEFAULTS[key];
  return value;
}

function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

// Builds the LodgingBusiness block Google reads. Anything the owner has left
// blank in the SEO tab falls back to the values the template used to carry.
function buildBusinessSchema(settings, ogImage) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: pick(settings, 'business_name'),
    description: pick(settings, 'business_description'),
    url: SITE_URL,
    telephone: pick(settings, 'telephone'),
    email: pick(settings, 'email'),
    address: {
      '@type': 'PostalAddress',
      streetAddress: pick(settings, 'street_address'),
      addressLocality: pick(settings, 'address_locality'),
      addressRegion: pick(settings, 'address_region'),
      addressCountry: pick(settings, 'address_country'),
    },
    numberOfRooms: num(pick(settings, 'number_of_rooms')),
    amenityFeature: AMENITIES.map((name) => ({
      '@type': 'LocationFeatureSpecification',
      name,
      value: true,
    })),
    image: ogImage,
  };

  const priceRange = settings?.price_range;
  if (priceRange) schema.priceRange = priceRange;

  const lat = num(pick(settings, 'latitude'));
  const lng = num(pick(settings, 'longitude'));
  if (lat !== undefined && lng !== undefined) {
    schema.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
  }

  const mapsUrl = pick(settings, 'maps_url');
  if (mapsUrl) schema.hasMap = mapsUrl;

  // Escaped so a stray "</script>" in any of these fields can't break out of
  // the script tag it's being embedded in.
  return JSON.stringify(schema, null, 2).replace(/</g, '\\u003c');
}

module.exports = { buildBusinessSchema };
