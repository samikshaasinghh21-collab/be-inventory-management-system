// HRMS Validation Schemas and Rules
// Location: src/utils/hrmsValidation.js

/**
 * PAN validation - Format: AAAAA9999A
 * Example: ABCDE1234F
 */
export const validatePAN = (pan) => {
  if (!pan) return { valid: false, error: 'PAN Number is required' };
  
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(pan)) {
    return { 
      valid: false, 
      error: 'PAN must be in format: AAAAA9999A (e.g., ABCDE1234F)' 
    };
  }
  
  return { valid: true };
};

/**
 * UAN validation - Numeric, 12 digits
 * Example: 100123456789
 */
export const validateUAN = (uan) => {
  if (!uan) return { valid: false, error: 'UAN Number is required' };
  
  const uanString = String(uan).trim();
  if (!/^\d{12}$/.test(uanString)) {
    return { 
      valid: false, 
      error: 'UAN must be 12 numeric digits' 
    };
  }
  
  return { valid: true };
};

/**
 * Aadhar validation - 12 digits
 */
export const validateAadhar = (aadhar) => {
  if (!aadhar) return { valid: false, error: 'Aadhar is required' };
  
  const aadharString = String(aadhar).trim().replace(/\s/g, '');
  if (!/^\d{12}$/.test(aadharString)) {
    return { 
      valid: false, 
      error: 'Aadhar must be 12 numeric digits' 
    };
  }
  
  return { valid: true };
};

/**
 * ESI validation - 17 digits (for backward compatibility)
 */
export const validateESI = (esi) => {
  if (!esi) return { valid: false, error: 'ESI Number is required' };
  
  const esiString = String(esi).trim().replace(/\s|-/g, '');
  if (!/^\d{17}$/.test(esiString)) {
    return { 
      valid: false, 
      error: 'ESI must be 17 numeric digits' 
    };
  }
  
  return { valid: true };
};

/**
 * Gross Salary calculation
 * Gross = Basic + Allowances
 */
export const calculateGrossSalary = ({
  basicSalary = 0,
  hra = 0,
  travelAllowance = 0,
  medicalAllowance = 0,
  otherAllowances = 0
} = {}) => {
  return (
    Number(basicSalary || 0) +
    Number(hra || 0) +
    Number(travelAllowance || 0) +
    Number(medicalAllowance || 0) +
    Number(otherAllowances || 0)
  );
};

/**
 * Calculate PF (Provident Fund) - 12% of basic salary
 */
export const calculatePF = (basicSalary = 0) => {
  return Number(basicSalary || 0) * 0.12;
};

/**
 * Calculate ESI - 0.75% for employee, 3.25% for employer (on gross)
 */
export const calculateESI = (grossSalary = 0) => {
  return Number(grossSalary || 0) * 0.0075;
};

/**
 * Calculate Professional Tax based on state and salary
 * Varies by state - this is a simplified version for general calculation
 */
export const calculateProfessionalTax = (grossSalary = 0, state = 'Maharashtra') => {
  const salary = Number(grossSalary || 0);
  
  // Simplified PT calculation (varies by state)
  if (salary <= 10000) return 0;
  if (salary <= 50000) return 150;
  if (salary <= 100000) return 200;
  if (salary <= 150000) return 300;
  if (salary <= 200000) return 400;
  return 500; // Maximum PT
};

/**
 * Calculate TDS (Tax Deducted at Source)
 * Simplified calculation based on annual salary
 */
export const calculateTDS = (annualSalary = 0) => {
  const salary = Number(annualSalary || 0);
  
  // Income tax slabs (India - FY 2024-25)
  let tax = 0;
  
  if (salary <= 250000) {
    return 0; // No tax
  } else if (salary <= 500000) {
    tax = (salary - 250000) * 0.05;
  } else if (salary <= 1000000) {
    tax = 12500 + (salary - 500000) * 0.20;
  } else if (salary <= 1500000) {
    tax = 112500 + (salary - 1000000) * 0.30;
  } else {
    tax = 262500 + (salary - 1500000) * 0.30;
  }
  
  return Math.round(tax);
};

/**
 * Calculate monthly net salary
 */
export const calculateNetSalary = ({
  grossSalary = 0,
  pfAmount = 0,
  esiAmount = 0,
  ptAmount = 0,
  tdsAmount = 0,
  otherDeductions = 0
} = {}) => {
  return (
    Number(grossSalary || 0) -
    Number(pfAmount || 0) -
    Number(esiAmount || 0) -
    Number(ptAmount || 0) -
    Number(tdsAmount || 0) -
    Number(otherDeductions || 0)
  );
};

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  if (!email) return { valid: false, error: 'Email is required' };
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
};

/**
 * Validate phone number - Indian format
 */
export const validatePhoneNumber = (phone) => {
  if (!phone) return { valid: false, error: 'Phone number is required' };
  
  const phoneString = String(phone).trim().replace(/[\s-()]/g, '');
  if (!/^[6-9]\d{9}$/.test(phoneString)) {
    return { 
      valid: false, 
      error: 'Phone must be 10 digits starting with 6-9' 
    };
  }
  
  return { valid: true };
};

/**
 * Validate date format MM/DD/YYYY
 */
export const validateDate = (dateString) => {
  if (!dateString) return { valid: false, error: 'Date is required' };
  
  const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
  if (!dateRegex.test(dateString)) {
    return { valid: false, error: 'Date must be in MM/DD/YYYY format' };
  }
  
  // Validate actual date
  const [month, day, year] = dateString.split('/');
  const date = new Date(year, month - 1, day);
  const isValidDate = 
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);
  
  if (!isValidDate) {
    return { valid: false, error: 'Invalid date' };
  }
  
  return { valid: true };
};

/**
 * Format date to MM/DD/YYYY
 */
export const formatDateToMMDDYYYY = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${month}/${day}/${year}`;
};

/**
 * Parse date from MM/DD/YYYY to Date object
 */
export const parseMMDDYYYYDate = (dateString) => {
  if (!dateString) return null;
  
  const [month, day, year] = dateString.split('/');
  return new Date(year, month - 1, day);
};

/**
 * Validate document file
 */
export const validateDocument = (file, allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']) => {
  if (!file) {
    return { valid: false, error: 'File is required' };
  }
  
  const maxSizeMB = 10;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (file.size > maxSizeBytes) {
    return { 
      valid: false, 
      error: `File size must be less than ${maxSizeMB}MB` 
    };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'File type must be PDF, JPG, JPEG, or PNG' 
    };
  }
  
  return { valid: true };
};

export default {
  validatePAN,
  validateUAN,
  validateAadhar,
  validateESI,
  validateEmail,
  validatePhoneNumber,
  validateDate,
  calculateGrossSalary,
  calculatePF,
  calculateESI,
  calculateProfessionalTax,
  calculateTDS,
  calculateNetSalary,
  formatDateToMMDDYYYY,
  parseMMDDYYYYDate,
  validateDocument
};
