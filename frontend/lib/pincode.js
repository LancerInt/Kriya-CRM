// Pincode → city/state lookup helpers used by the New / Edit Account forms.
//
// We hit two public APIs (no key, no signup) depending on country:
//   • India  → api.postalpincode.in   (granular per-locality results)
//   • Other  → api.zippopotam.us      (covers ~60 countries)
//
// Both return an array of `{ city, state, district? }` objects. Callers
// render the array in a dropdown so the user can pick when several
// localities share the same pincode (very common in India).

// ISO 3166-1 alpha-2 codes for every country name in lib/countries.js.
// The map is intentionally exhaustive so spelling drift between the
// dropdown label and the lookup call never silently breaks the feature.
export const COUNTRY_CODES = {
  // Americas
  "Antigua and Barbuda": "AG", "Argentina": "AR", "Bahamas": "BS",
  "Barbados": "BB", "Belize": "BZ", "Bolivia": "BO", "Brazil": "BR",
  "Canada": "CA", "Chile": "CL", "Colombia": "CO", "Costa Rica": "CR",
  "Cuba": "CU", "Dominica": "DM", "Dominican Republic": "DO",
  "Ecuador": "EC", "El Salvador": "SV", "Grenada": "GD", "Guatemala": "GT",
  "Guyana": "GY", "Haiti": "HT", "Honduras": "HN", "Jamaica": "JM",
  "Mexico": "MX", "Nicaragua": "NI", "Panama": "PA", "Paraguay": "PY",
  "Peru": "PE", "Saint Kitts and Nevis": "KN", "Saint Lucia": "LC",
  "Saint Vincent and the Grenadines": "VC", "Suriname": "SR",
  "Trinidad and Tobago": "TT", "United States": "US", "Uruguay": "UY",
  "Venezuela": "VE",
  // Europe
  "Albania": "AL", "Andorra": "AD", "Armenia": "AM", "Austria": "AT",
  "Azerbaijan": "AZ", "Belarus": "BY", "Belgium": "BE",
  "Bosnia and Herzegovina": "BA", "Bulgaria": "BG", "Croatia": "HR",
  "Cyprus": "CY", "Czech Republic": "CZ", "Denmark": "DK", "Estonia": "EE",
  "Finland": "FI", "France": "FR", "Georgia": "GE", "Germany": "DE",
  "Greece": "GR", "Hungary": "HU", "Iceland": "IS", "Ireland": "IE",
  "Italy": "IT", "Kosovo": "XK", "Latvia": "LV", "Liechtenstein": "LI",
  "Lithuania": "LT", "Luxembourg": "LU", "Malta": "MT", "Moldova": "MD",
  "Monaco": "MC", "Montenegro": "ME", "Netherlands": "NL",
  "North Macedonia": "MK", "Norway": "NO", "Poland": "PL", "Portugal": "PT",
  "Romania": "RO", "Russia": "RU", "San Marino": "SM", "Serbia": "RS",
  "Slovakia": "SK", "Slovenia": "SI", "Spain": "ES", "Sweden": "SE",
  "Switzerland": "CH", "Ukraine": "UA", "United Kingdom": "GB",
  "Vatican City": "VA",
  // Africa
  "Algeria": "DZ", "Angola": "AO", "Benin": "BJ", "Botswana": "BW",
  "Burkina Faso": "BF", "Burundi": "BI", "Cabo Verde": "CV", "Cameroon": "CM",
  "Central African Republic": "CF", "Chad": "TD", "Comoros": "KM",
  "Congo": "CG", "Democratic Republic of the Congo": "CD", "Djibouti": "DJ",
  "Egypt": "EG", "Equatorial Guinea": "GQ", "Eritrea": "ER", "Eswatini": "SZ",
  "Ethiopia": "ET", "Gabon": "GA", "Gambia": "GM", "Ghana": "GH",
  "Guinea": "GN", "Guinea-Bissau": "GW", "Ivory Coast": "CI", "Kenya": "KE",
  "Lesotho": "LS", "Liberia": "LR", "Libya": "LY", "Madagascar": "MG",
  "Malawi": "MW", "Mali": "ML", "Mauritania": "MR", "Mauritius": "MU",
  "Morocco": "MA", "Mozambique": "MZ", "Namibia": "NA", "Niger": "NE",
  "Nigeria": "NG", "Rwanda": "RW", "Sao Tome and Principe": "ST",
  "Senegal": "SN", "Seychelles": "SC", "Sierra Leone": "SL", "Somalia": "SO",
  "South Africa": "ZA", "South Sudan": "SS", "Sudan": "SD", "Tanzania": "TZ",
  "Togo": "TG", "Tunisia": "TN", "Uganda": "UG", "Western Sahara": "EH",
  "Zambia": "ZM", "Zimbabwe": "ZW",
  // South Asia
  "Afghanistan": "AF", "Bangladesh": "BD", "Bhutan": "BT", "India": "IN",
  "Maldives": "MV", "Nepal": "NP", "Pakistan": "PK", "Sri Lanka": "LK",
  // East Asia & Pacific
  "Australia": "AU", "Brunei": "BN", "Cambodia": "KH", "China": "CN",
  "Fiji": "FJ", "Hong Kong": "HK", "Indonesia": "ID", "Japan": "JP",
  "Kiribati": "KI", "Laos": "LA", "Macau": "MO", "Malaysia": "MY",
  "Marshall Islands": "MH", "Micronesia": "FM", "Mongolia": "MN",
  "Myanmar": "MM", "Nauru": "NR", "New Zealand": "NZ", "North Korea": "KP",
  "Palau": "PW", "Papua New Guinea": "PG", "Philippines": "PH", "Samoa": "WS",
  "Singapore": "SG", "Solomon Islands": "SB", "South Korea": "KR",
  "Taiwan": "TW", "Thailand": "TH", "Timor-Leste": "TL", "Tonga": "TO",
  "Tuvalu": "TV", "Vanuatu": "VU", "Vietnam": "VN",
  // Middle East / Central Asia
  "Bahrain": "BH", "Iran": "IR", "Iraq": "IQ", "Israel": "IL", "Jordan": "JO",
  "Kazakhstan": "KZ", "Kuwait": "KW", "Kyrgyzstan": "KG", "Lebanon": "LB",
  "Oman": "OM", "Palestine": "PS", "Qatar": "QA", "Saudi Arabia": "SA",
  "Syria": "SY", "Tajikistan": "TJ", "Turkey": "TR", "Turkmenistan": "TM",
  "United Arab Emirates": "AE", "Uzbekistan": "UZ", "Yemen": "YE",
};

