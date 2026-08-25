/*
 * EPW Insights
 * Author: Ehsan Rostami (https://github.com/ehsan-rostami)
 * Copyright (c) 2025-2026 Ehsan Rostami
 * Released under the GNU Affero General Public License v3.0 or later.
 */

import state from '../state.js';

export const countryCodeMap = {
  "AFG": "af", "ALB": "al", "DZA": "dz", "ASM": "as", "AND": "ad", "AGO": "ao", "AIA": "ai", "ATA": "aq",
  "ATG": "ag", "ARG": "ar", "ARM": "am", "ABW": "aw", "AUS": "au", "AUT": "at", "AZE": "az", "BHS": "bs",
  "BHR": "bh", "BGD": "bd", "BRB": "bb", "BLR": "by", "BEL": "be", "BLZ": "bz", "BEN": "bj", "BMU": "bm",
  "BTN": "bt", "BOL": "bo", "BES": "bq", "BIH": "ba", "BWA": "bw", "BVT": "bv", "BRA": "br", "IOT": "io",
  "BRN": "bn", "BGR": "bg", "BFA": "bf", "BDI": "bi", "CPV": "cv", "KHM": "kh", "CMR": "cm", "CAN": "ca",
  "CYM": "ky", "CAF": "cf", "TCD": "td", "CHL": "cl", "CHN": "cn", "CXR": "cx", "CCK": "cc", "COL": "co",
  "COM": "km", "COD": "cd", "COG": "cg", "COK": "ck", "CRI": "cr", "HRV": "hr", "CUB": "cu", "CUW": "cw",
  "CYP": "cy", "CZE": "cz", "CIV": "ci", "DNK": "dk", "DJI": "dj", "DMA": "dm", "DOM": "do", "ECU": "ec",
  "EGY": "eg", "SLV": "sv", "GNQ": "gq", "ERI": "er", "EST": "ee", "SWZ": "sz", "ETH": "et", "FLK": "fk",
  "FRO": "fo", "FJI": "fj", "FIN": "fi", "FRA": "fr", "GUF": "gf", "PYF": "pf", "ATF": "tf", "GAB": "ga",
  "GMB": "gm", "GEO": "ge", "DEU": "de", "GHA": "gh", "GIB": "gi", "GRC": "gr", "GRL": "gl", "GRD": "gd",
  "GLP": "gp", "GUM": "gu", "GTM": "gt", "GGY": "gg", "GIN": "gn", "GNB": "gw", "GUY": "gy", "HTI": "ht",
  "HMD": "hm", "VAT": "va", "HND": "hn", "HKG": "hk", "HUN": "hu", "ISL": "is", "IND": "in", "IDN": "id",
  "IRN": "ir", "IRQ": "iq", "IRL": "ie", "IMN": "im", "ISR": "il", "ITA": "it", "JAM": "jm", "JPN": "jp",
  "JEY": "je", "JOR": "jo", "KAZ": "kz", "KEN": "ke", "KIR": "ki", "PRK": "kp", "KOR": "kr", "KWT": "kw",
  "KGZ": "kg", "LAO": "la", "LVA": "lv", "LBN": "lb", "LSO": "ls", "LBR": "lr", "LBY": "ly", "LIE": "li",
  "LTU": "lt", "LUX": "lu", "MAC": "mo", "MDG": "mg", "MWI": "mw", "MYS": "my", "MDV": "mv", "MLI": "ml",
  "MLT": "mt", "MHL": "mh", "MTQ": "mq", "MRT": "mr", "MUS": "mu", "MYT": "yt", "MEX": "mx", "FSM": "fm",
  "MDA": "md", "MCO": "mc", "MNG": "mn", "MNE": "me", "MSR": "ms", "MAR": "ma", "MOZ": "mz", "MMR": "mm",
  "NAM": "na", "NRU": "nr", "NPL": "np", "NLD": "nl", "NCL": "nc", "NZL": "nz", "NIC": "ni", "NER": "ne",
  "NGA": "ng", "NIU": "nu", "NFK": "nf", "MNP": "mp", "NOR": "no", "OMN": "om", "PAK": "pk", "PLW": "pw",
  "PSE": "ps", "PAN": "pa", "PNG": "pg", "PRY": "py", "PER": "pe", "PHL": "ph", "PCN": "pn", "POL": "pl",
  "PRT": "pt", "PRI": "pr", "QAT": "qa", "MKD": "mk", "ROU": "ro", "RUS": "ru", "RWA": "rw", "REU": "re",
  "BLM": "bl", "SHN": "sh", "KNA": "kn", "LCA": "lc", "MAF": "mf", "SPM": "pm", "VCT": "vc", "WSM": "ws",
  "SMR": "sm", "STP": "st", "SAU": "sa", "SEN": "sn", "SRB": "rs", "SYC": "sc", "SLE": "sl", "SGP": "sg",
  "SXM": "sx", "SVK": "sk", "SVN": "si", "SLB": "sb", "SOM": "so", "ZAF": "za", "SGS": "gs", "SSD": "ss",
  "ESP": "es", "LKA": "lk", "SDN": "sd", "SUR": "sr", "SJM": "sj", "SWE": "se", "CHE": "ch", "SYR": "sy",
  "TWN": "tw", "TJK": "tj", "TZA": "tz", "THA": "th", "TLS": "tl", "TGO": "tg", "TKL": "tk", "TON": "to",
  "TTO": "tt", "TUN": "tn", "TUR": "tr", "TKM": "tm", "TCA": "tc", "TUV": "tv", "UGA": "ug", "UKR": "ua",
  "ARE": "ae", "GBR": "gb", "UMI": "um", "USA": "us", "URY": "uy", "UZB": "uz", "VUT": "vu", "VEN": "ve",
  "VNM": "vn", "VGB": "vg", "VIR": "vi", "WLF": "wf", "ESH": "eh", "YEM": "ye", "ZMB": "zm", "ZWE": "zw",
  "ALA": "ax"
};

