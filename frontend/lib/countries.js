export const REGIONS = [
  "Americas",
  "Europe",
  "Africa",
  "South Asia",
  "East Asia & Pacific",
  "Middle East",
];

export const COUNTRIES_BY_REGION = {
  "Americas": ["USA", "Canada", "Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru", "Ecuador", "Venezuela", "Uruguay", "Paraguay", "Bolivia", "Costa Rica", "Panama", "Guatemala", "Honduras", "Dominican Republic", "Cuba"],
  "Europe": ["Germany", "France", "UK", "Spain", "Italy", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland", "Poland", "Portugal", "Greece", "Ireland", "Czech Republic", "Romania", "Hungary", "Ukraine", "Russia", "Serbia", "Croatia", "Bulgaria", "Slovakia"],
  "Africa": ["Kenya", "Nigeria", "South Africa", "Ghana", "Tanzania", "Ethiopia", "Uganda", "Mozambique", "Senegal", "Cameroon", "Ivory Coast", "Zimbabwe", "Zambia", "Rwanda", "Mali", "Angola", "Madagascar", "Morocco", "Tunisia", "Algeria", "Sudan", "Congo", "Malawi", "Burkina Faso"],
  "South Asia": ["India", "Bangladesh", "Sri Lanka", "Nepal", "Pakistan", "Bhutan", "Maldives", "Afghanistan"],
  "East Asia & Pacific": ["Vietnam", "China", "Japan", "Australia", "Thailand", "Indonesia", "Philippines", "Malaysia", "South Korea", "Taiwan", "Myanmar", "Cambodia", "Laos", "New Zealand", "Singapore", "Hong Kong"],
  "Middle East": ["UAE", "Saudi Arabia", "Turkey", "Israel", "Egypt", "Qatar", "Kuwait", "Oman", "Bahrain", "Jordan", "Lebanon", "Iraq", "Iran", "Yemen"],
};

// Flat list of all countries
export const ALL_COUNTRIES = Object.values(COUNTRIES_BY_REGION).flat().sort();

// Get region for a country
export function getRegionForCountry(country) {
  if (!country) return null;
  const countryLower = country.toLowerCase().trim();
  for (const [region, countries] of Object.entries(COUNTRIES_BY_REGION)) {
    if (countries.some((c) => c.toLowerCase() === countryLower)) {
      return region;
    }
  }
  return null;
}