export function getCountryCode(countryName) {
  if (!countryName) return null;
  return COUNTRY_CODES[countryName] || null;
}

/**
 * Look up the city/state for a pincode.
 *
 * @param {string} pincode       The postal code as typed by the user.
 * @param {string} countryName   Full country name from lib/countries.js.
 * @returns {Promise<Array<{city:string,state:string,district?:string}>>}
 *          Empty array on failure / unsupported country.
 */
export async function lookupPincode(pincode, countryName) {
  const code = getCountryCode(countryName);
  const trimmed = (pincode || "").toString().trim();
  if (!code || !trimmed) return [];

  // India: api.postalpincode.in returns granular post-office data and is the
  // canonical source for Indian PIN codes. Use it whenever country is India
  // and the input matches a 6-digit pin (the spec). Falls through to the
  // global API for partial inputs.
  if (code === "IN" && /^\d{6}$/.test(trimmed)) {
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${trimmed}`);
      if (res.ok) {
        const data = await res.json();
        const rec = Array.isArray(data) ? data[0] : null;
        if (rec && rec.Status === "Success" && Array.isArray(rec.PostOffice)) {
          // De-duplicate by district so the dropdown isn't cluttered with
          // every individual post-office. Keep the first PO of each district
          // as the representative entry.
          const seen = new Set();
          const rows = [];
          for (const po of rec.PostOffice) {
            const key = `${po.District}|${po.State}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({
              city: po.District || po.Name,
              state: po.State || "",
              district: po.District || "",
            });
          }
          return rows;
        }
      }
    } catch {
      // Fall through to the global lookup.
    }
  }

  // Global fallback. Note: zippopotam.us supports a fixed set of countries
  // (US, CA, GB, DE, FR, ES, IT, NL, AU, BR, JP, MX, IN, etc.). Failures
  // simply return [] so the form behaves as a plain text input.
  try {
    const url = `https://api.zippopotam.us/${code.toLowerCase()}/${encodeURIComponent(trimmed)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.places || []).map((p) => ({
      city: p["place name"] || "",
      state: p.state || "",
    }));
  } catch {
    return [];
  }
}