export const countryNameMap = {
  "AFG": "Afghanistan", "ALB": "Albania", "DZA": "Algeria", "ASM": "American Samoa", "AND": "Andorra", "AGO": "Angola",
  "AIA": "Anguilla", "ATA": "Antarctica", "ATG": "Antigua and Barbuda", "ARG": "Argentina", "ARM": "Armenia", "ABW": "Aruba",
  "AUS": "Australia", "AUT": "Austria", "AZE": "Azerbaijan", "BHS": "Bahamas", "BHR": "Bahrain", "BGD": "Bangladesh",
  "BRB": "Barbados", "BLR": "Belarus", "BEL": "Belgium", "BLZ": "Belize", "BEN": "Benin", "BMU": "Bermuda", "BTN": "Bhutan",
  "BOL": "Bolivia", "BIH": "Bosnia and Herzegovina", "BWA": "Botswana", "BRA": "Brazil", "BRN": "Brunei Darussalam",
  "BGR": "Bulgaria", "BFA": "Burkina Faso", "BDI": "Burundi", "CPV": "Cabo Verde", "KHM": "Cambodia", "CMR": "Cameroon",
  "CAN": "Canada", "CYM": "Cayman Islands", "CAF": "Central African Republic", "TCD": "Chad", "CHL": "Chile", "CHN": "China",
  "COL": "Colombia", "COM": "Comoros", "COG": "Congo", "COD": "Congo (DRC)", "COK": "Cook Islands", "CRI": "Costa Rica",
  "CIV": "Côte d'Ivoire", "HRV": "Croatia", "CUB": "Cuba", "CUW": "Curaçao", "CYP": "Cyprus", "CZE": "Czechia",
  "DNK": "Denmark", "DJI": "Djibouti", "DMA": "Dominica", "DOM": "Dominican Republic", "ECU": "Ecuador", "EGY": "Egypt",
  "SLV": "El Salvador", "GNQ": "Equatorial Guinea", "ERI": "Eritrea", "EST": "Estonia", "SWZ": "Eswatini", "ETH": "Ethiopia",
  "FLK": "Falkland Islands", "FRO": "Faroe Islands", "FJI": "Fiji", "FIN": "Finland", "FRA": "France", "GUF": "French Guiana",
  "PYF": "French Polynesia", "GAB": "Gabon", "GMB": "Gambia", "GEO": "Georgia", "DEU": "Germany", "GHA": "Ghana",
  "GIB": "Gibraltar", "GRC": "Greece", "GRL": "Greenland", "GRD": "Grenada", "GLP": "Guadeloupe", "GUM": "Guam",
  "GTM": "Guatemala", "GGY": "Guernsey", "GIN": "Guinea", "GNB": "Guinea-Bissau", "GUY": "Guyana", "HTI": "Haiti",
  "HND": "Honduras", "HKG": "Hong Kong", "HUN": "Hungary", "ISL": "Iceland", "IND": "India", "IDN": "Indonesia",
  "IRN": "Iran", "IRQ": "Iraq", "IRL": "Ireland", "IMN": "Isle of Man", "ISR": "Israel", "ITA": "Italy", "JAM": "Jamaica",
  "JPN": "Japan", "JEY": "Jersey", "JOR": "Jordan", "KAZ": "Kazakhstan", "KEN": "Kenya", "KIR": "Kiribati",
  "PRK": "North Korea", "KOR": "South Korea", "KWT": "Kuwait", "KGZ": "Kyrgyzstan", "LAO": "Laos", "LVA": "Latvia",
  "LBN": "Lebanon", "LSO": "Lesotho", "LBR": "Liberia", "LBY": "Libya", "LIE": "Liechtenstein", "LTU": "Lithuania",
  "LUX": "Luxembourg", "MAC": "Macao", "MKD": "North Macedonia", "MDG": "Madagascar", "MWI": "Malawi", "MYS": "Malaysia",
  "MDV": "Maldives", "MLI": "Mali", "MLT": "Malta", "MHL": "Marshall Islands", "MTQ": "Martinique", "MRT": "Mauritania",
  "MUS": "Mauritius", "MYT": "Mayotte", "MEX": "Mexico", "FSM": "Micronesia", "MDA": "Moldova", "MCO": "Monaco",
  "MNG": "Mongolia", "MNE": "Montenegro", "MSR": "Montserrat", "MAR": "Morocco", "MOZ": "Mozambique", "MMR": "Myanmar",
  "NAM": "Namibia", "NRU": "Nauru", "NPL": "Nepal", "NLD": "Netherlands", "NCL": "New Caledonia", "NZL": "New Zealand",
  "NIC": "Nicaragua", "NER": "Niger", "NGA": "Nigeria", "NIU": "Niue", "NFK": "Norfolk Island", "MNP": "Northern Mariana Islands",
  "NOR": "Norway", "OMN": "Oman", "PAK": "Pakistan", "PLW": "Palau", "PSE": "Palestine", "PAN": "Panama",
  "PNG": "Papua New Guinea", "PRY": "Paraguay", "PER": "Peru", "PHL": "Philippines", "PCN": "Pitcairn", "POL": "Poland",
  "PRT": "Portugal", "PRI": "Puerto Rico", "QAT": "Qatar", "REU": "Réunion", "ROU": "Romania", "RUS": "Russia",
  "RWA": "Rwanda", "WSM": "Samoa", "SMR": "San Marino", "STP": "Sao Tome and Principe", "SAU": "Saudi Arabia",
  "SEN": "Senegal", "SRB": "Serbia", "SYC": "Seychelles", "SLE": "Sierra Leone", "SGP": "Singapore", "SVK": "Slovakia",
  "SVN": "Slovenia", "SLB": "Solomon Islands", "SOM": "Somalia", "ZAF": "South Africa", "ESP": "Spain", "LKA": "Sri Lanka",
  "SDN": "Sudan", "SUR": "Suriname", "SWE": "Sweden", "CHE": "Switzerland", "SYR": "Syria", "TWN": "Taiwan",
  "TJK": "Tajikistan", "TZA": "Tanzania", "THA": "Thailand", "TLS": "Timor-Leste", "TGO": "Togo", "TKL": "Tokelau",
  "TON": "Tonga", "TTO": "Trinidad and Tobago", "TUN": "Tunisia", "TUR": "Turkey", "TKM": "Turkmenistan",
  "TCA": "Turks and Caicos Islands", "TUV": "Tuvalu", "UGA": "Uganda", "UKR": "Ukraine", "ARE": "United Arab Emirates",
  "GBR": "United Kingdom", "USA": "United States", "URY": "Uruguay", "UZB": "Uzbekistan", "VUT": "Vanuatu",
  "VAT": "Vatican City", "VEN": "Venezuela", "VNM": "Viet Nam", "YEM": "Yemen", "ZMB": "Zambia", "ZWE": "Zimbabwe"
};

