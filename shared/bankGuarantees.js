export const guaranteeTypes = ['Security', 'Performance', 'EMD', 'Others'];
export const todayIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const displayBgDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
export const bgStatus = (record, today = todayIndia()) => record.closed ? 'Closed' : record.expiryDate < today ? 'Expired' : record.issueDate > today ? 'Not yet effective' : 'Active';
export const bgAlerts = (record, days = 30, today = todayIndia()) => {
  if (record.closed) return [];
  return [['expiryDate', 'Expiry'], ['claimDeadline', 'Claim deadline']].flatMap(([key, label]) => {
    const remaining = Math.round((Date.parse(record[key]) - Date.parse(today)) / 86400000);
    return remaining <= days ? [`${label}: ${remaining < 0 ? `${-remaining} days overdue` : remaining === 0 ? 'today' : `in ${remaining} days`}`] : [];
  });
};
export const calculatedBgAmount = (value, percentage) => Math.round(Number(value) * Number(percentage)) / 100;
export const bankIdentity = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
