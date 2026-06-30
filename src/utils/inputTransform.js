export const toSafeUppercase = (value) =>
  typeof value === "string" ? value.toUpperCase() : value;

export const transformUppercaseFieldValue = (field, value, fields = []) =>
  fields.includes(field) ? toSafeUppercase(value) : value;