export function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

export function formatStationDetail(rawCity, fileType = 'primary') {
  if (state.customLocationNames && state.customLocationNames[fileType]?.station !== null && state.customLocationNames[fileType]?.station !== undefined) {
    return state.customLocationNames[fileType].station;
  }

  if (!rawCity) return '';

  const separatorRegex = /[-._]/;
  const separatorIndex = rawCity.search(separatorRegex);

  if (separatorIndex === -1) {
    return '';
  }

  const detail = rawCity.substring(separatorIndex + 1);

  if (!detail) return '';

  try {
    let formattedDetail = detail
      .replace(/[-._]/g, ' ')
      .replace(/\bIntl\b/gi, 'International')
      .replace(/\bAP\b/gi, 'Airport')
      .replace(/\bWea Ctr\b/gi, 'Weather Center')
      .trim();

    return toTitleCase(formattedDetail);
  } catch (error) {
    console.error(error);
    return detail;
  }
}

export function formatLocationName(rawCity, countryCode, fileType = 'primary') {
  const customCity = state.customLocationNames?.[fileType]?.city;
  const customStation = state.customLocationNames?.[fileType]?.station;

  if (customCity) {
    const countryName = countryNameMap[countryCode] || countryCode;
    const stationPart = (customStation !== null && customStation !== undefined && customStation !== '') ? ` (${customStation})` : '';
    return `${customCity}${stationPart} │ ${countryName}`;
  }

  if (!rawCity) return 'Unknown Location';

  const countryName = countryNameMap[countryCode] || countryCode;
  try {
    const separatorRegex = /[-._]/;
    const separatorIndex = rawCity.search(separatorRegex);

    let city = rawCity;
    let detail = '';

    if (separatorIndex !== -1) {
      city = rawCity.substring(0, separatorIndex);
      detail = rawCity.substring(separatorIndex + 1);
    }

    const formattedCity = toTitleCase(city.trim());
    let formattedDetail = '';
    if (detail) {
      formattedDetail = detail
        .replace(/[-._]/g, ' ')
        .replace(/\bWea.Ctr\b/gi, 'Weather Center')
        .replace(/\bIntl\b/gi, 'International')
        .replace(/\bAP\b/gi, 'Airport')
        .replace(/\bWea Ctr\b/gi, 'Weather Center')
        .replace(/\bWea\.Ctr\b/gi, 'Weather Center')
        .replace(/\bCtr\b/gi, 'Center')
        .trim();

      if (formattedDetail) {
        formattedDetail = ` (${toTitleCase(formattedDetail)})`;
      }
    }
    return `${formattedCity}${formattedDetail} │ ${countryName}`;
  } catch (error) {
    console.error(error);
    return `${toTitleCase(rawCity)} │ ${countryName}`;
  }
}

export function formatSimpleLocation(rawCity, countryCode, fileType = 'primary') {
  const customCity = state.customLocationNames?.[fileType]?.city;

  if (customCity) {
    const countryName = countryNameMap[countryCode] || countryCode;
    return `${customCity} (${countryName})`;
  }

  if (!rawCity) return 'Unknown';

  const countryName = countryNameMap[countryCode] || countryCode;
  const separatorIndex = rawCity.search(/[-._]/);
  const city = (separatorIndex !== -1) ? rawCity.substring(0, separatorIndex) : rawCity;

  return `${toTitleCase(city.trim())} (${countryName})`;
}

export function formatCityNameOnly(rawCity, fileType = 'primary') {
  const customCity = state.customLocationNames?.[fileType]?.city;
  if (customCity) {
    return customCity;
  }

  if (!rawCity) return 'Unknown';
  const separatorIndex = rawCity.search(/[-._]/);
  const city = (separatorIndex !== -1) ? rawCity.substring(0, separatorIndex) : rawCity;
  return toTitleCase(city.trim());
}