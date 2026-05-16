// Source of truth for country + region dropdowns across the CRM.
// COUNTRIES_BY_REGION is the structured map (used for region filters and
// regulatory grouping). ALL_COUNTRIES is the flat, alphabetically-sorted
// list used by the country picker on Accounts / Clients / Compliance pages.
//
// Includes every UN-recognized state plus widely-used territories
// (Hong Kong, Macau, Taiwan, Palestine, Western Sahara, etc.) so search
// matches whichever spelling the user types.

export const REGIONS = [
  "Americas",
  "Europe",
  "Africa",
  "South Asia",
  "East Asia & Pacific",
  "Middle East",
];

export const COUNTRIES_BY_REGION = {
  "Americas": [
    "Antigua and Barbuda", "Argentina", "Bahamas", "Barbados", "Belize",
    "Bolivia", "Brazil", "Canada", "Chile", "Colombia", "Costa Rica",
    "Cuba", "Dominica", "Dominican Republic", "Ecuador", "El Salvador",
    "Grenada", "Guatemala", "Guyana", "Haiti", "Honduras", "Jamaica",
    "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru",
    "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
    "Suriname", "Trinidad and Tobago", "United States", "Uruguay", "Venezuela",
  ],
  "Europe": [
    "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belarus",
    "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Denmark", "Estonia", "Finland", "France", "Georgia",
    "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", "Kosovo",
    "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova",
    "Monaco", "Montenegro", "Netherlands", "North Macedonia", "Norway",
    "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia",
    "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine",
    "United Kingdom", "Vatican City",
  ],
  "Africa": [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
    "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
    "Congo", "Democratic Republic of the Congo", "Djibouti", "Egypt",
    "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia",
    "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast", "Kenya", "Lesotho",
    "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
    "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
    "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
    "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo",
    "Tunisia", "Uganda", "Western Sahara", "Zambia", "Zimbabwe",
  ],
  "South Asia": [
    "Afghanistan", "Bangladesh", "Bhutan", "India", "Maldives", "Nepal",
    "Pakistan", "Sri Lanka",
  ],
  "East Asia & Pacific": [
    "Australia", "Brunei", "Cambodia", "China", "Fiji", "Hong Kong",
    "Indonesia", "Japan", "Kiribati", "Laos", "Macau", "Malaysia",
    "Marshall Islands", "Micronesia", "Mongolia", "Myanmar", "Nauru",
    "New Zealand", "North Korea", "Palau", "Papua New Guinea", "Philippines",
    "Samoa", "Singapore", "Solomon Islands", "South Korea", "Taiwan",
    "Thailand", "Timor-Leste", "Tonga", "Tuvalu", "Vanuatu", "Vietnam",
  ],
  "Middle East": [
    "Bahrain", "Iran", "Iraq", "Israel", "Jordan", "Kazakhstan", "Kuwait",
    "Kyrgyzstan", "Lebanon", "Oman", "Palestine", "Qatar", "Saudi Arabia",
    "Syria", "Tajikistan", "Turkey", "Turkmenistan", "United Arab Emirates",
    "Uzbekistan", "Yemen",
  ],
};

// Flat alphabetical list used by the country dropdown.
export const ALL_COUNTRIES = Object.values(COUNTRIES_BY_REGION).flat().sort();

// Reverse-lookup helper: given a country name (case-insensitive), return the
// region it belongs to. Returns null for free-text countries not in our map.
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
