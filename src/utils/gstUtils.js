const STATE_CODE_TO_NAME = {
  "01": "jammu and kashmir",
  "02": "himachal pradesh",
  "03": "punjab",
  "04": "chandigarh",
  "05": "uttarakhand",
  "06": "haryana",
  "07": "delhi",
  "08": "rajasthan",
  "09": "uttar pradesh",
  "10": "bihar",
  "11": "sikkim",
  "12": "arunachal pradesh",
  "13": "nagaland",
  "14": "manipur",
  "15": "mizoram",
  "16": "tripura",
  "17": "meghalaya",
  "18": "assam",
  "19": "west bengal",
  "20": "jharkhand",
  "21": "odisha",
  "22": "chhattisgarh",
  "23": "madhya pradesh",
  "24": "gujarat",
  "26": "dadra and nagar haveli and daman and diu",
  "27": "maharashtra",
  "28": "andhra pradesh",
  "29": "karnataka",
  "30": "goa",
  "31": "lakshadweep",
  "32": "kerala",
  "33": "tamil nadu",
  "34": "puducherry",
  "35": "andaman and nicobar islands",
  "36": "telangana",
  "37": "andhra pradesh",
  "38": "ladakh",
};

const STATE_ALIASES = {
  "jammu and kashmir": ["jammu and kashmir", "j&k", "jk", "jammu kashmir"],
  "himachal pradesh": ["himachal pradesh", "hp"],
  punjab: ["punjab", "pb"],
  chandigarh: ["chandigarh", "ch"],
  uttarakhand: ["uttarakhand", "uttrakhand", "uk", "ua"],
  haryana: ["haryana", "hr"],
  delhi: ["delhi", "new delhi", "dl", "nd"],
  rajasthan: ["rajasthan", "rj"],
  "uttar pradesh": ["uttar pradesh", "up"],
  bihar: ["bihar", "br"],
  sikkim: ["sikkim", "sk"],
  "arunachal pradesh": ["arunachal pradesh", "ar"],
  nagaland: ["nagaland", "nl"],
  manipur: ["manipur", "mn"],
  mizoram: ["mizoram", "mz"],
  tripura: ["tripura", "tr"],
  meghalaya: ["meghalaya", "ml"],
  assam: ["assam", "as"],
  "west bengal": ["west bengal", "wb"],
  jharkhand: ["jharkhand", "jh"],
  odisha: ["odisha", "orissa", "od", "or"],
  chhattisgarh: ["chhattisgarh", "cg"],
  "madhya pradesh": ["madhya pradesh", "mp"],
  gujarat: ["gujarat", "gj"],
  "dadra and nagar haveli and daman and diu": [
    "dadra and nagar haveli and daman and diu",
    "dadra nagar haveli daman diu",
    "dnhdd",
    "dd",
  ],
  maharashtra: ["maharashtra", "mh"],
  "andhra pradesh": ["andhra pradesh", "ap"],
  karnataka: ["karnataka", "ka"],
  goa: ["goa", "ga"],
  lakshadweep: ["lakshadweep", "ld"],
  kerala: ["kerala", "kl"],
  "tamil nadu": ["tamil nadu", "tn"],
  puducherry: ["puducherry", "pondicherry", "py"],
  "andaman and nicobar islands": [
    "andaman and nicobar islands",
    "andaman nicobar islands",
    "andaman & nicobar islands",
    "an",
  ],
  telangana: ["telangana", "tg", "ts"],
  ladakh: ["ladakh", "la"],
};

const normalizeStateText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const GSTIN_PATTERN = /^\d{2}[a-z0-9]{13}$/i;

export const resolveIndianStateName = (stateValue, gstinValue = "") => {
  const normalizedState = normalizeStateText(stateValue);
  if (normalizedState) {
    const directMatch = Object.entries(STATE_ALIASES).find(([, aliases]) =>
      aliases.some((alias) => normalizeStateText(alias) === normalizedState)
    );
    if (directMatch) {
      return directMatch[0];
    }
  }

  const cleanedGstin = String(gstinValue ?? "").trim().toUpperCase();
  if (GSTIN_PATTERN.test(cleanedGstin)) {
    const code = cleanedGstin.slice(0, 2);
    return STATE_CODE_TO_NAME[code] ?? null;
  }

  return null;
};

export const getGstTaxMode = ({
  vendorState = "",
  vendorGstin = "",
  companyState = "",
  companyGstin = "",
} = {}) => {
  const resolvedVendorState = resolveIndianStateName(vendorState, vendorGstin);
  const resolvedCompanyState = resolveIndianStateName(companyState, companyGstin);

  if (resolvedVendorState && resolvedCompanyState) {
    return resolvedVendorState === resolvedCompanyState ? "intra" : "inter";
  }

  return "intra";
};
